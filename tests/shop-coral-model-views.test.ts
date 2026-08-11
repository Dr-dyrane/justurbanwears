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
  readonly slot: "MODEL_LEFT_PROFILE" | "MODEL_REAR_THREE_QUARTER" | "MODEL_REAR_MIRROR" | "MODEL_DETAIL";
  readonly src: string;
  readonly sha256: string;
  readonly width?: number;
  readonly height?: number;
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
      {
        slot: "MODEL_DETAIL",
        src: "/shop/products/magenta-plunge-ruched-mini-dress/08-model-detail.webp",
        sha256: "5b60a54faf31a7964f6f839b8be7842a7a8206ba2ff88ebf5fd0af30d14a36ea",
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
  {
    slug: "teal-draped-mini-set",
    hasFront: true,
    frontSha256: "b4721e8fb3d0a9e97183c1ade8b68a5bfe150a1360bcd5443715b3089552dc3f",
    views: [
      {
        slot: "MODEL_REAR_MIRROR",
        src: "/shop/products/teal-draped-mini-set/09-model-rear-mirror.webp",
        sha256: "1d9fa87b1a8ba9cabff1dab38ffd4bae76e98bb59f07a8a0443332f531ac4448",
      },
    ],
  },
  {
    slug: "sage-open-back-high-slit-maxi-dress",
    hasFront: true,
    frontSha256: "bb8e3576ab3b9679d19a5181e6999ff817057587c2a1fb12588e50957bb067a3",
    views: [
      {
        slot: "MODEL_LEFT_PROFILE",
        src: "/shop/products/sage-open-back-high-slit-maxi-dress/07-model-left-profile.webp",
        sha256: "35b1196542e5e4836ff82a6b1954fb281d553ce5fe1f9ec76d88beede626efa1",
      },
      {
        slot: "MODEL_REAR_THREE_QUARTER",
        src: "/shop/products/sage-open-back-high-slit-maxi-dress/05-model-rear-three-quarter.webp",
        sha256: "bece9263b8c0b9e4284af699ad01fd033928edff4019dfb9db822c1ca793830d",
      },
    ],
  },
  {
    slug: "cocoa-cowl-gathered-midi-dress",
    hasFront: false,
    views: [
      {
        slot: "MODEL_LEFT_PROFILE",
        src: "/shop/products/cocoa-cowl-gathered-midi-dress/07-model-left-profile.webp",
        sha256: "2030950a16cc5f193f7fe127157744a9f1a11a56ddb2c5ee49387bcffc8a161b",
        width: 972,
        height: 1728,
      },
      {
        slot: "MODEL_REAR_THREE_QUARTER",
        src: "/shop/products/cocoa-cowl-gathered-midi-dress/05-model-rear-three-quarter.webp",
        sha256: "438d45b6eb6c10ba43e5db611cb1dd4eb45ba34b0cfe2423f3a30727db0f968b",
        width: 972,
        height: 1728,
      },
    ],
  },
  {
    slug: "ivory-rib-knit-fitted-midi-dress",
    hasFront: false,
    views: [
      {
        slot: "MODEL_LEFT_PROFILE",
        src: "/shop/products/ivory-rib-knit-fitted-midi-dress/07-model-left-profile.webp",
        sha256: "401747a01c6cb15772cc594368440465c370f6dcbf655ec1ad04b53e5dbcf6b0",
      },
    ],
  },
  {
    slug: "coral-gathered-crop-mini-set",
    hasFront: false,
    views: [
      {
        slot: "MODEL_REAR_THREE_QUARTER",
        src: "/shop/products/coral-gathered-crop-mini-set/05-model-rear-three-quarter.webp",
        sha256: "77cd523ec75ced285347aa4992e35f2719a6706feec8d9e5bb28c202164e0304",
        width: 1122,
        height: 1402,
      },
    ],
  },
  {
    slug: "cropped-denim-jacket-black-legging-look",
    hasFront: false,
    views: [
      {
        slot: "MODEL_REAR_MIRROR",
        src: "/shop/products/cropped-denim-jacket-black-legging-look/09-model-rear-mirror.webp",
        sha256: "7c253f4b8b1d8207630f969d87a35bd6a4862323715f05d46b7f8d2cfa01bdfd",
        width: 1122,
        height: 1402,
      },
    ],
  },
] as const;

