import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
const publicMedia = [
  {
    view: "MODEL_FRONT",
    src: `/shop/products/${slug}/04-model-front.webp`,
    width: 972,
    height: 1619,
    sha256: "52b20d8d888d6eeeda3274c309853a0d8f63005a577edad698a7e5b875ac399e",
  },
  {
    view: "MODEL_REAR_THREE_QUARTER",
    src: `/shop/products/${slug}/05-model-rear-three-quarter.webp`,
    width: 972,
    height: 1619,
    sha256: "46dffec2dcae912077befbc50a23c2a2426ed86a664931b735601accf68cce72",
  },
] as const;
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

test("packages JUW-019's exact approved Lulu angles while direct product captures stay pending", async () => {
  const contract = PENDING_WARDROBE_PRODUCT_CONTRACTS.find(({ sku }) => sku === "JUW-019");
  assert.ok(contract);
  assert.equal(contract.slug, slug);
  assert.deepEqual(
    contract.publicSafeMedia,
    publicMedia.map(({ view, src, width, height }) => ({ view, src, width, height })),
  );
  assert.deepEqual(contract.missingViews, ["GARMENT_FRONT", "GARMENT_BACK"]);
  assert.equal(contract.garment.mediaState, "DRAFT");

  for (const media of publicMedia) {
    const assetPath = join(process.cwd(), "public", media.src);
    assert.equal(existsSync(assetPath), true);
    const bytes = readFileSync(assetPath);
    const metadata = await readImage(bytes).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, media.width);
    assert.equal(metadata.height, media.height);
    assert.equal(metadata.channels, 3);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
    assert.equal(metadata.xmp, undefined);
    assert.equal(metadata.iptc, undefined);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), media.sha256);
  }

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
