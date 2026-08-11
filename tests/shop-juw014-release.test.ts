import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { SHOP_CATALOGUE_MANIFEST } from "../scripts/shop-db/catalogue-manifest.mjs";
import { createEmptyStudioSnapshot } from "../lib/studio/domain/state";
import { mergeWardrobeAuthoritySeeds } from "../lib/studio/seeds/wardrobe-authority";

const expectedAssets = [
  ["01-garment-front.webp", "186fad74601ceb79a600cb92e0e0fb85ed50b540dd1ab6bde380f0cbcd71122a", 1122, 1402],
  ["02-garment-back.webp", "c302771d9a361cab264dbb8b5d3db903c66b9b795d32c441319b575fa6e32d02", 1122, 1402],
  ["03-mannequin-front.webp", "83383af64766d0d1f39e8ed14f7d1e5d724fe55f3c5520457ec930c54fa0f5eb", 1122, 1402],
  ["04-model-front.webp", "bb8e3576ab3b9679d19a5181e6999ff817057587c2a1fb12588e50957bb067a3", 972, 1619],
  ["07-model-left-profile.webp", "35b1196542e5e4836ff82a6b1954fb281d553ce5fe1f9ec76d88beede626efa1", 972, 1619],
  ["05-model-rear-three-quarter.webp", "bece9263b8c0b9e4284af699ad01fd033928edff4019dfb9db822c1ca793830d", 972, 1619],
  ["08-construction-detail.webp", "50f106a9dbc2d77c87c0e447297975388fc4b97cb98f70f92793cccfe98ab3f9", 1122, 1402],
] as const;

test("packages JUW-014 with the approved facts, truthful slots, and initial stock", () => {
  const product = SHOP_CATALOGUE_MANIFEST.products.find(({ sku }) => sku === "JUW-014");
  assert.ok(product);
  assert.equal(product.slug, "sage-open-back-high-slit-maxi-dress");
  assert.equal(product.price, 28500);
  assert.equal(product.taggedSize, "Size on request");
  assert.equal(product.fit, "Measurements confirmed before payment");
  assert.equal(product.condition, "Excellent · real-worn wardrobe piece");
  assert.deepEqual(product.measurements, []);
  assert.deepEqual(product.initialInventory, {
    availability: "AVAILABLE",
    onHand: 1,
    reserved: 0,
    sold: 0,
    returned: 0,
    writeOff: 0,
  });
  assert.deepEqual(
    product.media.map(({ slot, modelAnchorId }) => ({ slot, modelAnchorId })),
    [
      { slot: "GARMENT_FRONT", modelAnchorId: undefined },
      { slot: "GARMENT_BACK", modelAnchorId: undefined },
      { slot: "MANNEQUIN_FRONT", modelAnchorId: undefined },
      { slot: "MODEL_FRONT", modelAnchorId: "lulu-v3" },
      { slot: "CONSTRUCTION_DETAIL", modelAnchorId: undefined },
      { slot: "MODEL_LEFT_PROFILE", modelAnchorId: "lulu-v3" },
      { slot: "MODEL_REAR_THREE_QUARTER", modelAnchorId: "lulu-v3" },
    ],
  );
  assert.doesNotMatch(JSON.stringify(product), /demo|prototype|sample|preview|FABRIC_DETAIL/i);
});

test("keeps every approved JUW-014 public derivative exact and metadata-free", async () => {
  const directory = join(
    process.cwd(),
    "public/shop/products/sage-open-back-high-slit-maxi-dress",
  );
  for (const [file, expectedSha, width, height] of expectedAssets) {
    const bytes = readFileSync(join(directory, file));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedSha);
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, width);
    assert.equal(metadata.height, height);
    assert.equal(metadata.channels, 3);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
    assert.equal(metadata.xmp, undefined);
    assert.equal(metadata.iptc, undefined);
  }
});

test("promotes the reserved JUW-014 Studio draft contract without duplicating stock", () => {
  const seeded = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot());
  const garment = seeded.garments.find(({ sku }) => sku === "JUW-014");
  const listing = seeded.listings.find(({ slug }) => slug === "sage-open-back-high-slit-maxi-dress");
  const inventory = garment
    ? seeded.inventory.find(({ garmentId }) => garmentId === garment.id)
    : undefined;
  assert.ok(garment);
  assert.equal(garment.id, "wardrobe-private-draft-juw-014");
  assert.equal(garment.state, "PUBLISHED");
  assert.equal(garment.mediaState, "READY");
  assert.equal(garment.saleEligible, true);
  assert.equal(garment.price, 28500);
  assert.ok(listing);
  assert.deepEqual(
    inventory && {
      onHand: inventory.onHand,
      reserved: inventory.reserved,
      sold: inventory.sold,
      returned: inventory.returned,
      writeOff: inventory.writeOff,
    },
    { onHand: 1, reserved: 0, sold: 0, returned: 0, writeOff: 0 },
  );
});
