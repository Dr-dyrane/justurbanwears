import type { ShopProduct } from "../../lib/shop/catalog";

export function ProductVisual({
  product,
  compact = false,
  showStudyMark = true,
}: {
  product: ShopProduct;
  compact?: boolean;
  showStudyMark?: boolean;
}) {
  const featured = product.media?.[0];

  if (featured) {
    return (
      <div
        aria-label={featured.alt}
        className={`shop-product-visual is-photo${compact ? " is-compact" : ""}`}
        data-silhouette={product.silhouette}
        data-tone={product.tone}
        role="img"
      >
        {/* The labelled wrapper owns the accessible name across card and order contexts. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt=""
          aria-hidden="true"
          fetchPriority={compact ? "auto" : "high"}
          height={featured.height}
          loading={compact ? "lazy" : "eager"}
          src={featured.src}
          style={{ objectPosition: featured.objectPosition ?? "50% 50%" }}
          width={featured.width}
        />
        {showStudyMark ? (
          <span className="product-study-mark" aria-hidden="true">
            <small>justurban wears / GARMENT STUDY</small>
            <span>{product.sku}</span>
          </span>
        ) : null}
      </div>
    );
  }

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
      {showStudyMark ? (
        <span className="product-study-mark" aria-hidden="true">
          <small>justurban wears / GARMENT STUDY</small>
          <span>{product.sku}</span>
        </span>
      ) : null}
    </div>
  );
}
