import type {
  WardrobePublicMedia,
  WardrobePublicProduct,
  WardrobePublicViewSnapshot,
} from "./domain/entities";
import {
  WARDROBE_DROP_01_APPROVED_MODEL_FRONT_SLUGS,
  WARDROBE_DROP_01_PRODUCTS,
} from "./drop-01";

export const WARDROBE_PUBLIC_MODEL_ANCHOR = Object.freeze({
  id: "lulu-v2" as const,
  src: "/shop/model/lulu-v2-approved.png" as const,
});

export const WARDROBE_APPROVED_MODEL_FRONT_SLUGS = Object.freeze([
  "coral-drift-dress",
  "moss-square-knit",
  "ivory-tie-skirt",
  "cocoa-pleat-trouser",
  "salmon-camp-shirt",
  ...WARDROBE_DROP_01_APPROVED_MODEL_FRONT_SLUGS,
] as const);

export const WARDROBE_APPROVED_MODEL_MULTI_VIEW_SLUGS = Object.freeze([
  "coral-drift-dress",
  "moss-square-knit",
  "cocoa-pleat-trouser",
] as const);

const modelFrontSlugs = new Set<string>(WARDROBE_APPROVED_MODEL_FRONT_SLUGS);
const modelMultiViewSlugs = new Set<string>(WARDROBE_APPROVED_MODEL_MULTI_VIEW_SLUGS);

function migrationMedia(slug: string): WardrobePublicMedia[] {
  return [
    { slot: "GARMENT_FRONT", src: `/shop/products/${slug}/01-garment-front.webp` },
    { slot: "GARMENT_BACK", src: `/shop/products/${slug}/02-garment-back.webp` },
    { slot: "MANNEQUIN_FRONT", src: `/shop/products/${slug}/03-mannequin-front.webp` },
    ...(modelFrontSlugs.has(slug)
      ? [{ slot: "MODEL_FRONT" as const, src: `/shop/products/${slug}/04-model-front.webp` }]
      : []),
    { slot: "FABRIC_DETAIL", src: `/shop/products/${slug}/06-fabric-detail.webp` },
    ...(modelMultiViewSlugs.has(slug)
      ? [
          {
            slot: "MODEL_LEFT_PROFILE" as const,
            src: `/shop/products/${slug}/07-model-left-profile.webp`,
          },
          {
            slot: "MODEL_REAR_THREE_QUARTER" as const,
            src: `/shop/products/${slug}/05-model-rear-three-quarter.webp`,
          },
        ]
      : []),
  ];
}

function migrationSeed(
  product: Omit<WardrobePublicProduct, "media" | "modelAnchor">,
): WardrobePublicProduct {
  return {
    ...product,
    modelAnchor: { ...WARDROBE_PUBLIC_MODEL_ANCHOR },
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
    sku: "DYN-081",
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
    sku: "DYN-082",
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
    sku: "DYN-083",
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
    sku: "DYN-084",
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
    sku: "DYN-085",
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
    sku: "DYN-086",
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
    measurements: product.measurements.map((measurement) => ({ ...measurement })),
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
