import type { ShopProduct } from "../../lib/shop/catalog";

export function ProductVisual({
  product,
  compact = false,
}: {
  product: ShopProduct;
  compact?: boolean;
}) {
  return (
    <div
      aria-label={`${product.name}. Stylized garment study.`}
      className={`shop-product-visual${compact ? " is-compact" : ""}`}
      data-silhouette={product.silhouette}
      data-tone={product.tone}
      role="img"
    >
      <span className="product-haze" aria-hidden="true" />
      <span className="product-floor" aria-hidden="true" />
      <span className="product-object" aria-hidden="true">
        <span className="product-neck" />
        <span className="product-form" />
        <span className="product-fold product-fold-one" />
        <span className="product-fold product-fold-two" />
      </span>
      <span className="product-study-mark" aria-hidden="true">
        <small>justurban wears / GARMENT STUDY</small>
        <span>{product.sku}</span>
      </span>
    </div>
  );
}
