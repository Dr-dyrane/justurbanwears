import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const MIGRATION_TAG = "0020_studio_atelier_shop_adoption_receipts";
const FROZEN_0019_SNAPSHOT_ID = "4f36dc5b-ccd2-4dfb-92d1-898adc8e57ea";
const ADOPTION_TABLES = [
  "studio_atelier_shop_adoption_media",
  "studio_atelier_shop_adoption_receipts",
] as const;

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

test("0020 descends from frozen 0019 and adds only the exact fail-closed Shop adoption ledger", () => {
  const frozenSql = source("../drizzle/shop-postgres/0019_studio_atelier_external_authority.sql");
  const frozenSnapshotSource = source("../drizzle/shop-postgres/meta/0019_snapshot.json");
  const frozenSnapshot = JSON.parse(frozenSnapshotSource) as {
    id: string;
    tables: Record<string, unknown>;
  };
  const adoptionSnapshot = JSON.parse(
    source("../drizzle/shop-postgres/meta/0020_snapshot.json"),
  ) as { id: string; prevId: string; tables: Record<string, unknown> };

  assert.equal(Buffer.byteLength(frozenSql), 16_229);
  assert.equal(
    sha256(frozenSql),
    "066326e3799bede35c4f0f691691ec05a4c0563507ed3aa5d42475eeec44fc0e",
  );
  assert.equal(Buffer.byteLength(frozenSnapshotSource), 317_959);
  assert.equal(
    sha256(frozenSnapshotSource),
    "87a9fab76ef5dd8b949f525b3af88d66ba8e92a9a434972ea4b37a42f20027e5",
  );
  assert.equal(frozenSnapshot.id, FROZEN_0019_SNAPSHOT_ID);
  assert.equal(adoptionSnapshot.prevId, frozenSnapshot.id);
  assert.notEqual(adoptionSnapshot.id, adoptionSnapshot.prevId);

  const added = Object.keys(adoptionSnapshot.tables)
    .filter((key) => !(key in frozenSnapshot.tables))
    .sort();
  const removed = Object.keys(frozenSnapshot.tables)
    .filter((key) => !(key in adoptionSnapshot.tables));
  const changed = Object.keys(frozenSnapshot.tables)
    .filter((key) => key in adoptionSnapshot.tables)
    .filter((key) =>
      JSON.stringify(frozenSnapshot.tables[key])
      !== JSON.stringify(adoptionSnapshot.tables[key])
    );
  assert.deepEqual(
    added,
    ADOPTION_TABLES.map((table) => `public.${table}`).sort(),
  );
  assert.deepEqual(removed, []);
  assert.deepEqual(changed, []);

  const migration = source(`../drizzle/shop-postgres/${MIGRATION_TAG}.sql`);
  const created = [...migration.matchAll(/^CREATE TABLE "([^"]+)"/gm)]
    .map((match) => match[1])
    .sort();
  const altered = [...migration.matchAll(/^ALTER TABLE "([^"]+)"/gm)]
    .map((match) => match[1]);
  assert.deepEqual(created, [...ADOPTION_TABLES].sort());
  assert.equal(altered.every((table) => ADOPTION_TABLES.includes(
    table as (typeof ADOPTION_TABLES)[number],
  )), true);
  assert.match(migration, /studio_atelier_shop_adoption_receipts_pkey/);
  assert.match(migration, /studio_atelier_shop_adoption_receipts_operator_idempotency_unique/);
  assert.match(migration, /studio_atelier_shop_adoption_receipts_wardrobe_unique/);
  assert.match(migration, /studio_atelier_shop_adoption_receipts_commit_tuple/);
  const payloadStart = migration.indexOf(
    'CONSTRAINT "studio_atelier_shop_adoption_receipts_payload"',
  );
  const commitStart = migration.indexOf(
    'CONSTRAINT "studio_atelier_shop_adoption_receipts_commit_tuple"',
  );
  const receiptTableEnd = migration.indexOf("\n);\n--> statement-breakpoint", commitStart);
  assert.ok(payloadStart >= 0 && payloadStart < commitStart && commitStart < receiptTableEnd);
  const payloadCheck = migration.slice(payloadStart, commitStart);
  const commitCheck = migration.slice(commitStart, receiptTableEnd);
  assert.match(payloadCheck, /receipt"->>'schemaVersion'/);
  assert.match(payloadCheck, /receipt"->>'receiptId'/);
  assert.match(payloadCheck, /receipt"->>'wardrobeItemId'/);
  assert.match(payloadCheck, /receipt"->>'garmentId'/);
  assert.match(payloadCheck, /receipt"->>'adoptionRevision'/);
  assert.match(payloadCheck, /jsonb_array_length[\s\S]+\) is true/);
  assert.match(commitCheck, /state" = 'COMMITTING'[\s\S]+publication_id" is null/);
  assert.match(commitCheck, /state" = 'COMMITTED'[\s\S]+publication_id" is not null/);
  assert.match(commitCheck, /sku" is not null[\s\S]+length\(trim\([^)]*sku"\)\) > 0/);
  assert.match(commitCheck, /slug" is not null[\s\S]+length\(trim\([^)]*slug"\)\) > 0/);
  assert.match(commitCheck, /committed_at" is not null[\s\S]+\) is true/);
  assert.match(migration, /studio_atelier_shop_adoption_media_pkey/);
  assert.match(migration, /studio_atelier_shop_adoption_media_receipt_ordinal_unique/);
  assert.match(migration, /studio_atelier_shop_adoption_media_role_order/);
  assert.match(migration, /MODEL_REAR_THREE_QUARTER'[\s\S]+ordinal" = 6/);
  assert.match(migration, /studio_atelier_shop_adoption_media_same_origin_src/);
  assert.match(migration, /\/api\/shop\/atelier-media\//);
  assert.match(migration, /studio_atelier_shop_adoption_media_artifact_hash/);
  assert.match(migration, /studio_atelier_shop_adoption_media_dimensions/);
  assert.doesNotMatch(migration, /blob_(?:pathname|url)|https?:\/\/|provider_(?:url|request_id)/i);

  const journal = JSON.parse(
    source("../drizzle/shop-postgres/meta/_journal.json"),
  ) as { entries: Array<{
    idx: number;
    version: string;
    when: number;
    tag: string;
    breakpoints: boolean;
  }> };
  const adoptionEntryIndex = journal.entries.findIndex((entry) => entry.tag === MIGRATION_TAG);
  assert.ok(adoptionEntryIndex > 0);
  assert.deepEqual(journal.entries[adoptionEntryIndex - 1], {
    idx: 19,
    version: "7",
    when: 1_787_893_200_001,
    tag: "0019_studio_atelier_external_authority",
    breakpoints: true,
  });
  assert.deepEqual(journal.entries[adoptionEntryIndex], {
    idx: 20,
    version: "7",
    when: 1_787_893_200_002,
    tag: MIGRATION_TAG,
    breakpoints: true,
  });
});
