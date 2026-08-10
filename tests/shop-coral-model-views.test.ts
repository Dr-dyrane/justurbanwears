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

const approvedProducts = [
  {
    slug: "coral-drift-dress",
    views: [
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
    ],
  },
  {
    slug: "moss-square-knit",
    views: [
      {
        slot: "MODEL_LEFT_PROFILE",
        src: "/shop/products/moss-square-knit/07-model-left-profile.webp",
        sha256: "0464a09314a92d09a374667c7ce127c7e9cd043495535f30f0edbf1813aae257",
      },
      {
        slot: "MODEL_REAR_THREE_QUARTER",
        src: "/shop/products/moss-square-knit/05-model-rear-three-quarter.webp",
        sha256: "5da01a3c81ebfc68210628a2151109bec967ee80619d1576af47bc3887fcb559",
      },
    ],
  },
  {
    slug: "cocoa-pleat-trouser",
    views: [
      {
        slot: "MODEL_LEFT_PROFILE",
        src: "/shop/products/cocoa-pleat-trouser/07-model-left-profile.webp",
        sha256: "c61e04f4b0131cf5b8a520e090896269f6d85a2db96ad2d6c3cc7379ec183721",
      },
      {
        slot: "MODEL_REAR_THREE_QUARTER",
        src: "/shop/products/cocoa-pleat-trouser/05-model-rear-three-quarter.webp",
        sha256: "ca2cbcb7332f35ad513887fbf665e32c11cbcd5ecc0d2b7d9263cdf99b7fae1c",
      },
    ],
  },
] as const;

test("publishes cleared supplemental views as metadata-free 972 × 1619 WebPs", async () => {
  for (const view of approvedProducts.flatMap((product) => product.views)) {
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

test("orders product media, then Lulu front, left profile, and right rear three-quarter", () => {
  for (const approved of approvedProducts) {
    const product = shopProducts.find((candidate) => candidate.slug === approved.slug);
    assert.ok(product);

    const gallery = selectProductGalleryMedia(product);
    assert.deepEqual(
      gallery.map((item) => item.src),
      [
        `/shop/products/${approved.slug}/01-garment-front.webp`,
        `/shop/products/${approved.slug}/02-garment-back.webp`,
        `/shop/products/${approved.slug}/03-mannequin-front.webp`,
        `/shop/products/${approved.slug}/06-fabric-detail.webp`,
        `/shop/products/${approved.slug}/04-model-front.webp`,
        ...approved.views.map((view) => view.src),
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
        {
          view: "three-quarter",
          anchor: "lulu-v2",
          label: "On Lulu · right rear three-quarter",
        },
      ],
    );
    assert.doesNotMatch(JSON.stringify(gallery), /square back|right profile|05-model-back/iu);
  }
});

test("migrates stored v5 Moss and Cocoa data without resetting operator edits", () => {
  assert.equal(WARDROBE_PUBLIC_VIEW_SCHEMA_VERSION, 6);

  for (const [index, approved] of approvedProducts.slice(1).entries()) {
    const product = WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.find(
      (candidate) => candidate.slug === approved.slug,
    );
    assert.ok(product);
    const legacyMedia = product.media.filter(
      (item) => !approved.views.some((view) => view.slot === item.slot),
    );
    const parsed = parseStoredWardrobePublicView(JSON.stringify({
      version: 5,
      data: [{
        ...product,
        name: `Operator-edited ${approved.slug}`,
        price: 27100 + index,
        note: `Operator-authored ${approved.slug} note.`,
        media: legacyMedia,
      }],
      managedSlugs: [product.slug],
    }));

    assert.equal(parsed.products.length, 1);
    assert.equal(parsed.products[0].name, `Operator-edited ${approved.slug}`);
    assert.equal(parsed.products[0].price, 27100 + index);
    assert.equal(parsed.products[0].note, `Operator-authored ${approved.slug} note.`);
    assert.deepEqual(
      parsed.products[0].media.slice(-2),
      approved.views.map(({ slot, src }) => ({ slot, src })),
    );
  }
});

test("rejects supplemental model claims outside the approved multi-view contract", () => {
  const salmon = WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.find(
    (product) => product.slug === "salmon-camp-shirt",
  );
  assert.ok(salmon);
  const parsed = parseStoredWardrobePublicView(JSON.stringify({
    version: WARDROBE_PUBLIC_VIEW_SCHEMA_VERSION,
    data: [{
      ...salmon,
      media: [
        ...salmon.media,
        {
          slot: "MODEL_LEFT_PROFILE",
          src: "/shop/products/salmon-camp-shirt/07-model-left-profile.webp",
        },
      ],
    }],
    managedSlugs: [salmon.slug],
  }));

  assert.deepEqual(parsed.products, []);
  assert.deepEqual(parsed.managedSlugs, [salmon.slug]);
});
