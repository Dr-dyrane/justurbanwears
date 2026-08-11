import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { shopProducts } from "../lib/shop/catalog";
import { createEmptyStudioSnapshot } from "../lib/studio/domain/state";
import { selectWardrobePublicView } from "../lib/studio/projections/public-listing";
import { PENDING_WARDROBE_PRODUCT_CONTRACTS } from "../lib/studio/seeds/private-wardrobe-products";
import { mergeWardrobeAuthoritySeeds } from "../lib/studio/seeds/wardrobe-authority";

const slug = "cocoa-cowl-gathered-midi-dress";
const approvedMedia = [
  "07-model-left-profile.webp",
  "05-model-rear-three-quarter.webp",
] as const;

test("packages only JUW-015's approved Lulu angles while product captures stay pending", async () => {
  const contract = PENDING_WARDROBE_PRODUCT_CONTRACTS.find(({ sku }) => sku === "JUW-015");
  assert.ok(contract);
  assert.equal(contract.slug, slug);
  assert.deepEqual(contract.approvedViews, ["MODEL_LEFT_PROFILE", "MODEL_REAR_THREE_QUARTER"]);
  assert.deepEqual(contract.missingViews, ["GARMENT_FRONT", "GARMENT_BACK", "FABRIC_DETAIL"]);
  assert.deepEqual(contract.garment.references, []);
  assert.equal(contract.garment.mediaState, "DRAFT");

  for (const file of approvedMedia) {
    const assetPath = join(process.cwd(), "public/shop/products", slug, file);
    assert.equal(existsSync(assetPath), true, `${file} must be packaged`);
    const metadata = await sharp(readFileSync(assetPath)).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 972);
    assert.equal(metadata.height, 1728);
    assert.equal(metadata.channels, 3);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
    assert.equal(metadata.xmp, undefined);
    assert.equal(metadata.iptc, undefined);
  }

  const seeded = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot());
  const garment = seeded.garments.find(({ sku }) => sku === "JUW-015");
  assert.ok(garment);
  assert.equal(seeded.listings.some(({ garmentId }) => garmentId === garment.id), false);
  assert.equal(selectWardrobePublicView(seeded).some(({ sku }) => sku === "JUW-015"), false);
  assert.equal(shopProducts.some((product) => product.slug === slug), false);
});
