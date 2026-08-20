export const CURRENT_SHOP_DROP = "Drop 02" as const;

export function isCurrentShopProduct(product: { drop: string }): boolean {
  return product.drop === CURRENT_SHOP_DROP;
}
