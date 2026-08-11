export type WardrobePublicMediaSlot =
  | "GARMENT_FRONT"
  | "GARMENT_BACK"
  | "MANNEQUIN_FRONT"
  | "MODEL_FRONT"
  | "MODEL_LEFT_PROFILE"
  | "MODEL_REAR_THREE_QUARTER"
  | "MODEL_REAR_MIRROR"
  | "MODEL_DETAIL"
  | "CONSTRUCTION_DETAIL"
  | "FABRIC_DETAIL";

export type WardrobePublicModelAnchorId = "lulu-v2" | "lulu-v3";

export interface WardrobePublicMedia {
  slot: WardrobePublicMediaSlot;
  src: string;
  modelAnchorId?: WardrobePublicModelAnchorId;
}

export type WardrobePublicModelAnchor =
  | {
      id: "lulu-v2";
      src: "/shop/model/lulu-v2-approved.png";
    }
  | {
      id: "lulu-v3";
      src?: never;
    };

export interface WardrobePublicProduct {
  slug: string;
  sku: string;
  name: string;
  category: "Dresses" | "Sets" | "Shirts" | "Knitwear" | "Skirts" | "Trousers";
  price: number;
  taggedSize: string;
  fit: string;
  condition: string;
  colour: string;
  availability: "AVAILABLE" | "RESERVED" | "SOLD";
  drop: string;
  tone: "coral" | "indigo" | "moss" | "ivory" | "cocoa" | "salmon";
  silhouette: "dress" | "set" | "shirt" | "knit" | "skirt" | "trouser";
  note: string;
  story: string;
  details: string[];
  measurements: Array<{ label: string; value: string }>;
  modelAnchor: WardrobePublicModelAnchor;
  media: WardrobePublicMedia[];
}

export const WARDROBE_PUBLIC_VIEW_SCHEMA_VERSION = 19 as const;

export interface WardrobePublicViewSnapshot {
  products: WardrobePublicProduct[];
  managedSlugs: string[];
}

export interface StoredWardrobePublicView {
  version: typeof WARDROBE_PUBLIC_VIEW_SCHEMA_VERSION;
  data: WardrobePublicProduct[];
  managedSlugs: string[];
}
