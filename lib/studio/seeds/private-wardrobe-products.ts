import type {
  Garment,
  GarmentCategory,
  InventoryRecord,
  VisualVariant,
} from "../domain/entities";

const PRIVATE_PRODUCT_CREATED_AT = "2026-08-11T00:00:00.000Z";

export type PendingWardrobeMediaView =
  | "GARMENT_FRONT"
  | "GARMENT_UPPER_FRONT"
  | "GARMENT_BACK"
  | "MANNEQUIN_FRONT"
  | "MANNEQUIN_UPPER_FRONT"
  | "MANNEQUIN_RIGHT_REAR_THREE_QUARTER"
  | "MODEL_FRONT"
  | "MODEL_LEFT_PROFILE"
  | "MODEL_REAR_THREE_QUARTER"
  | "MODEL_REAR_MIRROR"
  | "MODEL_DETAIL"
  | "FABRIC_DETAIL"
  | "CONSTRUCTION_DETAIL";

export interface PendingWardrobePublicMedia {
  readonly view: PendingWardrobeMediaView;
  readonly src: `/shop/products/${string}/${string}.webp`;
  readonly width: number;
  readonly height: number;
}

export interface PendingWardrobeProductContract {
  readonly sku: `JUW-${string}`;
  readonly legacySkus: readonly string[];
  readonly slug: string;
  readonly approvedViews: readonly PendingWardrobeMediaView[];
  readonly missingViews: readonly PendingWardrobeMediaView[];
  readonly publicSafeMedia: readonly PendingWardrobePublicMedia[];
  readonly garment: Garment;
  readonly inventory: InventoryRecord;
}

interface PendingWardrobeProductSpec {
  readonly sku: `JUW-${string}`;
  readonly legacySkus: readonly string[];
  readonly slug: string;
  readonly title: string;
  readonly category: GarmentCategory;
  readonly color: string;
  readonly price: number;
  readonly description: string;
  readonly note: string;
  readonly visual: VisualVariant;
  readonly approvedViews: readonly PendingWardrobeMediaView[];
  readonly missingViews: readonly PendingWardrobeMediaView[];
  readonly publicSafeMedia?: readonly PendingWardrobePublicMedia[];
}

function pendingProduct(spec: PendingWardrobeProductSpec): PendingWardrobeProductContract {
  const garmentId = `wardrobe-private-product-${spec.sku.toLowerCase()}`;
  const readinessViews = [
    ...(spec.approvedViews.includes("GARMENT_FRONT") ? ["FRONT" as const] : []),
    ...(spec.approvedViews.includes("GARMENT_BACK") ? ["BACK" as const] : []),
    ...(spec.approvedViews.includes("FABRIC_DETAIL")
      || spec.approvedViews.includes("CONSTRUCTION_DETAIL")
      ? ["DETAIL" as const]
      : []),
  ];
  return {
    sku: spec.sku,
    legacySkus: spec.legacySkus,
    slug: spec.slug,
    approvedViews: spec.approvedViews,
    missingViews: spec.missingViews,
    publicSafeMedia: spec.publicSafeMedia ?? [],
    garment: {
      id: garmentId,
      sku: spec.sku,
      title: spec.title,
      category: spec.category,
      sizeLabel: "Size on request",
      estimatedFit: "Measurements confirmed before payment",
      color: spec.color,
      price: spec.price,
      condition: "Excellent · real-worn wardrobe piece",
      source: "Operator wardrobe intake",
      notes: spec.note,
      privateNote: "",
      publicDescription: spec.description,
      quantity: 1,
      saleEligible: true,
      measurements: [],
      classificationState: "READY",
      mediaState: spec.missingViews.length ? "DRAFT" : "READY",
      state: "DRAFT",
      availability: "AVAILABLE",
      canonState: "REVIEW",
      visual: spec.visual,
      references: readinessViews.map((view) => ({
        id: `${spec.sku.toLowerCase()}-approved-${view.toLowerCase()}`,
        view,
        quality: 100,
      })),
      createdAt: PRIVATE_PRODUCT_CREATED_AT,
    },
    inventory: {
      id: `wardrobe-private-stock-${spec.sku.toLowerCase()}`,
      garmentId,
      onHand: 1,
      reserved: 0,
      sold: 0,
      returned: 0,
      writeOff: 0,
      state: "DRAFT",
      updatedAt: PRIVATE_PRODUCT_CREATED_AT,
    },
  };
}

