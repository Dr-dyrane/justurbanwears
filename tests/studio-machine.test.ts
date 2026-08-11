import assert from "node:assert/strict";
import test from "node:test";
import type {
  Garment,
  InventoryRecord,
  StudioListing,
  StudioOrder,
  StudioReturn,
} from "../lib/studio/domain/entities";
import { createEmptyStudioSnapshot, createInitialStudioState } from "../lib/studio/domain/state";
import { everyGateReady, listingReadiness } from "../lib/studio/domain/readiness";
import { studioReducer } from "../lib/studio/machines/studio-machine";
import {
  createListingSlug,
  selectWardrobePublicView,
} from "../lib/studio/projections/public-listing";
import {
  APPROVED_PUBLIC_LISTINGS,
  getApprovedPublicListingContract,
} from "../lib/studio/projections/approved-catalogue";
import {
  WARDROBE_PUBLIC_VIEW_PROJECTION_SCHEMA_VERSION,
  WARDROBE_PUBLIC_VIEW_STORAGE_KEY,
  migrateLegacyStudioState,
} from "../lib/studio/db/browser-local-repository";
import {
  getApprovedModelSupplementalSlots,
  WARDROBE_APPROVED_MODEL_FRONT_SLUGS,
  WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS,
} from "../lib/wardrobe-public-view/seeds";

const garment: Garment = {
  id: "garment-test",
  sku: "DYN-081",
  title: "Coral Drift Dress",
  category: "Dress",
  sizeLabel: "UK 12",
  estimatedFit: "Relaxed 10–12",
  color: "Washed coral",
  price: 18500,
  condition: "Excellent pre-loved",
  source: "private acquisition note",
  notes: "Bias-cut midi.",
  privateNote: "private flaw note",
  publicDescription: "Bias-cut midi.",
  quantity: 1,
  saleEligible: true,
  measurements: [{ label: "Length", value: "124 cm" }],
  classificationState: "READY",
  mediaState: "READY",
  state: "DRAFT",
  availability: "AVAILABLE",
  canonState: "REVIEW",
  visual: "umber",
  references: [
    { id: "front", view: "FRONT", quality: 100 },
    { id: "back", view: "BACK", quality: 100 },
    { id: "detail", view: "DETAIL", quality: 100 },
  ],
  createdAt: "2026-08-10T00:00:00.000Z",
};

const inventory: InventoryRecord = {
  id: "stock-test",
  garmentId: garment.id,
  onHand: 1,
  reserved: 0,
  sold: 0,
  returned: 0,
  writeOff: 0,
  state: "READY",
  updatedAt: garment.createdAt,
};

