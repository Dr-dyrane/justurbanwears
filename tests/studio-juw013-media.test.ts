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

const slug = "teal-draped-mini-set";
const approvedMedia = [
  "04-model-front.webp",
  "09-model-rear-mirror.webp",
] as const;

test("packages JUW-013's approved Lulu views while product back and detail stay pending", async () => {
  const contract = PENDING_WARDROBE_PRODUCT_CONTRACTS.find(({ sku }) => sku === "JUW-013");
  assert.ok(contract);
  assert.equal(contract.slug, slug);
  assert.deepEqual(contract.approvedViews, ["GARMENT_FRONT", "MODEL_FRONT", "MODEL_REAR_MIRROR"]);
  assert.deepEqual(contract.missingViews, ["GARMENT_BACK", "FABRIC_DETAIL"]);
  assert.deepEqual(contract.garment.references.map(({ view }) => view), ["FRONT"]);
  assert.equal(contract.garment.mediaState, "DRAFT");

  for (const file of approvedMedia) {
    const assetPath = join(process.cwd(), "public/shop/products", slug, file);
    assert.equal(existsSync(assetPath), true, `${file} must be packaged`);
    const metadata = await sharp(readFileSync(assetPath)).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 972);
    assert.equal(metadata.height, 1619);
    assert.equal(metadata.channels, 3);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
    assert.equal(metadata.xmp, undefined);
    assert.equal(metadata.iptc, undefined);
  }

  const seeded = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot());
  const garment = seeded.garments.find(({ sku }) => sku === "JUW-013");
  assert.ok(garment);
  assert.equal(seeded.listings.some(({ garmentId }) => garmentId === garment.id), false);
  assert.equal(selectWardrobePublicView(seeded).some(({ sku }) => sku === "JUW-013"), false);
  assert.equal(shopProducts.some((product) => product.slug === slug), false);
});