/**
 * Sanitized Studio intake rows. Media may reference only fixed public product
 * paths that have passed the packaging gate; private source locations, hashes,
 * prompts, and identity evidence never enter this contract. A missing public
 * listing contract keeps each row out of Shop until its captures land.
 */
export const PENDING_WARDROBE_PRODUCT_CONTRACTS: readonly PendingWardrobeProductContract[] = Object.freeze([
  pendingProduct({
    sku: "JUW-013",
    legacySkus: ["DYN-093"],
    slug: "teal-draped-mini-set",
    title: "Teal Draped Mini Set",
    category: "Set",
    color: "Teal",
    price: 24500,
    description: "A teal two-piece set.",
    note: "A draped top paired with a close mini skirt.",
    visual: "indigo",
    approvedViews: [
      "GARMENT_FRONT",
      "GARMENT_BACK",
      "MANNEQUIN_FRONT",
      "MODEL_FRONT",
      "FABRIC_DETAIL",
      "MODEL_REAR_MIRROR",
    ],
    missingViews: [],
    publicSafeMedia: [
      {
        view: "GARMENT_FRONT",
        src: "/shop/products/teal-draped-mini-set/01-garment-front.webp",
        width: 1122,
        height: 1402,
      },
      {
        view: "GARMENT_BACK",
        src: "/shop/products/teal-draped-mini-set/02-garment-back.webp",
        width: 1122,
        height: 1402,
      },
      {
        view: "MANNEQUIN_FRONT",
        src: "/shop/products/teal-draped-mini-set/03-mannequin-front.webp",
        width: 1122,
        height: 1402,
      },
      {
        view: "MODEL_FRONT",
        src: "/shop/products/teal-draped-mini-set/04-model-front.webp",
        width: 972,
        height: 1619,
      },
      {
        view: "FABRIC_DETAIL",
        src: "/shop/products/teal-draped-mini-set/06-fabric-detail.webp",
        width: 1122,
        height: 1402,
      },
      {
        view: "MODEL_REAR_MIRROR",
        src: "/shop/products/teal-draped-mini-set/09-model-rear-mirror.webp",
        width: 972,
        height: 1619,
      },
    ],
  }),
  pendingProduct({
    sku: "JUW-015",
    legacySkus: ["DYN-095"],
    slug: "cocoa-cowl-gathered-midi-dress",
    title: "Cocoa Cowl Gathered Midi Dress",
    category: "Dress",
    color: "Cocoa taupe",
    price: 24500,
    description: "A cocoa-taupe midi dress with a softly draped cowl front and gathered waist.",
    note: "A quiet cocoa stretch line softened by a draped neckline and subtle right-waist gathering.",
    visual: "umber",
    approvedViews: [
      "GARMENT_FRONT",
      "GARMENT_BACK",
      "MANNEQUIN_FRONT",
      "FABRIC_DETAIL",
      "MODEL_LEFT_PROFILE",
      "MODEL_REAR_THREE_QUARTER",
    ],
    missingViews: [],
    publicSafeMedia: [
      {
        view: "GARMENT_FRONT",
        src: "/shop/products/cocoa-cowl-gathered-midi-dress/01-garment-front.webp",
        width: 1122,
        height: 1402,
      },
      {
        view: "GARMENT_BACK",
        src: "/shop/products/cocoa-cowl-gathered-midi-dress/02-garment-back.webp",
        width: 1122,
        height: 1402,
      },
      {
        view: "MANNEQUIN_FRONT",
        src: "/shop/products/cocoa-cowl-gathered-midi-dress/03-mannequin-front.webp",
        width: 1122,
        height: 1402,
      },
      {
        view: "FABRIC_DETAIL",
        src: "/shop/products/cocoa-cowl-gathered-midi-dress/06-fabric-detail.webp",
        width: 1122,
        height: 1402,
      },
      {
        view: "MODEL_LEFT_PROFILE",
        src: "/shop/products/cocoa-cowl-gathered-midi-dress/07-model-left-profile.webp",
        width: 972,
        height: 1728,
      },
      {
        view: "MODEL_REAR_THREE_QUARTER",
        src: "/shop/products/cocoa-cowl-gathered-midi-dress/05-model-rear-three-quarter.webp",
        width: 972,
        height: 1728,
      },
    ],
  }),
  pendingProduct({
    sku: "JUW-017",
    legacySkus: ["DYN-097"],
    slug: "white-tailored-vest-mini-set",
    title: "White Tailored Vest Mini Set",
    category: "Set",
    color: "White",
    price: 24500,
    description: "A white two-piece pairing a fitted collared top with a matching mini bottom.",
    note: "The product upper front and Lulu front are ready. Capture the complete product front, product back and one construction detail before publishing.",
    visual: "chalk",
    approvedViews: ["GARMENT_UPPER_FRONT", "MODEL_FRONT"],
    missingViews: ["GARMENT_FRONT", "GARMENT_BACK", "FABRIC_DETAIL"],
    publicSafeMedia: [
      {
        view: "GARMENT_UPPER_FRONT",
        src: "/shop/products/white-tailored-vest-mini-set/01-garment-upper-front.webp",
        width: 1086,
        height: 1448,
      },
      {
        view: "MODEL_FRONT",
        src: "/shop/products/white-tailored-vest-mini-set/04-model-front.webp",
        width: 1122,
        height: 1402,
      },
    ],
  }),
  pendingProduct({
    sku: "JUW-018",
    legacySkus: ["DYN-098"],
    slug: "plum-ruched-sleeve-fitted-dress",
    title: "Plum Ruched-Sleeve Fitted Dress",
    category: "Dress",
    color: "Plum",
    price: 22000,
    description: "A fitted plum dress with a high round neckline and ruched drawstring sleeves.",
    note: "The upper-front mannequin view and Lulu detail are ready. Capture the full length, product back and one fabric detail before publishing.",
    visual: "plum",
    approvedViews: ["MANNEQUIN_UPPER_FRONT", "MODEL_DETAIL"],
    missingViews: ["GARMENT_FRONT", "GARMENT_BACK", "FABRIC_DETAIL"],
    publicSafeMedia: [
      {
        view: "MANNEQUIN_UPPER_FRONT",
        src: "/shop/products/plum-ruched-sleeve-fitted-dress/03-mannequin-upper-front.webp",
        width: 1122,
        height: 1402,
      },
      {
        view: "MODEL_DETAIL",
        src: "/shop/products/plum-ruched-sleeve-fitted-dress/08-model-detail.webp",
        width: 1122,
        height: 1402,
      },
    ],
  }),
  pendingProduct({
    sku: "JUW-019",
    legacySkus: ["DYN-099"],
    slug: "black-floral-lace-long-sleeve-dress",
    title: "Black Floral-Lace Long-Sleeve Fitted Dress",
    category: "Dress",
    color: "Black",
    price: 24500,
    description: "A fitted black floral-lace dress with a high round neckline, lined bodice, sheer long sleeves and flared cuffs.",
    note: "The upper-front mannequin, Lulu front and rear-three-quarter, and cuff construction views are ready. Capture the direct product front and back before publishing.",
    visual: "plum",
    approvedViews: [
      "MANNEQUIN_UPPER_FRONT",
      "MODEL_FRONT",
      "MODEL_REAR_THREE_QUARTER",
      "CONSTRUCTION_DETAIL",
    ],
    missingViews: ["GARMENT_FRONT", "GARMENT_BACK"],
    publicSafeMedia: [
      {
        view: "MANNEQUIN_UPPER_FRONT",
        src: "/shop/products/black-floral-lace-long-sleeve-dress/03-mannequin-upper-front.webp",
        width: 1024,
        height: 1536,
      },
      {
        view: "MODEL_FRONT",
        src: "/shop/products/black-floral-lace-long-sleeve-dress/04-model-front.webp",
        width: 972,
        height: 1619,
      },
      {
        view: "MODEL_REAR_THREE_QUARTER",
        src: "/shop/products/black-floral-lace-long-sleeve-dress/05-model-rear-three-quarter.webp",
        width: 972,
        height: 1619,
      },
      {
        view: "CONSTRUCTION_DETAIL",
        src: "/shop/products/black-floral-lace-long-sleeve-dress/08-construction-detail.webp",
        width: 1024,
        height: 1536,
      },
    ],
  }),
  pendingProduct({
    sku: "JUW-020",
    legacySkus: ["DYN-100"],
    slug: "coral-gathered-crop-mini-set",
    title: "Coral Gathered Crop-Top and Mini-Skirt Set",
    category: "Set",
    color: "Coral",
    price: 24500,
    description: "A coral two-piece pairing a gathered crop top with a close mini skirt.",
    note: "The complete product set and Lulu rear-three-quarter view are ready for the catalogue.",
    visual: "umber",
    approvedViews: [
      "GARMENT_FRONT",
      "GARMENT_BACK",
      "MANNEQUIN_FRONT",
      "CONSTRUCTION_DETAIL",
      "MODEL_REAR_THREE_QUARTER",
    ],
    missingViews: [],
    publicSafeMedia: [
      {
        view: "GARMENT_FRONT",
        src: "/shop/products/coral-gathered-crop-mini-set/01-garment-front.webp",
        width: 1122,
        height: 1402,
      },
      {
        view: "GARMENT_BACK",
        src: "/shop/products/coral-gathered-crop-mini-set/02-garment-back.webp",
        width: 1122,
        height: 1402,
      },
      {
        view: "MANNEQUIN_FRONT",
        src: "/shop/products/coral-gathered-crop-mini-set/03-mannequin-front.webp",
        width: 1122,
        height: 1402,
      },
      {
        view: "CONSTRUCTION_DETAIL",
        src: "/shop/products/coral-gathered-crop-mini-set/08-construction-detail.webp",
        width: 1122,
        height: 1402,
      },
      {
        view: "MODEL_REAR_THREE_QUARTER",
        src: "/shop/products/coral-gathered-crop-mini-set/05-model-rear-three-quarter.webp",
        width: 1122,
        height: 1402,
      },
    ],
  }),
  pendingProduct({
    sku: "JUW-021",
    legacySkus: ["DYN-101"],
    slug: "cropped-denim-jacket-black-legging-look",
    title: "Cropped Denim Jacket and Black Legging Look",
    category: "Set",
    color: "Blue and black",
    price: 24500,
    description: "A casual two-piece look pairing a cropped blue denim jacket with black leggings.",
    note: "The complete product set and authentic Lulu rear-mirror view are ready for the catalogue.",
    visual: "indigo",
    approvedViews: [
      "GARMENT_FRONT",
      "GARMENT_BACK",
      "MANNEQUIN_FRONT",
      "FABRIC_DETAIL",
      "MODEL_REAR_MIRROR",
    ],
    missingViews: [],
    publicSafeMedia: [
      {
        view: "GARMENT_FRONT",
        src: "/shop/products/cropped-denim-jacket-black-legging-look/01-garment-front.webp",
        width: 1122,
        height: 1402,
      },
      {
        view: "GARMENT_BACK",
        src: "/shop/products/cropped-denim-jacket-black-legging-look/02-garment-back.webp",
        width: 1122,
        height: 1402,
      },
      {
        view: "MANNEQUIN_FRONT",
        src: "/shop/products/cropped-denim-jacket-black-legging-look/03-mannequin-front.webp",
        width: 1122,
        height: 1402,
      },
      {
        view: "FABRIC_DETAIL",
        src: "/shop/products/cropped-denim-jacket-black-legging-look/06-fabric-detail.webp",
        width: 1122,
        height: 1402,
      },
      {
        view: "MODEL_REAR_MIRROR",
        src: "/shop/products/cropped-denim-jacket-black-legging-look/09-model-rear-mirror.webp",
        width: 1122,
        height: 1402,
      },
    ],
  }),
  pendingProduct({
    sku: "JUW-022",
    legacySkus: ["DYN-102"],
    slug: "hot-pink-strapless-dress",
    title: "Hot-Pink Strapless Gathered Dress",
    category: "Dress",
    color: "Hot pink",
    price: 24500,
    description: "A hot-pink strapless dress with a softly gathered upper bodice.",
    note: "The Lulu bodice detail is ready. Capture the full-length product front, product back and one fabric detail before publishing.",
    visual: "plum",
    approvedViews: ["MODEL_DETAIL"],
    missingViews: ["GARMENT_FRONT", "GARMENT_BACK", "FABRIC_DETAIL"],
    publicSafeMedia: [
      {
        view: "MODEL_DETAIL",
        src: "/shop/products/hot-pink-strapless-dress/08-model-detail.webp",
        width: 972,
        height: 1619,
      },
    ],
  }),
  pendingProduct({
    sku: "JUW-023",
    legacySkus: ["DYN-103"],
    slug: "pale-blue-uniform-top",
    title: "Pale-Blue V-Neck Uniform Top",
    category: "Shirt",
    color: "Pale blue",
    price: 16500,
    description: "A pale-blue V-neck uniform top.",
    note: "Capture the direct product front, product back and one fabric detail before publishing.",
    visual: "chalk",
    approvedViews: [],
    missingViews: ["GARMENT_FRONT", "GARMENT_BACK", "FABRIC_DETAIL"],
  }),
  pendingProduct({
    sku: "JUW-024",
    legacySkus: ["DYN-104"],
    slug: "pale-bandeau-car-look",
    title: "Pale Gathered Bandeau Top",
    category: "Shirt",
    color: "Pale tone · exact colour to confirm",
    price: 16500,
    description: "A gathered strapless bandeau top.",
    note: "The product upper-front and Lulu upper-front detail are ready. Capture the full product front, product back and one fabric detail before publishing; confirm the exact colour at intake.",
    visual: "ivory",
    approvedViews: ["GARMENT_UPPER_FRONT", "MODEL_DETAIL"],
    missingViews: ["GARMENT_FRONT", "GARMENT_BACK", "FABRIC_DETAIL"],
    publicSafeMedia: [
      {
        view: "GARMENT_UPPER_FRONT",
        src: "/shop/products/pale-bandeau-car-look/01-garment-upper-front.webp",
        width: 1023,
        height: 1537,
      },
      {
        view: "MODEL_DETAIL",
        src: "/shop/products/pale-bandeau-car-look/08-model-detail.webp",
        width: 972,
        height: 1619,
      },
    ],
  }),
]);

