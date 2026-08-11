import type {
  WardrobePublicMedia,
  WardrobePublicMediaSlot,
  WardrobePublicModelAnchor,
  WardrobePublicModelAnchorId,
  WardrobePublicProduct,
  WardrobePublicViewSnapshot,
} from "./domain/entities";
import {
  WARDROBE_DROP_01_APPROVED_MODEL_FRONT_SLUGS,
  WARDROBE_DROP_01_PRODUCTS,
} from "./drop-01";

export const WARDROBE_PUBLIC_MODEL_ANCHORS = Object.freeze({
  "lulu-v2": Object.freeze({
    id: "lulu-v2" as const,
    src: "/shop/model/lulu-v2-approved.png" as const,
  }),
  "lulu-v3": Object.freeze({ id: "lulu-v3" as const }),
});

/** The public V2 identity reference remains the default and is never replaced by a private master. */
export const WARDROBE_PUBLIC_MODEL_ANCHOR = WARDROBE_PUBLIC_MODEL_ANCHORS["lulu-v2"];

export const WARDROBE_APPROVED_V3_MODEL_FRONT_SLUGS = Object.freeze([
  "coral-drift-dress",
  "indigo-workshirt",
  "moss-square-knit",
  "cocoa-pleat-trouser",
  "salmon-camp-shirt",
  "sage-open-back-high-slit-maxi-dress",
] as const);

export const WARDROBE_APPROVED_MODEL_FRONT_SLUGS = Object.freeze([
  "coral-drift-dress",
  "indigo-workshirt",
  "moss-square-knit",
  "ivory-tie-skirt",
  "cocoa-pleat-trouser",
  "salmon-camp-shirt",
  ...WARDROBE_DROP_01_APPROVED_MODEL_FRONT_SLUGS,
] as const);

type WardrobeSupplementalModelSlot = Extract<
  WardrobePublicMediaSlot,
  "MODEL_LEFT_PROFILE" | "MODEL_REAR_THREE_QUARTER" | "MODEL_REAR_MIRROR" | "MODEL_DETAIL"
>;

export const WARDROBE_APPROVED_MODEL_SUPPLEMENTAL_SLOTS = Object.freeze({
  "coral-drift-dress": ["MODEL_LEFT_PROFILE", "MODEL_REAR_THREE_QUARTER"],
  "moss-square-knit": ["MODEL_LEFT_PROFILE", "MODEL_REAR_THREE_QUARTER"],
  "cocoa-pleat-trouser": ["MODEL_LEFT_PROFILE", "MODEL_REAR_THREE_QUARTER"],
  "magenta-plunge-ruched-mini-dress": ["MODEL_LEFT_PROFILE", "MODEL_REAR_THREE_QUARTER"],
  "silver-off-shoulder-mermaid-dress": ["MODEL_REAR_THREE_QUARTER"],
  "orchid-beaded-column-gown": ["MODEL_DETAIL"],
  "sage-open-back-high-slit-maxi-dress": ["MODEL_REAR_THREE_QUARTER"],
} as const satisfies Record<string, readonly WardrobeSupplementalModelSlot[]>);

export function getApprovedModelSupplementalSlots(
  slug: string,
): readonly WardrobeSupplementalModelSlot[] {
  return Object.hasOwn(WARDROBE_APPROVED_MODEL_SUPPLEMENTAL_SLOTS, slug)
    ? WARDROBE_APPROVED_MODEL_SUPPLEMENTAL_SLOTS[
        slug as keyof typeof WARDROBE_APPROVED_MODEL_SUPPLEMENTAL_SLOTS
      ]
    : [];
}

const modelFrontSlugs = new Set<string>(WARDROBE_APPROVED_MODEL_FRONT_SLUGS);
const v3ModelFrontSlugs = new Set<string>(WARDROBE_APPROVED_V3_MODEL_FRONT_SLUGS);
const v3SupplementalModelSlugs = new Set(["sage-open-back-high-slit-maxi-dress"]);
const constructionDetailSlugs = new Set(["sage-open-back-high-slit-maxi-dress"]);

const modelMediaSlots = new Set<WardrobePublicMediaSlot>([
  "MODEL_FRONT",
  "MODEL_LEFT_PROFILE",
  "MODEL_REAR_THREE_QUARTER",
  "MODEL_REAR_MIRROR",
  "MODEL_DETAIL",
]);

