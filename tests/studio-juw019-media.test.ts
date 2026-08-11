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

const slug = "black-floral-lace-long-sleeve-dress";
const publicMedia = `/shop/products/${slug}/04-model-front.webp` as const;
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

test("packages JUW-019's approved Lulu front while full product captures stay pending", async () => {
  const contract = PENDING_WARDROBE_PRODUCT_CONTRACTS.find(({ sku }) => sku === "JUW-019");
  assert.ok(contract);
  assert.equal(contract.slug, slug);
  assert.deepEqual(contract.publicSafeMedia, [
    {
      view: "MODEL_FRONT",
      src: publicMedia,
      width: 972,
      height: 1619,
    },
  ]);
  assert.deepEqual(contract.missingViews, ["GARMENT_FRONT", "GARMENT_BACK"]);
  assert.equal(contract.garment.mediaState, "DRAFT");

  const assetPath = join(process.cwd(), "public", publicMedia);
  assert.equal(existsSync(assetPath), true);
  const metadata = await readImage(readFileSync(assetPath)).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 972);
  assert.equal(metadata.height, 1619);
  assert.equal(metadata.channels, 3);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.equal(metadata.xmp, undefined);
  assert.equal(metadata.iptc, undefined);

  const seeded = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot());
  const garment = seeded.garments.find(({ sku }) => sku === "JUW-019");
  assert.ok(garment);
  assert.equal(seeded.listings.some(({ garmentId }) => garmentId === garment.id), false);
  assert.equal(selectWardrobePublicView(seeded).some(({ sku }) => sku === "JUW-019"), false);
  assert.equal(shopProducts.some((product) => product.slug === slug), false);

  assert.doesNotMatch(
    JSON.stringify(contract.publicSafeMedia),
    /storage\/|sha-?256|prompt|provider|canon\/|evidence|identity metric/iu,
  );
});
