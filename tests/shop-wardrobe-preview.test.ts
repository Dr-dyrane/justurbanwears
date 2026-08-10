import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { WARDROBE_DROP_01_PRODUCTS } from "../lib/wardrobe-public-view/drop-01";
import { WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS } from "../lib/wardrobe-public-view/seeds";

const expectedNames = [
  "Blush Scoop Mini Dress",
  "Orchid Beaded Column Gown",
  "Sage Asymmetric Ruched Maxi Dress",
  "Magenta Plunge Ruched Mini Dress",
  "Silver Off-Shoulder Mermaid Dress",
  "Multicolor Abstract Strapless Mini Dress",
];

test("the six wardrobe dresses are saleable Drop 01 rows, not a separate preview catalogue", () => {
  assert.deepEqual(WARDROBE_DROP_01_PRODUCTS.map((product) => product.name), expectedNames);
  for (const product of WARDROBE_DROP_01_PRODUCTS) {
    assert.equal(product.drop, "Drop 01");
    assert.equal(product.availability, "AVAILABLE");
    assert.equal(product.category, "Dresses");
    assert.ok(product.price > 0);
    assert.equal(product.taggedSize, "Size on request");
  }

  const releaseSlugs = new Set<string>(WARDROBE_DROP_01_PRODUCTS.map((product) => product.slug));
  const saleRows = WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.filter((product) => releaseSlugs.has(product.slug));
  assert.equal(saleRows.length, 6);
  assert.deepEqual(saleRows.map((product) => product.slug), WARDROBE_DROP_01_PRODUCTS.map((product) => product.slug));
  for (const product of saleRows) {
    const expectedMedia = [
      "GARMENT_FRONT",
      "GARMENT_BACK",
      "MANNEQUIN_FRONT",
      ...(product.slug === "magenta-plunge-ruched-mini-dress" ? [] : ["MODEL_FRONT"]),
      "FABRIC_DETAIL",
    ];
    assert.deepEqual(product.media.map((item) => item.slot), expectedMedia);
    assert.doesNotMatch(JSON.stringify(product), /storage\/models|source\/instagram|privateNote|references/i);
  }

  const shopHomeSource = readFileSync(
    join(process.cwd(), "components/shop/shop-home.tsx"),
    "utf8",
  );
  const authoritySource = readFileSync(
    join(process.cwd(), "lib/studio/seeds/wardrobe-authority.ts"),
    "utf8",
  );
  assert.doesNotMatch(authoritySource, /WARDROBE_PUBLIC_DRAFTS|reviewedDrafts/);
  assert.doesNotMatch(shopHomeSource, /WardrobePreview|shop-release-index|shop-editorial-rail|shop-values/);
  assert.match(shopHomeSource, /showModelLink=\{false\}/);
  assert.match(shopHomeSource, /showStudyMark=\{false\}/);
  assert.match(shopHomeSource, /product\.slug !== heroProduct\.slug/);
});
