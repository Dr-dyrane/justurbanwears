import { createHash } from "node:crypto";
import { asc, desc, eq } from "drizzle-orm";
import { getShopDb } from "../../db/shop-postgres";
import {
  shopCatalogueItems,
  shopInventory,
  shopSeedLedger,
  studioCataloguePublications,
} from "../../db/shop-postgres-schema";
import { shopProducts } from "./catalog";
import { CURRENT_SHOP_DROP, isCurrentShopProduct } from "./current-drop";
import type { ShopProduct } from "./domain/entities";
import {
  isApprovedShopMediaSource,
  isSafeShopProductMediaUrl,
  SHOP_PUBLIC_MEDIA_CATALOGUE_CHECKSUM,
  SHOP_PUBLIC_MEDIA_PRESENTATION_CHECKSUM,
  SHOP_PUBLIC_MEDIA_REVISION,
  resolveShopPublicMediaUrl,
} from "./public-media";
import { wardrobePublicProductToShopProduct } from "./wardrobe-public-view";
import type {
  WardrobePublicMedia,
  WardrobePublicModelAnchor,
  WardrobePublicProduct,
} from "../wardrobe-public-view/domain/entities";

const CACHE_TTL_MS = 30_000;
const DATABASE_TIMEOUT_MS = 5_000;
const categories = new Set(["Dresses", "Rompers", "Sets", "Shirts", "Knitwear", "Skirts", "Trousers"]);
const tones = new Set(["coral", "indigo", "moss", "ivory", "cocoa", "salmon"]);
const silhouettes = new Set(["dress", "romper", "set", "shirt", "knit", "skirt", "trouser"]);
const mediaSlots = new Set([
  "GARMENT_FRONT",
  "GARMENT_BACK",
  "MANNEQUIN_FRONT",
  "MODEL_FRONT",
  "MODEL_LEFT_PROFILE",
  "MODEL_REAR_THREE_QUARTER",
  "MODEL_REAR_MIRROR",
  "MODEL_DETAIL",
  "FABRIC_DETAIL",
  "CONSTRUCTION_DETAIL",
]);
const modelSlots = new Set([
  "MODEL_FRONT",
  "MODEL_LEFT_PROFILE",
  "MODEL_REAR_THREE_QUARTER",
  "MODEL_REAR_MIRROR",
  "MODEL_DETAIL",
]);

type DatabaseCatalogueRow = Omit<typeof shopCatalogueItems.$inferSelect, "createdAt" | "updatedAt"> & {
  availability: "AVAILABLE" | "RESERVED" | "SOLD" | "ARCHIVED" | null;
  publicationId?: string | null;
  publicationOrigin?: string | null;
  publicationState?: string | null;
  publicationSourceRevision?: string | null;
  publicationMedia?: (typeof studioCataloguePublications.$inferSelect)["media"] | null;
  publicationSlug?: string | null;
  publicationFacts?: Record<string, unknown> | null;
  publicationBaseline?: Record<string, unknown> | null;
};
interface CatalogueReleaseLedger {
  revision: string;
  checksum: string;
  rowCount: number;
}

let cachedCatalogue:
  | { expiresAt: number; promise: Promise<ShopProduct[]> }
  | undefined;

