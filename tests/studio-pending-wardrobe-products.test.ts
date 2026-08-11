import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { validateManifest } from "../scripts/shop-db/release-core.mjs";
import { shopCategories } from "../lib/shop/catalog";
import { wardrobePublicProductToShopProduct } from "../lib/shop/wardrobe-public-view";
import { garmentReadiness } from "../lib/studio/domain/readiness";
import { createEmptyStudioSnapshot, createInitialStudioState } from "../lib/studio/domain/state";
import { studioReducer } from "../lib/studio/machines/studio-machine";
import { selectWardrobePublicView } from "../lib/studio/projections/public-listing";
import {
  PENDING_WARDROBE_PRODUCT_CONTRACTS,
} from "../lib/studio/seeds/private-wardrobe-products";
import { mergeWardrobeAuthoritySeeds } from "../lib/studio/seeds/wardrobe-authority";
import type { WardrobePublicProduct } from "../lib/wardrobe-public-view/domain/entities";

const expected = new Map<string, {
  price: number;
  category: "Set" | "Dress" | "Shirt";
  missing: readonly string[];
}>([
  ["JUW-013", { price: 24500, category: "Set", missing: [] }],
  ["JUW-015", { price: 24500, category: "Dress", missing: [] }],
  ["JUW-017", { price: 24500, category: "Set", missing: ["GARMENT_FRONT", "GARMENT_BACK", "FABRIC_DETAIL"] }],
  ["JUW-018", { price: 22000, category: "Dress", missing: ["GARMENT_FRONT", "GARMENT_BACK", "FABRIC_DETAIL"] }],
  ["JUW-019", { price: 24500, category: "Dress", missing: ["GARMENT_FRONT", "GARMENT_BACK"] }],
  ["JUW-020", { price: 24500, category: "Set", missing: ["GARMENT_FRONT", "GARMENT_BACK"] }],
  ["JUW-021", { price: 24500, category: "Set", missing: ["GARMENT_FRONT", "GARMENT_BACK", "FABRIC_DETAIL"] }],
  ["JUW-022", { price: 24500, category: "Dress", missing: ["GARMENT_FRONT", "GARMENT_BACK", "FABRIC_DETAIL"] }],
  ["JUW-024", { price: 16500, category: "Shirt", missing: ["GARMENT_FRONT", "GARMENT_BACK", "FABRIC_DETAIL"] }],
] as const);

test("seeds approved business facts while media remains the only readiness gap", () => {
  const seeded = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot());

  for (const contract of PENDING_WARDROBE_PRODUCT_CONTRACTS) {
    const policy = expected.get(contract.sku);
    const garment = seeded.garments.find((candidate) => candidate.sku === contract.sku);
    assert.ok(policy);
    assert.ok(garment);
    assert.equal(garment.category, policy.category);
    assert.equal(garment.price, policy.price);
    assert.equal(garment.sizeLabel, "Size on request");
    assert.equal(garment.estimatedFit, "Measurements confirmed before payment");
    assert.equal(garment.condition, "Excellent · real-worn wardrobe piece");
    assert.equal(garment.quantity, 1);
    assert.equal(garment.saleEligible, true);
    assert.deepEqual(garment.measurements, []);
    assert.equal(garment.classificationState, "READY");
    assert.equal(garment.availability, "AVAILABLE");
    assert.deepEqual(contract.missingViews, policy.missing);

    const gates = garmentReadiness(garment);
    if (policy.missing.length === 0) {
      assert.equal(garment.mediaState, "READY");
      assert.equal(garment.state, "PUBLISHED");
      assert.deepEqual(gates.filter((gate) => !gate.ready), []);
      assert.equal(seeded.listings.some((listing) => listing.garmentId === garment.id), true);
      const inventory = seeded.inventory.find((record) => record.garmentId === garment.id);
      assert.equal(inventory?.state, "PUBLISHED");
      assert.equal(inventory?.onHand, 1);
      continue;
    }
    assert.equal(garment.mediaState, "DRAFT");
    assert.equal(garment.state, "DRAFT");
    assert.deepEqual(
      gates.filter((gate) => !gate.ready).map((gate) => gate.id),
      ["media"],
    );
    assert.deepEqual(
      seeded.inventory.find((record) => record.garmentId === garment.id),
      {
        id: `wardrobe-private-stock-${contract.sku.toLowerCase()}`,
        garmentId: garment.id,
        onHand: 1,
        reserved: 0,
        sold: 0,
        returned: 0,
        writeOff: 0,
        state: "DRAFT",
        updatedAt: "2026-08-11T00:00:00.000Z",
      },
    );
    assert.equal(seeded.listings.some((listing) => listing.garmentId === garment.id), false);
  }

  for (const [sku, policy] of expected) {
    assert.equal(
      selectWardrobePublicView(seeded).some((product) => product.sku === sku),
      policy.missing.length === 0,
    );
  }
  assert.deepEqual(mergeWardrobeAuthoritySeeds(seeded), seeded);

  const serialized = JSON.stringify(PENDING_WARDROBE_PRODUCT_CONTRACTS);
  assert.doesNotMatch(serialized, /storage\/|sha-?256|prompt|provider|canon\/|evidence|identity metric/iu);
});

