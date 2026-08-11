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

const slug = "plum-ruched-sleeve-fitted-dress";

test("packages JUW-018's public-safe upper-front mannequin and Lulu detail while full product coverage stays pending", async () => {
  const contract = PENDING_WARDROBE_PRODUCT_CONTRACTS.find(({ sku }) => sku === "JUW-018");
  assert.ok(contract);
  assert.equal(contract.slug, slug);
  assert.deepEqual(contract.approvedViews, ["MANNEQUIN_UPPER_FRONT", "MODEL_DETAIL"]);
  assert.deepEqual(contract.missingViews, ["GARMENT_FRONT", "GARMENT_BACK", "FABRIC_DETAIL"]);
  assert.deepEqual(
    contract.publicSafeMedia.map(({ view }) => view),
    ["MANNEQUIN_UPPER_FRONT", "MODEL_DETAIL"],
  );
  assert.deepEqual(contract.garment.references, []);
  assert.equal(contract.garment.mediaState, "DRAFT");

  for (const filename of ["03-mannequin-upper-front.webp", "08-model-detail.webp"]) {
    const assetPath = join(process.cwd(), "public/shop/products", slug, filename);
    assert.equal(existsSync(assetPath), true);
    const metadata = await sharp(readFileSync(assetPath)).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 1122);
    assert.equal(metadata.height, 1402);
    assert.equal(metadata.channels, 3);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
    assert.equal(metadata.xmp, undefined);
    assert.equal(metadata.iptc, undefined);
  }

  const seeded = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot());
  const garment = seeded.garments.find(({ sku }) => sku === "JUW-018");
  assert.ok(garment);
  assert.equal(seeded.listings.some(({ garmentId }) => garmentId === garment.id), false);
  assert.equal(selectWardrobePublicView(seeded).some(({ sku }) => sku === "JUW-018"), false);
  assert.equal(shopProducts.some((product) => product.slug === slug), false);
});
