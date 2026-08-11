import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { createEmptyStudioSnapshot } from "../lib/studio/domain/state";
import { selectWardrobePublicView } from "../lib/studio/projections/public-listing";
import {
  getPendingWardrobeProductContract,
  pendingWardrobeMediaLabel,
  PENDING_WARDROBE_PRODUCT_CONTRACTS,
} from "../lib/studio/seeds/private-wardrobe-products";
import { mergeWardrobeAuthoritySeeds } from "../lib/studio/seeds/wardrobe-authority";

const expectedMedia = new Map<string, readonly string[]>([
  ["JUW-013", [
    "GARMENT_FRONT",
    "GARMENT_BACK",
    "MANNEQUIN_FRONT",
    "MODEL_FRONT",
    "FABRIC_DETAIL",
    "MODEL_REAR_MIRROR",
  ]],
  ["JUW-015", ["MODEL_LEFT_PROFILE", "MODEL_REAR_THREE_QUARTER"]],
  ["JUW-017", ["MODEL_FRONT"]],
  ["JUW-018", ["MODEL_DETAIL"]],
  ["JUW-019", ["MODEL_FRONT"]],
  ["JUW-020", ["MODEL_REAR_THREE_QUARTER"]],
  ["JUW-022", ["MODEL_DETAIL"]],
] as const);

const readImage = sharp as unknown as (input: Buffer) => {
  metadata(): Promise<{
    format?: string;
    width?: number;
    height?: number;
    exif?: Buffer;
    icc?: Buffer;
    xmp?: Buffer;
    iptc?: Buffer;
  }>;
};

test("projects only packaged public-safe media into pending Studio wardrobe cards", async () => {
  for (const contract of PENDING_WARDROBE_PRODUCT_CONTRACTS) {
    assert.deepEqual(
      contract.publicSafeMedia.map(({ view }) => view),
      expectedMedia.get(contract.sku),
    );
    assert.equal(getPendingWardrobeProductContract(contract.sku), contract);
    for (const legacySku of contract.legacySkus) {
      assert.equal(getPendingWardrobeProductContract(legacySku), contract);
    }

    for (const media of contract.publicSafeMedia) {
      assert.equal(contract.approvedViews.includes(media.view), true);
      assert.equal(contract.missingViews.includes(media.view), false);
      assert.match(media.src, new RegExp(`^/shop/products/${contract.slug}/[0-9]{2}-[a-z0-9-]+\\.webp$`));

      const assetPath = join(process.cwd(), "public", media.src);
      assert.equal(existsSync(assetPath), true, `${contract.sku} ${media.view} must exist`);
      const metadata = await readImage(readFileSync(assetPath)).metadata();
      assert.equal(metadata.format, "webp");
      assert.equal(metadata.width, media.width);
      assert.equal(metadata.height, media.height);
      assert.equal(metadata.exif, undefined);
      assert.equal(metadata.icc, undefined);
      assert.equal(metadata.xmp, undefined);
      assert.equal(metadata.iptc, undefined);
    }
  }

  const serialized = JSON.stringify(PENDING_WARDROBE_PRODUCT_CONTRACTS);
  assert.doesNotMatch(serialized, /storage\/|sha-?256|prompt|provider|canon\/|evidence|identity metric/iu);
});

test("keeps media labels plain and pending products outside the Shop projection", () => {
  assert.equal(pendingWardrobeMediaLabel("GARMENT_FRONT"), "Product front");
  assert.equal(pendingWardrobeMediaLabel("GARMENT_BACK"), "Product back");
  assert.equal(pendingWardrobeMediaLabel("MANNEQUIN_FRONT"), "Mannequin front");
  assert.equal(pendingWardrobeMediaLabel("FABRIC_DETAIL"), "Fabric detail");
  assert.equal(pendingWardrobeMediaLabel("MODEL_FRONT"), "On Lulu · front");
  assert.equal(pendingWardrobeMediaLabel("MODEL_REAR_MIRROR"), "On Lulu · rear mirror");

  const publicView = selectWardrobePublicView(
    mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot()),
  );
  for (const contract of PENDING_WARDROBE_PRODUCT_CONTRACTS) {
    assert.equal(
      publicView.some((product) => product.sku === contract.sku),
      contract.missingViews.length === 0,
    );
  }
});

test("renders the image-first ready and capture-next Studio surface", () => {
  const source = readFileSync(
    join(process.cwd(), "components/studio/wardrobe-workbench.tsx"),
    "utf8",
  );
  assert.match(source, /className="studio-pending-media-strip"/u);
  assert.match(source, /hasReadyMedia \? "Ready" : "Capture needed"/u);
  assert.match(source, />Capture next</u);
  assert.match(source, /getPendingWardrobeProductContract\(garment\.sku\)/u);
  assert.doesNotMatch(source, /storage\/|sha-?256|prompt|evidence|identity metric/iu);
});
