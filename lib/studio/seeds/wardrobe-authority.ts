import type {
  Garment,
  GarmentCategory,
  InventoryRecord,
  StudioListing,
} from "../domain/entities";
import type { StudioSnapshot } from "../domain/state";
import {
  WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS,
} from "../../wardrobe-public-view/seeds";

const MIGRATION_CREATED_AT = "2026-08-10T00:00:00.000Z";

function studioCategory(category: (typeof WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS)[number]["category"]): GarmentCategory {
  if (category === "Dresses") return "Dress";
  if (category === "Shirts") return "Shirt";
  if (category === "Knitwear") return "Knitwear";
  if (category === "Skirts") return "Skirt";
  return "Trousers";
}

function visualForTone(tone: (typeof WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS)[number]["tone"]): Garment["visual"] {
  if (tone === "indigo") return "indigo";
  if (tone === "moss") return "moss";
  if (tone === "ivory") return "chalk";
  if (tone === "salmon") return "plum";
  return "umber";
}

const migrationRows = WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.map((product) => {
  const token = product.sku.toLowerCase();
  const garmentId = `wardrobe-seed-${token}`;
  const listingId = `wardrobe-listing-${token}`;
  const inventoryId = `wardrobe-stock-${token}`;
  const listingState = product.availability === "RESERVED"
    ? "RESERVED" as const
    : product.availability === "SOLD"
      ? "SOLD" as const
      : "PUBLISHED" as const;
  const garment: Garment = {
    id: garmentId,
    sku: product.sku,
    title: product.name,
    category: studioCategory(product.category),
    sizeLabel: product.taggedSize,
    estimatedFit: product.fit,
    color: product.colour,
    price: product.price,
    condition: product.condition,
    source: "Original Shop migration",
    notes: product.note,
    privateNote: "",
    publicDescription: product.note,
    quantity: 1,
    saleEligible: true,
    measurements: product.measurements.map((measurement) => ({ ...measurement })),
    classificationState: "READY",
    mediaState: "READY",
    state: listingState,
    availability: product.availability,
    canonState: "APPROVED",
    visual: visualForTone(product.tone),
    references: [],
    createdAt: MIGRATION_CREATED_AT,
  };
  const listing: StudioListing = {
    id: listingId,
    garmentId,
    modelId: "model-lulu",
    slug: product.slug,
    title: product.name,
    description: product.note,
    price: product.price,
    state: listingState,
    createdAt: MIGRATION_CREATED_AT,
    publishedAt: MIGRATION_CREATED_AT,
    publicProjection: {
      ...product,
      details: [...product.details],
      measurements: product.measurements.map((measurement) => ({ ...measurement })),
      modelAnchor: { ...product.modelAnchor },
      media: product.media.map((frame) => ({ ...frame })),
    },
  };
  const inventory: InventoryRecord = {
    id: inventoryId,
    garmentId,
    listingId,
    onHand: product.availability === "SOLD" ? 0 : 1,
    reserved: product.availability === "RESERVED" ? 1 : 0,
    sold: product.availability === "SOLD" ? 1 : 0,
    returned: 0,
    writeOff: 0,
    state: listingState,
    updatedAt: MIGRATION_CREATED_AT,
  };
  return { garment, inventory, listing };
});

