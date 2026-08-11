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

const slug = "cropped-denim-jacket-black-legging-look";
const approvedMedia = [
  ["GARMENT_FRONT", "01-garment-front.webp", "cbfbfc1a069efd6f6a1b3d0f4d2e6c537d1156ab89487331f535173b6b5f4a1b"],
  ["GARMENT_BACK", "02-garment-back.webp", "8ed8d3c4ba1ed841a5a1b0479cfd6b76777bee3658fe8029224ce10e99a6ef46"],
  ["MANNEQUIN_FRONT", "03-mannequin-front.webp", "a677f9777f0bf070a2bd8aa96cc06e615ba3f335f576dd6fc88e2eff18c3cf69"],
  ["FABRIC_DETAIL", "06-fabric-detail.webp", "41629166da3edc77a614be7bdef4e4207b08e546f59a4ae4d718f974ffb96323"],
  ["MODEL_REAR_MIRROR", "09-model-rear-mirror.webp", "7c253f4b8b1d8207630f969d87a35bd6a4862323715f05d46b7f8d2cfa01bdfd"],
] as const;

test("packages JUW-021 as a truthful five-frame public catalogue row", async () => {
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
  assert.deepEqual(contract.approvedViews, approvedMedia.map(([view]) => view));
  assert.deepEqual(contract.garment.references.map(({ view }) => view), ["FRONT", "BACK", "DETAIL"]);
  assert.deepEqual(contract.missingViews, []);
  assert.deepEqual(contract.publicSafeMedia.map(({ view }) => view), approvedMedia.map(([view]) => view));
  assert.equal(contract.garment.mediaState, "READY");

  const directory = join(process.cwd(), "public/shop/products", slug);
  assert.deepEqual(
    readdirSync(directory).filter((file) => file.endsWith(".webp")).sort(),
    approvedMedia.map(([, file]) => file).sort(),
  );
  for (const [, file, sha256] of approvedMedia) {
    const bytes = readFileSync(join(directory, file));
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 1122);
    assert.equal(metadata.height, 1402);
    assert.equal(metadata.channels, 3);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
    assert.equal(metadata.xmp, undefined);
    assert.equal(metadata.iptc, undefined);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), sha256);
  }

  const publicSeed = WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.find(({ sku }) => sku === "JUW-021");
  assert.ok(publicSeed);
  assert.deepEqual(publicSeed.modelAnchor, { id: "lulu-v3" });
  assert.deepEqual(publicSeed.media.map(({ slot }) => slot), approvedMedia.map(([slot]) => slot));
  assert.deepEqual(
    publicSeed.media.filter(({ slot }) => slot.startsWith("MODEL_")).map(({ slot, modelAnchorId }) => ({ slot, modelAnchorId })),
    [{ slot: "MODEL_REAR_MIRROR", modelAnchorId: "lulu-v3" }],
  );
  assert.equal(
    publicSeed.media
      .filter(({ slot }) => !slot.startsWith("MODEL_"))
      .some(({ modelAnchorId }) => modelAnchorId !== undefined),
    false,
  );

  const seeded = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot());
  const garment = seeded.garments.find(({ sku }) => sku === "JUW-021");
  assert.ok(garment);
  assert.equal(garment.state, "PUBLISHED");
  const listing = seeded.listings.find(({ garmentId }) => garmentId === garment.id);
  assert.ok(listing);
  assert.equal(listing.publicProjection?.sku, "JUW-021");
  assert.equal(selectWardrobePublicView(seeded).some(({ sku }) => sku === "JUW-021"), true);
  assert.equal(shopProducts.some((product) => product.slug === slug), true);

  const serialized = JSON.stringify(contract);
  assert.doesNotMatch(serialized, /storage\/|sha-?256|prompt|provider|canon\/|evidence|identity metric/iu);
  assert.doesNotMatch(serialized, /closure|generated cover|underlayer|white inner/iu);
});
