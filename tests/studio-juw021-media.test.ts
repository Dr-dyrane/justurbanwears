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

const slug = "cropped-denim-jacket-black-legging-look";
const publicMedia = `/shop/products/${slug}/09-model-rear-mirror.webp` as const;
const readImage = sharp as unknown as (input: Buffer) => {
  metadata(): Promise<{
    format?: string;
    width?: number;
    height?: number;
    channels?: number;
    exif?: Buffer;
    icc?: Buffer;
    xmp?: Buffer;
    iptc?: Buffer;
  }>;
};

test("hydrates JUW-021 with only its authentic Lulu rear-mirror view", async () => {
  const contract = PENDING_WARDROBE_PRODUCT_CONTRACTS.find(({ sku }) => sku === "JUW-021");
  assert.ok(contract);
  assert.equal(contract.slug, slug);
  assert.deepEqual(contract.legacySkus, ["DYN-101"]);
  assert.equal(contract.garment.price, 24500);
  assert.equal(contract.garment.sizeLabel, "Size on request");
  assert.equal(contract.garment.estimatedFit, "Measurements confirmed before payment");
  assert.equal(contract.garment.condition, "Excellent · real-worn wardrobe piece");
  assert.equal(contract.garment.quantity, 1);
  assert.equal(contract.garment.saleEligible, true);
  assert.deepEqual(contract.garment.measurements, []);
  assert.deepEqual(contract.approvedViews, ["MODEL_REAR_MIRROR"]);
  assert.deepEqual(contract.garment.references, []);
  assert.deepEqual(contract.missingViews, ["GARMENT_FRONT", "GARMENT_BACK", "FABRIC_DETAIL"]);
  assert.deepEqual(contract.publicSafeMedia, [
    {
      view: "MODEL_REAR_MIRROR",
      src: publicMedia,
      width: 1122,
      height: 1402,
    },
  ]);

  const assetPath = join(process.cwd(), "public", publicMedia);
  assert.equal(existsSync(assetPath), true);
  const metadata = await readImage(readFileSync(assetPath)).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 1122);
  assert.equal(metadata.height, 1402);
  assert.equal(metadata.channels, 3);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.equal(metadata.xmp, undefined);
  assert.equal(metadata.iptc, undefined);

  const seeded = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot());
  const garment = seeded.garments.find(({ sku }) => sku === "JUW-021");
  assert.ok(garment);
  assert.equal(seeded.listings.some(({ garmentId }) => garmentId === garment.id), false);
  assert.equal(selectWardrobePublicView(seeded).some(({ sku }) => sku === "JUW-021"), false);
  assert.equal(shopProducts.some((product) => product.slug === slug), false);

  const serialized = JSON.stringify(contract);
  assert.doesNotMatch(serialized, /storage\/|sha-?256|prompt|provider|canon\/|evidence|identity metric/iu);
  assert.doesNotMatch(serialized, /closure|generated cover|underlayer/iu);
});
