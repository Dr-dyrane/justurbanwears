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

const DROP_01_LEGACY_AUTHORITY = new Map([
  ["DYN-087", { id: "wardrobe-reviewed-nude-ruched-sundress", skus: ["REVIEW-BLUSH-MINI-001", "REVIEW-NUDE-RUCHED-001"] }],
  ["DYN-088", { id: "wardrobe-reviewed-purple-beaded-evening-gown", skus: ["REVIEW-PURPLE-BEADED-002"] }],
  ["DYN-089", { id: "wardrobe-reviewed-draft-003", skus: ["REVIEW-SAGE-RUCHED-003"] }],
  ["DYN-090", { id: "wardrobe-reviewed-draft-004", skus: ["REVIEW-MAGENTA-PLUNGE-004"] }],
  ["DYN-091", { id: "wardrobe-reviewed-draft-005", skus: ["REVIEW-SILVER-MERMAID-005"] }],
  ["DYN-092", { id: "wardrobe-reviewed-draft-006", skus: ["REVIEW-ABSTRACT-STRAPLESS-006"] }],
] as const);

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
  const legacyAuthority = DROP_01_LEGACY_AUTHORITY.get(product.sku);
  const garmentId = legacyAuthority?.id ?? `wardrobe-seed-${token}`;
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
    source: product.drop === "Drop 01" ? "Operator wardrobe intake" : "Original Shop migration",
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

export const WARDROBE_AUTHORITY_MANAGED_SLUGS = Object.freeze(
  WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.map((product) => product.slug),
);

function normalizedSku(value: string) {
  return value.trim().toUpperCase();
}

function legacyAuthorityForSeed(seed: Garment) {
  return DROP_01_LEGACY_AUTHORITY.get(normalizedSku(seed.sku));
}

function isLegacyAuthorityMatch(existing: Garment, seed: Garment) {
  const authority = legacyAuthorityForSeed(seed);
  if (!authority) return false;
  const sku = normalizedSku(existing.sku);
  return existing.id === authority.id
    || authority.skus.some((candidate) => candidate === sku);
}

function promoteDrop01WardrobeRow(existing: Garment, seed: Garment): Garment {
  const pendingNotes = /pending|front study ready|size, measurements/i.test(existing.notes);
  return {
    ...seed,
    id: existing.id,
    title: existing.title || seed.title,
    sizeLabel: existing.sizeLabel !== "Pending" ? existing.sizeLabel : seed.sizeLabel,
    estimatedFit: existing.estimatedFit !== "Pending" ? existing.estimatedFit : seed.estimatedFit,
    price: existing.price > 0 ? existing.price : seed.price,
    condition: existing.condition !== "Pending inspection" ? existing.condition : seed.condition,
    source: existing.source || seed.source,
    notes: existing.notes && !pendingNotes ? existing.notes : seed.notes,
    privateNote: existing.privateNote,
    publicDescription: existing.publicDescription || seed.publicDescription,
    measurements: existing.measurements.length
      ? existing.measurements.map((measurement) => ({ ...measurement }))
      : seed.measurements.map((measurement) => ({ ...measurement })),
    references: existing.references.map((reference) => ({ ...reference })),
    reviewCover: existing.reviewCover ? { ...existing.reviewCover } : undefined,
    createdAt: existing.createdAt,
  };
}

/** Merge missing seeds while preserving every matching user-owned record. */
export function mergeWardrobeAuthoritySeeds(snapshot: StudioSnapshot): StudioSnapshot {
  const garments = [...snapshot.garments];
  const inventory = [...snapshot.inventory];
  const listings = [...snapshot.listings];
  const garmentIdMap = new Map<string, string>();
  const newlyAddedGarments = new Set<string>();
  const promotedGarments = new Set<string>();
  const seeds = migrationRows.map(({ garment }) => garment);

  for (const seed of seeds) {
    const existing = garments.find((garment) =>
      garment.id === seed.id
      || normalizedSku(garment.sku) === normalizedSku(seed.sku)
      || isLegacyAuthorityMatch(garment, seed),
    );
    if (existing) {
      garmentIdMap.set(seed.id, existing.id);
      if (isLegacyAuthorityMatch(existing, seed) && normalizedSku(existing.sku) !== normalizedSku(seed.sku)) {
        const index = garments.indexOf(existing);
        garments[index] = promoteDrop01WardrobeRow(existing, seed);
        promotedGarments.add(seed.id);
      }
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
    if (existing || (!newlyAddedGarments.has(seed.garmentId) && !promotedGarments.has(seed.garmentId))) continue;
    listings.push({ ...seed, garmentId });
  }

  const inventorySeeds = migrationRows.map(({ inventory: record }) => record);
  for (const seed of inventorySeeds) {
    const garmentId = garmentIdMap.get(seed.garmentId) ?? seed.garmentId;
    const existing = inventory.find((record) => record.id === seed.id || record.garmentId === garmentId);
    const listing = listings.find((candidate) => candidate.garmentId === garmentId);
    if (existing && promotedGarments.has(seed.garmentId)) {
      const index = inventory.indexOf(existing);
      inventory[index] = {
        ...seed,
        id: existing.id,
        garmentId,
        listingId: listing?.id,
      };
      continue;
    }
    if (existing || !newlyAddedGarments.has(seed.garmentId)) continue;
    inventory.push({
      ...seed,
      garmentId,
      listingId: listing?.id,
    });
  }

  return { ...snapshot, garments, inventory, listings };
}
