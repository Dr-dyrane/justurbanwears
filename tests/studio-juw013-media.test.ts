import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { shopProducts } from "../lib/shop/catalog";
import { createEmptyStudioSnapshot } from "../lib/studio/domain/state";
import { selectWardrobePublicView } from "../lib/studio/projections/public-listing";
import { PENDING_WARDROBE_PRODUCT_CONTRACTS } from "../lib/studio/seeds/private-wardrobe-products";
import { mergeWardrobeAuthoritySeeds } from "../lib/studio/seeds/wardrobe-authority";
import { WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS } from "../lib/wardrobe-public-view/seeds";

const slug = "teal-draped-mini-set";
const approvedMedia = [
  ["GARMENT_FRONT", "01-garment-front.webp", 1122, 1402, "69dd4a3dd24e4d66bc0acdac9594fc06bf98173f0fb0b318b51ae3bbd53c8168"],
  ["GARMENT_BACK", "02-garment-back.webp", 1122, 1402, "ca7fb8ba287d7a59a42dbf857ef7d4fa3e3ed1c5743030df8695fd37495089b3"],
  ["MANNEQUIN_FRONT", "03-mannequin-front.webp", 1122, 1402, "912ad8d609ca3175dd55350c1775b694cee4827e94a6ce3d299b8ebd0bcc326f"],
  ["MODEL_FRONT", "04-model-front.webp", 972, 1619, "b4721e8fb3d0a9e97183c1ade8b68a5bfe150a1360bcd5443715b3089552dc3f"],
  ["FABRIC_DETAIL", "06-fabric-detail.webp", 1122, 1402, "c747b0773aed42fc6db574b69eaae574e4d51ec0370cf8b741a5d674b71da2e1"],
  ["MODEL_REAR_MIRROR", "09-model-rear-mirror.webp", 972, 1619, "1d9fa87b1a8ba9cabff1dab38ffd4bae76e98bb59f07a8a0443332f531ac4448"],
] as const;

test("publishes only JUW-013's exact approved six-frame set", async () => {
  const productDirectory = join(process.cwd(), "public/shop/products", slug);
  assert.deepEqual(
    readdirSync(productDirectory).sort(),
    approvedMedia.map(([, file]) => file).sort(),
  );

  for (const [, file, width, height, sha256] of approvedMedia) {
    const body = readFileSync(join(productDirectory, file));
    const metadata = await sharp(body).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, width);
    assert.equal(metadata.height, height);
    assert.equal(metadata.channels, 3);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
    assert.equal(metadata.xmp, undefined);
    assert.equal(metadata.iptc, undefined);
    assert.equal(createHash("sha256").update(body).digest("hex"), sha256);
  }

  const publicProduct = WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.find(({ sku }) => sku === "JUW-013");
  assert.ok(publicProduct);
  assert.equal(publicProduct.slug, slug);
  assert.deepEqual(publicProduct.modelAnchor, { id: "lulu-v3" });
  assert.deepEqual(
    publicProduct.media.map(({ slot, modelAnchorId }) => ({
      slot,
      ...(modelAnchorId ? { modelAnchorId } : {}),
    })),
    approvedMedia.map(([slot]) => ({
      slot,
      ...(["MODEL_FRONT", "MODEL_REAR_MIRROR"].includes(slot)
        ? { modelAnchorId: "lulu-v3" as const }
        : {}),
    })),
  );
  const completedContract = PENDING_WARDROBE_PRODUCT_CONTRACTS.find(({ sku }) => sku === "JUW-013");
  assert.ok(completedContract);
  assert.deepEqual(completedContract.approvedViews, approvedMedia.map(([slot]) => slot));
  assert.deepEqual(completedContract.missingViews, []);
  assert.equal(completedContract.garment.mediaState, "READY");

  const studio = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot());
  const garment = studio.garments.find(({ sku }) => sku === "JUW-013");
  assert.ok(garment);
  assert.equal(garment.mediaState, "READY");
  assert.equal(garment.state, "PUBLISHED");
  assert.equal(studio.listings.some(({ garmentId }) => garmentId === garment.id), true);
  assert.equal(selectWardrobePublicView(studio).some(({ sku }) => sku === "JUW-013"), true);
  assert.equal(shopProducts.some((product) => product.slug === slug), true);
});
