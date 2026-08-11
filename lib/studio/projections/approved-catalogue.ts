import type {
  PublicListingMediaProjection,
  PublicListingMediaSlot,
  PublicModelAnchorProjection,
} from "../domain/entities";
import {
  WARDROBE_PUBLIC_MODEL_ANCHOR,
  WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS,
} from "../../wardrobe-public-view/seeds";
import { canonicalCatalogueSku } from "../../wardrobe-public-view/sku";

export const APPROVED_PUBLIC_MODEL_ANCHOR: PublicModelAnchorProjection = Object.freeze({
  ...WARDROBE_PUBLIC_MODEL_ANCHOR,
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
