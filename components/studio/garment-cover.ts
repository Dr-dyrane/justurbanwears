import type { Garment, StudioListing } from "../../lib/studio/domain/entities";
import { getApprovedPublicListingContract } from "../../lib/studio/projections/approved-catalogue";
import {
  getPendingWardrobeProductContract,
  pendingWardrobeMediaLabel,
} from "../../lib/studio/seeds/private-wardrobe-products";

export interface StudioGarmentCover {
  alt: string;
  height: number;
  src: string;
  width: number;
}

export function studioGarmentCover(garment: Garment, listing?: StudioListing): StudioGarmentCover | undefined {
  const approved = listing
    ? getApprovedPublicListingContract(garment.sku, listing.slug)?.media.find((frame) => frame.slot === "GARMENT_FRONT")
    : undefined;
  if (approved) {
    return {
      alt: `${garment.title}, approved garment front`,
      height: 1402,
      src: approved.src,
      width: 1122,
    };
  }

  const pending = getPendingWardrobeProductContract(garment.sku)?.publicSafeMedia[0];
  if (pending) {
    return {
      alt: `${garment.title}, ${pendingWardrobeMediaLabel(pending.view).toLowerCase()}`,
      height: pending.height,
      src: pending.src,
      width: pending.width,
    };
  }

  return garment.reviewCover;
}
