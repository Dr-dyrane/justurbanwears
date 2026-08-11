import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { SHOP_CATALOGUE_MANIFEST } from "../scripts/shop-db/catalogue-manifest.mjs";
import { applyCatalogueInTransaction } from "../scripts/shop-db/catalogue-operations.mjs";
import { safeErrorMessage } from "../scripts/shop-db/admin-client.mjs";
import {
  ADMIN_LOCK_SQL,
  assertExpectedManifestChecksum,
  buildCatalogueMutationPlan,
  canonicalStringify,
  compareCatalogueRows,
  decideMigrations,
  decideRevision,
  loadMigrations,
  manifestChecksum,
  PRODUCTION_CONFIRMATION,
  resolveDatabaseAccess,
  validateManifest,
  withLockedTransaction,
} from "../scripts/shop-db/release-core.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const expectedChecksum = "2a0bbd773e30209251b43114bb7cff89b19c71333da8ce7968eda5a24dd01a32";
const legacySkuRenames = Object.fromEntries(
  Array.from({ length: 12 }, (_, index) => [
    `DYN-${String(index + 81).padStart(3, "0")}`,
    `JUW-${String(index + 1).padStart(3, "0")}`,
  ]),
);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function guardedEnvironment(overrides = {}) {
  return {
    NODE_ENV: "test" as const,
    DATABASE_URL_UNPOOLED: "postgresql://admin:super-secret@ep-preview.example/neondb?sslmode=require",
    SHOP_DB_TARGET: "preview",
    SHOP_DB_EXPECTED_HOST: "ep-preview.example",
    SHOP_DB_EXPECTED_DATABASE: "neondb",
    ...overrides,
  };
}

function databaseCatalogueRows(manifest = SHOP_CATALOGUE_MANIFEST) {
  return manifest.products.map((product) => ({
    sku: product.sku,
    slug: product.slug,
    name: product.name,
    category: product.category,
    price: product.price,
    tagged_size: product.taggedSize,
    fit: product.fit,
    condition: product.condition,
    colour: product.colour,
    drop_label: product.drop,
    tone: product.tone,
    silhouette: product.silhouette,
    note: product.note,
    story: product.story,
    details: product.details,
    measurements: product.measurements,
    model_anchor: product.modelAnchor,
    media: product.media,
  }));
}

test("the checked-in manifest validates all 12 public assets and immutable SKUs", () => {
  assert.deepEqual(validateManifest(SHOP_CATALOGUE_MANIFEST, { assetRoot: join(repositoryRoot, "public") }), {
    checksum: expectedChecksum,
    productCount: 12,
  });
  assert.deepEqual(
    SHOP_CATALOGUE_MANIFEST.products.map((product) => product.sku),
    Array.from({ length: 12 }, (_, index) => `JUW-${String(index + 1).padStart(3, "0")}`),
  );
});

test("the release manifest exactly matches the approved browser presentation seeds", () => {
  const tsx = join(repositoryRoot, "node_modules/.bin/tsx");
  const source = execFileSync(tsx, [
    "-e",
    "import { WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS as rows } from './lib/wardrobe-public-view/seeds.ts'; console.log(JSON.stringify(rows));",
  ], { cwd: repositoryRoot, encoding: "utf8" });
  const releaseRows = SHOP_CATALOGUE_MANIFEST.products.map((product) => {
    const releaseProduct = clone(product);
    delete releaseProduct.initialInventory;
    return releaseProduct;
  });
  assert.deepEqual(releaseRows, JSON.parse(source));
});

test("manifest checksum is canonical, stable, and content-sensitive", () => {
  assert.equal(manifestChecksum(SHOP_CATALOGUE_MANIFEST), expectedChecksum);
  const reordered = {
    products: SHOP_CATALOGUE_MANIFEST.products.map((product) => Object.fromEntries(Object.entries(product).reverse())),
    revision: SHOP_CATALOGUE_MANIFEST.revision,
    schemaVersion: SHOP_CATALOGUE_MANIFEST.schemaVersion,
  };
  assert.equal(canonicalStringify(reordered), canonicalStringify(SHOP_CATALOGUE_MANIFEST));
  assert.equal(manifestChecksum(reordered), expectedChecksum);
  const changed = clone(SHOP_CATALOGUE_MANIFEST);
  changed.products[0].story += " Changed.";
  assert.notEqual(manifestChecksum(changed), expectedChecksum);
});

test("revision decisions no-op only for identical target evidence", () => {
  const request = {
    namespace: "justurbanwears.shop.catalogue",
    revision: SHOP_CATALOGUE_MANIFEST.revision,
    checksum: expectedChecksum,
    rowCount: 12,
    target: "preview",
  };
  assert.equal(decideRevision(undefined, request), "apply");
  assert.equal(decideRevision({ ...request, row_count: 12 }, request), "noop");
  assert.throws(() => decideRevision({ ...request, checksum: "0".repeat(64), row_count: 12 }, request), /different checksum/);
  assert.throws(() => decideRevision({ ...request, target: "production", row_count: 12 }, request), /different target/);
  assert.throws(() => decideRevision({ ...request, row_count: 11 }, request), /row count/);
});

