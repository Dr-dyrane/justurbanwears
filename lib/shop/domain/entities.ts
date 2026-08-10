export type ShopProductSlug = string;
export type ShopOrderReference = string;
export type NairaAmount = number;

export type ShopAvailability = "AVAILABLE" | "RESERVED" | "SOLD";
export type ProductTone = "coral" | "indigo" | "moss" | "ivory" | "cocoa" | "salmon";
export type ProductSilhouette = "dress" | "shirt" | "knit" | "skirt" | "trouser";
export type ProductMediaPresentation = "garment" | "mannequin" | "model";
export type ProductMediaView = "front" | "back" | "side" | "three-quarter" | "detail";
export type ShopModelAnchorId = "lulu-v2";

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

export interface ShopProduct {
  slug: ShopProductSlug;
  sku: string;
  name: string;
  category: "Dresses" | "Shirts" | "Knitwear" | "Skirts" | "Trousers";
  price: NairaAmount;
  taggedSize: string;
  fit: string;
  condition: string;
  colour: string;
  availability: ShopAvailability;
  drop: string;
  tone: ProductTone;
  silhouette: ProductSilhouette;
  media?: readonly ShopProductMedia[];
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

export type ShopOrderStatus =
  | "ORDER_RECEIVED"
  | "QUALITY_CHECK"
  | "READY_FOR_HANDOFF"
  | "IN_TRANSIT"
  | "DELIVERED";

export interface ShopOrder {
  id: ShopOrderReference;
  itemSlugs: ShopProductSlug[];
  subtotal: NairaAmount;
  deliveryFee: NairaAmount;
  total: NairaAmount;
  deliveryLabel: string;
  deliveryEstimate: string;
  placedAt: string;
  status: ShopOrderStatus;
}
