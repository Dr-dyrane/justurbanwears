import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { createEmptyStudioSnapshot } from "../lib/studio/domain/state";
import { mergeWardrobeAuthoritySeeds } from "../lib/studio/seeds/wardrobe-authority";

const expectedCovers = [
  {
    src: "/studio/wardrobe/blush-scoop-mini-dress/01-garment-front.webp",
    sha256: "90a0d53fa5749536338100e0ada2c73fbdadfe3e51c867611c2077136902633b",
  },
  {
    src: "/studio/wardrobe/orchid-beaded-column-gown/01-garment-front.webp",
    sha256: "7009f5f891fea39db6c017bbd4d30fa5935ffa97db0d4b533464c82cd1490b3b",
  },
  {
    src: "/studio/wardrobe/sage-asymmetric-ruched-maxi-dress/01-garment-front.webp",
    sha256: "26fb91232b24955d0f696a6e08efc37df81f28b2d863838faf7ec581947bc37d",
  },
  {
    src: "/studio/wardrobe/magenta-plunge-ruched-mini-dress/01-garment-front.webp",
    sha256: "5283d3dbfdbc154b5208c821e2830e02fffd518810c33f0416a488b33a304b56",
  },
  {
    src: "/studio/wardrobe/silver-off-shoulder-mermaid-dress/01-garment-front.webp",
    sha256: "8dfd775220e8141db56d8f259c7b5051ca31a19976a159a50dd426743379a0a2",
  },
  {
    src: "/studio/wardrobe/multicolor-abstract-strapless-mini-dress/01-garment-front.webp",
    sha256: "2bd0ead44a3fc0c665b8b39d835460a293f0f94f802612c49e61155cc76453a8",
  },
] as const;

test("keeps every real-worn wardrobe cover present, typed, and byte-reviewed", async () => {
  const seeded = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot());
  const reviewCovers = seeded.garments
    .filter((garment) => garment.sku.startsWith("REVIEW-"))
    .map((garment) => garment.reviewCover?.src);
  assert.deepEqual(reviewCovers, expectedCovers.map(({ src }) => src));

  for (const expected of expectedCovers) {
    const assetPath = join(process.cwd(), "public", expected.src.replace(/^\/+/, ""));
    assert.equal(existsSync(assetPath), true, `${expected.src} must exist`);
    const bytes = readFileSync(assetPath);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected.sha256);
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 1122);
    assert.equal(metadata.height, 1402);
  }
});
