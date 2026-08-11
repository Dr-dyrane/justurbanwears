import assert from "node:assert/strict";
import test from "node:test";
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
  category: "Set" | "Dress";
  missing: readonly string[];
}>([
  ["JUW-013", { price: 24500, category: "Set", missing: ["GARMENT_BACK", "FABRIC_DETAIL"] }],
  ["JUW-018", { price: 22000, category: "Dress", missing: ["GARMENT_FRONT", "GARMENT_BACK"] }],
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
    assert.equal(garment.mediaState, "DRAFT");
    assert.equal(garment.state, "DRAFT");
    assert.equal(garment.availability, "AVAILABLE");
    assert.deepEqual(contract.missingViews, policy.missing);

    const gates = garmentReadiness(garment);
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

  assert.equal(selectWardrobePublicView(seeded).some((product) => expected.has(product.sku)), false);
  assert.deepEqual(mergeWardrobeAuthoritySeeds(seeded), seeded);

  const serialized = JSON.stringify(PENDING_WARDROBE_PRODUCT_CONTRACTS);
  assert.doesNotMatch(serialized, /storage\/|sha-?256|prompt|provider|canon\/|evidence|identity metric/iu);
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

test("renames legacy intake SKUs without replacing operator-authored facts", () => {
  const contract = PENDING_WARDROBE_PRODUCT_CONTRACTS[0];
  const snapshot = createEmptyStudioSnapshot();
  snapshot.garments.push({
    ...contract.garment,
    sku: "DYN-093",
    title: "Operator teal title",
    price: 26000,
    privateNote: "Keep this note",
  });

  const merged = mergeWardrobeAuthoritySeeds(snapshot);
  const garment = merged.garments.find((candidate) => candidate.sku === "JUW-013");
  assert.ok(garment);
  assert.equal(garment.title, "Operator teal title");
  assert.equal(garment.price, 26000);
  assert.equal(garment.privateNote, "Keep this note");
  assert.equal(merged.garments.filter((candidate) => candidate.sku === "JUW-013").length, 1);
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
