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
import {
  WARDROBE_PUBLIC_DRAFTS,
  type WardrobePublicDraftSlug,
} from "../../wardrobe-public-view/drafts";

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

interface ReviewedDraftAuthoritySpec {
  id: string;
  sku: string;
  visual: Garment["visual"];
  referenceId: string;
  quality: number;
}

const REVIEWED_DRAFT_AUTHORITY = {
  "blush-scoop-mini-dress": {
    id: "wardrobe-reviewed-nude-ruched-sundress",
    sku: "REVIEW-BLUSH-MINI-001",
    visual: "umber",
    referenceId: "review-cover-blush-front",
    quality: 0.72,
  },
  "orchid-beaded-column-gown": {
    id: "wardrobe-reviewed-purple-beaded-evening-gown",
    sku: "REVIEW-PURPLE-BEADED-002",
    visual: "plum",
    referenceId: "review-cover-orchid-front",
    quality: 0.88,
  },
  "sage-asymmetric-ruched-maxi-dress": {
    id: "wardrobe-reviewed-draft-003",
    sku: "REVIEW-SAGE-RUCHED-003",
    visual: "moss",
    referenceId: "review-cover-sage-front",
    quality: 0.86,
  },
  "magenta-plunge-ruched-mini-dress": {
    id: "wardrobe-reviewed-draft-004",
    sku: "REVIEW-MAGENTA-PLUNGE-004",
    visual: "plum",
    referenceId: "review-cover-magenta-front",
    quality: 0.78,
  },
  "silver-off-shoulder-mermaid-dress": {
    id: "wardrobe-reviewed-draft-005",
    sku: "REVIEW-SILVER-MERMAID-005",
    visual: "chalk",
    referenceId: "review-cover-silver-front",
    quality: 0.68,
  },
  "multicolor-abstract-strapless-mini-dress": {
    id: "wardrobe-reviewed-draft-006",
    sku: "REVIEW-ABSTRACT-STRAPLESS-006",
    visual: "plum",
    referenceId: "review-cover-abstract-front",
    quality: 0.82,
  },
} satisfies Record<WardrobePublicDraftSlug, ReviewedDraftAuthoritySpec>;

function createReviewedDraft(
  draft: (typeof WARDROBE_PUBLIC_DRAFTS)[number],
): { garment: Garment; inventory: InventoryRecord } {
  const authority = REVIEWED_DRAFT_AUTHORITY[draft.slug];
  const garment: Garment = {
    id: authority.id,
    sku: authority.sku,
    title: draft.name,
    category: "Dress",
    sizeLabel: "Pending",
    estimatedFit: "Pending",
    color: draft.colour,
    price: 0,
    condition: "Pending inspection",
    source: "Operator wardrobe intake",
    notes: "Front study ready. Back, detail, size, measurements, and condition remain pending.",
    privateNote: "",
    publicDescription: "",
    quantity: 1,
    saleEligible: false,
    measurements: [],
    classificationState: "DRAFT",
    mediaState: "DRAFT",
    state: "DRAFT",
    availability: "ARCHIVED",
    canonState: "DRAFT",
    visual: authority.visual,
    references: [{ id: authority.referenceId, view: "FRONT", quality: authority.quality }],
    reviewCover: { ...draft.cover },
    createdAt: MIGRATION_CREATED_AT,
  };
  return {
    garment,
    inventory: {
      id: `wardrobe-stock-${authority.id.replace(/^wardrobe-/, "")}`,
      garmentId: authority.id,
      onHand: 1,
      reserved: 0,
      sold: 0,
      returned: 0,
      writeOff: 0,
      state: "DRAFT",
      updatedAt: MIGRATION_CREATED_AT,
    },
  };
}

const reviewedDrafts = WARDROBE_PUBLIC_DRAFTS.map(createReviewedDraft);

export const WARDROBE_AUTHORITY_MANAGED_SLUGS = Object.freeze(
  WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.map((product) => product.slug),
);

function normalizedSku(value: string) {
  return value.trim().toUpperCase();
}

const LEGACY_REVIEWED_SKUS = new Map([
  ["wardrobe-reviewed-nude-ruched-sundress", "REVIEW-NUDE-RUCHED-001"],
]);

function upgradeLegacyBlushDraft(existing: Garment, seed: Garment): Garment {
  const isExactLegacyPlaceholder = existing.id === "wardrobe-reviewed-nude-ruched-sundress"
    && normalizedSku(existing.sku) === "REVIEW-NUDE-RUCHED-001"
    && existing.title === "Nude ruched sundress"
    && existing.color === "Nude"
    && existing.source === "Reviewed candidate"
    && existing.notes === "Size, measurements, and condition remain pending."
    && existing.state === "DRAFT"
    && existing.mediaState === "EMPTY"
    && existing.visual === "umber"
    && !existing.saleEligible
    && existing.references.length === 0
    && !existing.reviewCover;
  if (!isExactLegacyPlaceholder) return existing;
  return {
    ...existing,
    sku: seed.sku,
    title: seed.title,
    color: seed.color,
    source: seed.source,
    notes: seed.notes,
    mediaState: seed.mediaState,
    visual: seed.visual,
    references: seed.references.map((reference) => ({ ...reference })),
    reviewCover: seed.reviewCover,
  };
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
    const legacySku = LEGACY_REVIEWED_SKUS.get(seed.id);
    const existing = garments.find((garment) =>
      garment.id === seed.id
      || normalizedSku(garment.sku) === normalizedSku(seed.sku)
      || (legacySku ? normalizedSku(garment.sku) === legacySku : false),
    );
    if (existing) {
      garmentIdMap.set(seed.id, existing.id);
      if (seed.id === "wardrobe-reviewed-nude-ruched-sundress") {
        const index = garments.indexOf(existing);
        garments[index] = upgradeLegacyBlushDraft(existing, seed);
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
