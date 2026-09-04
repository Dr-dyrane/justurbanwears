import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DROP_01_COMPLETED_SKUS, DROP_02_COMPATIBILITY_SKUS } from "../lib/shop/collection-compatibility";
import { SHOP_CATALOGUE_MANIFEST } from "../scripts/shop-db/catalogue-manifest.mjs";

const migration = readFileSync(
  `${process.cwd()}/drizzle/shop-postgres/0030_align_drop_02_membership.sql`,
  "utf8",
);

function migrationArray(name: string) {
  const match = migration.match(new RegExp(`${name} text\\[\\] := ARRAY\\[([\\s\\S]*?)\\n\\t\\];`));
  assert.ok(match, `${name} must be declared in the guarded migration`);
  return [...match[1]!.matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

test("the guarded migration adopts the exact approved Drop 02 release membership", () => {
  const releasedDrop02 = SHOP_CATALOGUE_MANIFEST.products
    .filter((product) => product.drop === "Drop 02")
    .map((product) => product.sku);

  assert.deepEqual(migrationArray("drop_01_skus"), [...DROP_01_COMPLETED_SKUS]);
  assert.deepEqual(migrationArray("drop_02_skus"), [...DROP_02_COMPATIBILITY_SKUS]);
  assert.deepEqual(migrationArray("drop_02_skus"), releasedDrop02);
  assert.equal(releasedDrop02.length, 34);
  assert.equal(releasedDrop02[0], "JUW-025");
  assert.equal(releasedDrop02.at(-1), "JUW-058");
});

test("the alignment migration fails closed and does not rewrite adjacent business truth", () => {
  assert.match(migration, /SHOP_COLLECTION_LIFECYCLE_MISMATCH/);
  assert.match(migration, /DROP_01_MEMBERSHIP_MISMATCH/);
  assert.match(migration, /DROP_02_RELEASE_MEMBERSHIP_MISMATCH/);
  assert.match(migration, /DROP_02_WARDROBE_TARGET_CONFLICT/);
  assert.match(migration, /SHOP_COLLECTION_FINAL_MEMBERSHIP_MISMATCH/);
  assert.match(migration, /DROP_02_WARDROBE_TARGET_NOT_BACKFILLED/);
  assert.match(migration, /SET collection_id = drop_02_id/);
  assert.match(migration, /SET target_collection_id = drop_02_id/);
  assert.match(migration, /SET version = version \+ 1, updated_at = now\(\)/);
  assert.doesNotMatch(migration, /UPDATE\s+shop_inventory/i);
  assert.doesNotMatch(migration, /UPDATE\s+shop_orders/i);
  assert.doesNotMatch(migration, /UPDATE\s+studio_media/i);
  assert.doesNotMatch(migration, /UPDATE\s+studio_catalogue_publications/i);
  assert.doesNotMatch(migration, /SET\s+drop_label/i);
});
