import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { SHOP_CATALOGUE_MANIFEST } from "../scripts/shop-db/catalogue-manifest.mjs";
import { manifestChecksum } from "../scripts/shop-db/release-core.mjs";
import {
  cataloguePresentationChecksum,
  createBlobAssetPlan,
  createPublicMediaSourceManifest,
  mergeLegacyAssets,
} from "../scripts/shop-media/blob-sync.mjs";
import { createEmptyCommerceSnapshot } from "../lib/shop/domain/state";
import { parseStoredShopState } from "../lib/shop/db/browser-local-repository";
import { createBrowserCheckoutAvailabilityPort } from "../lib/shop/db/browser-checkout-availability";
import {
  evaluateCheckoutAvailability,
  POST as confirmCheckoutAvailability,
} from "../app/api/shop/catalogue/availability/route";
import {
  SHOP_PUBLIC_MEDIA_ASSETS,
  SHOP_PUBLIC_MEDIA_CATALOGUE_CHECKSUM,
  SHOP_PUBLIC_MEDIA_PRESENTATION_CHECKSUM,
  SHOP_PUBLIC_MEDIA_REVISION,
  SHOP_PUBLIC_MEDIA_SOURCE_ASSETS,
  isSafeShopProductMediaUrl,
  resolveShopPublicMediaUrl,
} from "../lib/shop/public-media";
import {
  assertCatalogueReleaseLedger,
  assertCataloguePresentation,
  databaseCatalogueRowToShopProduct,
  loadServerShopProducts,
  withCatalogueTimeout,
} from "../lib/shop/server-catalog";
import { createBrowserCommerceService, createCommerceService } from "../lib/shop/services/commerce-service";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const firstManifestProduct = SHOP_CATALOGUE_MANIFEST.products[0];
const currentManifestProducts = SHOP_CATALOGUE_MANIFEST.products.filter((product) => product.drop === "Drop 02");

function databaseRow(
  product = firstManifestProduct,
  availability: "AVAILABLE" | "RESERVED" | "SOLD" | "ARCHIVED" | null = product.initialInventory.availability,
): Parameters<typeof databaseCatalogueRowToShopProduct>[0] {
  return {
    sku: product.sku,
    slug: product.slug,
    name: product.name,
    category: product.category,
    price: product.price,
    taggedSize: product.taggedSize,
    fit: product.fit,
    condition: product.condition,
    colour: product.colour,
    dropLabel: product.drop,
    tone: product.tone,
    silhouette: product.silhouette,
    note: product.note,
    story: product.story,
    details: [...product.details],
    measurements: product.measurements.map(
      (measurement: { label: string; value: string }) => ({ ...measurement }),
    ),
    modelAnchor: { ...product.modelAnchor },
    media: product.media.map((item: {
      slot: string;
      src: string;
      modelAnchorId?: "lulu-v2" | "lulu-v3" | "lulu-v4";
    }) => ({ ...item })),
    availability,
  };
}

async function withoutExpectedCatalogueError<T>(operation: () => Promise<T>) {
  const original = console.error;
  console.error = () => undefined;
  try {
    return await operation();
  } finally {
    console.error = original;
  }
}