test("the linked Studio lifecycle reaches return-to-readiness without leaking private fields", () => {
  let state = studioReducer(createInitialStudioState(), {
    type: "HYDRATION_SUCCEEDED",
    snapshot: createEmptyStudioSnapshot(),
  });
  state = studioReducer(state, { type: "GARMENT_CREATED", garment, inventory });
  state = studioReducer(state, { type: "GARMENT_READY_REQUESTED", id: garment.id });
  assert.equal(state.garments[0].state, "READY");

  const listing: StudioListing = {
    id: "listing-test",
    garmentId: garment.id,
    modelId: state.defaultModelId,
    slug: createListingSlug(garment.sku, garment.title),
    title: garment.title,
    description: garment.publicDescription,
    price: garment.price,
    state: "DRAFT",
    createdAt: garment.createdAt,
  };
  state = studioReducer(state, { type: "LISTING_DRAFTED", listing });
  state = studioReducer(state, { type: "LISTING_READY_REQUESTED", id: listing.id });
  state = studioReducer(state, { type: "LISTING_PUBLISHED", id: listing.id, publishedAt: garment.createdAt });
  assert.equal(state.listings[0].state, "PUBLISHED");
  assert.equal(everyGateReady(listingReadiness(state, state.listings[0])), true);

  const publicView = selectWardrobePublicView(state);
  assert.equal(publicView.length, 1);
  assert.equal(publicView[0].name, garment.title);
  assert.equal(publicView[0].sku, "JUW-001");
  assert.notEqual(publicView[0].sku, garment.sku);
  assert.equal("privateNote" in publicView[0], false);
  assert.equal("source" in publicView[0], false);
  assert.equal("references" in publicView[0], false);
  assert.equal("modelId" in publicView[0], false);
  assert.deepEqual(
    publicView[0].modelAnchor,
    getApprovedPublicListingContract(garment.sku, listing.slug)?.modelAnchor,
  );
  assert.equal(publicView[0].media.length, 7);
  assert.equal(publicView[0].media[0].src, "/shop/products/coral-drift-dress/01-garment-front.webp");
  assert.equal(publicView[0].media[3].src, "/shop/products/coral-drift-dress/04-model-front.webp");
  assert.equal(publicView[0].media[4].src, "/shop/products/coral-drift-dress/06-fabric-detail.webp");
  assert.equal(publicView[0].media[5].src, "/shop/products/coral-drift-dress/07-model-left-profile.webp");
  assert.equal(publicView[0].media[6].src, "/shop/products/coral-drift-dress/05-model-rear-three-quarter.webp");
  assert.doesNotMatch(JSON.stringify(publicView[0].media), /05-model-back/);
  assert.equal(JSON.stringify(publicView[0]).includes(garment.privateNote), false);
  assert.equal(JSON.stringify(publicView[0]).includes(garment.source), false);

  const order: StudioOrder = {
    id: "order-test",
    listingId: listing.id,
    inventoryId: inventory.id,
    quantity: 1,
    state: "RESERVED",
    createdAt: garment.createdAt,
  };
  state = studioReducer(state, { type: "ORDER_RESERVED", order });
  assert.equal(state.inventory[0].reserved, 1);
  assert.equal(state.listings[0].state, "RESERVED");

  state = studioReducer(state, { type: "ORDER_FULFILLED", id: order.id, fulfilledAt: garment.createdAt });
  assert.equal(state.inventory[0].onHand, 0);
  assert.equal(state.listings[0].state, "SOLD");

  const returnCase: StudioReturn = {
    id: "return-test",
    orderId: order.id,
    inventoryId: inventory.id,
    quantity: 1,
    state: "DRAFT",
    disposition: "PENDING",
    createdAt: garment.createdAt,
  };
  state = studioReducer(state, { type: "RETURN_OPENED", returnCase });
  state = studioReducer(state, {
    type: "RETURN_DISPOSED",
    id: returnCase.id,
    disposition: "RESTOCK",
    resolvedAt: garment.createdAt,
  });
  assert.equal(state.inventory[0].onHand, 1);
  assert.equal(state.garments[0].state, "RETURNED");
  assert.equal(state.listings[0].state, "READY");
  assert.equal(selectWardrobePublicView(state).length, 0);
});

