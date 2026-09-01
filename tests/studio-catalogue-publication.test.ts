import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { SHOP_CATALOGUE_MANIFEST } from "../scripts/shop-db/catalogue-manifest.mjs";
import { isSafeShopProductMediaUrl } from "../lib/shop/public-media";
import {
  databaseCatalogueRowToShopProduct,
  loadServerShopProducts,
} from "../lib/shop/server-catalog";
import { CURRENT_SHOP_DROP } from "../lib/shop/current-drop";
import { publishStudioPieceSchema } from "../lib/studio/engine/catalogue-publication-contracts";
import {
  dynamicStudioSlug,
  normalizeStudioPublicationImage,
  studioPublicationBlockers,
} from "../lib/studio/engine/catalogue-publication-service";

const root = fileURLToPath(new URL("..", import.meta.url));
const wardrobeItemId = "01234567-89ab-4cde-8f01-23456789abcd";
const slug = "coral-evening-dress-0123456789ab4cde8f0123456789abcd";
const blobOrigin = "https://example.public.blob.vercel-storage.com";
const hashes = {
  GARMENT_FRONT: "1".repeat(64),
  GARMENT_BACK: "2".repeat(64),
  FABRIC_DETAIL: "3".repeat(64),
} as const;
const media = (Object.keys(hashes) as Array<keyof typeof hashes>).map((slot) => ({
  slot,
  src: `${blobOrigin}/shop/studio/${slug}/${slot.toLowerCase()}/${hashes[slot]}.webp`,
}));
const publicationMedia = media.map((item) => ({
  ...item,
  pathname: new URL(item.src).pathname.slice(1),
  sourceSha256: "f".repeat(64),
  sha256: hashes[item.slot],
  mimeType: "image/webp",
  width: 1122,
  height: 1402,
}));

function releaseRow() {
  const product = SHOP_CATALOGUE_MANIFEST.products.find((item) => item.drop === CURRENT_SHOP_DROP);
  assert.ok(product);
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
    measurements: product.measurements.map((item: { label: string; value: string }) => ({ ...item })),
    modelAnchor: { ...product.modelAnchor },
    media: product.media.map((item: { slot: string; src: string; modelAnchorId?: "lulu-v2" | "lulu-v3" | "lulu-v4" }) => ({ ...item })),
    availability: product.initialInventory.availability,
  };
}

function dynamicRow() {
  return {
    sku: "JUW-100",
    slug,
    name: "Coral Evening Dress",
    category: "Dresses",
    price: 24500,
    taggedSize: "Size on request",
    fit: "Measurements confirmed before payment",
    condition: "Excellent · real-worn wardrobe piece",
    colour: "Coral",
    dropLabel: CURRENT_SHOP_DROP,
    tone: "coral",
    silhouette: "dress",
    note: "One-off wardrobe piece.",
    story: "Coral · Excellent · real-worn wardrobe piece",
    details: ["Coral", "Size on request", "Excellent · real-worn wardrobe piece"],
    measurements: [],
    modelAnchor: {},
    media,
    availability: "AVAILABLE" as const,
    publicationId: "12345678-89ab-4cde-8f01-23456789abcd",
    publicationOrigin: "STUDIO_NATIVE",
    publicationState: "PUBLISHED",
    publicationSourceRevision: "a".repeat(64),
    publicationMedia,
    publicationSlug: slug,
    publicationBaseline: null,
    publicationFacts: {
      title: "Coral Evening Dress",
      category: "Dresses",
      colour: "Coral",
      sizeLabel: "Size on request",
      condition: "Excellent · real-worn wardrobe piece",
      price: 24500,
      quantity: 1,
    },
  };
}

test("publication confirmation is explicit and public slugs are deterministic", () => {
  assert.equal(dynamicStudioSlug({ id: wardrobeItemId, title: "Coral Evening Dress" }), slug);
  assert.equal(publishStudioPieceSchema.safeParse({
    expectedRevision: "a".repeat(64),
    idempotencyKey: "publish:01234567",
    confirmation: "PUBLISH",
    publicMediaConfirmed: true,
  }).success, true);
  assert.equal(publishStudioPieceSchema.safeParse({
    expectedRevision: "a".repeat(64),
    idempotencyKey: "publish:01234567",
    confirmation: "PUBLISH",
    publicMediaConfirmed: false,
  }).success, false);
  assert.ok(studioPublicationBlockers({
    id: wardrobeItemId,
    intakeId: "11111111-1111-4111-8111-111111111111",
    operatorSubject: "studio-workspace",
    title: "Coral Evening Dress",
    description: "",
    category: "Dress",
    colour: "Coral",
    sizeLabel: "Size on request",
    condition: "Excellent",
    price: 24_500,
    quantity: 1,
    state: "READY",
    version: 2,
    targetCollectionId: null,
    approvedAssetId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }, []).includes("Shop description"));
});

test("a ledger-backed dynamic row appends without weakening a release row", async () => {
  const dynamic = databaseCatalogueRowToShopProduct(dynamicRow());
  assert.ok(dynamic);
  assert.equal(dynamic.sku, "JUW-100");
  assert.equal(dynamic.availabilityConfirmed, true);
  assert.equal(dynamic.modelTryout.modelStatus, "PENDING");
  assert.equal(dynamic.media?.length, 3);
  assert.ok(dynamic.media?.every((item) => isSafeShopProductMediaUrl(item.src, slug)));
  const merged = await loadServerShopProducts(async () => [releaseRow(), dynamicRow()]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].drop, CURRENT_SHOP_DROP);
  assert.equal(merged[1].sku, dynamic.sku);
  assert.throws(() => databaseCatalogueRowToShopProduct({
    ...dynamicRow(),
    publicationMedia: publicationMedia.slice(0, 2),
  }), /media set/);
});