test("promotes JUW-015 only after product captures and approved model angles are complete", () => {
  const contract = PENDING_WARDROBE_PRODUCT_CONTRACTS.find(({ sku }) => sku === "JUW-015");
  assert.ok(contract);
  assert.deepEqual(contract.approvedViews, [
    "GARMENT_FRONT",
    "GARMENT_BACK",
    "MANNEQUIN_FRONT",
    "FABRIC_DETAIL",
    "MODEL_LEFT_PROFILE",
    "MODEL_REAR_THREE_QUARTER",
  ]);
  assert.deepEqual(contract.missingViews, []);
  assert.deepEqual(contract.garment.references.map(({ view }) => view), ["FRONT", "BACK", "DETAIL"]);
  assert.equal(contract.garment.mediaState, "READY");

  const seeded = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot());
  const garment = seeded.garments.find(({ sku }) => sku === "JUW-015");
  assert.ok(garment);
  assert.equal(seeded.listings.some(({ garmentId }) => garmentId === garment.id), true);
  assert.equal(selectWardrobePublicView(seeded).some(({ sku }) => sku === "JUW-015"), true);
});

test("admits JUW-017's real Lulu front while unresolved product construction stays explicit", async () => {
  const contract = PENDING_WARDROBE_PRODUCT_CONTRACTS.find(({ sku }) => sku === "JUW-017");
  assert.ok(contract);
  assert.deepEqual(contract.approvedViews, ["MODEL_FRONT"]);
  assert.deepEqual(contract.missingViews, ["GARMENT_FRONT", "GARMENT_BACK", "FABRIC_DETAIL"]);
  assert.deepEqual(contract.garment.references, []);
  assert.equal(contract.garment.mediaState, "DRAFT");
  assert.doesNotMatch(contract.garment.publicDescription, /skirt|shorts/iu);

  const assetPath = join(
    process.cwd(),
    "public/shop/products/white-tailored-vest-mini-set/04-model-front.webp",
  );
  assert.equal(existsSync(assetPath), true);
  const metadata = await sharp(readFileSync(assetPath)).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 1122);
  assert.equal(metadata.height, 1402);
  assert.equal(metadata.channels, 3);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.equal(metadata.xmp, undefined);
  assert.equal(metadata.iptc, undefined);

  const seeded = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot());
  const garment = seeded.garments.find(({ sku }) => sku === "JUW-017");
  assert.ok(garment);
  assert.equal(seeded.listings.some(({ garmentId }) => garmentId === garment.id), false);
  assert.equal(selectWardrobePublicView(seeded).some(({ sku }) => sku === "JUW-017"), false);
});

test("keeps JUW-019 approved upper views distinct from missing full product captures", () => {
  const contract = PENDING_WARDROBE_PRODUCT_CONTRACTS.find(({ sku }) => sku === "JUW-019");
  assert.ok(contract);
  assert.deepEqual(contract.approvedViews, [
    "MANNEQUIN_UPPER_FRONT",
    "MODEL_FRONT",
    "MODEL_REAR_THREE_QUARTER",
    "CONSTRUCTION_DETAIL",
  ]);
  assert.deepEqual(contract.missingViews, ["GARMENT_FRONT", "GARMENT_BACK"]);
  assert.deepEqual(contract.garment.references.map(({ view }) => view), ["DETAIL"]);
  assert.equal(contract.garment.mediaState, "DRAFT");

  const seeded = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot());
  const garment = seeded.garments.find(({ sku }) => sku === "JUW-019");
  assert.ok(garment);
  assert.equal(seeded.listings.some(({ garmentId }) => garmentId === garment.id), false);
  assert.equal(selectWardrobePublicView(seeded).some(({ sku }) => sku === "JUW-019"), false);
});

test("preserves JUW-020 approved rear-three-quarter views while direct product views remain pending", () => {
  const contract = PENDING_WARDROBE_PRODUCT_CONTRACTS.find(({ sku }) => sku === "JUW-020");
  assert.ok(contract);
  assert.deepEqual(contract.approvedViews, [
    "MANNEQUIN_RIGHT_REAR_THREE_QUARTER",
    "MODEL_REAR_THREE_QUARTER",
    "CONSTRUCTION_DETAIL",
  ]);
  assert.deepEqual(contract.missingViews, ["GARMENT_FRONT", "GARMENT_BACK"]);
  assert.deepEqual(contract.garment.references.map(({ view }) => view), ["DETAIL"]);
  assert.equal(contract.garment.mediaState, "DRAFT");

  const seeded = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot());
  const garment = seeded.garments.find(({ sku }) => sku === "JUW-020");
  assert.ok(garment);
  assert.equal(seeded.listings.some(({ garmentId }) => garmentId === garment.id), false);
  assert.equal(selectWardrobePublicView(seeded).some(({ sku }) => sku === "JUW-020"), false);
});