test("writing off a returned sold unit preserves other sellable units", () => {
  const multiGarment = { ...garment, id: "garment-multi", quantity: 2 };
  const multiInventory = { ...inventory, id: "stock-multi", garmentId: multiGarment.id, onHand: 2 };
  let state = studioReducer(createInitialStudioState(), {
    type: "HYDRATION_SUCCEEDED",
    snapshot: createEmptyStudioSnapshot(),
  });
  state = studioReducer(state, { type: "GARMENT_CREATED", garment: multiGarment, inventory: multiInventory });
  state = studioReducer(state, { type: "GARMENT_READY_REQUESTED", id: multiGarment.id });
  const listing: StudioListing = {
    id: "listing-multi",
    garmentId: multiGarment.id,
    modelId: state.defaultModelId,
    slug: "coral-drift-dress",
    title: multiGarment.title,
    description: multiGarment.publicDescription,
    price: multiGarment.price,
    state: "DRAFT",
    createdAt: multiGarment.createdAt,
  };
  state = studioReducer(state, { type: "LISTING_DRAFTED", listing });
  state = studioReducer(state, { type: "LISTING_READY_REQUESTED", id: listing.id });
  state = studioReducer(state, { type: "LISTING_PUBLISHED", id: listing.id, publishedAt: multiGarment.createdAt });
  const order: StudioOrder = {
    id: "order-multi",
    listingId: listing.id,
    inventoryId: multiInventory.id,
    quantity: 1,
    state: "RESERVED",
    createdAt: multiGarment.createdAt,
  };
  state = studioReducer(state, { type: "ORDER_RESERVED", order });
  state = studioReducer(state, { type: "ORDER_FULFILLED", id: order.id, fulfilledAt: multiGarment.createdAt });
  assert.equal(state.listings[0].state, "PUBLISHED");
  const returnCase: StudioReturn = {
    id: "return-multi",
    orderId: order.id,
    inventoryId: multiInventory.id,
    quantity: 1,
    state: "DRAFT",
    disposition: "PENDING",
    createdAt: multiGarment.createdAt,
  };
  state = studioReducer(state, { type: "RETURN_OPENED", returnCase });
  state = studioReducer(state, {
    type: "RETURN_DISPOSED",
    id: returnCase.id,
    disposition: "WRITE_OFF",
    resolvedAt: multiGarment.createdAt,
  });
  assert.equal(state.inventory[0].onHand, 1);
  assert.equal(state.inventory[0].writeOff, 1);
  assert.equal(state.listings[0].state, "PUBLISHED");
  assert.equal(state.listings[0].publicProjection?.availability, "AVAILABLE");
});

test("approved wardrobe public-view contracts expose only cleared Lulu views", () => {
  assert.equal(WARDROBE_PUBLIC_VIEW_PROJECTION_SCHEMA_VERSION, 10);
  assert.equal(WARDROBE_PUBLIC_VIEW_STORAGE_KEY, "justurban-wears:wardrobe-public-view:v10");
  const approvedModelFrontSlugs = new Set<string>(WARDROBE_APPROVED_MODEL_FRONT_SLUGS);
  for (const listing of APPROVED_PUBLIC_LISTINGS) {
    const contract = getApprovedPublicListingContract(listing.sku, listing.slug);
    assert.ok(contract);
    const seed = WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.find(
      (product) => product.sku === listing.sku && product.slug === listing.slug,
    );
    assert.ok(seed);
    assert.deepEqual(contract.modelAnchor, seed.modelAnchor);
    const hasApprovedModelFront = approvedModelFrontSlugs.has(listing.slug);
    const expected = [
      `/shop/products/${listing.slug}/01-garment-front.webp`,
      `/shop/products/${listing.slug}/02-garment-back.webp`,
      `/shop/products/${listing.slug}/03-mannequin-front.webp`,
      ...(hasApprovedModelFront
        ? [`/shop/products/${listing.slug}/04-model-front.webp`]
        : []),
      `/shop/products/${listing.slug}/06-fabric-detail.webp`,
      ...getApprovedModelSupplementalSlots(listing.slug).map((slot) => {
        const file = slot === "MODEL_LEFT_PROFILE"
          ? "07-model-left-profile.webp"
          : slot === "MODEL_REAR_THREE_QUARTER"
            ? "05-model-rear-three-quarter.webp"
            : "08-model-detail.webp";
        return `/shop/products/${listing.slug}/${file}`;
      }),
    ];
    assert.deepEqual(
      contract.media.map((frame) => frame.src),
      expected,
    );
    assert.doesNotMatch(contract.media.map((frame) => frame.src).join(" "), /05-model-back\.webp/);
    assert.equal(createListingSlug(listing.sku, "Any private working title"), listing.slug);
  }

  assert.equal(getApprovedPublicListingContract("DYN-081", "wrong-slug"), undefined);
  assert.equal(getApprovedPublicListingContract("PRIVATE-001", "coral-drift-dress"), undefined);
});

