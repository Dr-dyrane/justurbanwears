import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { createEmptyStudioSnapshot } from "../lib/studio/domain/state";
import {
  getApprovedPublicListingContract,
  publicMediaLabel,
} from "../lib/studio/projections/approved-catalogue";
import { selectWardrobePublicView } from "../lib/studio/projections/public-listing";
import { mergeWardrobeAuthoritySeeds } from "../lib/studio/seeds/wardrobe-authority";
import { WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS } from "../lib/wardrobe-public-view/seeds";

const sku = "JUW-010";
const slug = "magenta-plunge-ruched-mini-dress";
const detailSource = `/shop/products/${slug}/08-model-detail.webp`;
const expectedModelMedia = [
  {
    slot: "MODEL_LEFT_PROFILE",
    src: `/shop/products/${slug}/07-model-left-profile.webp`,
    modelAnchorId: "lulu-v2",
  },
  {
    slot: "MODEL_REAR_THREE_QUARTER",
    src: `/shop/products/${slug}/05-model-rear-three-quarter.webp`,
    modelAnchorId: "lulu-v2",
  },
  {
    slot: "MODEL_DETAIL",
    src: detailSource,
    modelAnchorId: "lulu-v2",
  },
] as const;

test("publishes JUW-010's approved metadata-free single-VP8 styled detail", async () => {
  const bytes = readFileSync(join(process.cwd(), "public", detailSource));
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 972);
  assert.equal(metadata.height, 1619);
  assert.equal(metadata.channels, 3);
  assert.equal(metadata.pages, undefined);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.equal(metadata.xmp, undefined);
  assert.equal(metadata.iptc, undefined);
  assert.equal(createHash("sha256").update(bytes).digest("hex"),
    "5b60a54faf31a7964f6f839b8be7842a7a8206ba2ff88ebf5fd0af30d14a36ea");
  assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP");
  assert.equal(bytes.subarray(12, 16).toString("ascii"), "VP8 ");
  assert.equal(20 + bytes.readUInt32LE(16) + (bytes.readUInt32LE(16) % 2), bytes.length);
});

test("projects only the truthful JUW-010 detail beside unchanged 07 and 05 views", () => {
  const seed = WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.find((product) => product.sku === sku);
  assert.ok(seed);
  assert.equal(seed.slug, slug);
  assert.equal(seed.name, "Magenta Plunge Ruched Mini Dress");
  assert.equal(seed.fit, "Measurements confirmed before payment");
  assert.deepEqual(seed.details, ["Plunge neckline", "Ruched body", "Mini length", "Vivid magenta finish"]);
  assert.deepEqual(seed.modelAnchor, {
    id: "lulu-v2",
    src: "/shop/model/lulu-v2-approved.png",
  });
  assert.deepEqual(
    seed.media.filter(({ slot }) => slot.startsWith("MODEL_")),
    expectedModelMedia,
  );
  assert.equal(seed.media.some(({ slot }) => slot === "MODEL_FRONT"), false);

  const contract = getApprovedPublicListingContract(sku, slug);
  assert.ok(contract);
  assert.deepEqual(
    contract.media.filter(({ slot }) => slot.startsWith("MODEL_")),
    expectedModelMedia,
  );
  assert.equal(publicMediaLabel("MODEL_DETAIL"), "Model styled detail");
});

test("keeps JUW-010 Studio stock unchanged while projecting the detail publicly", () => {
  const snapshot = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot());
  const garment = snapshot.garments.find((candidate) => candidate.sku === sku);
  assert.ok(garment);
  const listing = snapshot.listings.find((candidate) => candidate.garmentId === garment.id);
  const inventory = snapshot.inventory.find((candidate) => candidate.garmentId === garment.id);
  assert.ok(listing);
  assert.ok(inventory);
  assert.deepEqual(
    {
      state: listing.state,
      onHand: inventory.onHand,
      reserved: inventory.reserved,
      sold: inventory.sold,
      returned: inventory.returned,
      writeOff: inventory.writeOff,
    },
    { state: "PUBLISHED", onHand: 1, reserved: 0, sold: 0, returned: 0, writeOff: 0 },
  );
  const publicRow = selectWardrobePublicView(snapshot).find((product) => product.sku === sku);
  assert.ok(publicRow);
  assert.deepEqual(
    publicRow.media.filter(({ slot }) => slot.startsWith("MODEL_")),
    expectedModelMedia,
  );
});
