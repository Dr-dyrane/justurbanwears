import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const MIGRATION_TAG = "0019_studio_atelier_external_authority";
const FROZEN_0018_SNAPSHOT_ID = "d6aea739-be2d-4d9c-81b3-97ddf2763ab8";
const EXTERNAL_AUTHORITY_TABLES = [
  "studio_atelier_adult_verification_receipts",
  "studio_atelier_consent_events",
  "studio_atelier_consent_grants",
  "studio_atelier_consent_projections",
  "studio_atelier_styling_advisories",
] as const;

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

test("0019 descends from the exact frozen 0018 lineage", () => {
  const frozenSql = source("../drizzle/shop-postgres/0018_studio_transactional_authority.sql");
  const frozenSnapshotSource = source("../drizzle/shop-postgres/meta/0018_snapshot.json");
  const frozenSnapshot = JSON.parse(frozenSnapshotSource) as {
    id: string;
    prevId: string;
  };
  const externalSnapshot = JSON.parse(
    source("../drizzle/shop-postgres/meta/0019_snapshot.json"),
  ) as { id: string; prevId: string };
  assert.equal(Buffer.byteLength(frozenSql), 62_439);
  assert.equal(
    sha256(frozenSql),
    "ba280c8782f6e700c654a968081b8f33a6cd90cca3a192771f8a896f1d2e5c7f",
  );
  assert.equal(
    sha256(frozenSnapshotSource),
    "f5eb6f022967f4503b4e00499f43873aa13c49f026c21e8fb1963c0e8cf03678",
  );
  assert.equal(frozenSnapshot.id, FROZEN_0018_SNAPSHOT_ID);
  assert.equal(externalSnapshot.prevId, frozenSnapshot.id);
  assert.notEqual(externalSnapshot.id, externalSnapshot.prevId);
});

test("0019 adds exactly the five external-authority tables", () => {
  const before = JSON.parse(
    source("../drizzle/shop-postgres/meta/0018_snapshot.json"),
  ) as { tables: Record<string, unknown> };
  const after = JSON.parse(
    source("../drizzle/shop-postgres/meta/0019_snapshot.json"),
  ) as { tables: Record<string, unknown> };
  const added = Object.keys(after.tables)
    .filter((key) => !(key in before.tables))
    .sort();
  const removed = Object.keys(before.tables)
    .filter((key) => !(key in after.tables));
  const changed = Object.keys(before.tables)
    .filter((key) => key in after.tables)
    .filter((key) => JSON.stringify(before.tables[key]) !== JSON.stringify(after.tables[key]));
  assert.deepEqual(
    added,
    EXTERNAL_AUTHORITY_TABLES.map((table) => `public.${table}`).sort(),
  );
  assert.deepEqual(removed, []);
  assert.deepEqual(changed, []);
});

test("0019 SQL is external-authority-only and carries its fail-closed constraints", () => {
  const migration = source(`../drizzle/shop-postgres/${MIGRATION_TAG}.sql`);
  const created = [...migration.matchAll(/^CREATE TABLE "([^"]+)"/gm)]
    .map((match) => match[1])
    .sort();
  const altered = [...migration.matchAll(/^ALTER TABLE "([^"]+)"/gm)]
    .map((match) => match[1]);
  assert.deepEqual(created, [...EXTERNAL_AUTHORITY_TABLES].sort());
  assert.equal(altered.every((table) => EXTERNAL_AUTHORITY_TABLES.includes(
    table as (typeof EXTERNAL_AUTHORITY_TABLES)[number],
  )), true);
  assert.doesNotMatch(migration, /adoption/i);
  assert.match(migration, /studio_atelier_consent_events_operator_idempotency_unique/);
  assert.match(migration, /studio_atelier_consent_projections_revision_positive/);
  assert.match(migration, /studio_atelier_consent_grants_non_zdr/);
  assert.match(migration, /studio_atelier_adult_verification_time_order/);
  assert.match(migration, /studio_atelier_styling_advisories_content_addressed/);
  assert.match(migration, /studio_atelier_styling_advisories_boundary/);
});

test("the journal preserves exact 0018 to 0019 identity before any later monotonic entries", () => {
  const journal = JSON.parse(
    source("../drizzle/shop-postgres/meta/_journal.json"),
  ) as { entries: Array<{ idx: number; when: number; tag: string }> };
  const previousMatches = journal.entries.filter((entry) => entry.idx === 18);
  const currentMatches = journal.entries.filter((entry) => entry.idx === 19);
  const previous = previousMatches[0];
  const current = currentMatches[0];
  assert.equal(previousMatches.length, 1);
  assert.equal(currentMatches.length, 1);
  assert.deepEqual(previous, {
    idx: 18,
    when: 1_787_893_200_000,
    tag: "0018_studio_transactional_authority",
    version: "7",
    breakpoints: true,
  });
  assert.equal(current?.idx, 19);
  assert.equal(current?.tag, MIGRATION_TAG);
  assert.equal(current?.when, 1_787_893_200_001);
  assert.equal((current?.when ?? 0) > (previous?.when ?? 0), true);
  const previousPosition = journal.entries.findIndex((entry) => entry.idx === 18);
  const currentPosition = journal.entries.findIndex((entry) => entry.idx === 19);
  assert.equal(currentPosition, previousPosition + 1);
  const later = journal.entries.slice(currentPosition + 1);
  assert.equal(later.every((entry, index) => {
    const predecessor = index === 0 ? current : later[index - 1];
    return entry.idx === 20 + index
      && entry.when > (predecessor?.when ?? 0);
  }), true);
});