const supplementalModelFiles: Record<WardrobeSupplementalModelSlot, string> = {
  MODEL_LEFT_PROFILE: "07-model-left-profile.webp",
  MODEL_REAR_THREE_QUARTER: "05-model-rear-three-quarter.webp",
  MODEL_REAR_MIRROR: "09-model-rear-mirror.webp",
  MODEL_DETAIL: "08-model-detail.webp",
};

export function getApprovedModelAnchorId(
  slug: string,
  slot: WardrobePublicMediaSlot,
): WardrobePublicModelAnchorId | undefined {
  if (!modelMediaSlots.has(slot)) return undefined;
  return (
    (slot === "MODEL_FRONT" && v3ModelFrontSlugs.has(slug))
    || (slot !== "MODEL_FRONT" && v3SupplementalModelSlugs.has(slug))
  ) ? "lulu-v3" : "lulu-v2";
}

export function getWardrobePublicModelAnchor(slug: string): WardrobePublicModelAnchor {
  return v3ModelFrontSlugs.has(slug)
    ? { ...WARDROBE_PUBLIC_MODEL_ANCHORS["lulu-v3"] }
    : { ...WARDROBE_PUBLIC_MODEL_ANCHORS["lulu-v2"] };
}

function migrationFrame(
  slug: string,
  slot: WardrobePublicMediaSlot,
  fileName: string,
): WardrobePublicMedia {
  const modelAnchorId = getApprovedModelAnchorId(slug, slot);
  return {
    slot,
    src: `/shop/products/${slug}/${fileName}`,
    ...(modelAnchorId ? { modelAnchorId } : {}),
  };
}

function migrationMedia(slug: string): WardrobePublicMedia[] {
  return [
    migrationFrame(slug, "GARMENT_FRONT", "01-garment-front.webp"),
    migrationFrame(slug, "GARMENT_BACK", "02-garment-back.webp"),
    migrationFrame(slug, "MANNEQUIN_FRONT", "03-mannequin-front.webp"),
    ...(modelFrontSlugs.has(slug)
      ? [migrationFrame(slug, "MODEL_FRONT", "04-model-front.webp")]
      : []),
    constructionDetailSlugs.has(slug)
      ? migrationFrame(slug, "CONSTRUCTION_DETAIL", "08-construction-detail.webp")
      : migrationFrame(slug, "FABRIC_DETAIL", "06-fabric-detail.webp"),
    ...getApprovedModelSupplementalSlots(slug).map((slot) => ({
      ...migrationFrame(slug, slot, supplementalModelFiles[slot]),
    })),
  ];
}

function migrationSeed(
  product: Omit<WardrobePublicProduct, "media" | "modelAnchor">,
): WardrobePublicProduct {
  return {
    ...product,
    modelAnchor: getWardrobePublicModelAnchor(product.slug),
    media: migrationMedia(product.slug),
  };
}

/**
 * One-time public migration rows for the original six-product Shop release.
 * Studio materializes matching wardrobe records and thereafter owns lifecycle.
 */
