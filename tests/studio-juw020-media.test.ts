import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { shopProducts } from "../lib/shop/catalog";
import { createEmptyStudioSnapshot } from "../lib/studio/domain/state";
import { selectWardrobePublicView } from "../lib/studio/projections/public-listing";
import { PENDING_WARDROBE_PRODUCT_CONTRACTS } from "../lib/studio/seeds/private-wardrobe-products";
import { mergeWardrobeAuthoritySeeds } from "../lib/studio/seeds/wardrobe-authority";
import { WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS } from "../lib/wardrobe-public-view/seeds";

const slug = "coral-gathered-crop-mini-set";
const approvedMedia = [
  ["GARMENT_FRONT", "01-garment-front.webp", 1122, 1402, "5ac60f0b4af8f909e01cbf7a41889fa545b28cf8ad746fabcd9d568773da21c8"],
  ["GARMENT_BACK", "02-garment-back.webp", 1122, 1402, "b22227ff63b7bbaa6b34f98a68c3fa5334d4d3eceabe5d65f2b600562ef5d855"],
  ["MANNEQUIN_FRONT", "03-mannequin-front.webp", 1122, 1402, "9ec9f37faf4c246d7a55717abfd499cd994c2c9eb675e97175b6f9ff8ae17abb"],
  ["CONSTRUCTION_DETAIL", "08-construction-detail.webp", 1122, 1402, "914e7db3ff8d49f2316edf08c6412ced893e501d1b19a2d60de2e3d1d9636c89"],
  ["MODEL_REAR_THREE_QUARTER", "05-model-rear-three-quarter.webp", 1122, 1402, "77cd523ec75ced285347aa4992e35f2719a6706feec8d9e5bb28c202164e0304"],
] as const;

test("packages JUW-020 as a truthful five-frame public catalogue row", async () => {
  const contract = PENDING_WARDROBE_PRODUCT_CONTRACTS.find(({ sku }) => sku === "JUW-020");
  assert.ok(contract);
  assert.equal(contract.slug, slug);
  assert.deepEqual(contract.approvedViews, approvedMedia.map(([view]) => view));
  assert.deepEqual(contract.missingViews, []);
  assert.deepEqual(contract.publicSafeMedia.map(({ view }) => view), approvedMedia.map(([view]) => view));
  assert.deepEqual(contract.garment.references.map(({ view }) => view), ["FRONT", "BACK", "DETAIL"]);
  assert.equal(contract.garment.mediaState, "READY");

  const directory = join(process.cwd(), "public/shop/products", slug);
  assert.deepEqual(
    readdirSync(directory).filter((file) => file.endsWith(".webp")).sort(),
    approvedMedia.map(([, file]) => file).sort(),
  );
  for (const [, file, width, height, sha256] of approvedMedia) {
    const bytes = readFileSync(join(directory, file));
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, width);
    assert.equal(metadata.height, height);
    assert.equal(metadata.channels, 3);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
    assert.equal(metadata.xmp, undefined);
    assert.equal(metadata.iptc, undefined);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), sha256);
  }

  const publicSeed = WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.find(({ sku }) => sku === "JUW-020");
  assert.ok(publicSeed);
  assert.deepEqual(publicSeed.modelAnchor, { id: "lulu-v3" });
  assert.deepEqual(publicSeed.media.map(({ slot }) => slot), approvedMedia.map(([slot]) => slot));
  assert.deepEqual(
    publicSeed.media.filter(({ slot }) => slot.startsWith("MODEL_")).map(({ slot, modelAnchorId }) => ({ slot, modelAnchorId })),
    [{ slot: "MODEL_REAR_THREE_QUARTER", modelAnchorId: "lulu-v3" }],
  );
  assert.equal(
    publicSeed.media
      .filter(({ slot }) => !slot.startsWith("MODEL_"))
      .some(({ modelAnchorId }) => modelAnchorId !== undefined),
    false,
  );

  const seeded = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot());
  const garment = seeded.garments.find(({ sku }) => sku === "JUW-020");
  assert.ok(garment);
  assert.equal(garment.state, "PUBLISHED");
  const listing = seeded.listings.find(({ garmentId }) => garmentId === garment.id);
  assert.ok(listing);
  assert.equal(listing.publicProjection?.sku, "JUW-020");
  assert.equal(selectWardrobePublicView(seeded).some(({ sku }) => sku === "JUW-020"), true);
  assert.equal(shopProducts.some((product) => product.slug === slug), true);
});
