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

const readImage = sharp as unknown as (input: Uint8Array) => {
  metadata(): Promise<{
    format?: string;
    width?: number;
    height?: number;
    channels?: number;
    exif?: Uint8Array;
    icc?: Uint8Array;
    xmp?: Uint8Array;
    iptc?: Uint8Array;
  }>;
};

interface ApprovedProductView {
  readonly slot: "MODEL_LEFT_PROFILE" | "MODEL_REAR_THREE_QUARTER" | "MODEL_DETAIL";
  readonly src: string;
  readonly sha256: string;
}

interface ApprovedProductMedia {
  readonly slug: string;
  readonly hasFront: boolean;
  readonly frontSha256?: string;
  readonly views: readonly ApprovedProductView[];
}

const approvedProducts: readonly ApprovedProductMedia[] = [
  {
    slug: "coral-drift-dress",
    hasFront: true,
    frontSha256: "b6a7bbed8e487caf97a9620ba3d8c16e1be529f45bcf1bc8999d57644e57e2f6",
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
    slug: "indigo-workshirt",
    hasFront: true,
    frontSha256: "0dc8f552c9e25f17d261495d39bdc77c1601b4cf1985e44757f415c5976665e0",
    views: [],
  },
  {
    slug: "moss-square-knit",
    hasFront: true,
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
    hasFront: true,
    frontSha256: "f4586c9f87405ede93f927ac145090cd7723b98984f3610accce6ef1f43d5ad3",
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
  {
    slug: "magenta-plunge-ruched-mini-dress",
    hasFront: false,
    views: [
      {
        slot: "MODEL_LEFT_PROFILE",
        src: "/shop/products/magenta-plunge-ruched-mini-dress/07-model-left-profile.webp",
        sha256: "0ed7ada9453902956ca96abd2ed53a9627f99ad54607777b23f69461bef2ece2",
      },
      {
        slot: "MODEL_REAR_THREE_QUARTER",
        src: "/shop/products/magenta-plunge-ruched-mini-dress/05-model-rear-three-quarter.webp",
        sha256: "5cb0e4ad5d444cb4ad7d1d4f510cb1f978fc88cb26f1d688865468640905fb05",
      },
    ],
  },
  {
    slug: "orchid-beaded-column-gown",
    hasFront: true,
    views: [
      {
        slot: "MODEL_DETAIL",
        src: "/shop/products/orchid-beaded-column-gown/08-model-detail.webp",
        sha256: "40008573a597745f621c71ce3826d2f23fc72609ed8c01d253ffe42ff4990fd3",
      },
    ],
  },
  {
    slug: "silver-off-shoulder-mermaid-dress",
    hasFront: false,
    views: [
      {
        slot: "MODEL_REAR_THREE_QUARTER",
        src: "/shop/products/silver-off-shoulder-mermaid-dress/05-model-rear-three-quarter.webp",
        sha256: "f6258ad165c3e6005b079502489571324718076bc453a727c5e9c275bc06dab9",
      },
    ],
  },
] as const;

test("publishes cleared supplemental views as metadata-free 972 × 1619 WebPs", async () => {
  for (const view of approvedProducts.flatMap((product) => product.views)) {
    const path = join(process.cwd(), "public", view.src.replace(/^\/+/, ""));
    const bytes = readFileSync(path);
    const metadata = await readImage(bytes).metadata();

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

test("publishes approved V3 fronts as sanitized exact derivatives", async () => {
  for (const product of approvedProducts.filter((candidate) => candidate.frontSha256)) {
    const path = join(
      process.cwd(),
      `public/shop/products/${product.slug}/04-model-front.webp`,
    );
    const bytes = readFileSync(path);
    const metadata = await readImage(bytes).metadata();

    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 972);
    assert.equal(metadata.height, 1619);
    assert.equal(metadata.channels, 3);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
    assert.equal(metadata.xmp, undefined);
    assert.equal(metadata.iptc, undefined);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), product.frontSha256);
  }
});

test("orders product media, an approved front when present, then supplemental Lulu views", () => {
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
        ...(approved.hasFront ? [`/shop/products/${approved.slug}/04-model-front.webp`] : []),
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
        ...(approved.hasFront
          ? [{
              view: "front",
              anchor: [
                "coral-drift-dress",
                "indigo-workshirt",
                "moss-square-knit",
                "cocoa-pleat-trouser",
                "salmon-camp-shirt",
              ].includes(approved.slug)
                ? "lulu-v3"
                : "lulu-v2",
              label: "On Lulu · front",
            }]
          : []),
        ...approved.views.map((view) => {
          if (view.slot === "MODEL_LEFT_PROFILE") {
            return { view: "side", anchor: "lulu-v2", label: "On Lulu · left profile" };
          }
          if (view.slot === "MODEL_REAR_THREE_QUARTER") {
            return {
              view: "three-quarter",
              anchor: "lulu-v2",
              label: "On Lulu · right rear three-quarter",
            };
          }
          return { view: "detail", anchor: "lulu-v2", label: "On Lulu · styled detail" };
        }),
      ],
    );
    assert.doesNotMatch(JSON.stringify(gallery), /square back|right profile|05-model-back/iu);
    if (!approved.hasFront) {
      assert.deepEqual(product.modelTryout, { modelStatus: "PENDING" });
    }
  }
});

