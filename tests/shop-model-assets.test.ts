import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { shopModelAnchors, shopProducts } from "../lib/shop/catalog.ts";
import { resolveApprovedModelTryout } from "../lib/shop/model-tryout.ts";

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

test("keeps model backs out of the public catalogue until a rear identity master is approved", () => {
  for (const product of shopProducts) {
    assert.doesNotMatch(JSON.stringify(product), /05-model-back\.webp/);
  }
});
