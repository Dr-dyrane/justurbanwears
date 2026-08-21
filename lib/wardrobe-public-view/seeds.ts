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
  "lulu-v4": Object.freeze({ id: "lulu-v4" as const }),
});

/** The public V2 identity reference remains the default and is never replaced by a private master. */
export const WARDROBE_PUBLIC_MODEL_ANCHOR = WARDROBE_PUBLIC_MODEL_ANCHORS["lulu-v2"];

export const WARDROBE_APPROVED_V3_MODEL_FRONT_SLUGS = Object.freeze([
  "coral-drift-dress",
  "indigo-workshirt",
  "moss-square-knit",
  "cocoa-pleat-trouser",
  "salmon-camp-shirt",
  "teal-draped-mini-set",
  "sage-open-back-high-slit-maxi-dress",
] as const);

export const WARDROBE_APPROVED_V4_MODEL_SLUGS = Object.freeze([
  "black-cropped-tee-slim-trouser-set",
  "violet-beaded-ruffle-romper",
  "black-sweetheart-fit-flare-midi-dress",
  "black-ivory-folded-neck-column-dress",
  "indigo-seamed-denim-mini-dress",
  "black-cropped-tee-silver-ruched-skirt-set",
  "black-cropped-tee-pink-distressed-shorts-set",
  "black-cropped-tee-blue-distressed-shorts-set",
] as const);

export const WARDROBE_APPROVED_MODEL_FRONT_SLUGS = Object.freeze([
  "coral-drift-dress",
  "indigo-workshirt",
  "moss-square-knit",
  "ivory-tie-skirt",
  "cocoa-pleat-trouser",
  "salmon-camp-shirt",
  ...WARDROBE_DROP_01_APPROVED_MODEL_FRONT_SLUGS,
  ...WARDROBE_APPROVED_V4_MODEL_SLUGS,
] as const);

type WardrobeSupplementalModelSlot = Extract<
  WardrobePublicMediaSlot,
  "MODEL_LEFT_PROFILE" | "MODEL_REAR_THREE_QUARTER" | "MODEL_REAR_MIRROR" | "MODEL_DETAIL"
>;