test("the public Blob release contains only exact manifest media and verifies local bytes", async () => {
  const plan = await createBlobAssetPlan(repositoryRoot);
  const sourceManifest = await createPublicMediaSourceManifest(repositoryRoot);
  assert.equal(SHOP_PUBLIC_MEDIA_REVISION, SHOP_CATALOGUE_MANIFEST.revision);
  assert.equal(SHOP_PUBLIC_MEDIA_CATALOGUE_CHECKSUM, manifestChecksum(SHOP_CATALOGUE_MANIFEST));
  assert.equal(
    SHOP_PUBLIC_MEDIA_PRESENTATION_CHECKSUM,
    cataloguePresentationChecksum(SHOP_CATALOGUE_MANIFEST),
  );
  assert.equal(plan.length, 296);
  assert.equal(SHOP_PUBLIC_MEDIA_ASSETS.length, plan.length);
  assert.equal(SHOP_PUBLIC_MEDIA_SOURCE_ASSETS.length, plan.length);
  assert.deepEqual(SHOP_PUBLIC_MEDIA_SOURCE_ASSETS, sourceManifest.assets);
  assert.equal(
    plan.filter((asset) => asset.sourcePath.startsWith("/shop/products/")).length,
    295,
  );
  const currentDropAssets = plan.filter((asset) => currentManifestProducts.some((product) =>
    asset.sourcePath.startsWith(`/shop/products/${product.slug}/`)));
  assert.equal(currentDropAssets.length, 193);
  assert.equal(plan.length - currentDropAssets.length, 103);
  assert.ok(currentDropAssets.every((asset) => {
    const released = SHOP_PUBLIC_MEDIA_ASSETS.find((candidate) => candidate.sourcePath === asset.sourcePath);
    return released?.url === released?.sourcePath || released?.url.startsWith("https://");
  }));
  assert.deepEqual(
    SHOP_PUBLIC_MEDIA_SOURCE_ASSETS.find(({ sourcePath }) =>
      sourcePath === "/shop/products/magenta-plunge-ruched-mini-dress/08-model-detail.webp"
    ),
    {
      sourcePath: "/shop/products/magenta-plunge-ruched-mini-dress/08-model-detail.webp",
      pathname: "shop/catalogue/5b60a54faf31a7964f6f839b8be7842a7a8206ba2ff88ebf5fd0af30d14a36ea/products/magenta-plunge-ruched-mini-dress/08-model-detail.webp",
      sha256: "5b60a54faf31a7964f6f839b8be7842a7a8206ba2ff88ebf5fd0af30d14a36ea",
      size: 72746,
      contentType: "image/webp",
      width: 972,
      height: 1619,
    },
  );
  assert.deepEqual(
    SHOP_PUBLIC_MEDIA_SOURCE_ASSETS.find(({ sourcePath }) =>
      sourcePath === "/shop/products/sage-open-back-high-slit-maxi-dress/07-model-left-profile.webp"
    ),
    {
      sourcePath: "/shop/products/sage-open-back-high-slit-maxi-dress/07-model-left-profile.webp",
      pathname: "shop/catalogue/35b1196542e5e4836ff82a6b1954fb281d553ce5fe1f9ec76d88beede626efa1/products/sage-open-back-high-slit-maxi-dress/07-model-left-profile.webp",
      sha256: "35b1196542e5e4836ff82a6b1954fb281d553ce5fe1f9ec76d88beede626efa1",
      size: 149916,
      contentType: "image/webp",
      width: 972,
      height: 1619,
    },
  );
  assert.equal(
    plan.some((asset) => asset.sourcePath.endsWith("silver-off-shoulder-mermaid-dress/04-model-front.webp")),
    false,
  );

  for (const asset of SHOP_PUBLIC_MEDIA_ASSETS) {
    const planned = plan.find((candidate) => candidate.sourcePath === asset.sourcePath);
    assert.ok(planned, asset.sourcePath);
    assert.equal(asset.pathname, planned.pathname);
    assert.equal(asset.sha256, planned.sha256);
    assert.equal(asset.size, planned.size);
    assert.equal(asset.contentType, planned.contentType);
    assert.ok(
      asset.url === asset.sourcePath
      || /^https:\/\/3zahcgtjznzcxgsl\.public\.blob\.vercel-storage\.com\//.test(asset.url),
    );
    assert.equal(resolveShopPublicMediaUrl(asset.sourcePath), asset.url);
    const body = await readFile(join(repositoryRoot, "public", asset.sourcePath));
    assert.equal(createHash("sha256").update(body).digest("hex"), asset.sha256);
  }
});

test("superseded content-addressed URLs remain valid saved-order evidence", () => {
  const sourcePath = "/shop/products/example/04-model-front.webp";
  const oldAsset = { sourcePath, pathname: "old", url: "https://blob.example/old", size: 1 };
  const activeAsset = { sourcePath, pathname: "new", url: "https://blob.example/new", size: 2 };
  assert.deepEqual(mergeLegacyAssets({
    assets: [oldAsset],
    legacyAssets: [{ ...oldAsset, url: "https://blob.example/older" }],
  }, [activeAsset]).map((asset) => asset.url), [
    "https://blob.example/old",
    "https://blob.example/older",
  ]);
});

test("the server accepts only the exact database ledger paired with the media release", () => {
  assert.doesNotThrow(() => assertCatalogueReleaseLedger({
    revision: SHOP_PUBLIC_MEDIA_REVISION,
    checksum: SHOP_PUBLIC_MEDIA_CATALOGUE_CHECKSUM,
    rowCount: 16,
  }, 16));
  assert.throws(() => assertCatalogueReleaseLedger({
    revision: "older-release",
    checksum: SHOP_PUBLIC_MEDIA_CATALOGUE_CHECKSUM,
    rowCount: 16,
  }, 16), /does not match/);
  assert.throws(() => assertCatalogueReleaseLedger({
    revision: SHOP_PUBLIC_MEDIA_REVISION,
    checksum: SHOP_PUBLIC_MEDIA_CATALOGUE_CHECKSUM,
    rowCount: 12,
  }, 16), /does not match/);
});

