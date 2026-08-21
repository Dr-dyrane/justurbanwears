import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { CURRENT_SHOP_DROP, isCurrentShopProduct } from "../lib/shop/current-drop";
import { WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS } from "../lib/wardrobe-public-view/seeds";

const expectedDrop02Products = [
  ["black-cropped-tee-slim-trouser-set", "Black Cropped Tee and Slim Trouser Set"],
  ["violet-beaded-ruffle-romper", "Violet Beaded Ruffle Romper"],
  ["black-sweetheart-fit-flare-midi-dress", "Black Sweetheart Fit-and-Flare Midi Dress"],
  ["black-ivory-folded-neck-column-dress", "Black and Ivory Folded-Neck Column Dress"],
  ["indigo-seamed-denim-mini-dress", "Indigo Seamed Denim Mini Dress"],
  ["black-cropped-tee-silver-ruched-skirt-set", "Black Cropped Tee and Silver Ruched Skirt Set"],
  ["black-cropped-tee-pink-distressed-shorts-set", "Black Cropped Tee and Pink Distressed Shorts Set"],
  ["black-cropped-tee-blue-distressed-shorts-set", "Black Cropped Tee and Blue Distressed Shorts Set"],
] as const;

const expectedDrop02Media = [
  "GARMENT_FRONT",
  "GARMENT_BACK",
  "MANNEQUIN_FRONT",
  "MODEL_FRONT",
  "FABRIC_DETAIL",
  "MODEL_LEFT_PROFILE",
  "MODEL_REAR_THREE_QUARTER",
] as const;

test("the public Shop is the exact eight-piece Drop 02 wardrobe", () => {
  const dropProducts = WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.filter(isCurrentShopProduct);

  assert.equal(CURRENT_SHOP_DROP, "Drop 02");
  assert.equal(dropProducts.length, 8);
  assert.deepEqual(
    dropProducts.map(({ name, slug }) => [slug, name]),
    expectedDrop02Products,
  );

  for (const product of dropProducts) {
    assert.equal(product.drop, CURRENT_SHOP_DROP);
    assert.equal(product.availability, "AVAILABLE");
    assert.ok(product.price > 0);
    assert.equal(product.taggedSize, "Size on request");
    assert.equal(product.modelAnchor.id, "lulu-v4");
    assert.deepEqual(product.media.map((item) => item.slot), expectedDrop02Media);
    assert.equal(product.media.length, 7);
    for (const media of product.media.filter((item) => item.slot.startsWith("MODEL_"))) {
      assert.equal(media.modelAnchorId, "lulu-v4");
    }
    assert.doesNotMatch(
      JSON.stringify(product),
      /storage\/models|source\/instagram|privateNote|references|provenance/i,
    );
  }

  const shopHomeSource = readFileSync(
    join(process.cwd(), "components/shop/shop-home.tsx"),
    "utf8",
  );
  const authoritySource = readFileSync(
    join(process.cwd(), "lib/studio/seeds/wardrobe-authority.ts"),
    "utf8",
  );
  const searchSource = readFileSync(
    join(process.cwd(), "components/shop/shop-search.tsx"),
    "utf8",
  );
  const detailSource = readFileSync(
    join(process.cwd(), "components/shop/product-detail.tsx"),
    "utf8",
  );
  const homeCss = readFileSync(
    join(process.cwd(), "app/shop-editorial-hero.css"),
    "utf8",
  );
  const relatedCss = readFileSync(
    join(process.cwd(), "app/shop-product-detail-c.css"),
    "utf8",
  );
  assert.doesNotMatch(authoritySource, /WARDROBE_PUBLIC_DRAFTS|reviewedDrafts/);
  assert.doesNotMatch(shopHomeSource, /WardrobePreview|shop-release-index|shop-editorial-rail|shop-values/);
  assert.match(shopHomeSource, /showModelLink=\{false\}/);
  assert.match(shopHomeSource, /showStudyMark=\{false\}/);
  assert.match(shopHomeSource, /product\.slug !== heroProduct\.slug/);
  assert.match(shopHomeSource, /products\.filter\(isCurrentShopProduct\)/);
  assert.match(shopHomeSource, /violet-beaded-ruffle-romper/);
  assert.match(searchSource, /products\.filter\(isCurrentShopProduct\)/);
  assert.match(detailSource, /candidate && isCurrentShopProduct\(candidate\)/);
  assert.match(homeCss, /\.shop-home \.product-card-action > span:last-child/);
  assert.match(relatedCss, /\.shop-product-page \.shop-related \.product-card-action > span:last-child/);
  assert.doesNotMatch(homeCss, /\.shop-home \.product-card-action > span\s*\{/);
  assert.doesNotMatch(relatedCss, /\.shop-product-page \.shop-related \.product-card-action > span\s*\{/);
});