const reviewedDrafts: Array<{ garment: Garment; inventory: InventoryRecord }> = [
  {
    garment: {
      id: "wardrobe-reviewed-nude-ruched-sundress",
      sku: "REVIEW-NUDE-RUCHED-001",
      title: "Nude ruched sundress",
      category: "Dress",
      sizeLabel: "Pending",
      estimatedFit: "Pending",
      color: "Nude",
      price: 0,
      condition: "Pending inspection",
      source: "Reviewed candidate",
      notes: "Size, measurements, and condition remain pending.",
      privateNote: "",
      publicDescription: "",
      quantity: 1,
      saleEligible: false,
      measurements: [],
      classificationState: "DRAFT",
      mediaState: "EMPTY",
      state: "DRAFT",
      availability: "ARCHIVED",
      canonState: "DRAFT",
      visual: "umber",
      references: [],
      createdAt: MIGRATION_CREATED_AT,
    },
    inventory: {
      id: "wardrobe-stock-reviewed-nude-ruched-sundress",
      garmentId: "wardrobe-reviewed-nude-ruched-sundress",
      onHand: 1,
      reserved: 0,
      sold: 0,
      returned: 0,
      writeOff: 0,
      state: "DRAFT",
      updatedAt: MIGRATION_CREATED_AT,
    },
  },
  {
    garment: {
      id: "wardrobe-reviewed-purple-beaded-evening-gown",
      sku: "REVIEW-PURPLE-BEADED-002",
      title: "Purple beaded evening gown",
      category: "Dress",
      sizeLabel: "Pending",
      estimatedFit: "Pending",
      color: "Purple",
      price: 0,
      condition: "Pending inspection",
      source: "Reviewed candidate",
      notes: "Size, measurements, and condition remain pending.",
      privateNote: "",
      publicDescription: "",
      quantity: 1,
      saleEligible: false,
      measurements: [],
      classificationState: "DRAFT",
      mediaState: "EMPTY",
      state: "DRAFT",
      availability: "ARCHIVED",
      canonState: "DRAFT",
      visual: "plum",
      references: [],
      createdAt: MIGRATION_CREATED_AT,
    },
    inventory: {
      id: "wardrobe-stock-reviewed-purple-beaded-evening-gown",
      garmentId: "wardrobe-reviewed-purple-beaded-evening-gown",
      onHand: 1,
      reserved: 0,
      sold: 0,
      returned: 0,
      writeOff: 0,
      state: "DRAFT",
      updatedAt: MIGRATION_CREATED_AT,
    },
  },
];

export const WARDROBE_AUTHORITY_MANAGED_SLUGS = Object.freeze(
  WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.map((product) => product.slug),
);

function normalizedSku(value: string) {
  return value.trim().toUpperCase();
}

/** Merge missing seeds while preserving every matching user-owned record. */
export function mergeWardrobeAuthoritySeeds(snapshot: StudioSnapshot): StudioSnapshot {
  const garments = [...snapshot.garments];
  const inventory = [...snapshot.inventory];
  const listings = [...snapshot.listings];
  const garmentIdMap = new Map<string, string>();
  const newlyAddedGarments = new Set<string>();
  const seeds = [
    ...reviewedDrafts.map(({ garment }) => garment),
    ...migrationRows.map(({ garment }) => garment),
  ];

  for (const seed of seeds) {
    const existing = garments.find((garment) =>
      garment.id === seed.id || normalizedSku(garment.sku) === normalizedSku(seed.sku),
    );
    if (existing) {
      garmentIdMap.set(seed.id, existing.id);
      continue;
    }
    garments.push(seed);
    garmentIdMap.set(seed.id, seed.id);
    newlyAddedGarments.add(seed.id);
  }

  for (const seed of migrationRows.map(({ listing }) => listing)) {
    const garmentId = garmentIdMap.get(seed.garmentId) ?? seed.garmentId;
    const existing = listings.find((listing) =>
      listing.id === seed.id || listing.slug === seed.slug || listing.garmentId === garmentId,
    );
    if (existing || !newlyAddedGarments.has(seed.garmentId)) continue;
    listings.push({ ...seed, garmentId });
  }

  const inventorySeeds = [
    ...reviewedDrafts.map(({ inventory: record }) => record),
    ...migrationRows.map(({ inventory: record }) => record),
  ];
  for (const seed of inventorySeeds) {
    const garmentId = garmentIdMap.get(seed.garmentId) ?? seed.garmentId;
    const existing = inventory.find((record) => record.id === seed.id || record.garmentId === garmentId);
    if (existing || !newlyAddedGarments.has(seed.garmentId)) continue;
    const listing = listings.find((candidate) => candidate.garmentId === garmentId);
    inventory.push({
      ...seed,
      garmentId,
      listingId: listing?.id,
    });
  }

  return { ...snapshot, garments, inventory, listings };
}
