import assert from "node:assert/strict";
import test from "node:test";
import {
  createServerWardrobeOverlayRepository,
} from "../lib/studio/db/server-wardrobe-overlay";
import type { Garment, InventoryRecord } from "../lib/studio/domain/entities";
import { createEmptyStudioSnapshot } from "../lib/studio/domain/state";
import type { StudioRepository } from "../lib/studio/services/contracts";

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
