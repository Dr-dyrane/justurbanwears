import type {
  Garment,
  PublicListingProjection,
  StudioListing,
} from "../domain/entities";
import type { StudioSnapshot } from "../domain/state";
import { everyGateReady, modelReadiness } from "../domain/readiness";
import {
  approvedSlugForSku,
  getApprovedPublicListingContract,
} from "./approved-catalogue";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function publicCategory(category: Garment["category"]): PublicListingProjection["category"] {
  if (category === "Dress") return "Dresses";
  if (category === "Shirt") return "Shirts";
  if (category === "Knitwear") return "Knitwear";
  if (category === "Skirt") return "Skirts";
  return "Trousers";
}

function publicSilhouette(category: Garment["category"]): PublicListingProjection["silhouette"] {
  if (category === "Dress") return "dress";
  if (category === "Shirt") return "shirt";
  if (category === "Knitwear") return "knit";
  if (category === "Skirt") return "skirt";
  return "trouser";
}

function publicTone(colour: string): PublicListingProjection["tone"] {
  const normalized = colour.toLowerCase();
  if (normalized.includes("coral") || normalized.includes("orange")) return "coral";
  if (normalized.includes("indigo") || normalized.includes("blue")) return "indigo";
  if (normalized.includes("moss") || normalized.includes("green")) return "moss";
  if (normalized.includes("ivory") || normalized.includes("cream") || normalized.includes("white")) return "ivory";
  if (normalized.includes("pink") || normalized.includes("salmon")) return "salmon";
  return "cocoa";
}

export function createListingSlug(sku: string, title: string) {
  return approvedSlugForSku(sku) ?? `${slugify(title)}-${slugify(sku)}`;
}

export function createWardrobePublicProduct(
  listing: StudioListing,
  garment: Garment,
): PublicListingProjection | undefined {
  const approved = getApprovedPublicListingContract(garment.sku, listing.slug);
  if (!approved) return undefined;
  const availability = listing.state === "RESERVED"
    ? "RESERVED"
    : listing.state === "SOLD"
      ? "SOLD"
      : "AVAILABLE";

  return {
    slug: listing.slug,
    sku: garment.sku,
    name: listing.title,
    category: publicCategory(garment.category),
    price: listing.price,
    taggedSize: garment.sizeLabel,
    fit: garment.estimatedFit,
    condition: garment.condition,
    colour: garment.color,
    availability,
    drop: "Studio release",
    tone: publicTone(garment.color),
    silhouette: publicSilhouette(garment.category),
    note: listing.description,
    story: "Curated by justurban wears.",
    details: [garment.condition, garment.color, garment.sizeLabel],
    measurements: garment.measurements.map((measurement) => ({ ...measurement })),
    modelAnchor: approved.modelAnchor,
    media: approved.media,
  };
}

export function selectWardrobePublicView(snapshot: StudioSnapshot) {
  return snapshot.listings.flatMap((listing) => {
    if (!["PUBLISHED", "RESERVED", "SOLD"].includes(listing.state)) return [];
    const garment = snapshot.garments.find((candidate) => candidate.id === listing.garmentId);
    const model = snapshot.models.find((candidate) => candidate.id === listing.modelId);
    if (
      !garment
      || !listing.publicProjection
      || !model
      || model.id !== snapshot.defaultModelId
      || model.state !== "READY"
      || !everyGateReady(modelReadiness(model))
      || !getApprovedPublicListingContract(garment.sku, listing.slug)
    ) return [];
    const projection = createWardrobePublicProduct(listing, garment);
    return projection ? [projection] : [];
  });
}

// Compatibility names for persisted V2 Studio records while callers migrate to
// the wardrobe-public-view language.
export const createPublicListingProjection = createWardrobePublicProduct;
export const selectPublicCatalog = selectWardrobePublicView;
