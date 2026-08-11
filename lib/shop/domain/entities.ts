export type ShopProductSlug = string;
export type ShopOrderReference = string;
export type NairaAmount = number;

export type ShopAvailability = "AVAILABLE" | "RESERVED" | "SOLD";
export type ProductTone = "coral" | "indigo" | "moss" | "ivory" | "cocoa" | "salmon";
export type ProductSilhouette = "dress" | "set" | "shirt" | "knit" | "skirt" | "trouser";
export type ProductMediaPresentation = "garment" | "mannequin" | "model";
export type ProductMediaView = "front" | "back" | "side" | "three-quarter" | "rear-mirror" | "detail";
export type ShopModelAnchorId = "lulu-v2" | "lulu-v3";

export interface ShopProductMedia {
  id: string;
  src: string;
  alt: string;
  label: string;
  presentation: ProductMediaPresentation;
  view: ProductMediaView;
  width: number;
  height: number;
  objectPosition?: string;
  modelAnchorId?: ShopModelAnchorId;
}

export interface ShopApprovedModelMedia extends ShopProductMedia {
  presentation: "model";
  view: "front";
  modelAnchorId: ShopModelAnchorId;
}

export type ShopModelTryout =
  | { modelStatus: "PENDING" }
  | {
      modelStatus: "APPROVED";
      modelAnchorId: ShopModelAnchorId;
      frame: ShopApprovedModelMedia;
    };

export interface ShopProduct {
  slug: ShopProductSlug;
  sku: string;
  name: string;
  category: "Dresses" | "Sets" | "Shirts" | "Knitwear" | "Skirts" | "Trousers";
  price: NairaAmount;
  taggedSize: string;
  fit: string;
  condition: string;
  colour: string;
  availability: ShopAvailability;
  /** False only when the server catalogue could not confirm current stock. */
  availabilityConfirmed: boolean;
  drop: string;
  tone: ProductTone;
  silhouette: ProductSilhouette;
  media?: readonly ShopProductMedia[];
  modelTryout: ShopModelTryout;
  note: string;
  story: string;
  details: string[];
  measurements: Array<{ label: string; value: string }>;
}

export interface BagItem {
  slug: ShopProductSlug;
  size: string;
}

export const shopNotificationPreferences = ["delivery", "saved", "drops"] as const;
export type ShopNotificationPreference = (typeof shopNotificationPreferences)[number];
export type ShopNotificationPreferences = Record<ShopNotificationPreference, boolean>;

export type ShopDeliveryId = "lagos" | "pickup" | "nationwide";

export interface ShopDeliveryOption {
  id: ShopDeliveryId;
  label: string;
  note: string;
  fee: NairaAmount;
  estimate: string;
}

export interface ShopCheckoutContact {
  name: string;
  email: string;
  phone: string;
}

export interface ShopDeliveryAddress {
  street: string;
  area: string;
  state: string;
  country: "Nigeria";
}

export type ShopCheckoutFulfillment =
  | {
      kind: "DELIVERY";
      optionId: Exclude<ShopDeliveryId, "pickup">;
      address: ShopDeliveryAddress;
    }
  | {
      kind: "PICKUP";
      optionId: "pickup";
    };

export interface ShopCheckoutRequest {
  contact: ShopCheckoutContact;
  fulfillment: ShopCheckoutFulfillment;
}

export type ShopOrderLine =
  | {
      snapshot: "PRODUCT";
      slug: ShopProductSlug;
      sku: string;
      name: string;
      taggedSize: string;
      unitPrice: NairaAmount;
      quantity: 1;
      imageSrc?: string;
      imageAlt?: string;
    }
  | {
      snapshot: "LEGACY";
      slug: ShopProductSlug;
      quantity: 1;
    };

export type ShopOrderFulfillment =
  | ShopCheckoutFulfillment
  | {
      kind: "LEGACY";
      optionId: null;
    };

export type ShopOrderTransmission = "LOCAL_ONLY" | "SUBMITTED";

export type ShopOrderStatus =
  | "PAYMENT_REQUIRED"
  | "ORDER_RECEIVED"
  | "QUALITY_CHECK"
  | "READY_FOR_HANDOFF"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "CANCELLED";

export interface ShopOrder {
  id: ShopOrderReference;
  lines: ShopOrderLine[];
  contact: ShopCheckoutContact | null;
  fulfillment: ShopOrderFulfillment;
  subtotal: NairaAmount;
  deliveryFee: NairaAmount;
  total: NairaAmount;
  deliveryLabel: string;
  deliveryEstimate: string;
  savedAt: string;
  status: ShopOrderStatus;
  transmission: ShopOrderTransmission;
}

export type ShopCheckoutFailureReason =
  | "EMPTY_BAG"
  | "BAG_CHANGED"
  | "AVAILABILITY_UNCONFIRMED"
  | "INVALID_CHECKOUT"
  | "IN_PROGRESS"
  | "PERSISTENCE_FAILED";

export type ShopCheckoutCreationResult =
  | { ok: true; order: ShopOrder }
  | { ok: false; reason: Exclude<ShopCheckoutFailureReason, "IN_PROGRESS" | "PERSISTENCE_FAILED"> };

export type ShopCheckoutSaveResult =
  | { ok: true; orderId: ShopOrderReference }
  | { ok: false; reason: ShopCheckoutFailureReason };

export interface ShopCheckoutSubmissionIntent {
  version: 1;
  idempotencyKey: string;
  lines: Array<{
    slug: ShopProductSlug;
    taggedSize: string;
    quantity: 1;
  }>;
  contact: ShopCheckoutContact;
  fulfillment: ShopCheckoutFulfillment;
}

export type ShopSubmittedOrder = Omit<ShopOrder, "transmission"> & {
  transmission: "SUBMITTED";
};

export type ShopCheckoutSubmissionResult =
  | { ok: true; order: ShopSubmittedOrder }
  | { ok: false; reason: "UNAVAILABLE" | "UNAUTHENTICATED" | "REJECTED" };

export type ShopCheckoutAvailabilityConfirmation =
  | "CONFIRMED"
  | "CHANGED"
  | "UNAVAILABLE";