test("an unapproved SKU and slug pair cannot clear listing gates", () => {
  let state = studioReducer(createInitialStudioState(), {
    type: "HYDRATION_SUCCEEDED",
    snapshot: createEmptyStudioSnapshot(),
  });
  const unapprovedGarment = { ...garment, id: "garment-unapproved", sku: "PRIVATE-001" };
  const unapprovedInventory = {
    ...inventory,
    id: "stock-unapproved",
    garmentId: unapprovedGarment.id,
  };
  state = studioReducer(state, {
    type: "GARMENT_CREATED",
    garment: unapprovedGarment,
    inventory: unapprovedInventory,
  });
  state = studioReducer(state, { type: "GARMENT_READY_REQUESTED", id: unapprovedGarment.id });
  const unapprovedListing: StudioListing = {
    id: "listing-unapproved",
    garmentId: unapprovedGarment.id,
    modelId: state.defaultModelId,
    slug: "coral-drift-dress",
    title: unapprovedGarment.title,
    description: unapprovedGarment.publicDescription,
    price: unapprovedGarment.price,
    state: "DRAFT",
    createdAt: unapprovedGarment.createdAt,
  };
  state = studioReducer(state, { type: "LISTING_DRAFTED", listing: unapprovedListing });

  const gates = listingReadiness(state, state.listings[0]);
  assert.equal(gates.find((gate) => gate.id === "media")?.ready, false);
  assert.equal(gates.find((gate) => gate.id === "model")?.ready, false);
  state = studioReducer(state, { type: "LISTING_READY_REQUESTED", id: unapprovedListing.id });
  assert.equal(state.listings[0].state, "DRAFT");
  assert.deepEqual(selectWardrobePublicView(state), []);
});

test("publish rechecks the Lulu V2 readiness gate after a draft is cleared", () => {
  let state = studioReducer(createInitialStudioState(), {
    type: "HYDRATION_SUCCEEDED",
    snapshot: createEmptyStudioSnapshot(),
  });
  state = studioReducer(state, { type: "GARMENT_CREATED", garment, inventory });
  state = studioReducer(state, { type: "GARMENT_READY_REQUESTED", id: garment.id });
  const listing: StudioListing = {
    id: "listing-recheck",
    garmentId: garment.id,
    modelId: state.defaultModelId,
    slug: "coral-drift-dress",
    title: garment.title,
    description: garment.publicDescription,
    price: garment.price,
    state: "DRAFT",
    createdAt: garment.createdAt,
  };
  state = studioReducer(state, { type: "LISTING_DRAFTED", listing });
  state = studioReducer(state, { type: "LISTING_READY_REQUESTED", id: listing.id });
  assert.equal(state.listings[0].state, "READY");
  state = studioReducer(state, {
    type: "MODEL_UPDATED",
    id: state.defaultModelId,
    update: { readiness: { identityApproved: false } },
  });
  state = studioReducer(state, {
    type: "LISTING_PUBLISHED",
    id: listing.id,
    publishedAt: garment.createdAt,
  });
  assert.equal(state.listings[0].state, "READY");
  assert.equal(state.listings[0].publicProjection, undefined);
  assert.deepEqual(selectWardrobePublicView(state), []);
});

test("a version-one local envelope migrates into the version-two graph", () => {
  const migrated = migrateLegacyStudioState(JSON.stringify({
    version: 1,
    data: {
      defaultModelId: "model-old",
      models: [{ id: "model-old", name: "Lulu", ready: true }],
      garments: [{ id: "garment-old", sku: "JUW-OLD", title: "Legacy garment" }],
    },
  }));
  assert.ok(migrated);
  assert.equal(migrated.defaultModelId, "model-old");
  assert.equal(migrated.models[0].state, "READY");
  assert.equal(migrated.models[0].version, "LULU NEUTRAL IDENTITY MASTER V2");
  assert.equal(migrated.garments[0].state, "DRAFT");
  assert.deepEqual(migrated.listings, []);
});
