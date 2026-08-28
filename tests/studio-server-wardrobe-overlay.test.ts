import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createServerWardrobeOverlayRepository,
  loadServerWardrobeItems,
} from "../lib/studio/db/server-wardrobe-overlay";
import type { Garment, InventoryRecord } from "../lib/studio/domain/entities";
import { createEmptyStudioSnapshot } from "../lib/studio/domain/state";
import type { StudioRepository } from "../lib/studio/services/contracts";
import { selectPieceWorkspace } from "../lib/studio/projections/piece-workspace";

const localGarment: Garment = {
  id: "local-garment",
  sku: "JUW-LOCAL",
  title: "Existing local garment",
  category: "Dress",
  sizeLabel: "M",
  estimatedFit: "True to size",
  color: "Black",
  price: 20_000,
  condition: "Excellent",
  source: "Local",
  notes: "",
  privateNote: "",
  publicDescription: "",
  quantity: 1,
  saleEligible: false,
  measurements: [],
  classificationState: "READY",
  mediaState: "READY",
  state: "READY",
  availability: "AVAILABLE",
  canonState: "APPROVED",
  visual: "umber",
  references: [],
  createdAt: "2026-08-12T00:00:00.000Z",
};

const localInventory: InventoryRecord = {
  id: "local-inventory",
  garmentId: localGarment.id,
  onHand: 1,
  reserved: 0,
  sold: 0,
  returned: 0,
  writeOff: 0,
  state: "READY",
  updatedAt: localGarment.createdAt,
};

test("connected Wardrobe distinguishes a verified empty collection from unavailable or invalid truth", async () => {
  const verifiedEmpty = await loadServerWardrobeItems(async () => Response.json({ items: [] }));
  assert.deepEqual(verifiedEmpty, []);

  await assert.rejects(
    loadServerWardrobeItems(async () => Response.json(
      { error: { message: "temporarily unavailable" } },
      { status: 503 },
    )),
    /Connected Wardrobe is unavailable/u,
  );
  await assert.rejects(
    loadServerWardrobeItems(async () => Response.json({ items: [{ id: "partial-row" }] })),
    /unverified data/u,
  );
});

test("a connected Wardrobe loader failure rejects hydration instead of erasing the server overlay", async () => {
  const repository = createServerWardrobeOverlayRepository({
    read: async () => createEmptyStudioSnapshot(),
    write: async () => undefined,
    subscribe: () => () => undefined,
  }, async () => {
    throw new Error("Connected Wardrobe is unavailable. Try again.");
  });

  await assert.rejects(repository.read(), /Connected Wardrobe is unavailable/u);
});

test("server Wardrobe drafts hydrate as a private read overlay and never persist to browser state", async () => {
  const local = {
    ...createEmptyStudioSnapshot(),
    garments: [localGarment],
    inventory: [localInventory],
  };
  let persisted = local;
  let storageListener: ((snapshot: typeof local) => void) | undefined;
  const base: StudioRepository = {
    read: async () => local,
    write: async (snapshot) => { persisted = snapshot; },
    subscribe: (listener) => {
      storageListener = listener as (snapshot: typeof local) => void;
      return () => undefined;
    },
  };
  const repository = createServerWardrobeOverlayRepository(base, async () => [{
    id: "11111111-1111-4111-8111-111111111111",
    intakeId: "22222222-2222-4222-8222-222222222222",
    title: "Coral Bias Dress",
    category: "Dress",
    colour: "Coral",
    sizeLabel: "Size on request",
    condition: "Excellent · real-worn wardrobe piece",
    price: 24_500,
    quantity: 1,
    state: "DRAFT",
    approvedAssetId: "33333333-3333-4333-8333-333333333333",
    createdAt: "2026-08-12T01:00:00.000Z",
    updatedAt: "2026-08-12T01:00:00.000Z",
  }]);

  const hydrated = await repository.read();
  assert.equal(hydrated.garments[0], localGarment);
  assert.equal(hydrated.inventory[0], localInventory);
  assert.equal(hydrated.listings.length, 0);
  assert.equal(hydrated.garments.length, 2);
  assert.equal(hydrated.garments[1].saleEligible, false);
  assert.equal(
    hydrated.garments[1].reviewCover?.src,
    "/api/studio/intakes/22222222-2222-4222-8222-222222222222/assets/33333333-3333-4333-8333-333333333333",
  );

  await repository.write(hydrated);
  assert.deepEqual(persisted.garments, [localGarment]);
  assert.deepEqual(persisted.inventory, [localInventory]);

  let external = local;
  repository.subscribe((snapshot) => { external = snapshot as typeof local; });
  storageListener?.(local);
  assert.equal(external.garments.length, 2);
  assert.equal(external.garments[1].title, "Coral Bias Dress");
});