test("a reviewed Shop description is bound to the public note while legacy ledgers remain readable", () => {
  const row = dynamicRow();
  row.note = "A coral dress with a softly draped neckline.";
  row.publicationFacts = { ...row.publicationFacts, description: row.note };
  const product = databaseCatalogueRowToShopProduct(row);
  assert.ok(product);
  assert.equal(product.note, row.note);
  assert.throws(() => databaseCatalogueRowToShopProduct({
    ...row,
    note: "Different customer copy",
  }), /facts drifted/);
});

test("public promotion strips private image metadata and records a distinct public hash", async () => {
  const privateJpeg = await sharp({
    create: { width: 24, height: 32, channels: 3, background: "#cb6a4a" },
  }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const privateMetadata = await sharp(privateJpeg).metadata();
  assert.ok(privateMetadata.exif || privateMetadata.icc);
  const normalized = await normalizeStudioPublicationImage(privateJpeg);
  const publicMetadata = await sharp(normalized.bytes).metadata();
  assert.equal(publicMetadata.format, "webp");
  assert.equal(publicMetadata.space, "srgb");
  assert.equal(publicMetadata.exif, undefined);
  assert.equal(publicMetadata.icc, undefined);
  assert.equal(publicMetadata.xmp, undefined);
  assert.equal(publicationMedia[0].sourceSha256 === publicationMedia[0].sha256, false);
});

test("publication is one atomic guarded statement and Piece owns Review to Publish", () => {
  const repository = readFileSync(`${root}/lib/server/studio-catalogue-publication-repository.ts`, "utf8");
  const service = readFileSync(`${root}/lib/studio/engine/catalogue-publication-service.ts`, "utf8");
  const catalogue = readFileSync(`${root}/lib/shop/server-catalog.ts`, "utf8");
  const route = readFileSync(`${root}/app/api/studio/wardrobe/[id]/publication/route.ts`, "utf8");
  const wardrobeRoute = readFileSync(`${root}/app/api/studio/wardrobe/route.ts`, "utf8");
  const overlay = readFileSync(`${root}/lib/studio/db/server-wardrobe-overlay.ts`, "utf8");
  const workbench = readFileSync(`${root}/components/studio/wardrobe-workbench.tsx`, "utf8");
  const migration = readFileSync(`${root}/drizzle/shop-postgres/0006_jittery_joystick.sql`, "utf8");
  assert.match(repository, /with ready_piece as/);
  assert.match(repository, /nextval\('shop_dynamic_sku_sequence'\)/);
  assert.match(repository, /version = \$\{input\.expectedVersion\}/);
  assert.match(repository, /version = version \+ 1/);
  assert.match(repository, /insert into shop_catalogue_items/);
  assert.match(repository, /CURRENT_SHOP_DROP/);
  assert.match(repository, /dropLabel: shopCatalogueItems\.dropLabel/);
  assert.match(repository, /description: shopCatalogueItems\.note/);
  assert.match(repository, /\$\{input\.description\}, \$\{`\$\{input\.colour\} · \$\{input\.condition\}`\}/);
  assert.match(repository, /note = \$\{input\.description\}/);
  assert.doesNotMatch(repository, /story = \$\{input\.description\}/);
  assert.match(repository, /row\.dropLabel \? \{ drop: row\.dropLabel \}/);
  assert.doesNotMatch(repository, /'Studio wardrobe'/);
  assert.match(repository, /insert into shop_inventory/);
  assert.match(repository, /insert into studio_catalogue_publications/);
  assert.match(service, /shop\/studio\/\$\{slug\}/);
  assert.match(service, /allowOverwrite: false/);
  assert.match(service, /const converged = await get\(pathname/);
  assert.match(service, /sha256\(convergedBytes\) !== publicSha256/);
  assert.match(service, /current\.ready\.sourceRevision !== input\.expectedRevision/);
  assert.match(service, /toColourspace\("srgb"\)/);
  assert.match(service, /sourceSha256: source\.sha256/);
  assert.match(service, /description: item\.description/);
  assert.match(service, /blockers\.push\("Shop description"\)/);
  assert.match(service, /findCataloguePublication\(\{ wardrobeItemId, operatorSubject: operator\.subject \}\)/);
  assert.match(service, /operatorSubject: input\.operator\.subject/);
  assert.doesNotMatch(service, /operator\.role/);
  assert.match(catalogue, /const cached = \(await getServerShopProducts\(\)\)\.find/);
  assert.match(catalogue, /const products = await loadServerShopProducts\(\)/);
  assert.match(route, /requireStudioOperator/);
  assert.match(wardrobeRoute, /cataloguePublicationReceipt/);
  assert.match(overlay, /dynamicPublication/);
  assert.match(overlay, /SERVER_LISTING_PREFIX/);
  assert.match(workbench, /Review Shop preview/);
  assert.match(workbench, /publicMediaConfirmed: true/);
  assert.match(workbench, /Make public/);
  assert.match(workbench, /response\.status === 409/);
  assert.match(workbench, /getOrCreateSessionCommandKey\(\{/);
  assert.match(workbench, /revision: publicationRevision/);
  assert.match(workbench, /clearSessionCommandKey\(\{/);
  assert.match(workbench, /setPublicationReview\(null\)/);
  assert.match(workbench, /setPublicationReload\(\(value\) => value \+ 1\)/);
  assert.match(migration, /studio_catalogue_publications_wardrobe_unique/);
  assert.match(migration, /studio_catalogue_publications_operator_idempotency_unique/);
});