function normalizedSku(value: string) {
  return value.trim().toUpperCase();
}

export function pendingWardrobeMediaLabel(view: PendingWardrobeMediaView) {
  const labels: Record<PendingWardrobeMediaView, string> = {
    GARMENT_FRONT: "Product front",
    GARMENT_UPPER_FRONT: "Product upper front",
    GARMENT_BACK: "Product back",
    MANNEQUIN_FRONT: "Mannequin front",
    MANNEQUIN_UPPER_FRONT: "Upper front",
    MANNEQUIN_RIGHT_REAR_THREE_QUARTER: "Right rear view",
    MODEL_FRONT: "On Lulu · front",
    MODEL_LEFT_PROFILE: "On Lulu · left profile",
    MODEL_REAR_THREE_QUARTER: "On Lulu · rear three-quarter",
    MODEL_REAR_MIRROR: "On Lulu · rear mirror",
    MODEL_DETAIL: "On Lulu · detail",
    FABRIC_DETAIL: "Fabric detail",
    CONSTRUCTION_DETAIL: "Construction detail",
  };
  return labels[view];
}

export function getPendingWardrobeProductContract(sku: string) {
  const normalized = normalizedSku(sku);
  return PENDING_WARDROBE_PRODUCT_CONTRACTS.find((contract) =>
    normalizedSku(contract.sku) === normalized
    || contract.legacySkus.includes(normalized),
  );
}

