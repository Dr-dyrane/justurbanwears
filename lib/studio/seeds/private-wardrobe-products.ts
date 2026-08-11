import type {
  Garment,
  GarmentCategory,
  InventoryRecord,
  VisualVariant,
} from "../domain/entities";

const PRIVATE_PRODUCT_CREATED_AT = "2026-08-11T00:00:00.000Z";

export type PendingWardrobeMediaView =
  | "GARMENT_FRONT"
  | "GARMENT_BACK"
  | "MANNEQUIN_UPPER_FRONT"
  | "MANNEQUIN_RIGHT_REAR_THREE_QUARTER"
  | "MODEL_FRONT"
  | "MODEL_LEFT_PROFILE"
  | "MODEL_REAR_THREE_QUARTER"
  | "MODEL_REAR_MIRROR"
  | "MODEL_DETAIL"
  | "FABRIC_DETAIL"
  | "CONSTRUCTION_DETAIL";

export interface PendingWardrobeProductContract {
  readonly sku: `JUW-${string}`;
  readonly legacySkus: readonly string[];
  readonly slug: string;
  readonly approvedViews: readonly PendingWardrobeMediaView[];
  readonly missingViews: readonly PendingWardrobeMediaView[];
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
}

function pendingProduct(spec: PendingWardrobeProductSpec): PendingWardrobeProductContract {
  const garmentId = `wardrobe-private-product-${spec.sku.toLowerCase()}`;
  const readinessViews = [
    ...(spec.approvedViews.includes("GARMENT_FRONT") ? ["FRONT" as const] : []),
    ...(spec.approvedViews.includes("MODEL_DETAIL")
      || spec.approvedViews.includes("FABRIC_DETAIL")
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
      mediaState: "DRAFT",
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
 * Sanitized Studio intake rows. They carry approved customer-facing facts and
 * view labels only; no source locations, hashes, prompts, or identity evidence.
 * A missing public contract keeps each row out of Shop until its captures land.
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
    description: "A teal two-piece pairing a draped long-sleeve crop top with a close mini skirt.",
    note: "Front and Lulu views are ready. Capture the product back and a close construction detail before publishing.",
    visual: "indigo",
    approvedViews: ["GARMENT_FRONT", "MODEL_FRONT", "MODEL_REAR_MIRROR"],
    missingViews: ["GARMENT_BACK", "FABRIC_DETAIL"],
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
    note: "The Lulu side and rear views are ready. Capture the product front, product back and one construction detail before publishing.",
    visual: "umber",
    approvedViews: ["MODEL_LEFT_PROFILE", "MODEL_REAR_THREE_QUARTER"],
    missingViews: ["GARMENT_FRONT", "GARMENT_BACK", "FABRIC_DETAIL"],
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
    note: "The Lulu detail is ready. Capture the full length and product back before publishing.",
    visual: "plum",
    approvedViews: ["MANNEQUIN_UPPER_FRONT", "MODEL_DETAIL"],
    missingViews: ["GARMENT_FRONT", "GARMENT_BACK"],
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
    note: "The upper front, Lulu front and lace construction detail are ready. Capture the full-length product front and product back before publishing.",
    visual: "plum",
    approvedViews: ["MANNEQUIN_UPPER_FRONT", "MODEL_FRONT", "CONSTRUCTION_DETAIL"],
    missingViews: ["GARMENT_FRONT", "GARMENT_BACK"],
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
    note: "The right rear-three-quarter and construction detail are ready. Capture the direct product front and product back before publishing.",
    visual: "umber",
    approvedViews: ["MANNEQUIN_RIGHT_REAR_THREE_QUARTER", "CONSTRUCTION_DETAIL"],
    missingViews: ["GARMENT_FRONT", "GARMENT_BACK"],
  }),
]);

function normalizedSku(value: string) {
  return value.trim().toUpperCase();
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