test("credential and target guards accept only the declared direct database", () => {
  const access = resolveDatabaseAccess(guardedEnvironment(), { mutating: true });
  assert.equal(access.target, "preview");
  assert.match(access.databaseUrl, /ep-preview\.example/);
  assert.throws(
    () => resolveDatabaseAccess({ ...guardedEnvironment(), DATABASE_URL_UNPOOLED: "", DATABASE_URL: "postgresql://admin:super-secret@ep-preview.example/neondb" }),
    /deliberately not accepted/,
  );
  assert.throws(
    () => resolveDatabaseAccess(guardedEnvironment({ DATABASE_URL_UNPOOLED: "postgresql://admin:super-secret@ep-preview-pooler.example/neondb" })),
    /pooled endpoint/,
  );
  assert.throws(() => resolveDatabaseAccess(guardedEnvironment({ SHOP_DB_EXPECTED_HOST: "other.example" })), /host does not match/);
  assert.throws(() => resolveDatabaseAccess(guardedEnvironment({ SHOP_DB_TARGET: "staging" })), /local, preview, or production/);
  assert.throws(
    () => resolveDatabaseAccess(guardedEnvironment({ SHOP_DB_TARGET: "production" }), { mutating: true }),
    new RegExp(PRODUCTION_CONFIRMATION),
  );
  assert.doesNotThrow(() => resolveDatabaseAccess(guardedEnvironment({
    SHOP_DB_TARGET: "production",
    SHOP_DB_PRODUCTION_CONFIRM: PRODUCTION_CONFIRMATION,
  }), { mutating: true }));
  const credential = guardedEnvironment().DATABASE_URL_UNPOOLED;
  const redacted = safeErrorMessage(new Error(`connection failed for ${credential}: super-secret`), guardedEnvironment());
  assert.doesNotMatch(redacted, /super-secret|postgresql:\/\//);
});

test("production writes pin the exact manifest checksum before connection", () => {
  assert.throws(
    () => assertExpectedManifestChecksum({}, expectedChecksum, { mutating: true, target: "production" }),
    /require SHOP_DB_EXPECTED_MANIFEST_CHECKSUM/,
  );
  assert.throws(
    () => assertExpectedManifestChecksum({ SHOP_DB_EXPECTED_MANIFEST_CHECKSUM: "0".repeat(64) }, expectedChecksum, { mutating: true, target: "preview" }),
    /does not match/,
  );
  assert.doesNotThrow(() => assertExpectedManifestChecksum(
    { SHOP_DB_EXPECTED_MANIFEST_CHECKSUM: expectedChecksum },
    expectedChecksum,
    { mutating: true, target: "production" },
  ));
});

test("seed and descriptive sync never update operational inventory", () => {
  const options = { target: "preview", gitSha: "a".repeat(40) };
  const seed = buildCatalogueMutationPlan(SHOP_CATALOGUE_MANIFEST, { ...options, mode: "seed" });
  const sync = buildCatalogueMutationPlan(SHOP_CATALOGUE_MANIFEST, { ...options, mode: "descriptive-sync" });
  assert.equal(seed.inventory.length, 12);
  assert.ok(seed.inventory.every((query: { text: string }) => /on conflict \("sku"\) do nothing$/.test(query.text)));
  assert.ok(sync.inventory.every((query: { text: string }) => /on conflict \("sku"\) do nothing$/.test(query.text)));
  const updateClause = sync.catalogue[0].text.split("do update set ")[1];
  assert.ok(updateClause);
  assert.doesNotMatch(updateClause, /"sku"\s*=/);
  assert.doesNotMatch(updateClause, /"availability"|"on_hand"|"reserved"|"sold"|"returned"|"write_off"/);
  assert.equal(sync.ledger.values.at(-1), "descriptive-sync");
});

test("the transaction wrapper locks before work, commits success, and rolls back failure", async () => {
  type FakeClient = { query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }> };
  const successQueries: Array<[string, unknown[] | undefined]> = [];
  const successClient: FakeClient = { query: async (text, values) => { successQueries.push([text, values]); return { rows: [] }; } };
  await withLockedTransaction(successClient, async (client: FakeClient) => client.query("select work"));
  assert.deepEqual(successQueries.map(([text]) => text), [
    "begin",
    "select set_config('lock_timeout', $1, true)",
    ADMIN_LOCK_SQL,
    "select work",
    "commit",
  ]);

  const failureQueries: string[] = [];
  const failureClient: FakeClient = { query: async (text) => {
    failureQueries.push(text);
    if (text === "select work") throw new Error("injected failure");
    return { rows: [] };
  } };
  await assert.rejects(() => withLockedTransaction(failureClient, async (client: FakeClient) => client.query("select work")), /injected failure/);
  assert.equal(failureQueries.at(-1), "rollback");
  assert.equal(failureQueries.includes("commit"), false);
});