function cloneGarment(garment: Garment): Garment {
  return {
    ...garment,
    measurements: garment.measurements.map((measurement) => ({ ...measurement })),
    references: garment.references.map((reference) => ({ ...reference })),
  };
}

function cloneInventory(inventory: InventoryRecord, garmentId: string): InventoryRecord {
  return { ...inventory, garmentId };
}

/** Add missing private rows without creating a listing or public projection. */
export function mergePendingWardrobeProducts(
  currentGarments: readonly Garment[],
  currentInventory: readonly InventoryRecord[],
) {
  const garments = [...currentGarments];
  const inventory = [...currentInventory];

  for (const contract of PENDING_WARDROBE_PRODUCT_CONTRACTS) {
    const existingIndex = garments.findIndex((garment) =>
      garment.id === contract.garment.id
      || normalizedSku(garment.sku) === normalizedSku(contract.sku)
      || contract.legacySkus.includes(normalizedSku(garment.sku)),
    );
    const garmentId = existingIndex === -1
      ? contract.garment.id
      : garments[existingIndex].id;

    if (existingIndex === -1) {
      garments.push(cloneGarment(contract.garment));
    } else if (contract.legacySkus.includes(normalizedSku(garments[existingIndex].sku))) {
      garments[existingIndex] = { ...garments[existingIndex], sku: contract.sku };
    }

    if (!inventory.some((record) => record.garmentId === garmentId)) {
      inventory.push(cloneInventory(contract.inventory, garmentId));
    }
  }

  return { garments, inventory };
}
