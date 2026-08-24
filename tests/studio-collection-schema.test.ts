import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaSource = readFileSync(join(repositoryRoot, "db/shop-postgres-schema.ts"), "utf8");
const journal = JSON.parse(
  readFileSync(join(repositoryRoot, "drizzle/shop-postgres/meta/_journal.json"), "utf8"),
) as { entries: Array<{ idx: number; tag: string }> };
const migrationEntry = journal.entries.find((entry) => entry.idx === 12);

assert.ok(migrationEntry, "expected additive collection migration 0012");

const migrationSource = readFileSync(
  join(repositoryRoot, "drizzle/shop-postgres", `${migrationEntry.tag}.sql`),
  "utf8",
);
const snapshot = JSON.parse(
  readFileSync(join(repositoryRoot, "drizzle/shop-postgres/meta/0012_snapshot.json"), "utf8"),
) as {
  tables: Record<string, {
    columns: Record<string, { notNull: boolean }>;
    foreignKeys: Record<string, { onDelete: string; tableTo: string }>;
    indexes: Record<string, { isUnique: boolean; where?: string }>;
    checkConstraints: Record<string, unknown>;
  }>;
  enums: Record<string, { values: string[] }>;
};

test("defines strict first-class collection identity and lifecycle constraints", () => {
  assert.match(schemaSource, /shopCollectionState = pgEnum\("shop_collection_state"/);
  assert.match(schemaSource, /shopCollections = pgTable\("shop_collections"/);
  assert.match(schemaSource, /shop_collections_one_active_unique/);
  assert.match(schemaSource, /shop_collections_lifecycle_timestamps/);

  const collection = snapshot.tables["public.shop_collections"];
  assert.ok(collection);
  assert.deepEqual(snapshot.enums["public.shop_collection_state"].values, [
    "DRAFT",
    "ACTIVE",
    "ARCHIVED",
  ]);
  assert.equal(collection.indexes.shop_collections_key_unique.isUnique, true);
  assert.equal(collection.indexes.shop_collections_ordinal_unique.isUnique, true);
  assert.equal(collection.indexes.shop_collections_one_active_unique.isUnique, true);
  assert.match(collection.indexes.shop_collections_one_active_unique.where ?? "", /ACTIVE/);
  assert.ok(collection.checkConstraints.shop_collections_lifecycle_timestamps);
});

test("keeps catalogue and wardrobe collection relationships nullable and restrictive", () => {
  const catalogue = snapshot.tables["public.shop_catalogue_items"];
  const wardrobe = snapshot.tables["public.studio_wardrobe_items"];

  assert.equal(catalogue.columns.collection_id.notNull, false);
  assert.equal(wardrobe.columns.target_collection_id.notNull, false);
  const catalogueForeignKey =
    catalogue.foreignKeys.shop_catalogue_items_collection_id_shop_collections_id_fk;
  const wardrobeForeignKey =
    wardrobe.foreignKeys.studio_wardrobe_items_target_collection_id_shop_collections_id_fk;
  assert.equal(catalogueForeignKey.tableTo, "shop_collections");
  assert.equal(catalogueForeignKey.onDelete, "restrict");
  assert.equal(wardrobeForeignKey.tableTo, "shop_collections");
  assert.equal(wardrobeForeignKey.onDelete, "restrict");
});

test("backfills canonical membership by exact SKU without rewriting legacy labels", () => {
  assert.match(migrationSource, /'drop-01', 'Drop 01', 1, 1, 'ARCHIVED'/);
  assert.match(migrationSource, /'drop-02', 'Drop 02', 2, 1, 'ACTIVE'/);
  assert.match(migrationSource, /SHOP_COLLECTION_CANONICAL_MEMBERSHIP_MISSING/);
  assert.match(migrationSource, /SHOP_COLLECTION_CANONICAL_MEMBERSHIP_NOT_BACKFILLED/);
  assert.match(migrationSource, /'JUW-001'.*'JUW-021'/s);
  assert.match(migrationSource, /'JUW-025'.*'JUW-040'.*'JUW-042'/s);
  assert.match(migrationSource, /catalogue\."sku" = ANY/);
  assert.doesNotMatch(migrationSource, /SHOP_COLLECTION_UNKNOWN_DROP_LABEL/);
  assert.doesNotMatch(migrationSource, /SET\s+"drop_label"/i);
  assert.match(migrationSource, /SET "collection_id" = collection\."id"/);
  assert.match(migrationSource, /SET "target_collection_id" = catalogue\."collection_id"/);
  assert.doesNotMatch(migrationSource, /ALTER COLUMN "collection_id" SET NOT NULL/);
  assert.doesNotMatch(migrationSource, /ALTER COLUMN "target_collection_id" SET NOT NULL/);
});
