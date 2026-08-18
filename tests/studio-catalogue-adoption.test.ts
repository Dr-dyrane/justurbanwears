import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const migration = readFileSync(`${root}/drizzle/shop-postgres/0011_motionless_the_call.sql`, "utf8");
const schema = readFileSync(`${root}/db/shop-postgres-schema.ts`, "utf8");
const catalogue = readFileSync(`${root}/lib/shop/server-catalog.ts`, "utf8");
const release = readFileSync(`${root}/scripts/shop-db/catalogue-operations.mjs`, "utf8");

test("the forward migration adopts the exact release catalogue under one existing owner", () => {
  const adoptedSkus = migration.match(/\('JUW-(?:00[1-9]|01[0-6]|020|021)'\)/g) ?? [];
  assert.equal(new Set(adoptedSkus).size, 18);
  assert.match(migration, /STUDIO_CATALOGUE_ADOPTION_OWNER_AMBIGUOUS/);
  assert.match(migration, /STUDIO_CATALOGUE_ADOPTION_MEDIA_INCOMPLETE/);
  assert.match(migration, /approved_asset_id, created_at, updated_at[\s\S]*?null,/);
  assert.match(migration, /'CATALOGUE_ADOPTED'/);
  assert.match(migration, /to_jsonb\(catalogue\) - 'created_at' - 'updated_at' AS baseline/);
  assert.match(migration, /digest\(convert_to/);
});

test("catalogue adoption preserves the immutable baseline while current facts remain order-authoritative", () => {
  assert.match(schema, /origin: varchar\("origin"/);
  assert.match(schema, /baseline: jsonb\("baseline"/);
  assert.match(catalogue, /publicationOrigin === "CATALOGUE_ADOPTED"/);
  assert.match(catalogue, /adoptedBaselineRow/);
  assert.match(release, /publication_baseline/);
  assert.match(release, /if \(!adoptedSkus\.has\(query\.values\[0\]\)\)/);
});