test("a server publication rehydrates one sanitized Live listing after reload", async () => {
  const empty = createEmptyStudioSnapshot();
  let persisted = empty;
  const repository = createServerWardrobeOverlayRepository({
    read: async () => empty,
    write: async (snapshot) => { persisted = snapshot; },
    subscribe: () => () => undefined,
  }, async () => [{
    id: "11111111-1111-4111-8111-111111111111",
    intakeId: "22222222-2222-4222-8222-222222222222",
    title: "Coral Bias Dress",
    category: "Dress",
    colour: "Coral",
    sizeLabel: "Size on request",
    condition: "Excellent · real-worn wardrobe piece",
    price: 24_500,
    quantity: 1,
    state: "READY",
    approvedAssetId: "33333333-3333-4333-8333-333333333333",
    createdAt: "2026-08-12T01:00:00.000Z",
    updatedAt: "2026-08-12T01:01:00.000Z",
    publication: {
      publicationId: "44444444-4444-4444-8444-444444444444",
      wardrobeItemId: "11111111-1111-4111-8111-111111111111",
      sku: "JUW-100",
      slug: "coral-bias-dress-11111111111141118111111111111111",
      origin: "STUDIO_NATIVE",
      state: "PUBLISHED",
      publishedAt: "2026-08-12T01:01:00.000Z",
      shopUrl: "/shop/products/coral-bias-dress-11111111111141118111111111111111",
    },
  }]);

  const hydrated = await repository.read();
  assert.equal(hydrated.garments.length, 1);
  assert.equal(hydrated.listings.length, 1);
  assert.equal(hydrated.garments[0].sku, "JUW-100");
  assert.equal(hydrated.garments[0].state, "PUBLISHED");
  assert.equal(hydrated.listings[0].slug, hydrated.garments[0].dynamicPublication?.slug);
  const piece = selectPieceWorkspace({ garment: hydrated.garments[0], listing: hydrated.listings[0] });
  assert.equal(piece.stage, "LIVE");
  assert.equal(piece.nextAction.kind, "VIEW_SHOP");

  await repository.write(hydrated);
  assert.equal(persisted.garments.length, 0);
  assert.equal(persisted.inventory.length, 0);
  assert.equal(persisted.listings.length, 0);
});

test("an adopted catalogue piece enriches its legacy card without duplicating or persisting server truth", async () => {
  const garment = { ...localGarment, id: "wardrobe-seed-juw-001", sku: "JUW-001", price: 24_500 };
  const listing = {
    id: "wardrobe-listing-juw-001",
    garmentId: garment.id,
    modelId: "model-lulu",
    slug: "coral-drift-dress",
    title: "Coral Drift Dress",
    description: "Original editorial copy",
    price: 24_500,
    state: "PUBLISHED" as const,
    createdAt: garment.createdAt,
    publishedAt: garment.createdAt,
  };
  const stock = { ...localInventory, id: "wardrobe-stock-juw-001", garmentId: garment.id, listingId: listing.id };
  const local = { ...createEmptyStudioSnapshot(), garments: [garment], listings: [listing], inventory: [stock] };
  let persisted = local;
  const repository = createServerWardrobeOverlayRepository({
    read: async () => local,
    write: async (snapshot) => { persisted = snapshot as typeof local; },
    subscribe: () => () => undefined,
  }, async () => [{
    id: "11111111-1111-4111-8111-111111111111",
    intakeId: "22222222-2222-4222-8222-222222222222",
    title: "Coral Drift Dress",
    category: "Dress",
    colour: "Coral",
    sizeLabel: "UK 10",
    condition: "Excellent",
    price: 25_000,
    quantity: 1,
    state: "READY",
    approvedAssetId: null,
    createdAt: "2026-08-12T01:00:00.000Z",
    updatedAt: "2026-08-12T01:01:00.000Z",
    publication: {
      publicationId: "44444444-4444-4444-8444-444444444444",
      wardrobeItemId: "11111111-1111-4111-8111-111111111111",
      sku: "JUW-001",
      slug: "coral-drift-dress",
      origin: "CATALOGUE_ADOPTED",
      state: "PUBLISHED",
      publishedAt: "2026-08-12T01:01:00.000Z",
      shopUrl: "/shop/products/coral-drift-dress",
      inventory: {
        availability: "RESERVED",
        onHand: 1,
        reserved: 1,
        sold: 0,
        returned: 0,
        writeOff: 0,
        updatedAt: "2026-08-12T01:02:00.000Z",
      },
    },
  }]);

  const hydrated = await repository.read();
  assert.equal(hydrated.garments.length, 1);
  assert.equal(hydrated.listings.length, 1);
  assert.equal(hydrated.inventory.length, 1);
  assert.equal(hydrated.garments[0].id, garment.id);
  assert.equal(hydrated.garments[0].privateWardrobeItemId, "11111111-1111-4111-8111-111111111111");
  assert.equal(hydrated.garments[0].price, 25_000);
  assert.equal(hydrated.garments[0].state, "RESERVED");
  assert.equal(hydrated.listings[0].id, listing.id);
  assert.equal(hydrated.inventory[0].reserved, 1);

  await repository.write(hydrated);
  assert.equal(persisted.garments.length, 0);
  assert.equal(persisted.listings.length, 0);
  assert.equal(persisted.inventory.length, 0);
});

