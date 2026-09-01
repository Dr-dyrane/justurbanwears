import type {
  PublicListingMediaProjection,
  PublicListingMediaSlot,
} from "../domain/entities";
import {
  WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS,
} from "../../wardrobe-public-view/seeds";
import { canonicalCatalogueSku } from "../../wardrobe-public-view/sku";

const currentLuluV4PreviewListing = [...WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS]
  .reverse()
  .find((listing) => listing.modelAnchor.id === "lulu-v4"
    && listing.media.some((frame) => frame.slot === "MODEL_FRONT" && frame.modelAnchorId === "lulu-v4"));
const currentLuluV4PreviewFrame = currentLuluV4PreviewListing?.media.find(
  (frame) => frame.slot === "MODEL_FRONT" && frame.modelAnchorId === "lulu-v4",
);

if (!currentLuluV4PreviewListing || !currentLuluV4PreviewFrame) {
  throw new Error("The current Lulu V4 public preview is missing from the approved catalogue projection.");
}

/**
 * Browser-safe current-Lulu preview derived from the approved V4 catalogue
 * projection. Private identity and body authorities never enter the bundle.
 */
export const APPROVED_PUBLIC_MODEL_PREVIEW = Object.freeze({
  id: "lulu-v4" as const,
  label: "Lulu V4" as const,
  src: currentLuluV4PreviewFrame.src,
  width: 1120,
  height: 1400,
  listingSlug: currentLuluV4PreviewListing.slug,
});

export const APPROVED_PUBLIC_LISTINGS = Object.freeze(
  WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.map(({ sku, slug }) => ({ sku, slug })),
);

function normalizeSku(sku: string) {
  return canonicalCatalogueSku(sku);
}

export function approvedSlugForSku(sku: string) {
  return APPROVED_PUBLIC_LISTINGS.find((listing) => listing.sku === normalizeSku(sku))?.slug;
}

export function getApprovedPublicListingContract(sku: string, slug: string) {
  const approved = WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.find((listing) =>
    listing.sku === normalizeSku(sku) && listing.slug === slug,
  );
  if (!approved) return undefined;

  return {
    sku: approved.sku,
    slug: approved.slug,
    modelAnchor: { ...approved.modelAnchor },
    media: approved.media.map<PublicListingMediaProjection>((frame) => ({ ...frame })),
  };
}

export function publicMediaLabel(slot: PublicListingMediaSlot) {
  if (slot === "GARMENT_FRONT") return "Garment front";
  if (slot === "GARMENT_BACK") return "Garment back";
  if (slot === "MANNEQUIN_FRONT") return "Mannequin front";
  if (slot === "MODEL_FRONT") return "Model front";
  if (slot === "MODEL_LEFT_PROFILE") return "Model left profile";
  if (slot === "MODEL_REAR_THREE_QUARTER") return "Model right rear three-quarter";
  if (slot === "MODEL_REAR_MIRROR") return "Model rear mirror";
  if (slot === "MODEL_DETAIL") return "Model styled detail";
  if (slot === "CONSTRUCTION_DETAIL") return "Construction detail";
  return "Fabric detail";
}
