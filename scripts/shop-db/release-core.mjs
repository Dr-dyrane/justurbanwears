import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const CATALOGUE_NAMESPACE = "justurbanwears.shop.catalogue";
export const EXPECTED_CATALOGUE_ROWS = 47;
export const LEGACY_CATALOGUE_SKUS = Object.freeze(
  Array.from({ length: 12 }, (_, index) => `DYN-${String(index + 81).padStart(3, "0")}`),
);
export const PRODUCTION_CONFIRMATION = "APPLY_JUSTURBANWEARS_PRODUCTION";
export const ADMIN_LOCK_SQL = "select pg_advisory_xact_lock(hashtextextended('justurban-wears:shop-db-admin', 0))";
export const INVENTORY_PROTECTED_COLUMNS = Object.freeze([
  "availability",
  "on_hand",
  "reserved",
  "sold",
  "returned",
  "write_off",
  "updated_at",
]);

const TARGETS = new Set(["local", "preview", "production"]);
const AVAILABILITIES = new Set(["AVAILABLE", "RESERVED", "SOLD", "ARCHIVED"]);
const MEDIA_SLOTS = new Set([
  "GARMENT_FRONT",
  "GARMENT_BACK",
  "MANNEQUIN_FRONT",
  "MODEL_FRONT",
  "MODEL_LEFT_PROFILE",
  "MODEL_REAR_THREE_QUARTER",
  "MODEL_REAR_MIRROR",
  "MODEL_DETAIL",
  "CONSTRUCTION_DETAIL",
  "FABRIC_DETAIL",
]);
const MODEL_MEDIA_SLOTS = new Set([
  "MODEL_FRONT",
  "MODEL_LEFT_PROFILE",
  "MODEL_REAR_THREE_QUARTER",
  "MODEL_REAR_MIRROR",
  "MODEL_DETAIL",
]);
const MODEL_ANCHOR_IDS = new Set(["lulu-v2", "lulu-v3", "lulu-v4"]);
const REQUIRED_MEDIA_SLOTS = ["GARMENT_FRONT", "GARMENT_BACK", "MANNEQUIN_FRONT"];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function nonEmptyString(value, label) {
  invariant(typeof value === "string" && value.trim() === value && value.length > 0, `${label} must be a non-empty trimmed string.`);
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

export function canonicalStringify(value) {
  return JSON.stringify(canonicalValue(value));
}

export function manifestChecksum(manifest) {
  return createHash("sha256").update(canonicalStringify(manifest)).digest("hex");
}

export function assertExpectedManifestChecksum(env, actualChecksum, { mutating, target }) {
  const expected = env.SHOP_DB_EXPECTED_MANIFEST_CHECKSUM?.trim().toLowerCase();
  if (expected) {
    invariant(/^[0-9a-f]{64}$/.test(expected), "SHOP_DB_EXPECTED_MANIFEST_CHECKSUM must be a lowercase SHA-256 checksum.");
    invariant(expected === actualChecksum, "The checked-in manifest does not match SHOP_DB_EXPECTED_MANIFEST_CHECKSUM.");
  }
  if (mutating && target === "production") {
    invariant(expected, "Production writes require SHOP_DB_EXPECTED_MANIFEST_CHECKSUM.");
  }
}

export function queryRows(result) {
  invariant(result && Array.isArray(result.rows), "Database driver returned an unexpected query result.");
  return result.rows;
}

/**
 * @param {Record<string, any>} manifest
 * @param {{ assetRoot?: string, expectedRows?: number }} [options]
 */
export function validateManifest(manifest, { assetRoot, expectedRows = EXPECTED_CATALOGUE_ROWS } = {}) {
  invariant(manifest && typeof manifest === "object", "Catalogue manifest must be an object.");
  invariant(manifest.schemaVersion === 2, "Catalogue manifest schemaVersion must be 2.");
  nonEmptyString(manifest.revision, "Catalogue revision");
  invariant(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(manifest.revision), "Catalogue revision has an invalid format.");
  invariant(Array.isArray(manifest.products), "Catalogue products must be an array.");
  invariant(manifest.products.length === expectedRows, `Catalogue manifest must contain exactly ${expectedRows} products.`);

  const seenSkus = new Set();
  const seenSlugs = new Set();
  const assetPaths = [];
  for (const [index, product] of manifest.products.entries()) {
    const label = `products[${index}]`;
    for (const field of ["sku", "slug", "name", "category", "taggedSize", "fit", "condition", "colour", "drop", "tone", "silhouette", "note", "story"]) {
      nonEmptyString(product[field], `${label}.${field}`);
    }
    invariant(/^JUW-\d{3}$/.test(product.sku), `${label}.sku must use the immutable JUW-NNN form.`);
    invariant(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug), `${label}.slug must be kebab-case.`);
    invariant(!seenSkus.has(product.sku), `Duplicate catalogue SKU: ${product.sku}.`);
    invariant(!seenSlugs.has(product.slug), `Duplicate catalogue slug: ${product.slug}.`);
    seenSkus.add(product.sku);
    seenSlugs.add(product.slug);
    invariant(Number.isInteger(product.price) && product.price >= 0, `${label}.price must be a nonnegative integer.`);
    invariant(AVAILABILITIES.has(product.availability), `${label}.availability is invalid.`);
    invariant(Array.isArray(product.details) && product.details.every((item) => typeof item === "string" && item.length > 0), `${label}.details must be strings.`);
    invariant(Array.isArray(product.measurements) && product.measurements.every((item) => item && typeof item.label === "string" && typeof item.value === "string"), `${label}.measurements are invalid.`);
    invariant(MODEL_ANCHOR_IDS.has(product.modelAnchor?.id), `${label}.modelAnchor is not an approved Lulu model version.`);
    invariant(
      product.modelAnchor.id === "lulu-v2"
        ? product.modelAnchor.src === "/shop/model/lulu-v2-approved.png"
        : product.modelAnchor.src === undefined,
      `${label}.modelAnchor exposes an invalid public source.`,
    );
    invariant(Array.isArray(product.media), `${label}.media must be an array.`);
    const slots = new Set();
    for (const media of product.media) {
      invariant(MEDIA_SLOTS.has(media?.slot), `${label} contains an invalid media slot.`);
      invariant(!slots.has(media.slot), `${label} contains duplicate media slot ${media.slot}.`);
      slots.add(media.slot);
      const prefix = `/shop/products/${product.slug}/`;
      invariant(typeof media.src === "string" && media.src.startsWith(prefix) && !media.src.includes("/storage/"), `${label} contains a non-public media path.`);
      if (MODEL_MEDIA_SLOTS.has(media.slot)) {
        invariant(MODEL_ANCHOR_IDS.has(media.modelAnchorId), `${label}.${media.slot} is missing an approved model anchor id.`);
      } else {
        invariant(media.modelAnchorId === undefined, `${label}.${media.slot} must not carry a model anchor id.`);
      }
      assetPaths.push(media.src);
    }
    for (const slot of REQUIRED_MEDIA_SLOTS) invariant(slots.has(slot), `${label} is missing ${slot}.`);
    invariant(
      slots.has("FABRIC_DETAIL") !== slots.has("CONSTRUCTION_DETAIL"),
      `${label} must contain exactly one truthful detail slot.`,
    );
    const modelFront = product.media.find((media) => media.slot === "MODEL_FRONT");
    if (modelFront) {
      invariant(
        modelFront.modelAnchorId === product.modelAnchor.id,
        `${label}.MODEL_FRONT must match the product primary model anchor.`,
      );
    }
    const stock = product.initialInventory;
    invariant(stock && stock.availability === product.availability, `${label}.initialInventory availability must match presentation availability.`);
    for (const field of ["onHand", "reserved", "sold", "returned", "writeOff"]) {
      invariant(Number.isInteger(stock[field]) && stock[field] >= 0, `${label}.initialInventory.${field} must be nonnegative.`);
    }
    invariant(stock.reserved <= stock.onHand, `${label} has more reserved than on-hand stock.`);
    invariant(stock.returned <= stock.sold, `${label} has more returns than sales.`);
    invariant(stock.onHand + stock.sold - stock.returned + stock.writeOff === 1, `${label} violates one-off inventory conservation.`);
    invariant(
      (stock.availability === "AVAILABLE" && stock.onHand === 1 && stock.reserved === 0)
      || (stock.availability === "RESERVED" && stock.onHand === 1 && stock.reserved === 1)
      || (stock.availability === "SOLD" && stock.onHand === 0 && stock.reserved === 0 && stock.sold > stock.returned)
      || (stock.availability === "ARCHIVED" && stock.reserved === 0),
      `${label} has inconsistent availability and one-off inventory counts.`,
    );
  }

  assetPaths.push("/shop/model/lulu-v2-approved.png");
  if (assetRoot) {
    for (const publicPath of assetPaths) {
      invariant(existsSync(join(assetRoot, publicPath.slice(1))), `Manifest asset is missing: ${publicPath}.`);
    }
  }
  return { checksum: manifestChecksum(manifest), productCount: manifest.products.length };
}

