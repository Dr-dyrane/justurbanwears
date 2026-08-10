import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { shopModelAnchors, shopProducts } from "../lib/shop/catalog.ts";
import {
  resolveApprovedModelTryout,
  selectProductGalleryMedia,
} from "../lib/shop/model-tryout.ts";

const expectedApprovals = [
  {
    slug: "coral-drift-dress",
    width: 972,
    height: 1619,
    sha256: "114122193834a4bf31686e2df0ac8a8a3709febd39575b559123cf9bc3f3911a",
  },
  {
    slug: "moss-square-knit",
    width: 972,
    height: 1619,
    sha256: "6cc0921a1263fc8b5514421be739c6eb6262fdb1bb9a229c010a2f0e0ebb388d",
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
    sha256: "388845a92134af3accda47f6ee1b5aa7d98bb14483df82999ba1d913f1dcfdc5",
  },
  {
    slug: "salmon-camp-shirt",
    width: 972,
    height: 1619,
    sha256: "048fba20e31e6fd092315bd042b161ba559a011ae4b12b72be88ac547325e1ac",
  },
  {
    slug: "blush-scoop-mini-dress",
    width: 972,
    height: 1619,
    sha256: "3556692f2e60c202c44b449d5aa3fa54242212a5afb4ac220028cc6d361925ad",
  },
  {
    slug: "orchid-beaded-column-gown",
    width: 972,
    height: 1619,
    sha256: "b39a75718c9ab77057325c7549f7b749b56aead8f06634465718e3a971ba6ea8",
  },
  {
    slug: "sage-asymmetric-ruched-maxi-dress",
    width: 972,
    height: 1619,
    sha256: "c7fe429f33d463325924dc321bd2f8dc573f32fc975df379fe9977fe19b1dd51",
  },
  {
    slug: "silver-off-shoulder-mermaid-dress",
    width: 972,
    height: 1619,
    sha256: "e41334fe9952d9a2c5fb84fe3e6730099b9936f2fd5f44fc8896ee55a9ec907e",
  },
  {
    slug: "multicolor-abstract-strapless-mini-dress",
    width: 972,
    height: 1619,
    sha256: "32cb8b1c831708f0e347e8069639fe552dc95d842cc7a0a408f51b6dd272daee",
  },
] as const;

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
    assert.equal(entry.tryout.modelAnchorId, "lulu-v2");
    assert.equal(entry.tryout.frame.width, expected.width);
    assert.equal(entry.tryout.frame.height, expected.height);

    const assetPath = join(process.cwd(), "public", entry.tryout.frame.src.replace(/^\/+/, ""));
    assert.equal(existsSync(assetPath), true, `${entry.tryout.frame.src} must exist`);
    assert.equal(
      createHash("sha256").update(readFileSync(assetPath)).digest("hex"),
      expected.sha256,
    );
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

    if (expectedApprovals.some(({ slug }) => slug === product.slug)) {
      const expectedModelSources = product.slug === "coral-drift-dress"
        ? [
            `/shop/products/${product.slug}/04-model-front.webp`,
            `/shop/products/${product.slug}/07-model-left-profile.webp`,
            `/shop/products/${product.slug}/05-model-rear-three-quarter.webp`,
          ]
        : [`/shop/products/${product.slug}/04-model-front.webp`];
      assert.equal(gallery.length, 4 + expectedModelSources.length);
      assert.deepEqual(modelFrames.map((item) => item.src), expectedModelSources);
      assert.ok(modelFrames.every((item) => item.modelAnchorId === "lulu-v2"));
    } else {
      assert.equal(gallery.length, 4);
      assert.equal(modelFrames.length, 0);
    }
  }
});