test("adding only the declared missing captures completes each media gate", () => {
  const snapshot = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot());
  let state = studioReducer(createInitialStudioState(), {
    type: "HYDRATION_SUCCEEDED",
    snapshot,
  });

  for (const contract of PENDING_WARDROBE_PRODUCT_CONTRACTS) {
    const garment = state.garments.find((candidate) => candidate.sku === contract.sku);
    assert.ok(garment);
    if (contract.missingViews.length === 0) {
      assert.equal(garment.mediaState, "READY");
      continue;
    }
    const references = contract.missingViews.map((view, index) => ({
      id: `${contract.sku.toLowerCase()}-missing-${index}`,
      view: view === "GARMENT_FRONT"
        ? "FRONT" as const
        : view === "GARMENT_BACK"
          ? "BACK" as const
          : "DETAIL" as const,
      quality: 100,
    }));
    state = studioReducer(state, {
      type: "GARMENT_MEDIA_ADDED",
      id: garment.id,
      references,
    });
    const updated = state.garments.find((candidate) => candidate.id === garment.id);
    assert.equal(updated?.mediaState, "READY");
    assert.deepEqual(
      updated?.references.map((reference) => reference.view).sort(),
      ["BACK", "DETAIL", "FRONT"],
    );
  }
});

test("promotes the legacy JUW-013 intake without replacing operator-authored facts", () => {
  const canonical = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot())
    .garments.find((candidate) => candidate.sku === "JUW-013");
  assert.ok(canonical);
  const snapshot = createEmptyStudioSnapshot();
  snapshot.garments.push({
    ...canonical,
    sku: "DYN-093",
    title: "Operator teal title",
    price: 26000,
    privateNote: "Keep this note",
    mediaState: "DRAFT",
    state: "DRAFT",
    canonState: "REVIEW",
  });
  snapshot.inventory.push({
    id: "wardrobe-private-stock-juw-013",
    garmentId: canonical.id,
    onHand: 1,
    reserved: 0,
    sold: 0,
    returned: 0,
    writeOff: 0,
    state: "DRAFT",
    updatedAt: canonical.createdAt,
  });

  const merged = mergeWardrobeAuthoritySeeds(snapshot);
  const garment = merged.garments.find((candidate) => candidate.sku === "JUW-013");
  assert.ok(garment);
  assert.equal(garment.title, "Operator teal title");
  assert.equal(garment.price, 26000);
  assert.equal(garment.privateNote, "Keep this note");
  assert.equal(garment.mediaState, "READY");
  assert.equal(garment.state, "PUBLISHED");
  assert.equal(merged.garments.filter((candidate) => candidate.sku === "JUW-013").length, 1);
  assert.equal(merged.listings.some((listing) => listing.garmentId === garment.id), true);
});

test("preserves Sets and rear-mirror as truthful public vocabulary", () => {
  assert.ok(shopCategories.includes("Sets"));
  const product: WardrobePublicProduct = {
    slug: "teal-draped-mini-set",
    sku: "JUW-013",
    name: "Teal Draped Mini Set",
    category: "Sets",
    price: 24500,
    taggedSize: "Size on request",
    fit: "Measurements confirmed before payment",
    condition: "Excellent · real-worn wardrobe piece",
    colour: "Teal",
    availability: "AVAILABLE",
    drop: "Drop 01",
    tone: "indigo",
    silhouette: "set",
    note: "A teal two-piece set.",
    story: "A draped top paired with a close mini skirt.",
    details: ["Two-piece set"],
    measurements: [],
    modelAnchor: { id: "lulu-v3" },
    media: [{
      slot: "MODEL_REAR_MIRROR",
      src: "/shop/products/teal-draped-mini-set/09-model-rear-mirror.webp",
      modelAnchorId: "lulu-v3",
    }],
  };

  const shopProduct = wardrobePublicProductToShopProduct(product);
  assert.equal(shopProduct.category, "Sets");
  assert.equal(shopProduct.silhouette, "set");
  assert.deepEqual(shopProduct.media?.[0], {
    id: "model-rear-mirror",
    src: "/shop/products/teal-draped-mini-set/09-model-rear-mirror.webp",
    alt: "Teal Draped Mini Set · on lulu · rear mirror.",
    label: "On Lulu · rear mirror",
    presentation: "model",
    view: "rear-mirror",
    width: 972,
    height: 1619,
    modelAnchorId: "lulu-v3",
  });

  assert.doesNotThrow(() => validateManifest({
    schemaVersion: 2,
    revision: "pending-set-contract",
    products: [{
      ...product,
      media: [
        { slot: "GARMENT_FRONT", src: "/shop/products/teal-draped-mini-set/01-garment-front.webp" },
        { slot: "GARMENT_BACK", src: "/shop/products/teal-draped-mini-set/02-garment-back.webp" },
        { slot: "MANNEQUIN_FRONT", src: "/shop/products/teal-draped-mini-set/03-mannequin-front.webp" },
        { slot: "FABRIC_DETAIL", src: "/shop/products/teal-draped-mini-set/06-fabric-detail.webp" },
        product.media[0],
      ],
      initialInventory: {
        availability: "AVAILABLE",
        onHand: 1,
        reserved: 0,
        sold: 0,
        returned: 0,
        writeOff: 0,
      },
    }],
  }, { expectedRows: 1 }));
});