export function decideRevision(existing, { namespace, revision, checksum, rowCount, target }) {
  if (!existing) return "apply";
  invariant(existing.namespace === namespace && existing.revision === revision, "Seed ledger identity does not match the requested revision.");
  if (existing.checksum !== checksum) throw new Error(`Seed revision ${revision} already exists with a different checksum.`);
  if (Number(existing.row_count ?? existing.rowCount) !== rowCount) throw new Error(`Seed revision ${revision} has an inconsistent row count.`);
  if (target && existing.target !== target) throw new Error(`Seed revision ${revision} was recorded for a different target.`);
  return "noop";
}

function directUrlFromEnvironment(env) {
  const unpooled = env.DATABASE_URL_UNPOOLED?.trim();
  const nonPooling = env.POSTGRES_URL_NON_POOLING?.trim();
  if (unpooled && nonPooling && unpooled !== nonPooling) {
    throw new Error("DATABASE_URL_UNPOOLED and POSTGRES_URL_NON_POOLING conflict; provide one direct admin URL.");
  }
  const value = unpooled || nonPooling;
  if (!value) {
    const runtimeHint = env.DATABASE_URL || env.POSTGRES_URL
      ? " Runtime/pooled DATABASE_URL and POSTGRES_URL are deliberately not accepted."
      : "";
    throw new Error(`A direct admin URL is required in DATABASE_URL_UNPOOLED or POSTGRES_URL_NON_POOLING.${runtimeHint}`);
  }
  return value;
}