export const WARDROBE_APPROVED_MODEL_SUPPLEMENTAL_SLOTS = Object.freeze({
  "black-cropped-tee-slim-trouser-set": ["MODEL_LEFT_PROFILE", "MODEL_REAR_THREE_QUARTER"],
  "violet-beaded-ruffle-romper": ["MODEL_LEFT_PROFILE", "MODEL_REAR_THREE_QUARTER"],
  "black-sweetheart-fit-flare-midi-dress": ["MODEL_LEFT_PROFILE", "MODEL_REAR_THREE_QUARTER"],
  "black-ivory-folded-neck-column-dress": ["MODEL_LEFT_PROFILE", "MODEL_REAR_THREE_QUARTER"],
  "indigo-seamed-denim-mini-dress": ["MODEL_LEFT_PROFILE", "MODEL_REAR_THREE_QUARTER"],
  "black-cropped-tee-silver-ruched-skirt-set": ["MODEL_LEFT_PROFILE", "MODEL_REAR_THREE_QUARTER"],
  "black-cropped-tee-pink-distressed-shorts-set": ["MODEL_LEFT_PROFILE", "MODEL_REAR_THREE_QUARTER"],
  "black-cropped-tee-blue-distressed-shorts-set": ["MODEL_LEFT_PROFILE", "MODEL_REAR_THREE_QUARTER"],
  "coral-drift-dress": ["MODEL_LEFT_PROFILE", "MODEL_REAR_THREE_QUARTER"],
  "moss-square-knit": ["MODEL_LEFT_PROFILE", "MODEL_REAR_THREE_QUARTER"],
  "cocoa-pleat-trouser": ["MODEL_LEFT_PROFILE", "MODEL_REAR_THREE_QUARTER"],
  "magenta-plunge-ruched-mini-dress": [
    "MODEL_LEFT_PROFILE",
    "MODEL_REAR_THREE_QUARTER",
    "MODEL_DETAIL",
  ],
  "silver-off-shoulder-mermaid-dress": ["MODEL_REAR_THREE_QUARTER"],
  "orchid-beaded-column-gown": ["MODEL_DETAIL"],
  "sage-open-back-high-slit-maxi-dress": ["MODEL_LEFT_PROFILE", "MODEL_REAR_THREE_QUARTER"],
  "cocoa-cowl-gathered-midi-dress": ["MODEL_LEFT_PROFILE", "MODEL_REAR_THREE_QUARTER"],
  "ivory-rib-knit-fitted-midi-dress": ["MODEL_LEFT_PROFILE"],
  "teal-draped-mini-set": ["MODEL_REAR_MIRROR"],
  "coral-gathered-crop-mini-set": ["MODEL_REAR_THREE_QUARTER"],
  "cropped-denim-jacket-black-legging-look": ["MODEL_REAR_MIRROR"],
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
const v4ModelSlugs = new Set<string>(WARDROBE_APPROVED_V4_MODEL_SLUGS);
const v3SupplementalModelSlugs = new Set([
  "teal-draped-mini-set",
  "sage-open-back-high-slit-maxi-dress",
  "cocoa-cowl-gathered-midi-dress",
  "ivory-rib-knit-fitted-midi-dress",
  "coral-gathered-crop-mini-set",
  "cropped-denim-jacket-black-legging-look",
]);
const constructionDetailSlugs = new Set([
  "sage-open-back-high-slit-maxi-dress",
  "coral-gathered-crop-mini-set",
]);

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
  if (v4ModelSlugs.has(slug)) return "lulu-v4";
  return (
    (slot === "MODEL_FRONT" && v3ModelFrontSlugs.has(slug))
    || (slot !== "MODEL_FRONT" && v3SupplementalModelSlugs.has(slug))
  ) ? "lulu-v3" : "lulu-v2";
}

export function getWardrobePublicModelAnchor(slug: string): WardrobePublicModelAnchor {
  if (v4ModelSlugs.has(slug)) {
    return { ...WARDROBE_PUBLIC_MODEL_ANCHORS["lulu-v4"] };
  }
  return v3ModelFrontSlugs.has(slug) || v3SupplementalModelSlugs.has(slug)
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
  migrationSeed({
    slug: "black-cropped-tee-slim-trouser-set",
    sku: "JUW-025",
    name: "Black Cropped Tee and Slim Trouser Set",
    category: "Sets",
    price: 24500,
    taggedSize: "Size on request",
    fit: "Measurements confirmed before payment",
    condition: "Condition confirmed before payment",
    colour: "Black",
    availability: "AVAILABLE",
    drop: "Drop 02",
    tone: "cocoa",
    silhouette: "set",
    note: "A black cropped tee and slim trouser pairing with a clean, close line.",
    story: "Soft gathered sleeve caps meet a fitted crop, balanced by high-waisted tapered trousers with a simple silver-tone button.",
    details: ["Cropped crew-neck tee", "Soft gathered sleeve caps", "High-waisted slim trousers", "Tapered ankle length"],
    measurements: [],
  }),
  migrationSeed({
    slug: "violet-beaded-ruffle-romper",
    sku: "JUW-026",
    name: "Violet Beaded Ruffle Romper",
    category: "Rompers",
    price: 32000,
    taggedSize: "Size on request",
    fit: "Measurements confirmed before payment",
    condition: "Condition confirmed before payment",
    colour: "Deep violet",
    availability: "AVAILABLE",
    drop: "Drop 02",
    tone: "indigo",
    silhouette: "romper",
    note: "A deep-violet beaded romper framed by soft flounces and an asymmetric ruffled hem.",
    story: "Slim straps and an off-shoulder flounce open the neckline, while dense tonal beadwork carries through the close romper silhouette.",
    details: ["Slim shoulder straps", "Off-shoulder flounce", "Dense tonal beadwork", "Asymmetric ruffled hem"],
    measurements: [],
  }),
  migrationSeed({
    slug: "black-sweetheart-fit-flare-midi-dress",
    sku: "JUW-027",
    name: "Black Sweetheart Fit-and-Flare Midi Dress",
    category: "Dresses",
    price: 28500,
    taggedSize: "Size on request",
    fit: "Measurements confirmed before payment",
    condition: "Condition confirmed before payment",
    colour: "Black",
    availability: "AVAILABLE",
    drop: "Drop 02",
    tone: "cocoa",
    silhouette: "dress",
    note: "A black sweetheart midi shaped through the bodice and released into a full gathered skirt.",
    story: "Curved cup seams, short structured sleeves, and a panelled waist give way to a softly gathered A-line midi skirt.",
    details: ["Sweetheart cup seams", "Short structured sleeves", "Panelled fitted bodice", "Gathered A-line midi skirt"],
    measurements: [],
  }),
  migrationSeed({
    slug: "black-ivory-folded-neck-column-dress",
    sku: "JUW-028",
    name: "Black and Ivory Folded-Neck Column Dress",
    category: "Dresses",
    price: 34500,
    taggedSize: "Size on request",
    fit: "Measurements confirmed before payment",
    condition: "Condition confirmed before payment",
    colour: "Black and ivory",
    availability: "AVAILABLE",
    drop: "Drop 02",
    tone: "ivory",
    silhouette: "dress",
    note: "A floor-length black column set off by a broad folded ivory neckline.",
    story: "The wide off-shoulder fold frames a low open neckline before the dress falls into a long, close column silhouette.",
    details: ["Broad folded ivory neckline", "Off-shoulder line", "Close column silhouette", "Floor length"],
    measurements: [],
  }),
  migrationSeed({
    slug: "indigo-seamed-denim-mini-dress",
    sku: "JUW-029",
    name: "Indigo Seamed Denim Mini Dress",
    category: "Dresses",
    price: 28500,
    taggedSize: "Size on request",
    fit: "Measurements confirmed before payment",
    condition: "Condition confirmed before payment",
    colour: "Medium-deep indigo",
    availability: "AVAILABLE",
    drop: "Drop 02",
    tone: "indigo",
    silhouette: "dress",
    note: "A close indigo denim mini shaped by long seams and a softly rounded hem.",
    story: "A clean jewel neckline and plain long sleeves frame the fitted line, with restrained topstitching carrying through the compact silhouette.",
    details: ["Shallow jewel neckline", "Long plain sleeves", "Closed centre construction line", "Fitted mini length"],
    measurements: [],
  }),
  migrationSeed({
    slug: "black-cropped-tee-silver-ruched-skirt-set",
    sku: "JUW-030",
    name: "Black Cropped Tee and Silver Ruched Skirt Set",
    category: "Sets",
    price: 28500,
    taggedSize: "Size on request",
    fit: "Measurements confirmed before payment",
    condition: "Condition confirmed before payment",
    colour: "Black and silver",
    availability: "AVAILABLE",
    drop: "Drop 02",
    tone: "ivory",
    silhouette: "set",
    note: "A matte-black cropped tee paired with a close silver ruched skirt and one high front slit.",
    story: "The clean crew-neck crop keeps the top quiet while the reflective ruching and high centre-front slit give the skirt its movement.",
    details: ["Cropped crew-neck tee", "High-waisted pencil skirt", "Reflective ruched finish", "Single high centre-front slit"],
    measurements: [],
  }),
  migrationSeed({
    slug: "black-cropped-tee-pink-distressed-shorts-set",
    sku: "JUW-031",
    name: "Black Cropped Tee and Pink Distressed Shorts Set",
    category: "Sets",
    price: 19500,
    taggedSize: "Size on request",
    fit: "Measurements confirmed before payment",
    condition: "Condition confirmed before payment",
    colour: "Black and pink",
    availability: "AVAILABLE",
    drop: "Drop 02",
    tone: "coral",
    silhouette: "set",
    note: "A matte-black cropped tee paired with vivid pink distressed cut-off denim shorts.",
    story: "The close crew-neck crop leaves a clean waist gap above high-rise washed-pink denim shorts, finished with front distress and uneven raw frayed hems.",
    details: ["Cropped crew-neck tee", "High-rise denim shorts", "Front pocket and fly construction", "Distressed raw frayed hems"],
    measurements: [],
  }),
  migrationSeed({
    slug: "black-cropped-tee-blue-distressed-shorts-set",
    sku: "JUW-032",
    name: "Black Cropped Tee and Blue Distressed Shorts Set",
    category: "Sets",
    price: 19500,
    taggedSize: "Size on request",
    fit: "Measurements confirmed before payment",
    condition: "Condition confirmed before payment",
    colour: "Black and medium blue",
    availability: "AVAILABLE",
    drop: "Drop 02",
    tone: "indigo",
    silhouette: "set",
    note: "A matte-black cropped tee paired with washed blue distressed cut-off denim shorts.",
    story: "The close crew-neck crop leaves a clean waist gap above high-rise medium-blue denim shorts, finished with asymmetric front distress, relaxed openings and uneven raw frayed hems.",
    details: ["Cropped crew-neck tee", "High-rise denim shorts", "Asymmetric front distress", "Short raw frayed hems"],
    measurements: [],
  }),
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
