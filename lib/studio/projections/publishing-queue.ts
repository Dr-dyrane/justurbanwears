import type {
  Garment,
  StudioLifecycleState,
  StudioListing,
  StudioNativeShopReadiness,
} from "../domain/entities";
import type { StudioPublicationReview } from "../engine/catalogue-publication-contracts";

export type StudioPublishingQueueEntry =
  | {
      id: string;
      kind: "LISTING";
      garment: Garment;
      listing: StudioListing;
      state: StudioLifecycleState;
      title: string;
    }
  | {
      id: string;
      kind: "STUDIO_NATIVE_THREE_PHOTO";
      garment: Garment;
      state: "READY";
      title: string;
    };

export function projectStudioNativeShopReadiness(
  review: StudioPublicationReview | null,
): StudioNativeShopReadiness | undefined {
  if (!review || review.state === "PUBLISHED") return undefined;
  if (review.state === "READY") {
    return { path: "STUDIO_NATIVE_THREE_PHOTO", state: "READY" };
  }
  return {
    path: "STUDIO_NATIVE_THREE_PHOTO",
    state: "BLOCKED",
    blockers: [...review.blockers],
  };
}

/**
 * Keeps the native three-photo Shop queue separate from catalogue/Atelier
 * listings. A ready native piece opens its dossier for authoritative review;
 * it never becomes a fabricated StudioListing.
 */
export function selectStudioPublishingQueue(
  garments: readonly Garment[],
  listings: readonly StudioListing[],
): StudioPublishingQueueEntry[] {
  const garmentsById = new Map(garments.map((garment) => [garment.id, garment]));
  const listedGarmentIds = new Set(listings.map((listing) => listing.garmentId));
  const nativeReady = garments.flatMap<StudioPublishingQueueEntry>((garment) => (
    garment.nativeShopReadiness?.path === "STUDIO_NATIVE_THREE_PHOTO"
    && garment.nativeShopReadiness.state === "READY"
    && !listedGarmentIds.has(garment.id)
      ? [{
          id: `native-shop-ready:${garment.id}`,
          kind: "STUDIO_NATIVE_THREE_PHOTO" as const,
          garment,
          state: "READY" as const,
          title: garment.title,
        }]
      : []
  ));
  const listingEntries = listings.flatMap<StudioPublishingQueueEntry>((listing) => {
    if (listing.state !== "DRAFT" && listing.state !== "READY") return [];
    const garment = garmentsById.get(listing.garmentId);
    return garment ? [{
      id: listing.id,
      kind: "LISTING" as const,
      garment,
      listing,
      state: listing.state,
      title: listing.title,
    }] : [];
  });
  return [...nativeReady, ...listingEntries];
}
