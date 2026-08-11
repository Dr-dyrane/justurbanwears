import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { shopModelAnchors, shopProducts } from "../lib/shop/catalog";
import {
  resolveApprovedModelTryout,
  selectProductGalleryMedia,
} from "../lib/shop/model-tryout";

const expectedApprovals = [
  {
    slug: "coral-drift-dress",
    width: 972,
    height: 1619,
    sha256: "b6a7bbed8e487caf97a9620ba3d8c16e1be529f45bcf1bc8999d57644e57e2f6",
  },
  {
    slug: "indigo-workshirt",
    width: 972,
    height: 1619,
    sha256: "0dc8f552c9e25f17d261495d39bdc77c1601b4cf1985e44757f415c5976665e0",
  },
  {
    slug: "moss-square-knit",
    width: 972,
    height: 1619,
    sha256: "2ea912595c82c9b4b1a0c8f0f608e6242332cc41ee2f337c5da53a489262e03c",
  },
  {
    slug: "ivory-tie-skirt",
    width: 971,
    height: 1619,
    sha256: "2ec9586b6f050ab0e9e9486866b08633b7e89b2ee1fda49f79d80c1db8e1a06d",
  },
  {
    slug: "cocoa-pleat-trouser",
    width: 972,
    height: 1619,
    sha256: "f4586c9f87405ede93f927ac145090cd7723b98984f3610accce6ef1f43d5ad3",
  },
  {
    slug: "salmon-camp-shirt",
    width: 972,
    height: 1619,
    sha256: "afb3e4c0e804799a58ed11d87d46b3dd0fcca26c2cdd0323b577d8d3d25e0bda",
  },
  {
    slug: "blush-scoop-mini-dress",
    width: 972,
    height: 1619,
    sha256: "6e56d78e84f11bbf872b551dc06e57fb6ab75649faeb8a30ba84a4ff22fb8aa4",
  },
  {
    slug: "orchid-beaded-column-gown",
    width: 972,
    height: 1619,
    sha256: "21f11f3f1146080ebb3c2fe1a5affb40872f545d66ab996d594263409cd2e6b3",
  },
  {
    slug: "multicolor-abstract-strapless-mini-dress",
    width: 972,
    height: 1619,
    sha256: "575b3341f455e69e99988b16969261575f5a0543fb4c9afc7b21117d41201f1c",
  },
] as const;

const approvedSupplementalSources = new Map<string, readonly string[]>([
  ...[
    "coral-drift-dress",
    "moss-square-knit",
    "cocoa-pleat-trouser",
    "magenta-plunge-ruched-mini-dress",
  ].map((slug) => [
    slug,
    [
      `/shop/products/${slug}/07-model-left-profile.webp`,
      `/shop/products/${slug}/05-model-rear-three-quarter.webp`,
    ],
  ] as const),
  [
    "silver-off-shoulder-mermaid-dress",
    ["/shop/products/silver-off-shoulder-mermaid-dress/05-model-rear-three-quarter.webp"],
  ],
  [
    "orchid-beaded-column-gown",
    ["/shop/products/orchid-beaded-column-gown/08-model-detail.webp"],
  ],
]);

test("keeps the public Lulu V2 anchor byte-identical to the approved projection", () => {
  const anchor = shopModelAnchors["lulu-v2"];
  const assetPath = join(process.cwd(), "public", anchor.src.replace(/^\/+/, ""));
  assert.equal(existsSync(assetPath), true);
  assert.equal(
    createHash("sha256").update(readFileSync(assetPath)).digest("hex"),
    "35ad162ba8a9b3e50a8288ddc03dda350926dc95b93e7541a08405f711a5347c",
  );
});

test("publishes only identity-cleared model fronts with their reviewed bytes", () => {
  const approved = shopProducts.flatMap((product) => {
    const tryout = resolveApprovedModelTryout(product.modelTryout);
    return tryout ? [{ product, tryout }] : [];
  });

  assert.deepEqual(
    approved.map(({ product }) => product.slug),
    expectedApprovals.map(({ slug }) => slug),
  );

  for (const expected of expectedApprovals) {
    const entry = approved.find(({ product }) => product.slug === expected.slug);
    assert.ok(entry);
    assert.equal(entry.tryout.frame.view, "front");
    assert.equal(entry.tryout.frame.presentation, "model");
    assert.equal(
      entry.tryout.modelAnchorId,
      [
        "coral-drift-dress",
        "indigo-workshirt",
        "moss-square-knit",
        "cocoa-pleat-trouser",
        "salmon-camp-shirt",
      ].includes(expected.slug)
        ? "lulu-v3"
        : "lulu-v2",
    );
    assert.equal(entry.tryout.frame.width, expected.width);
    assert.equal(entry.tryout.frame.height, expected.height);

    const assetPath = join(process.cwd(), "public", entry.tryout.frame.src.replace(/^\/+/, ""));
    assert.equal(existsSync(assetPath), true, `${entry.tryout.frame.src} must exist`);
    const body = readFileSync(assetPath);
    assert.equal(
      createHash("sha256").update(body).digest("hex"),
      expected.sha256,
    );
    for (const metadataChunk of ["EXIF", "XMP ", "ICCP"]) {
      assert.equal(
        body.indexOf(Buffer.from(metadataChunk)),
        -1,
        `${entry.tryout.frame.src} must not expose ${metadataChunk.trim()} metadata`,
      );
    }
  }
});

test("keeps unsupported square-back claims out of the public catalogue", () => {
  for (const product of shopProducts) {
    assert.doesNotMatch(JSON.stringify(product), /05-model-back\.webp/);
  }
});

test("appends only approved Lulu views to the main product gallery", () => {
  for (const product of shopProducts) {
    const gallery = selectProductGalleryMedia(product);
    const modelFrames = gallery.filter((item) => item.presentation === "model");
    const hasApprovedFront = expectedApprovals.some(({ slug }) => slug === product.slug);
    const supplementalSources = approvedSupplementalSources.get(product.slug) ?? [];
    const expectedModelFrames = [
      ...(hasApprovedFront ? [{
        src: `/shop/products/${product.slug}/04-model-front.webp`,
        modelAnchorId: [
          "coral-drift-dress",
          "indigo-workshirt",
          "moss-square-knit",
          "cocoa-pleat-trouser",
          "salmon-camp-shirt",
        ].includes(product.slug)
          ? "lulu-v3"
          : "lulu-v2",
      }] : []),
      ...supplementalSources.map((src) => ({ src, modelAnchorId: "lulu-v2" })),
    ];

    if (expectedModelFrames.length) {
      assert.equal(gallery.length, 4 + expectedModelFrames.length);
      assert.deepEqual(
        modelFrames.map(({ src, modelAnchorId }) => ({ src, modelAnchorId })),
        expectedModelFrames,
      );
    } else {
      assert.equal(gallery.length, 4);
      assert.equal(modelFrames.length, 0);
    }
  }

  const magenta = shopProducts.find((product) => product.slug === "magenta-plunge-ruched-mini-dress");
  assert.ok(magenta);
  assert.deepEqual(magenta.modelTryout, { modelStatus: "PENDING" });
});