test("migrates stored v5 supplemental views without resetting operator edits", () => {
  assert.equal(WARDROBE_PUBLIC_VIEW_SCHEMA_VERSION, 11);

  for (const [index, approved] of approvedProducts.filter(
    (product) => product.views.length > 0,
  ).slice(1).entries()) {
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
      parsed.products[0].media.slice(-approved.views.length),
      approved.views.map(({ slot, src }) => ({ slot, src, modelAnchorId: "lulu-v2" })),
    );
  }
});

test("migrates an existing v6 Magenta row to approved supplemental views", () => {
  const magenta = WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.find(
    (product) => product.slug === "magenta-plunge-ruched-mini-dress",
  );
  assert.ok(magenta);
  const productOnlyMedia = magenta.media.filter((item) => !item.slot.startsWith("MODEL_"));
  const parsed = parseStoredWardrobePublicView(JSON.stringify({
    version: 6,
    data: [{
      ...magenta,
      name: "Operator Magenta",
      price: 22800,
      note: "Operator-authored Magenta note.",
      media: productOnlyMedia,
    }],
    managedSlugs: [magenta.slug],
  }));

  assert.equal(parsed.products.length, 1);
  assert.deepEqual(parsed.managedSlugs, [magenta.slug]);
  assert.equal(parsed.products[0].name, "Operator Magenta");
  assert.equal(parsed.products[0].price, 22800);
  assert.equal(parsed.products[0].note, "Operator-authored Magenta note.");
  const approvedMagenta = approvedProducts.find((product) => product.slug === magenta.slug);
  assert.ok(approvedMagenta);
  assert.deepEqual(
    parsed.products[0].media.slice(-2),
    approvedMagenta.views.map(({ slot, src }) => ({ slot, src, modelAnchorId: "lulu-v2" })),
  );
  const shopProduct = shopProducts.find((product) => product.slug === magenta.slug);
  assert.ok(shopProduct);
  assert.deepEqual(shopProduct.modelTryout, { modelStatus: "PENDING" });
});

test("rejects supplemental model claims outside the approved slot contract", () => {
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

  const silver = WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.find(
    (product) => product.slug === "silver-off-shoulder-mermaid-dress",
  );
  assert.ok(silver);
  const silverWithUnapprovedLeft = parseStoredWardrobePublicView(JSON.stringify({
    version: WARDROBE_PUBLIC_VIEW_SCHEMA_VERSION,
    data: [{
      ...silver,
      media: [
        ...silver.media,
        {
          slot: "MODEL_LEFT_PROFILE",
          src: "/shop/products/silver-off-shoulder-mermaid-dress/07-model-left-profile.webp",
        },
      ],
    }],
    managedSlugs: [silver.slug],
  }));
  assert.deepEqual(silverWithUnapprovedLeft.products, []);
  assert.deepEqual(silverWithUnapprovedLeft.managedSlugs, [silver.slug]);

  const multicolor = WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.find(
    (product) => product.slug === "multicolor-abstract-strapless-mini-dress",
  );
  assert.ok(multicolor);
  const multicolorWithUnapprovedDetail = parseStoredWardrobePublicView(JSON.stringify({
    version: WARDROBE_PUBLIC_VIEW_SCHEMA_VERSION,
    data: [{
      ...multicolor,
      media: [
        ...multicolor.media,
        {
          slot: "MODEL_DETAIL",
          src: "/shop/products/multicolor-abstract-strapless-mini-dress/08-model-detail.webp",
        },
      ],
    }],
    managedSlugs: [multicolor.slug],
  }));
  assert.deepEqual(multicolorWithUnapprovedDetail.products, []);
  assert.deepEqual(multicolorWithUnapprovedDetail.managedSlugs, [multicolor.slug]);
});