export function resolveDatabaseAccess(env, { mutating = false } = {}) {
  const target = env.SHOP_DB_TARGET?.trim();
  invariant(TARGETS.has(target), "SHOP_DB_TARGET must be exactly local, preview, or production.");
  const rawUrl = directUrlFromEnvironment(env);
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("The direct admin URL is not a valid URL.");
  }
  invariant(parsed.protocol === "postgres:" || parsed.protocol === "postgresql:", "The direct admin URL must use postgres:// or postgresql://.");
  invariant(!parsed.hostname.includes("-pooler") && !parsed.hostname.includes(".pooler."), "A pooled endpoint cannot be used for shop database administration.");
  invariant(parsed.searchParams.get("pgbouncer") !== "true", "A PgBouncer endpoint cannot be used for shop database administration.");
  const expectedHost = env.SHOP_DB_EXPECTED_HOST?.trim().toLowerCase();
  const expectedDatabase = env.SHOP_DB_EXPECTED_DATABASE?.trim();
  invariant(expectedHost, "SHOP_DB_EXPECTED_HOST is required as a target guard.");
  invariant(expectedDatabase, "SHOP_DB_EXPECTED_DATABASE is required as a target guard.");
  invariant(parsed.hostname.toLowerCase() === expectedHost, "The direct admin URL host does not match SHOP_DB_EXPECTED_HOST.");
  invariant(decodeURIComponent(parsed.pathname.replace(/^\//, "")) === expectedDatabase, "The direct admin URL database does not match SHOP_DB_EXPECTED_DATABASE.");
  if (env.VERCEL_ENV === "production") invariant(target === "production", "VERCEL_ENV=production requires SHOP_DB_TARGET=production.");
  if (env.VERCEL_ENV === "preview") invariant(target === "preview", "VERCEL_ENV=preview requires SHOP_DB_TARGET=preview.");
  if (mutating && target === "production") {
    invariant(env.SHOP_DB_PRODUCTION_CONFIRM === PRODUCTION_CONFIRMATION, `Production writes require SHOP_DB_PRODUCTION_CONFIRM=${PRODUCTION_CONFIRMATION}.`);
  }
  return { databaseUrl: rawUrl, target };
}

export function validateGitSha(value) {
  invariant(typeof value === "string" && /^[0-9a-f]{7,64}$/.test(value), "A 7–64 character lowercase hexadecimal git SHA is required.");
  return value;
}

export async function withLockedTransaction(client, work) {
  let began = false;
  try {
    await client.query("begin");
    began = true;
    await client.query("select set_config('lock_timeout', $1, true)", ["30s"]);
    await client.query(ADMIN_LOCK_SQL);
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    if (began) {
      try {
        await client.query("rollback");
      } catch {
        // Preserve the original failure; closing the client releases the transaction.
      }
    }
    throw error;
  }
}

export function loadMigrations(migrationDirectory) {
  const journal = JSON.parse(readFileSync(join(migrationDirectory, "meta/_journal.json"), "utf8"));
  invariant(Array.isArray(journal.entries), "Drizzle migration journal is invalid.");
  return journal.entries.map((entry) => {
    const source = readFileSync(join(migrationDirectory, `${entry.tag}.sql`), "utf8")
      .replace(/\r\n/g, "\n");
    return {
      tag: entry.tag,
      createdAt: Number(entry.when),
      hash: createHash("sha256").update(source).digest("hex"),
      statements: source.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean),
    };
  });
}

export function decideMigrations(localMigrations, appliedRows) {
  const remote = [...appliedRows].sort((a, b) => Number(a.created_at) - Number(b.created_at));
  invariant(remote.length <= localMigrations.length, "Database contains unknown future shop migrations.");
  for (let index = 0; index < remote.length; index += 1) {
    const local = localMigrations[index];
    const applied = remote[index];
    invariant(Number(applied.created_at) === local.createdAt, "Database migration history is not a prefix of the checked-in journal.");
    invariant(applied.hash === local.hash, `Migration checksum mismatch for ${local.tag}.`);
  }
  return { applied: remote.length, pending: localMigrations.slice(remote.length) };
}

const catalogueColumns = [
  "sku", "slug", "name", "category", "price", "tagged_size", "fit", "condition", "colour",
  "drop_label", "tone", "silhouette", "note", "story", "details", "measurements", "model_anchor", "media",
];
const catalogueUpdateColumns = catalogueColumns.filter((column) => column !== "sku");

function catalogueValues(product) {
  return [
    product.sku, product.slug, product.name, product.category, product.price, product.taggedSize,
    product.fit, product.condition, product.colour, product.drop, product.tone, product.silhouette,
    product.note, product.story, JSON.stringify(product.details), JSON.stringify(product.measurements),
    JSON.stringify(product.modelAnchor), JSON.stringify(product.media),
  ];
}

export function buildCatalogueMutationPlan(manifest, { mode, target, gitSha }) {
  invariant(mode === "seed" || mode === "descriptive-sync", "Catalogue mode must be seed or descriptive-sync.");
  invariant(TARGETS.has(target), "Catalogue target is invalid.");
  validateGitSha(gitSha);
  const { checksum, productCount } = validateManifest(manifest);
  const placeholders = catalogueColumns.map((_, index) => `$${index + 1}`).join(", ");
  const conflict = mode === "seed"
    ? "do nothing"
    : `do update set ${catalogueUpdateColumns.map((column) => `"${column}" = excluded."${column}"`).join(", ")}, "updated_at" = now()`;
  const catalogue = manifest.products.map((product) => ({
    text: `insert into "shop_catalogue_items" (${catalogueColumns.map((column) => `"${column}"`).join(", ")}) values (${placeholders}) on conflict ("sku") ${conflict}`,
    values: catalogueValues(product),
  }));
  const inventory = manifest.products.map((product) => ({
    text: "insert into \"shop_inventory\" (\"sku\", \"availability\", \"on_hand\", \"reserved\", \"sold\", \"returned\", \"write_off\") values ($1, $2, $3, $4, $5, $6, $7) on conflict (\"sku\") do nothing",
    values: [
      product.sku,
      product.initialInventory.availability,
      product.initialInventory.onHand,
      product.initialInventory.reserved,
      product.initialInventory.sold,
      product.initialInventory.returned,
      product.initialInventory.writeOff,
    ],
  }));
  const ledger = {
    text: "insert into \"shop_seed_ledger\" (\"namespace\", \"revision\", \"target\", \"git_sha\", \"checksum\", \"row_count\", \"operation\") values ($1, $2, $3, $4, $5, $6, $7)",
    values: [CATALOGUE_NAMESPACE, manifest.revision, target, gitSha, checksum, productCount, mode],
  };
  return { catalogue, checksum, inventory, ledger, namespace: CATALOGUE_NAMESPACE, productCount, revision: manifest.revision };
}

export function compareCatalogueRows(manifest, catalogueRows, inventoryRows) {
  const expected = new Map(manifest.products.map((product) => [product.sku, product]));
  const actualCatalogue = new Map(catalogueRows.map((row) => [row.sku, row]));
  const actualInventory = new Set(inventoryRows.map((row) => row.sku));
  const issues = [];
  for (const row of catalogueRows) {
    if (!expected.has(row.sku)) issues.push(`Unexpected legacy catalogue row ${row.sku}.`);
  }
  for (const row of inventoryRows) {
    if (!expected.has(row.sku)) issues.push(`Unexpected legacy inventory row ${row.sku}.`);
  }
  for (const [sku, product] of expected) {
    const row = actualCatalogue.get(sku);
    if (!row) {
      issues.push(`Missing catalogue row ${sku}.`);
      continue;
    }
    const fields = {
      slug: product.slug, name: product.name, category: product.category, price: product.price,
      tagged_size: product.taggedSize, fit: product.fit, condition: product.condition,
      colour: product.colour, drop_label: product.drop, tone: product.tone,
      silhouette: product.silhouette, note: product.note, story: product.story,
      details: product.details, measurements: product.measurements,
      model_anchor: product.modelAnchor, media: product.media,
    };
    for (const [field, value] of Object.entries(fields)) {
      if (canonicalStringify(row[field]) !== canonicalStringify(value)) issues.push(`${sku}.${field} differs from the manifest.`);
    }
    if (!actualInventory.has(sku)) issues.push(`Missing inventory row ${sku}.`);
  }
  return issues;
}