test("the server ties confirmed descriptive rows to the checked-in release", () => {
  const rows = SHOP_CATALOGUE_MANIFEST.products.map((product) => databaseRow(product));
  assert.doesNotThrow(() => assertCataloguePresentation(rows));
  assert.throws(
    () => assertCataloguePresentation([
      { ...rows[0], price: rows[0].price + 1 },
      ...rows.slice(1),
    ]),
    /do not match/,
  );
});

test("the server catalogue deadline fails instead of hanging the storefront", async () => {
  await assert.rejects(
    withCatalogueTimeout(new Promise(() => undefined), 5),
    /timed out/,
  );
});

test("a complete Neon row becomes a confirmed Shop product with Blob media", () => {
  const product = databaseCatalogueRowToShopProduct(databaseRow());
  assert.ok(product);
  assert.equal(product.sku, "JUW-001");
  assert.equal(product.availabilityConfirmed, true);
  assert.equal(product.availability, "AVAILABLE");
  assert.ok(product.media?.every((item) => item.src.startsWith("https://")));
  assert.equal(product.modelTryout.modelStatus, "APPROVED");
  if (product.modelTryout.modelStatus !== "APPROVED") return;
  assert.match(product.modelTryout.frame.src, /^https:\/\//);
  assert.equal(
    isSafeShopProductMediaUrl(product.modelTryout.frame.src, product.slug),
    true,
  );
});

test("an adopted catalogue revision changes facts without replacing the authored presentation", () => {
  const baseline = databaseRow();
  const baselineProduct = databaseCatalogueRowToShopProduct(baseline);
  assert.ok(baselineProduct);
  const revisedPrice = baseline.price + 2_500;
  const product = databaseCatalogueRowToShopProduct({
    ...baseline,
    price: revisedPrice,
    publicationId: "44444444-4444-4444-8444-444444444444",
    publicationOrigin: "CATALOGUE_ADOPTED",
    publicationState: "PUBLISHED",
    publicationSourceRevision: "a".repeat(64),
    publicationSlug: baseline.slug,
    publicationFacts: {
      title: baseline.name,
      category: baseline.category,
      colour: baseline.colour,
      sizeLabel: baseline.taggedSize,
      condition: baseline.condition,
      price: revisedPrice,
      quantity: 1,
    },
    publicationMedia: [
      { origin: "CATALOGUE_BASELINE", slot: "GARMENT_FRONT", src: String(baseline.media[0]?.src) },
      { origin: "CATALOGUE_BASELINE", slot: "GARMENT_BACK", src: String(baseline.media[1]?.src) },
      { origin: "CATALOGUE_BASELINE", slot: "FABRIC_DETAIL", src: String(baseline.media.at(-1)?.src) },
    ],
    publicationBaseline: { sku: baseline.sku },
  });
  assert.ok(product);
  assert.equal(product.price, revisedPrice);
  assert.equal(product.story, baselineProduct.story);
  assert.deepEqual(product.media, baselineProduct.media);
  assert.deepEqual(product.details, baselineProduct.details);
  assert.deepEqual(product.measurements, baselineProduct.measurements);
});

test("the server accepts JUW-014's truthful construction detail", () => {
  const source = SHOP_CATALOGUE_MANIFEST.products.find((product) => product.sku === "JUW-014");
  assert.ok(source);
  const product = databaseCatalogueRowToShopProduct(databaseRow(source));
  assert.ok(product);
  const construction = product.media?.find((item) => item.id === "construction-detail");
  assert.ok(construction);
  assert.match(construction.src, /^https:\/\//);
});

test("checkout performs a fresh fail-closed availability confirmation", async () => {
  const product = databaseCatalogueRowToShopProduct(databaseRow());
  assert.ok(product);
  const line = { slug: product.slug, size: product.taggedSize };
  assert.equal(evaluateCheckoutAvailability([product], [line]), "CONFIRMED");
  assert.equal(evaluateCheckoutAvailability([
    { ...product, availability: "RESERVED" },
  ], [line]), "CHANGED");
  assert.equal(evaluateCheckoutAvailability([
    { ...product, availabilityConfirmed: false },
  ], [line]), "UNAVAILABLE");

  const port = createBrowserCheckoutAvailabilityPort(async () =>
    Response.json({ status: "CONFIRMED" }));
  assert.equal(await port.confirm([line]), "CONFIRMED");
  const unavailablePort = createBrowserCheckoutAvailabilityPort(async () => {
    throw new Error("offline");
  });
  assert.equal(await unavailablePort.confirm([line]), "UNAVAILABLE");

  const invalid = await confirmCheckoutAvailability(new Request(
    "https://www.justurbanwears.com/api/shop/catalogue/availability",
    { method: "POST", body: "{}", headers: { "content-type": "application/json" } },
  ));
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { status: "CHANGED" });
});

test("an invalid or unavailable Neon snapshot falls back with purchase actions fail-closed", async () => {
  const fallback = await withoutExpectedCatalogueError(() => loadServerShopProducts(async () => {
    throw new Error("synthetic outage");
  }));
  assert.equal(currentManifestProducts.length, 28);
  assert.deepEqual(fallback.map((product) => product.sku), currentManifestProducts.map((product) => product.sku));
  assert.ok(fallback.every((product) => product.availabilityConfirmed === false));
  assert.ok(fallback.flatMap((product) => product.media ?? []).every((item) =>
    isSafeShopProductMediaUrl(item.src, item.src.split("/products/")[1]?.split("/")[0] ?? ""),
  ));
  const service = createBrowserCommerceService(fallback);
  assert.equal(service.getProductAvailability(fallback[0].slug), null);
  assert.equal(service.normalizeBagItem({ slug: fallback[0].slug, size: fallback[0].taggedSize }), null);
  const restored = parseStoredShopState(JSON.stringify({
    version: 3,
    data: {
      ...createEmptyCommerceSnapshot(),
      bag: [{ slug: fallback[0].slug, size: fallback[0].taggedSize }],
    },
  }), (slug) => fallback.find((product) => product.slug === slug));
  assert.deepEqual(restored?.bag, [{ slug: fallback[0].slug, size: fallback[0].taggedSize }]);

  const partial = await withoutExpectedCatalogueError(() => loadServerShopProducts(async () => [
    databaseRow(),
    { ...databaseRow(currentManifestProducts[0]), availability: null },
  ]));
  assert.equal(partial.length, currentManifestProducts.length);
  assert.ok(partial.every((product) => product.availabilityConfirmed === false));
});

test("a mixed Drop 01 and Drop 02 Neon snapshot returns only the current drop", async () => {
  const products = await loadServerShopProducts(async () => [
    databaseRow(firstManifestProduct, "AVAILABLE"),
    databaseRow(currentManifestProducts[0], "RESERVED"),
  ]);
  assert.deepEqual(products.map((product) => product.sku), [currentManifestProducts[0].sku]);
  assert.equal(products[0].availability, "RESERVED");
  assert.equal(products[0].availabilityConfirmed, true);
});

test("archived current-drop Neon rows are omitted without weakening the remaining snapshot", async () => {
  const products = await loadServerShopProducts(async () => [
    databaseRow(currentManifestProducts[0], "ARCHIVED"),
    databaseRow(currentManifestProducts[1], "RESERVED"),
  ]);
  assert.deepEqual(products.map((product) => product.sku), [currentManifestProducts[1].sku]);
  assert.equal(products[0].availabilityConfirmed, true);
});

test("saved local checkouts accept only an exact released Blob URL", () => {
  const product = databaseCatalogueRowToShopProduct(databaseRow());
  assert.ok(product);
  const products = [product];
  const service = createCommerceService({
    repository: {
      read: async () => createEmptyCommerceSnapshot(),
      write: async () => undefined,
      subscribe: () => () => undefined,
    },
    catalog: {
      hydrate: async () => products,
      list: () => products,
      getProduct: (slug) => products.find((candidate) => candidate.slug === slug),
      subscribe: () => () => undefined,
    },
    now: () => new Date("2026-08-11T12:00:00.000Z"),
    createReference: () => "JUW-20260811-BLOB01",
  });
  const created = service.createCheckout({
    ...createEmptyCommerceSnapshot(),
    bag: [{ slug: product.slug, size: product.taggedSize }],
  }, {
    contact: { name: "Lulu Dyrane", email: "lulu@example.com", phone: "+2349071306678" },
    fulfillment: { kind: "PICKUP", optionId: "pickup" },
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const envelope = (order: unknown) => JSON.stringify({
    version: 3,
    data: { ...createEmptyCommerceSnapshot(), orders: [order] },
  });
  const parsed = parseStoredShopState(envelope(created.order), () => product);
  assert.equal(parsed?.orders.length, 1);
  assert.match(JSON.stringify(parsed), /public\.blob\.vercel-storage\.com/);

  const forged = {
    ...created.order,
    lines: created.order.lines.map((line) => line.snapshot === "PRODUCT" && line.imageSrc
      ? { ...line, imageSrc: line.imageSrc.replace("3zahcgtjznzcxgsl.public.blob.vercel-storage.com", "evil.example") }
      : line),
  };
  assert.deepEqual(parseStoredShopState(envelope(forged), () => product)?.orders, []);
});