export const WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS: readonly WardrobePublicProduct[] = Object.freeze([
  migrationSeed({
    slug: "coral-drift-dress",
    sku: "JUW-001",
    name: "Coral Drift Dress",
    category: "Dresses",
    price: 24500,
    taggedSize: "UK 10",
    fit: "Relaxed 8–10",
    condition: "Excellent pre-loved",
    colour: "Washed coral",
    availability: "AVAILABLE",
    drop: "Drop 01",
    tone: "coral",
    silhouette: "dress",
    note: "A softly gathered midi that moves without feeling precious.",
    story: "Chosen for the easy drape and warm, sun-faded colour. The waist sits gently rather than tightly, with enough movement for everyday plans and evening light.",
    details: ["Soft woven hand", "Side zip", "Midi length", "Unlined"],
    measurements: [
      { label: "Bust", value: "88 cm" },
      { label: "Waist", value: "74 cm" },
      { label: "Length", value: "121 cm" },
    ],
  }),
  migrationSeed({
    slug: "indigo-workshirt",
    sku: "JUW-002",
    name: "Indigo Workshirt",
    category: "Shirts",
    price: 18000,
    taggedSize: "L",
    fit: "Oversized 10–14",
    condition: "Very good",
    colour: "Washed indigo",
    availability: "RESERVED",
    drop: "Drop 01",
    tone: "indigo",
    silhouette: "shirt",
    note: "Soft denim structure with the ease of a light jacket.",
    story: "A useful in-between layer with softened seams and a lived-in wash. Wear it open over a tank or buttoned with sleeves rolled once.",
    details: ["Two patch pockets", "Tonal buttons", "Soft denim", "Curved hem"],
    measurements: [
      { label: "Chest", value: "116 cm" },
      { label: "Shoulder", value: "48 cm" },
      { label: "Length", value: "73 cm" },
    ],
  }),
  migrationSeed({
    slug: "moss-square-knit",
    sku: "JUW-003",
    name: "Moss Square Knit",
    category: "Knitwear",
    price: 12500,
    taggedSize: "M",
    fit: "Fitted 8–12",
    condition: "Good — light wear",
    colour: "Moss green",
    availability: "AVAILABLE",
    drop: "Drop 01",
    tone: "moss",
    silhouette: "knit",
    note: "Fine rib, square neck, and a close fit that layers cleanly.",
    story: "The quiet colour does the work here. A clean neckline and fine rib make it useful under tailoring, while the stretch keeps it easy on its own.",
    details: ["Stretch rib", "Square neckline", "Long sleeve", "Close fit"],
    measurements: [
      { label: "Bust", value: "76–92 cm" },
      { label: "Sleeve", value: "59 cm" },
      { label: "Length", value: "55 cm" },
    ],
  }),
  migrationSeed({
    slug: "ivory-tie-skirt",
    sku: "JUW-004",
    name: "Ivory Tie Skirt",
    category: "Skirts",
    price: 15500,
    taggedSize: "UK 10",
    fit: "Adjustable 8–12",
    condition: "Excellent pre-loved",
    colour: "Warm ivory",
    availability: "SOLD",
    drop: "Archive",
    tone: "ivory",
    silhouette: "skirt",
    note: "An asymmetric wrap with a clean waist tie and soft movement.",
    story: "A simple wrap shape with a little asymmetry. This one has found a home, but remains in the edit as a reference for the pieces we look for.",
    details: ["Adjustable tie", "Asymmetric front", "Midi length", "Fully lined"],
    measurements: [
      { label: "Waist", value: "68–82 cm" },
      { label: "Hip", value: "104 cm" },
      { label: "Length", value: "79 cm" },
    ],
  }),
  migrationSeed({
    slug: "cocoa-pleat-trouser",
    sku: "JUW-005",
    name: "Cocoa Pleat Trouser",
    category: "Trousers",
    price: 22000,
    taggedSize: "UK 12",
    fit: "True 10–12",
    condition: "Excellent pre-loved",
    colour: "Deep cocoa",
    availability: "AVAILABLE",
    drop: "Drop 01",
    tone: "cocoa",
    silhouette: "trouser",
    note: "A long, fluid line with a single front pleat and gentle taper.",
    story: "The fabric falls with weight but stays breathable. A high waist and subtle taper make this pair equally good with a compact knit or oversized shirt.",
    details: ["High waist", "Single front pleat", "Side pockets", "Gentle taper"],
    measurements: [
      { label: "Waist", value: "78 cm" },
      { label: "Rise", value: "31 cm" },
      { label: "Inseam", value: "78 cm" },
    ],
  }),
  migrationSeed({
    slug: "salmon-camp-shirt",
    sku: "JUW-006",
    name: "Salmon Camp Shirt",
    category: "Shirts",
    price: 16500,
    taggedSize: "M",
    fit: "Relaxed 8–12",
    condition: "Very good",
    colour: "Soft salmon",
    availability: "AVAILABLE",
    drop: "Drop 01",
    tone: "salmon",
    silhouette: "shirt",
    note: "Airy, boxy, and cut with an open collar for warm days.",
    story: "An unfussy shirt in the exact shade that makes denim and cocoa neutrals feel considered. The boxy cut is intended to sit away from the body.",
    details: ["Open collar", "Short sleeve", "Boxy cut", "Side vents"],
    measurements: [
      { label: "Chest", value: "108 cm" },
      { label: "Shoulder", value: "44 cm" },
      { label: "Length", value: "64 cm" },
    ],
  }),
  ...WARDROBE_DROP_01_PRODUCTS.map((product) => migrationSeed({
    ...product,
    details: [...product.details],
    measurements: product.measurements.map((
      measurement: WardrobePublicProduct["measurements"][number],
    ) => ({ ...measurement })),
  })),
]);

export function createWardrobePublicViewMigrationSnapshot(): WardrobePublicViewSnapshot {
  return {
    products: WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.map((product) => ({
      ...product,
      details: [...product.details],
      measurements: product.measurements.map((measurement) => ({ ...measurement })),
      modelAnchor: { ...product.modelAnchor },
      media: product.media.map((item) => ({ ...item })),
    })),
    managedSlugs: WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.map((product) => product.slug),
  };
}
