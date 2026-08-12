import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { shopProducts } from "../lib/shop/catalog";
import { createEmptyStudioSnapshot } from "../lib/studio/domain/state";
import { selectWardrobePublicView } from "../lib/studio/projections/public-listing";
import { PENDING_WARDROBE_PRODUCT_CONTRACTS } from "../lib/studio/seeds/private-wardrobe-products";
import {
  WARDROBE_AUTHORITY_MANAGED_SLUGS,
  mergeWardrobeAuthoritySeeds,
} from "../lib/studio/seeds/wardrobe-authority";

const slug = "pale-bandeau-car-look";
const productUpperFront = `/shop/products/${slug}/01-garment-upper-front.webp` as const;
const modelDetail = `/shop/products/${slug}/08-model-detail.webp` as const;

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

test("hydrates JUW-024 with its approved product upper front and authentic Lulu upper detail", async () => {
  const contract = PENDING_WARDROBE_PRODUCT_CONTRACTS.find(({ sku }) => sku === "JUW-024");
  assert.ok(contract);
  assert.equal(contract.slug, slug);
  assert.deepEqual(contract.legacySkus, ["DYN-104"]);
  assert.equal(contract.garment.category, "Shirt");
  assert.equal(contract.garment.price, 16500);
  assert.equal(contract.garment.sizeLabel, "Size on request");
  assert.equal(contract.garment.estimatedFit, "Measurements confirmed before payment");
  assert.equal(contract.garment.condition, "Excellent · real-worn wardrobe piece");
  assert.equal(contract.garment.quantity, 1);
  assert.equal(contract.garment.saleEligible, true);
  assert.equal(contract.garment.availability, "AVAILABLE");
  assert.deepEqual(contract.garment.measurements, []);
  assert.equal(contract.garment.color, "Pale tone · exact colour to confirm");
  assert.match(contract.garment.notes, /product upper-front and Lulu upper-front detail are ready/iu);
  assert.match(contract.garment.notes, /confirm the exact colour at intake/iu);
  assert.deepEqual(contract.approvedViews, ["GARMENT_UPPER_FRONT", "MODEL_DETAIL"]);
  assert.deepEqual(contract.garment.references, []);
  assert.deepEqual(contract.missingViews, ["GARMENT_FRONT", "GARMENT_BACK", "FABRIC_DETAIL"]);
  assert.deepEqual(contract.publicSafeMedia, [
    {
      view: "GARMENT_UPPER_FRONT",
      src: productUpperFront,
      width: 1023,
      height: 1537,
    },
    {
      view: "MODEL_DETAIL",
      src: modelDetail,
      width: 972,
      height: 1619,
    },
  ]);

  for (const media of contract.publicSafeMedia) {
    const assetPath = join(process.cwd(), "public", media.src);
    assert.equal(existsSync(assetPath), true);
    const metadata = await readImage(readFileSync(assetPath)).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, media.width);
    assert.equal(metadata.height, media.height);
    assert.equal(metadata.channels, 3);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
    assert.equal(metadata.xmp, undefined);
    assert.equal(metadata.iptc, undefined);
  }

  const seeded = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot());
  const garment = seeded.garments.find(({ sku }) => sku === "JUW-024");
  assert.ok(garment);
  assert.equal(seeded.listings.some(({ garmentId }) => garmentId === garment.id), false);
  assert.equal(selectWardrobePublicView(seeded).some(({ sku }) => sku === "JUW-024"), false);
  assert.equal(WARDROBE_AUTHORITY_MANAGED_SLUGS.includes(slug), false);
  assert.equal(shopProducts.some((product) => product.slug === slug), false);

  const serialized = JSON.stringify(contract);
  assert.doesNotMatch(serialized, /storage\/|sha-?256|prompt|provider|canon\/|evidence|identity metric/iu);
  assert.doesNotMatch(serialized, /dress|skirt|trouser|hem|back closure|zip|button/iu);
});
