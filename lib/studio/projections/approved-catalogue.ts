import type {
  PublicListingMediaProjection,
  PublicListingMediaSlot,
  PublicModelAnchorProjection,
} from "../domain/entities";

export const APPROVED_PUBLIC_MODEL_ANCHOR: PublicModelAnchorProjection = Object.freeze({
  id: "lulu-v2",
  src: "/shop/model/lulu-v2-approved.png",
});

export const APPROVED_PUBLIC_LISTINGS = Object.freeze([
  { sku: "DYN-081", slug: "coral-drift-dress" },
  { sku: "DYN-082", slug: "indigo-workshirt" },
  { sku: "DYN-083", slug: "moss-square-knit" },
  { sku: "DYN-084", slug: "ivory-tie-skirt" },
  { sku: "DYN-085", slug: "cocoa-pleat-trouser" },
  { sku: "DYN-086", slug: "salmon-camp-shirt" },
] as const);

const APPROVED_PRODUCT_FRAME_FILES: ReadonlyArray<{
  slot: PublicListingMediaSlot;
  file: string;
}> = Object.freeze([
  { slot: "GARMENT_FRONT", file: "01-garment-front.webp" },
  { slot: "GARMENT_BACK", file: "02-garment-back.webp" },
  { slot: "MANNEQUIN_FRONT", file: "03-mannequin-front.webp" },
  { slot: "FABRIC_DETAIL", file: "06-fabric-detail.webp" },
]);

const APPROVED_MODEL_FRONT_FILES: Readonly<Partial<Record<
  (typeof APPROVED_PUBLIC_LISTINGS)[number]["slug"],
  string
>>> = Object.freeze({
  "coral-drift-dress": "04-model-front.webp",
  "moss-square-knit": "04-model-front.webp",
  "ivory-tie-skirt": "04-model-front.webp",
  "cocoa-pleat-trouser": "04-model-front.webp",
  "salmon-camp-shirt": "04-model-front.webp",
});

function normalizeSku(sku: string) {
  return sku.trim().toUpperCase();
}

export function approvedSlugForSku(sku: string) {
  return APPROVED_PUBLIC_LISTINGS.find((listing) => listing.sku === normalizeSku(sku))?.slug;
}

export function getApprovedPublicListingContract(sku: string, slug: string) {
  const approved = APPROVED_PUBLIC_LISTINGS.find((listing) =>
    listing.sku === normalizeSku(sku) && listing.slug === slug,
  );
  if (!approved) return undefined;

  const modelFrontFile = APPROVED_MODEL_FRONT_FILES[approved.slug];
  const frames = [
    ...APPROVED_PRODUCT_FRAME_FILES.slice(0, 3),
    ...(modelFrontFile
      ? [{ slot: "MODEL_FRONT" as const, file: modelFrontFile }]
      : []),
    APPROVED_PRODUCT_FRAME_FILES[3],
  ];

  return {
    sku: approved.sku,
    slug: approved.slug,
    modelAnchor: { ...APPROVED_PUBLIC_MODEL_ANCHOR },
    media: frames.map<PublicListingMediaProjection>((frame) => ({
      slot: frame.slot,
      src: `/shop/products/${approved.slug}/${frame.file}`,
    })),
  };
}

export function publicMediaLabel(slot: PublicListingMediaSlot) {
  if (slot === "GARMENT_FRONT") return "Garment front";
  if (slot === "GARMENT_BACK") return "Garment back";
  if (slot === "MANNEQUIN_FRONT") return "Mannequin front";
  if (slot === "MODEL_FRONT") return "Model front";
  if (slot === "MODEL_BACK") return "Model back";
  return "Fabric detail";
}