export async function withCatalogueTimeout<T>(
  operation: Promise<T>,
  timeoutMs = DATABASE_TIMEOUT_MS,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("The Neon catalogue request timed out.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid catalogue ${field}.`);
  }
  return value;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Invalid catalogue ${field}.`);
  }
  return [...value];
}

function parseMeasurements(value: unknown) {
  if (!Array.isArray(value)) throw new Error("Invalid catalogue measurements.");
  return value.map((measurement) => {
    if (
      !measurement
      || typeof measurement !== "object"
      || !("label" in measurement)
      || !("value" in measurement)
    ) throw new Error("Invalid catalogue measurement.");
    return {
      label: nonEmptyString(measurement.label, "measurement label"),
      value: nonEmptyString(measurement.value, "measurement value"),
    };
  });
}

function parseModelAnchor(value: unknown): WardrobePublicModelAnchor {
  if (!value || typeof value !== "object" || !("id" in value)) {
    throw new Error("Invalid catalogue model anchor.");
  }
  if (
    (value.id === "lulu-v3" || value.id === "lulu-v4")
    && (!("src" in value) || value.src === undefined)
  ) {
    return { id: value.id };
  }
  if (
    value.id === "lulu-v2"
    && "src" in value
    && value.src === "/shop/model/lulu-v2-approved.png"
    && isApprovedShopMediaSource(value.src)
  ) {
    return { id: "lulu-v2", src: value.src };
  }
  throw new Error("Invalid catalogue model anchor.");
}

function parseMedia(value: unknown, slug: string): WardrobePublicMedia[] {
  if (!Array.isArray(value) || !value.length) throw new Error("Invalid catalogue media.");
  const seen = new Set<string>();
  return value.map((item) => {
    if (
      !item
      || typeof item !== "object"
      || !("slot" in item)
      || !("src" in item)
      || typeof item.slot !== "string"
      || !mediaSlots.has(item.slot)
      || typeof item.src !== "string"
      || !item.src.startsWith(`/shop/products/${slug}/`)
      || !isApprovedShopMediaSource(item.src)
      || seen.has(item.slot)
    ) throw new Error("Invalid catalogue media item.");
    seen.add(item.slot);

    const modelAnchorId = "modelAnchorId" in item ? item.modelAnchorId : undefined;
    if (
      modelSlots.has(item.slot)
      ? modelAnchorId !== "lulu-v2" && modelAnchorId !== "lulu-v3" && modelAnchorId !== "lulu-v4"
      : modelAnchorId !== undefined
    ) throw new Error("Invalid catalogue media anchor.");

    return {
      slot: item.slot as WardrobePublicMedia["slot"],
      src: resolveShopPublicMediaUrl(item.src),
      ...(modelAnchorId ? { modelAnchorId } : {}),
    };
  });
}

function dynamicCatalogueRowToShopProduct(row: DatabaseCatalogueRow): ShopProduct {
  if (
    !row.publicationId
    || row.publicationOrigin !== "STUDIO_NATIVE"
    || row.publicationState !== "PUBLISHED"
    || typeof row.publicationSourceRevision !== "string"
    || !/^[0-9a-f]{64}$/.test(row.publicationSourceRevision)
    || !Array.isArray(row.publicationMedia)
    || row.publicationSlug !== row.slug
    || !row.publicationFacts
    || typeof row.publicationFacts !== "object"
  ) throw new Error("Invalid Studio publication ledger.");
  const slug = nonEmptyString(row.slug, "slug");
  const sku = nonEmptyString(row.sku, "SKU");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Invalid Studio catalogue slug.");
  if (!/^JUW-[0-9]{3,}$/.test(sku)) throw new Error("Invalid Studio catalogue SKU.");
  if (!Number.isSafeInteger(row.price) || row.price <= 0) throw new Error("Invalid Studio catalogue price.");
  if (!categories.has(row.category) || !tones.has(row.tone) || !silhouettes.has(row.silhouette)) {
    throw new Error("Invalid Studio catalogue presentation.");
  }
  if (!Array.isArray(row.media) || row.media.length !== 3 || row.publicationMedia.length !== 3) {
    throw new Error("Invalid Studio catalogue media set.");
  }
  const ledgerFacts = row.publicationFacts;
  if (
    ledgerFacts.title !== row.name
    || ledgerFacts.category !== row.category
    || ledgerFacts.colour !== row.colour
    || ledgerFacts.sizeLabel !== row.taggedSize
    || ledgerFacts.condition !== row.condition
    || ledgerFacts.price !== row.price
    || ledgerFacts.quantity !== 1
  ) throw new Error("Studio catalogue facts drifted from publication review.");
  const catalogueSources = new Map(row.media.map((item) => {
    if (!item || typeof item !== "object" || !("slot" in item) || !("src" in item)) {
      throw new Error("Invalid Studio catalogue media.");
    }
    return [String(item.slot), String(item.src)];
  }));
  const expectedSlots = new Set(["GARMENT_FRONT", "GARMENT_BACK", "FABRIC_DETAIL"]);
  const media = row.publicationMedia.map((item) => {
    if (
      !item
      || typeof item !== "object"
      || !("slot" in item)
      || !("src" in item)
      || !("sha256" in item)
      || !("sourceSha256" in item)
      || !("pathname" in item)
      || !("mimeType" in item)
      || !("width" in item)
      || !("height" in item)
      || typeof item.slot !== "string"
      || !expectedSlots.delete(item.slot)
      || typeof item.src !== "string"
      || catalogueSources.get(item.slot) !== item.src
      || !isSafeShopProductMediaUrl(item.src, slug)
      || typeof item.sha256 !== "string"
      || !/^[0-9a-f]{64}$/.test(item.sha256)
      || typeof item.sourceSha256 !== "string"
      || !/^[0-9a-f]{64}$/.test(item.sourceSha256)
      || item.mimeType !== "image/webp"
      || item.pathname !== `shop/studio/${slug}/${item.slot.toLowerCase()}/${item.sha256}.webp`
      || !item.src.endsWith(`/${item.sha256}.webp`)
      || !Number.isSafeInteger(item.width)
      || !Number.isSafeInteger(item.height)
      || Number(item.width) < 1
      || Number(item.height) < 1
    ) throw new Error("Invalid Studio publication media.");
    const slot = item.slot as "GARMENT_FRONT" | "GARMENT_BACK" | "FABRIC_DETAIL";
    const label = slot === "GARMENT_FRONT" ? "Garment front" : slot === "GARMENT_BACK" ? "Garment back" : "Fabric detail";
    return {
      id: slot.toLowerCase().replaceAll("_", "-"),
      src: item.src,
      alt: `${row.name} · ${label.toLowerCase()}.`,
      label,
      presentation: "garment" as const,
      view: slot === "GARMENT_FRONT" ? "front" as const : slot === "GARMENT_BACK" ? "back" as const : "detail" as const,
      width: Number(item.width),
      height: Number(item.height),
    };
  });
  if (expectedSlots.size || catalogueSources.size !== 3) throw new Error("Incomplete Studio publication media.");
  if (row.availability !== "AVAILABLE" && row.availability !== "RESERVED" && row.availability !== "SOLD") {
    throw new Error("Studio catalogue inventory is missing or invalid.");
  }
  return {
    slug,
    sku,
    name: nonEmptyString(row.name, "name"),
    category: row.category as ShopProduct["category"],
    price: row.price,
    taggedSize: nonEmptyString(row.taggedSize, "tagged size"),
    fit: nonEmptyString(row.fit, "fit"),
    condition: nonEmptyString(row.condition, "condition"),
    colour: nonEmptyString(row.colour, "colour"),
    availability: row.availability,
    availabilityConfirmed: true,
    drop: nonEmptyString(row.dropLabel, "drop label"),
    tone: row.tone as ShopProduct["tone"],
    silhouette: row.silhouette as ShopProduct["silhouette"],
    media,
    modelTryout: { modelStatus: "PENDING" },
    note: nonEmptyString(row.note, "note"),
    story: nonEmptyString(row.story, "story"),
    details: stringArray(row.details, "details"),
    measurements: parseMeasurements(row.measurements),
  };
}

export function databaseCatalogueRowToShopProduct(row: DatabaseCatalogueRow): ShopProduct | null {
  if (row.availability === "ARCHIVED") return null;
  if (row.publicationId && row.publicationOrigin === "CATALOGUE_ADOPTED") {
    if (row.publicationState !== "PUBLISHED") return null;
    if (
      typeof row.publicationSourceRevision !== "string"
      || !/^[0-9a-f]{64}$/.test(row.publicationSourceRevision)
      || !row.publicationBaseline
      || typeof row.publicationBaseline !== "object"
      || !row.publicationFacts
      || typeof row.publicationFacts !== "object"
    ) throw new Error("Invalid catalogue adoption ledger.");
    const facts = row.publicationFacts;
    if (
      facts.title !== row.name
      || facts.category !== row.category
      || facts.colour !== row.colour
      || facts.sizeLabel !== row.taggedSize
      || facts.condition !== row.condition
      || facts.price !== row.price
      || facts.quantity !== 1
    ) throw new Error("Catalogue adoption facts drifted from the live row.");
    return databaseCatalogueRowToShopProduct({
      ...row,
      publicationId: null,
      publicationOrigin: null,
      publicationState: null,
      publicationSourceRevision: null,
      publicationMedia: null,
      publicationSlug: null,
      publicationFacts: null,
      publicationBaseline: null,
    });
  }
  if (row.publicationId) return dynamicCatalogueRowToShopProduct(row);
  if (
    row.availability !== "AVAILABLE"
    && row.availability !== "RESERVED"
    && row.availability !== "SOLD"
  ) throw new Error("Catalogue inventory is missing or invalid.");

  const slug = nonEmptyString(row.slug, "slug");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Invalid catalogue slug.");
  const sku = nonEmptyString(row.sku, "SKU");
  if (!/^JUW-[0-9]{3,}$/.test(sku)) throw new Error("Invalid catalogue SKU.");
  if (!Number.isSafeInteger(row.price) || row.price < 0) throw new Error("Invalid catalogue price.");
  if (!categories.has(row.category)) throw new Error("Invalid catalogue category.");
  if (!tones.has(row.tone)) throw new Error("Invalid catalogue tone.");
  if (!silhouettes.has(row.silhouette)) throw new Error("Invalid catalogue silhouette.");

  const publicProduct: WardrobePublicProduct = {
    slug,
    sku,
    name: nonEmptyString(row.name, "name"),
    category: row.category as WardrobePublicProduct["category"],
    price: row.price,
    taggedSize: nonEmptyString(row.taggedSize, "tagged size"),
    fit: nonEmptyString(row.fit, "fit"),
    condition: nonEmptyString(row.condition, "condition"),
    colour: nonEmptyString(row.colour, "colour"),
    availability: row.availability,
    drop: nonEmptyString(row.dropLabel, "drop label"),
    tone: row.tone as WardrobePublicProduct["tone"],
    silhouette: row.silhouette as WardrobePublicProduct["silhouette"],
    note: nonEmptyString(row.note, "note"),
    story: nonEmptyString(row.story, "story"),
    details: stringArray(row.details, "details"),
    measurements: parseMeasurements(row.measurements),
    modelAnchor: parseModelAnchor(row.modelAnchor),
    media: parseMedia(row.media, slug),
  };
  return wardrobePublicProductToShopProduct(publicProduct);
}

function adoptedBaselineRow(row: DatabaseCatalogueRow): DatabaseCatalogueRow {
  const baseline = row.publicationBaseline;
  if (!baseline || typeof baseline !== "object" || baseline.sku !== row.sku) {
    throw new Error("Invalid catalogue adoption baseline.");
  }
  const value = (key: string) => baseline[key];
  return {
    ...row,
    sku: nonEmptyString(value("sku"), "adoption baseline SKU"),
    slug: nonEmptyString(value("slug"), "adoption baseline slug"),
    name: nonEmptyString(value("name"), "adoption baseline name"),
    category: nonEmptyString(value("category"), "adoption baseline category"),
    price: Number(value("price")),
    taggedSize: nonEmptyString(value("tagged_size"), "adoption baseline tagged size"),
    fit: nonEmptyString(value("fit"), "adoption baseline fit"),
    condition: nonEmptyString(value("condition"), "adoption baseline condition"),
    colour: nonEmptyString(value("colour"), "adoption baseline colour"),
    dropLabel: nonEmptyString(value("drop_label"), "adoption baseline drop"),
    tone: nonEmptyString(value("tone"), "adoption baseline tone"),
    silhouette: nonEmptyString(value("silhouette"), "adoption baseline silhouette"),
    note: nonEmptyString(value("note"), "adoption baseline note"),
    story: nonEmptyString(value("story"), "adoption baseline story"),
    details: value("details") as string[],
    measurements: value("measurements") as Array<{ label: string; value: string }>,
    modelAnchor: value("model_anchor") as DatabaseCatalogueRow["modelAnchor"],
    media: value("media") as DatabaseCatalogueRow["media"],
  };
}

function fallbackProducts(): ShopProduct[] {
  return shopProducts.filter(isCurrentShopProduct).map((product) => ({
    ...product,
    availabilityConfirmed: false,
    details: [...product.details],
    measurements: product.measurements.map((measurement) => ({ ...measurement })),
    media: product.media?.map((item) => ({
      ...item,
      src: resolveShopPublicMediaUrl(item.src),
    })),
    modelTryout: product.modelTryout.modelStatus === "APPROVED"
      ? {
          ...product.modelTryout,
          frame: {
            ...product.modelTryout.frame,
            src: resolveShopPublicMediaUrl(product.modelTryout.frame.src),
          },
        }
      : product.modelTryout,
  }));
}

export function assertCatalogueReleaseLedger(
  ledger: CatalogueReleaseLedger | undefined,
  rowCount: number,
): void {
  if (
    !ledger
    || ledger.revision !== SHOP_PUBLIC_MEDIA_REVISION
    || ledger.checksum !== SHOP_PUBLIC_MEDIA_CATALOGUE_CHECKSUM
    || ledger.rowCount !== rowCount
  ) {
    throw new Error("The Neon catalogue release does not match the deployed media contract.");
  }
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [
        key,
        canonicalValue((value as Record<string, unknown>)[key]),
      ]),
    );
  }
  return value;
}

export function assertCataloguePresentation(rows: readonly DatabaseCatalogueRow[]): void {
  const products = [...rows]
    .sort((left, right) => left.sku.localeCompare(right.sku))
    .map((row) => ({
      sku: row.sku,
      slug: row.slug,
      name: row.name,
      category: row.category,
      price: row.price,
      taggedSize: row.taggedSize,
      fit: row.fit,
      condition: row.condition,
      colour: row.colour,
      drop: row.dropLabel,
      tone: row.tone,
      silhouette: row.silhouette,
      note: row.note,
      story: row.story,
      details: row.details,
      measurements: row.measurements,
      modelAnchor: row.modelAnchor,
      media: row.media,
    }));
  const payload = canonicalValue({
    schemaVersion: 2,
    revision: SHOP_PUBLIC_MEDIA_REVISION,
    products,
  });
  const checksum = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  if (checksum !== SHOP_PUBLIC_MEDIA_PRESENTATION_CHECKSUM) {
    throw new Error("The Neon catalogue rows do not match the deployed release.");
  }
}

async function readDatabaseCatalogue() {
  const database = getShopDb();
  const [rows, ledgerRows] = await withCatalogueTimeout(Promise.all([
    database
      .select({
        sku: shopCatalogueItems.sku,
        slug: shopCatalogueItems.slug,
        name: shopCatalogueItems.name,
        category: shopCatalogueItems.category,
        price: shopCatalogueItems.price,
        taggedSize: shopCatalogueItems.taggedSize,
        fit: shopCatalogueItems.fit,
        condition: shopCatalogueItems.condition,
        colour: shopCatalogueItems.colour,
        dropLabel: shopCatalogueItems.dropLabel,
        tone: shopCatalogueItems.tone,
        silhouette: shopCatalogueItems.silhouette,
        note: shopCatalogueItems.note,
        story: shopCatalogueItems.story,
        details: shopCatalogueItems.details,
        measurements: shopCatalogueItems.measurements,
        modelAnchor: shopCatalogueItems.modelAnchor,
        media: shopCatalogueItems.media,
        availability: shopInventory.availability,
        publicationId: studioCataloguePublications.id,
        publicationOrigin: studioCataloguePublications.origin,
        publicationState: studioCataloguePublications.state,
        publicationSourceRevision: studioCataloguePublications.sourceRevision,
        publicationMedia: studioCataloguePublications.media,
        publicationSlug: studioCataloguePublications.slug,
        publicationFacts: studioCataloguePublications.facts,
        publicationBaseline: studioCataloguePublications.baseline,
      })
      .from(shopCatalogueItems)
      .leftJoin(shopInventory, eq(shopCatalogueItems.sku, shopInventory.sku))
      .leftJoin(studioCataloguePublications, eq(shopCatalogueItems.sku, studioCataloguePublications.sku))
      .orderBy(asc(shopCatalogueItems.sku)),
    database
      .select({
        revision: shopSeedLedger.revision,
        checksum: shopSeedLedger.checksum,
        rowCount: shopSeedLedger.rowCount,
      })
      .from(shopSeedLedger)
      .where(eq(shopSeedLedger.namespace, "justurbanwears.shop.catalogue"))
      .orderBy(desc(shopSeedLedger.appliedAt))
      .limit(1),
  ]));
  const releaseRows = rows.flatMap((row) => {
    if (!row.publicationId) return [row];
    if (row.publicationOrigin === "CATALOGUE_ADOPTED") return [adoptedBaselineRow(row)];
    return [];
  });
  assertCatalogueReleaseLedger(ledgerRows[0], releaseRows.length);
  assertCataloguePresentation(releaseRows);
  return rows;
}

export async function loadServerShopProducts(
  readRows: () => Promise<DatabaseCatalogueRow[]> = readDatabaseCatalogue,
): Promise<ShopProduct[]> {
  try {
    const rows = await readRows();
    if (!rows.length) throw new Error("The catalogue is empty.");
    const products = rows.filter((row) => row.dropLabel === CURRENT_SHOP_DROP).flatMap((row) => {
      const product = databaseCatalogueRowToShopProduct(row);
      return product ? [product] : [];
    });
    if (!products.length) throw new Error("The catalogue has no public products.");
    if (
      new Set(products.map((product) => product.sku)).size !== products.length
      || new Set(products.map((product) => product.slug)).size !== products.length
    ) throw new Error("The catalogue contains duplicate identities.");
    return products;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown catalogue error.";
    console.error(`Neon catalogue unavailable; using fail-closed release data. ${message}`);
    return fallbackProducts();
  }
}

export function getServerShopProducts(): Promise<ShopProduct[]> {
  const now = Date.now();
  if (cachedCatalogue && cachedCatalogue.expiresAt > now) return cachedCatalogue.promise;
  const promise = loadServerShopProducts();
  cachedCatalogue = { expiresAt: now + CACHE_TTL_MS, promise };
  return promise;
}

export function invalidateServerShopCatalogue(): void {
  cachedCatalogue = undefined;
}

export async function getServerShopProduct(slug: string): Promise<ShopProduct | undefined> {
  const cached = (await getServerShopProducts()).find((product) => product.slug === slug);
  if (cached) return cached;
  // A publication receipt can land on a different server instance than its
  // first PDP request. One bounded authoritative miss refresh makes that link
  // immediately useful without removing the short index cache.
  const products = await loadServerShopProducts();
  cachedCatalogue = { expiresAt: Date.now() + CACHE_TTL_MS, promise: Promise.resolve(products) };
  return products.find((product) => product.slug === slug);
}