test("an archived adopted piece remains archived instead of resurfacing as Ready", async () => {
  const garment = { ...localGarment, id: "wardrobe-seed-juw-001", sku: "JUW-001", price: 24_500 };
  const listing = {
    id: "wardrobe-listing-juw-001",
    garmentId: garment.id,
    modelId: "model-lulu",
    slug: "coral-drift-dress",
    title: "Coral Drift Dress",
    description: "Original editorial copy",
    price: 24_500,
    state: "PUBLISHED" as const,
    createdAt: garment.createdAt,
    publishedAt: garment.createdAt,
  };
  const stock = { ...localInventory, id: "wardrobe-stock-juw-001", garmentId: garment.id, listingId: listing.id };
  const local = { ...createEmptyStudioSnapshot(), garments: [garment], listings: [listing], inventory: [stock] };
  const repository = createServerWardrobeOverlayRepository({
    read: async () => local,
    write: async () => undefined,
    subscribe: () => () => undefined,
  }, async () => [{
    id: "11111111-1111-4111-8111-111111111111",
    intakeId: "22222222-2222-4222-8222-222222222222",
    title: "Coral Drift Dress",
    category: "Dress",
    colour: "Coral",
    sizeLabel: "UK 10",
    condition: "Excellent",
    price: 24_500,
    quantity: 0,
    state: "ARCHIVED",
    approvedAssetId: null,
    createdAt: "2026-08-12T01:00:00.000Z",
    updatedAt: "2026-08-12T01:01:00.000Z",
    publication: {
      publicationId: "44444444-4444-4444-8444-444444444444",
      wardrobeItemId: "11111111-1111-4111-8111-111111111111",
      sku: "JUW-001",
      slug: "coral-drift-dress",
      origin: "CATALOGUE_ADOPTED",
      state: "ARCHIVED",
      publishedAt: "2026-08-12T01:01:00.000Z",
      shopUrl: "/shop/products/coral-drift-dress",
      inventory: {
        availability: "ARCHIVED",
        onHand: 0,
        reserved: 0,
        sold: 0,
        returned: 0,
        writeOff: 1,
        updatedAt: "2026-08-12T01:02:00.000Z",
      },
    },
  }]);

  const hydrated = await repository.read();
  assert.equal(hydrated.garments[0].state, "CANCELLED");
  assert.equal(hydrated.garments[0].availability, "ARCHIVED");
  assert.equal(hydrated.garments[0].saleEligible, false);
  assert.equal(hydrated.listings[0].state, "CANCELLED");
  assert.equal(hydrated.inventory[0].state, "CANCELLED");
});

test("a server-unpublished piece keeps the durable lifecycle as its only publication authority", async () => {
  const repository = createServerWardrobeOverlayRepository({
    read: async () => createEmptyStudioSnapshot(),
    write: async () => undefined,
    subscribe: () => () => undefined,
  }, async () => [{
    id: "11111111-1111-4111-8111-111111111111",
    intakeId: "22222222-2222-4222-8222-222222222222",
    title: "Private Coral Dress",
    category: "Dress",
    colour: "Coral",
    sizeLabel: "UK 10",
    condition: "Excellent",
    price: 25_000,
    quantity: 1,
    state: "READY",
    approvedAssetId: null,
    createdAt: "2026-08-12T01:00:00.000Z",
    updatedAt: "2026-08-12T01:01:00.000Z",
    publication: {
      publicationId: "44444444-4444-4444-8444-444444444444",
      wardrobeItemId: "11111111-1111-4111-8111-111111111111",
      sku: "JUW-025",
      slug: "private-coral-dress",
      origin: "CATALOGUE_ADOPTED",
      state: "UNPUBLISHED",
      publishedAt: "2026-08-12T01:01:00.000Z",
      shopUrl: "/shop/products/private-coral-dress",
    },
  }]);

  const hydrated = await repository.read();
  assert.equal(hydrated.garments[0].privateWardrobeItemId, "11111111-1111-4111-8111-111111111111");
  assert.equal(hydrated.garments[0].dynamicPublication?.state, "UNPUBLISHED");
  assert.equal(hydrated.listings[0].state, "READY");

  const workbench = readFileSync(`${process.cwd()}/components/studio/wardrobe-workbench.tsx`, "utf8");
  assert.match(
    workbench,
    /\{garment\.privateWardrobeItemId\s*\?\s*<GarmentLifecyclePanel[\s\S]*?: listing \? <section className="studio-piece-shop"><ListingEditor listing=\{listing\} \/><\/section> : null\}/u,
  );
  assert.doesNotMatch(
    workbench,
    /\{garment\.privateWardrobeItemId \? <GarmentLifecyclePanel[\s\S]*?\/> : null\}\s*\{listing \? <section/u,
  );
});
