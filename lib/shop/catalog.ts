import { createShopProductMigrationSeeds } from "./wardrobe-public-view";

export type {
  ProductSilhouette,
  ProductMediaPresentation,
  ProductMediaView,
  ProductTone,
  ShopProductMedia,
  ShopModelTryout,
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

/**
 * Compatibility migration rows only. Mounted Shop routes consume the
 * versioned wardrobe public view exposed by ShopProvider.
 */
export const shopProducts = createShopProductMigrationSeeds();

/** Compatibility resolver for legacy state parsers and static tests. */
export function getShopProduct(slug: string) {
  return shopProducts.find((product) => product.slug === slug);
}

export const shopCategories = [
  "All",
  "Dresses",
  "Shirts",
  "Knitwear",
  "Skirts",
  "Trousers",
] as const;

export function formatNaira(value: number) {
  return `₦${value.toLocaleString("en-NG")}`;
}
