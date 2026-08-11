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

const slug = "cocoa-cowl-gathered-midi-dress";
const approvedMedia = [
  ["GARMENT_FRONT", "01-garment-front.webp", 1122, 1402, "c66e5a9198c16bd64dc572ae3efdc65d6063de5781a74d4ab681586cf3bea2ae"],
  ["GARMENT_BACK", "02-garment-back.webp", 1122, 1402, "3970f8e8b1069824afced84a047f23fff594ad65bed83f92dd54a17b5cebb4ae"],
  ["MANNEQUIN_FRONT", "03-mannequin-front.webp", 1122, 1402, "22290498a41548c730465782f6b414c53c2db15e82c3c51b7d43a6f5a7528166"],
  ["FABRIC_DETAIL", "06-fabric-detail.webp", 1122, 1402, "6100fa65258b13aaded3e60441bb75c238523250a52ba1c76fa847f033f394e4"],
  ["MODEL_LEFT_PROFILE", "07-model-left-profile.webp", 972, 1728, "2030950a16cc5f193f7fe127157744a9f1a11a56ddb2c5ee49387bcffc8a161b"],
  ["MODEL_REAR_THREE_QUARTER", "05-model-rear-three-quarter.webp", 972, 1728, "438d45b6eb6c10ba43e5db611cb1dd4eb45ba34b0cfe2423f3a30727db0f968b"],
] as const;

test("packages JUW-015 as a truthful six-frame public catalogue row", async () => {
  const contract = PENDING_WARDROBE_PRODUCT_CONTRACTS.find(({ sku }) => sku === "JUW-015");
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

  const publicSeed = WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.find(({ sku }) => sku === "JUW-015");
  assert.ok(publicSeed);
  assert.deepEqual(publicSeed.modelAnchor, { id: "lulu-v3" });
  assert.deepEqual(publicSeed.media.map(({ slot }) => slot), approvedMedia.map(([slot]) => slot));
  assert.deepEqual(
    publicSeed.media.filter(({ slot }) => slot.startsWith("MODEL_")).map(({ slot, modelAnchorId }) => ({ slot, modelAnchorId })),
    [
      { slot: "MODEL_LEFT_PROFILE", modelAnchorId: "lulu-v3" },
      { slot: "MODEL_REAR_THREE_QUARTER", modelAnchorId: "lulu-v3" },
    ],
  );
  assert.equal(publicSeed.media.some(({ slot }) => slot === "MODEL_FRONT"), false);

  const seeded = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot());
  const garment = seeded.garments.find(({ sku }) => sku === "JUW-015");
  assert.ok(garment);
  assert.equal(garment.state, "PUBLISHED");
  const listing = seeded.listings.find(({ garmentId }) => garmentId === garment.id);
  assert.ok(listing);
  assert.equal(listing.publicProjection?.sku, "JUW-015");
  assert.equal(selectWardrobePublicView(seeded).some(({ sku }) => sku === "JUW-015"), true);
  assert.equal(shopProducts.some((product) => product.slug === slug), true);
});
