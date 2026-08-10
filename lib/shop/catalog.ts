import type { ShopProduct } from "./domain/entities";

export type {
  ProductSilhouette,
  ProductMediaPresentation,
  ProductMediaView,
  ProductTone,
  ShopProductMedia,
  ShopModelAnchorId,
  ShopAvailability,
  ShopProduct,
} from "./domain/entities";

export const shopModelAnchors = {
  "lulu-v2": {
    id: "lulu-v2",
    src: "/shop/model/lulu-v2-approved.png",
  },
} as const;

const catalogueMediaTemplate = [
  {
    id: "garment-front",
    filename: "01-garment-front.webp",
    label: "Garment front",
    presentation: "garment",
    view: "front",
    width: 1122,
    height: 1402,
    describe: (name: string) => `${name} shown alone from the front against a warm neutral studio background.`,
  },
  {
    id: "garment-back",
    filename: "02-garment-back.webp",
    label: "Garment back",
    presentation: "garment",
    view: "back",
    width: 1122,
    height: 1402,
    describe: (name: string) => `${name} shown alone from the back against a warm neutral studio background.`,
  },
  {
    id: "mannequin-front",
    filename: "03-mannequin-front.webp",
    label: "On mannequin",
    presentation: "mannequin",
    view: "front",
    width: 1122,
    height: 1402,
    describe: (name: string) => `${name} shown from the front on a neutral studio mannequin.`,
  },
  {
    id: "fabric-detail",
    filename: "06-fabric-detail.webp",
    label: "Fabric detail",
    presentation: "garment",
    view: "detail",
    width: 1122,
    height: 1402,
    describe: (name: string) => `Close view of ${name} fabric and construction details.`,
  },
] as const;

function createCatalogueMedia(slug: string, name: string): NonNullable<ShopProduct["media"]> {
  return catalogueMediaTemplate.map((item) => ({
    id: item.id,
    src: `/shop/products/${slug}/${item.filename}`,
    alt: item.describe(name),
    label: item.label,
    presentation: item.presentation,
    view: item.view,
    width: item.width,
    height: item.height,
  }));
}

// Public, shopper-safe catalogue data. This module never imports Studio state or private identity sources.
export const shopProducts: ShopProduct[] = [
  {
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
    drop: "August edit",
    tone: "coral",
    silhouette: "dress",
    note: "A softly gathered midi that moves without feeling precious.",
    story:
      "Chosen for the easy drape and warm, sun-faded colour. The waist sits gently rather than tightly, with enough movement for everyday plans and evening light.",
    media: createCatalogueMedia("coral-drift-dress", "Coral Drift Dress"),
    details: ["Soft woven hand", "Side zip", "Midi length", "Unlined"],
    measurements: [
      { label: "Bust", value: "88 cm" },
      { label: "Waist", value: "74 cm" },
      { label: "Length", value: "121 cm" },
    ],
  },
  {
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
    drop: "August edit",
    tone: "indigo",
    silhouette: "shirt",
    media: createCatalogueMedia("indigo-workshirt", "Indigo Workshirt"),
    note: "Soft denim structure with the ease of a light jacket.",
    story:
      "A useful in-between layer with softened seams and a lived-in wash. Wear it open over a tank or buttoned with sleeves rolled once.",
    details: ["Two patch pockets", "Tonal buttons", "Soft denim", "Curved hem"],
    measurements: [
      { label: "Chest", value: "116 cm" },
      { label: "Shoulder", value: "48 cm" },
      { label: "Length", value: "73 cm" },
    ],
  },
  {
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
    drop: "August edit",
    tone: "moss",
    silhouette: "knit",
    media: createCatalogueMedia("moss-square-knit", "Moss Square Knit"),
    note: "Fine rib, square neck, and a close fit that layers cleanly.",
    story:
      "The quiet colour does the work here. A clean neckline and fine rib make it useful under tailoring, while the stretch keeps it easy on its own.",
    details: ["Stretch rib", "Square neckline", "Long sleeve", "Close fit"],
    measurements: [
      { label: "Bust", value: "76–92 cm" },
      { label: "Sleeve", value: "59 cm" },
      { label: "Length", value: "55 cm" },
    ],
  },
  {
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
    media: createCatalogueMedia("ivory-tie-skirt", "Ivory Tie Skirt"),
    note: "An asymmetric wrap with a clean waist tie and soft movement.",
    story:
      "A simple wrap shape with a little asymmetry. This one has found a home, but remains in the edit as a reference for the pieces we look for.",
    details: ["Adjustable tie", "Asymmetric front", "Midi length", "Fully lined"],
    measurements: [
      { label: "Waist", value: "68–82 cm" },
      { label: "Hip", value: "104 cm" },
      { label: "Length", value: "79 cm" },
    ],
  },
  {
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
    drop: "August edit",
    tone: "cocoa",
    silhouette: "trouser",
    media: createCatalogueMedia("cocoa-pleat-trouser", "Cocoa Pleat Trouser"),
    note: "A long, fluid line with a single front pleat and gentle taper.",
    story:
      "The fabric falls with weight but stays breathable. A high waist and subtle taper make this pair equally good with a compact knit or oversized shirt.",
    details: ["High waist", "Single front pleat", "Side pockets", "Gentle taper"],
    measurements: [
      { label: "Waist", value: "78 cm" },
      { label: "Rise", value: "31 cm" },
      { label: "Inseam", value: "78 cm" },
    ],
  },
  {
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
    drop: "August edit",
    tone: "salmon",
    silhouette: "shirt",
    media: createCatalogueMedia("salmon-camp-shirt", "Salmon Camp Shirt"),
    note: "Airy, boxy, and cut with an open collar for warm days.",
    story:
      "An unfussy shirt in the exact shade that makes denim and cocoa neutrals feel considered. The boxy cut is intended to sit away from the body.",
    details: ["Open collar", "Short sleeve", "Boxy cut", "Side vents"],
    measurements: [
      { label: "Chest", value: "108 cm" },
      { label: "Shoulder", value: "44 cm" },
      { label: "Length", value: "64 cm" },
    ],
  },
];

export const shopCategories = [
  "All",
  "Dresses",
  "Shirts",
  "Knitwear",
  "Skirts",
  "Trousers",
] as const;

export function getShopProduct(slug: string) {
  return shopProducts.find((product) => product.slug === slug);
}

export function formatNaira(value: number) {
  return `₦${value.toLocaleString("en-NG")}`;
}