test("publishes cleared supplemental views as metadata-free exact WebPs", async () => {
  for (const view of approvedProducts.flatMap((product) => product.views)) {
    const path = join(process.cwd(), "public", view.src.replace(/^\/+/, ""));
    const bytes = readFileSync(path);
    const metadata = await readImage(bytes).metadata();

    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, view.width ?? 972);
    assert.equal(metadata.height, view.height ?? 1619);
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
        ["sage-open-back-high-slit-maxi-dress", "coral-gathered-crop-mini-set"].includes(approved.slug)
          ? `/shop/products/${approved.slug}/08-construction-detail.webp`
          : `/shop/products/${approved.slug}/06-fabric-detail.webp`,
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
                "teal-draped-mini-set",
                "sage-open-back-high-slit-maxi-dress",
              ].includes(approved.slug)
                ? "lulu-v3"
                : "lulu-v2",
              label: "On Lulu · front",
            }]
          : []),
        ...approved.views.map((view) => {
          if (view.slot === "MODEL_LEFT_PROFILE") {
            return {
              view: "side",
              anchor: [
                "sage-open-back-high-slit-maxi-dress",
                "cocoa-cowl-gathered-midi-dress",
                "ivory-rib-knit-fitted-midi-dress",
              ].includes(approved.slug) ? "lulu-v3" : "lulu-v2",
              label: "On Lulu · left profile",
            };
          }
          if (view.slot === "MODEL_REAR_THREE_QUARTER") {
            return {
              view: "three-quarter",
              anchor: [
                "cocoa-cowl-gathered-midi-dress",
                "sage-open-back-high-slit-maxi-dress",
                "coral-gathered-crop-mini-set",
              ].includes(approved.slug) ? "lulu-v3" : "lulu-v2",
              label: "On Lulu · right rear three-quarter",
            };
          }
          if (view.slot === "MODEL_REAR_MIRROR") {
            return { view: "rear-mirror", anchor: "lulu-v3", label: "On Lulu · rear mirror" };
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
  assert.equal(WARDROBE_PUBLIC_VIEW_SCHEMA_VERSION, 19);

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
      approved.views.map(({ slot, src }) => ({
        slot,
        src,
        modelAnchorId: [
          "sage-open-back-high-slit-maxi-dress",
          "cocoa-cowl-gathered-midi-dress",
          "ivory-rib-knit-fitted-midi-dress",
          "teal-draped-mini-set",
          "coral-gathered-crop-mini-set",
          "cropped-denim-jacket-black-legging-look",
        ].includes(approved.slug)
          ? "lulu-v3"
          : "lulu-v2",
      })),
    );
  }
});

test("migrates a stored v16 Sage row to the approved left profile without resetting operator edits", () => {
  const sage = WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.find(
    (product) => product.slug === "sage-open-back-high-slit-maxi-dress",
  );
  assert.ok(sage);
  const parsed = parseStoredWardrobePublicView(JSON.stringify({
    version: 16,
    data: [{
      ...sage,
      name: "Operator Sage title",
      price: 28900,
      note: "Operator-authored Sage note.",
      media: sage.media.filter((item) => item.slot !== "MODEL_LEFT_PROFILE"),
    }],
    managedSlugs: [sage.slug],
  }));

  assert.equal(parsed.products.length, 1);
  assert.equal(parsed.products[0].name, "Operator Sage title");
  assert.equal(parsed.products[0].price, 28900);
  assert.equal(parsed.products[0].note, "Operator-authored Sage note.");
  assert.deepEqual(
    parsed.products[0].media.slice(-2).map(({ slot, modelAnchorId }) => ({ slot, modelAnchorId })),
    [
      { slot: "MODEL_LEFT_PROFILE", modelAnchorId: "lulu-v3" },
      { slot: "MODEL_REAR_THREE_QUARTER", modelAnchorId: "lulu-v3" },
    ],
  );
});

test("migrates a stored v18 envelope without resetting operator edits", () => {
  const sage = WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.find(
    (product) => product.slug === "sage-open-back-high-slit-maxi-dress",
  );
  assert.ok(sage);
  const parsed = parseStoredWardrobePublicView(JSON.stringify({
    version: 18,
    data: [{
      ...sage,
      name: "Operator Sage v18 title",
      price: 29100,
      note: "Operator-authored Sage v18 note.",
    }],
    managedSlugs: [sage.slug],
  }));

  assert.equal(parsed.products.length, 1);
  assert.equal(parsed.products[0].name, "Operator Sage v18 title");
  assert.equal(parsed.products[0].price, 29100);
  assert.equal(parsed.products[0].note, "Operator-authored Sage v18 note.");
  assert.deepEqual(parsed.managedSlugs, [sage.slug]);
});

test("migrates an existing v15 Magenta row by appending only the approved detail", () => {
  const magenta = WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.find(
    (product) => product.slug === "magenta-plunge-ruched-mini-dress",
  );
  assert.ok(magenta);
  const catalogue09Media = magenta.media.filter((item) => item.slot !== "MODEL_DETAIL");
  const parsed = parseStoredWardrobePublicView(JSON.stringify({
    version: 15,
    data: [{
      ...magenta,
      name: "Operator Magenta",
      price: 22800,
      note: "Operator-authored Magenta note.",
      media: catalogue09Media,
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
    parsed.products[0].media.slice(-approvedMagenta.views.length),
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
