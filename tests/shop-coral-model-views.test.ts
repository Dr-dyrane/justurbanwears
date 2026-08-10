import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { shopProducts } from "../lib/shop/catalog";
import { selectProductGalleryMedia } from "../lib/shop/model-tryout";
import {
  WARDROBE_PUBLIC_VIEW_SCHEMA_VERSION,
} from "../lib/wardrobe-public-view/domain/entities";
import { parseStoredWardrobePublicView } from "../lib/wardrobe-public-view/db/browser-repository";
import { WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS } from "../lib/wardrobe-public-view/seeds";

const approvedViews = [
  {
    slot: "MODEL_LEFT_PROFILE",
    src: "/shop/products/coral-drift-dress/07-model-left-profile.webp",
    sha256: "1957c0782264dd5e3016a3af7f2c2b71a2b8d35086736e1d617e557f8af32e8a",
  },
  {
    slot: "MODEL_REAR_THREE_QUARTER",
    src: "/shop/products/coral-drift-dress/05-model-rear-three-quarter.webp",
    sha256: "40f4c304a96375451fb7c8693456f959c60d0876ffbd1c563fa3c3e3b1257b73",
  },
] as const;

test("publishes the two cleared Coral views as metadata-free 972 × 1619 WebPs", async () => {
  for (const view of approvedViews) {
    const path = join(process.cwd(), "public", view.src.replace(/^\/+/, ""));
    const bytes = readFileSync(path);
    const metadata = await sharp(bytes).metadata();

    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 972);
    assert.equal(metadata.height, 1619);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
    assert.equal(metadata.xmp, undefined);
    assert.equal(metadata.iptc, undefined);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), view.sha256);
  }
});

test("orders Coral product media, then front, left profile, and rear three-quarter", () => {
  const coral = shopProducts.find((product) => product.slug === "coral-drift-dress");
  assert.ok(coral);

  const gallery = selectProductGalleryMedia(coral);
  assert.deepEqual(
    gallery.map((item) => item.src),
    [
      "/shop/products/coral-drift-dress/01-garment-front.webp",
      "/shop/products/coral-drift-dress/02-garment-back.webp",
      "/shop/products/coral-drift-dress/03-mannequin-front.webp",
      "/shop/products/coral-drift-dress/06-fabric-detail.webp",
      "/shop/products/coral-drift-dress/04-model-front.webp",
      ...approvedViews.map((view) => view.src),
    ],
  );
  assert.deepEqual(
    gallery.filter((item) => item.presentation === "model").map((item) => ({
      view: item.view,
      anchor: item.modelAnchorId,
      label: item.label,
    })),
    [
      { view: "front", anchor: "lulu-v2", label: "On Lulu · front" },
      { view: "side", anchor: "lulu-v2", label: "On Lulu · left profile" },
      { view: "three-quarter", anchor: "lulu-v2", label: "On Lulu · rear three-quarter" },
    ],
  );
  assert.doesNotMatch(JSON.stringify(gallery), /square back|right profile|05-model-back/iu);
});

test("migrates stored V3 Coral data without resetting operator edits", () => {
  const coral = WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.find(
    (product) => product.slug === "coral-drift-dress",
  );
  assert.ok(coral);
  const legacyMedia = coral.media.filter((item) => !approvedViews.some((view) => view.slot === item.slot));
  const parsed = parseStoredWardrobePublicView(JSON.stringify({
    version: 3,
    data: [{
      ...coral,
      name: "Operator-edited Coral title",
      price: 27100,
      note: "Operator-authored release note.",
      media: legacyMedia,
    }],
    managedSlugs: [coral.slug],
  }));

  assert.equal(WARDROBE_PUBLIC_VIEW_SCHEMA_VERSION, 5);
  assert.equal(parsed.products.length, 1);
  assert.equal(parsed.products[0].name, "Operator-edited Coral title");
  assert.equal(parsed.products[0].price, 27100);
  assert.equal(parsed.products[0].note, "Operator-authored release note.");
  assert.deepEqual(
    parsed.products[0].media.slice(-2),
    approvedViews.map(({ slot, src }) => ({ slot, src })),
  );
});

test("rejects supplemental model claims outside the approved Coral contract", () => {
  const moss = WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.find(
    (product) => product.slug === "moss-square-knit",
  );
  assert.ok(moss);
  const parsed = parseStoredWardrobePublicView(JSON.stringify({
    version: WARDROBE_PUBLIC_VIEW_SCHEMA_VERSION,
    data: [{
      ...moss,
      media: [
        ...moss.media,
        {
          slot: "MODEL_LEFT_PROFILE",
          src: "/shop/products/moss-square-knit/07-model-left-profile.webp",
        },
      ],
    }],
    managedSlugs: [moss.slug],
  }));

  assert.deepEqual(parsed.products, []);
  assert.deepEqual(parsed.managedSlugs, [moss.slug]);
});