test("standalone catalogue apply verifies conflict results and writes the ledger last", async () => {
  const plan = buildCatalogueMutationPlan(SHOP_CATALOGUE_MANIFEST, {
    mode: "seed",
    target: "preview",
    gitSha: "a".repeat(40),
  });
  const queries: string[] = [];
  const transaction = { query: async (text: string) => {
    queries.push(text);
    if (text.startsWith('select * from "shop_catalogue_items"')) return { rows: databaseCatalogueRows() };
    if (text.startsWith('select "sku" from "shop_inventory"')) {
      return { rows: SHOP_CATALOGUE_MANIFEST.products.map((product) => ({ sku: product.sku })) };
    }
    return { rows: [] };
  } };
  assert.equal(
    await applyCatalogueInTransaction(transaction, SHOP_CATALOGUE_MANIFEST, plan, "preview"),
    "apply",
  );
  assert.match(queries[0], /"target" = \$3/);
  assert.equal(queries.at(-1), plan.ledger.text);
  assert.ok(queries.indexOf('select * from "shop_catalogue_items" where "sku" = any($1::varchar[])') < queries.length - 1);
});

test("migration planning verifies every applied hash and only permits a journal prefix", () => {
  const migrations = loadMigrations(join(repositoryRoot, "drizzle/shop-postgres"));
  assert.equal(migrations[0].hash, "073783a0e602ea233cc6bbeb0d4561433f9180b373ea50df88750fd3041cac94");
  assert.equal(decideMigrations(migrations, []).pending.length, migrations.length);
  const first = { hash: migrations[0].hash, created_at: migrations[0].createdAt };
  assert.equal(decideMigrations(migrations, [first]).applied, 1);
  assert.throws(() => decideMigrations(migrations, [{ ...first, hash: "0".repeat(64) }]), /checksum mismatch/);
  if (migrations.length > 1) {
    assert.throws(
      () => decideMigrations(migrations, [{ hash: migrations[1].hash, created_at: migrations[1].createdAt }]),
      /not a prefix/,
    );
  }
});

test("the forward SKU migration covers every retired alias and preserves inventory through cascade", () => {
  const migration = readFileSync(
    join(repositoryRoot, "drizzle/shop-postgres/0002_deep_steel_serpent.sql"),
    "utf8",
  );
  assert.match(migration, /ON UPDATE cascade/);
  assert.match(migration, /SKU migration changed operational inventory state/);
  assert.match(migration, /UPDATE "shop_order_items"/);
  const browserMigration = readFileSync(
    join(repositoryRoot, "lib/wardrobe-public-view/sku.ts"),
    "utf8",
  );
  for (const [legacySku, currentSku] of Object.entries(legacySkuRenames)) {
    assert.ok(migration.split(`'${legacySku}', '${currentSku}'`).length >= 2);
    assert.match(browserMigration, new RegExp(`\\["${legacySku}", "${currentSku}"\\]`));
  }
});

test("verification compares presentation but ignores mutable inventory counters", () => {
  const catalogueRows = databaseCatalogueRows();
  const inventoryRows = SHOP_CATALOGUE_MANIFEST.products.map((product) => ({
    sku: product.sku,
    availability: "ARCHIVED",
    on_hand: 0,
    sold: 99,
  }));
  assert.deepEqual(compareCatalogueRows(SHOP_CATALOGUE_MANIFEST, catalogueRows, inventoryRows), []);
  catalogueRows[0].story = "drift";
  assert.deepEqual(compareCatalogueRows(SHOP_CATALOGUE_MANIFEST, catalogueRows, inventoryRows), ["JUW-001.story differs from the manifest."]);
  assert.deepEqual(
    compareCatalogueRows(
      SHOP_CATALOGUE_MANIFEST,
      [...databaseCatalogueRows(), { ...databaseCatalogueRows()[0], sku: "DYN-081" }],
      inventoryRows,
    ),
    ["Unexpected legacy catalogue row DYN-081."],
  );
});

test("build and deployment remain free of database administration side effects", () => {
  const packageJson = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));
  assert.equal(packageJson.scripts["build:vercel"], "NITRO_PRESET=vercel vite build && node scripts/fix-vercel-output-routes.mjs");
  for (const scriptName of ["build", "build:vercel", "dev", "start"]) {
    assert.doesNotMatch(packageJson.scripts[scriptName], /shop-db|drizzle-kit\s+migrate|db:release|db:shop/);
  }
  for (const prefix of ["prebuild", "postbuild", "prestart", "poststart"]) assert.equal(packageJson.scripts[prefix], undefined);
  const vercelIgnore = readFileSync(join(repositoryRoot, ".vercelignore"), "utf8");
  assert.match(vercelIgnore, /^\/drizzle\/$/m);
  assert.match(vercelIgnore, /^\/scripts\/shop-db\/$/m);
  assert.match(vercelIgnore, /^\/\.codex\/$/m);
  assert.match(vercelIgnore, /^\/design\/identity-2026\/\*\*$/m);
  assert.match(vercelIgnore, /^!\/design\/identity-2026\/justurban-app-icon\.svg$/m);
  assert.match(vercelIgnore, /^!\/design\/identity-2026\/justurban-wordmark\.svg$/m);
  const gitIgnore = readFileSync(join(repositoryRoot, ".gitignore"), "utf8");
  assert.match(gitIgnore, /^\/\.codex\/$/m);
});
