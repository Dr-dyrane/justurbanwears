"use client";

import { formatNaira } from "../../lib/shop/catalog";
import { WARDROBE_DROP_01_PRODUCTS } from "../../lib/wardrobe-public-view/drop-01";
import { ShopLink as Link } from "./atoms/shop-link";
import { ProductVisual } from "./product-visual";
import { useShop } from "./shop-provider";

export function WardrobePreview() {
  const { products } = useShop();
  const wardrobeDressSlugs = new Set<string>(WARDROBE_DROP_01_PRODUCTS.map((product) => product.slug));
  const drop = products.filter((product) => wardrobeDressSlugs.has(product.slug));

  if (!drop.length) return null;

  return (
    <section className="shop-wardrobe-preview" aria-labelledby="wardrobe-preview-title">
      <header className="shop-wardrobe-preview-header">
        <div>
          <p className="shop-kicker">Drop 01 · Available now</p>
          <h2 id="wardrobe-preview-title">Six dresses from Lulu’s wardrobe.</h2>
        </div>
        <p>Real-worn pieces, photographed across the full product study and released one of each.</p>
      </header>

      <ol className="shop-wardrobe-preview-list">
        {drop.map((product, index) => (
          <li key={product.slug}>
            <figure>
              <Link
                aria-label={`View ${product.name}`}
                className="shop-wardrobe-preview-frame"
                href={`/shop/products/${product.slug}`}
              >
                <ProductVisual compact product={product} />
              </Link>
              <figcaption>
                <span className="shop-wardrobe-preview-state">
                  <i aria-hidden="true" />
                  Available now
                </span>
                <span className="shop-wardrobe-preview-index">
                  {formatNaira(product.price)} · {String(index + 1).padStart(2, "0")}
                </span>
                <h3><Link href={`/shop/products/${product.slug}`}>{product.name}</Link></h3>
              </figcaption>
            </figure>
          </li>
        ))}
      </ol>
    </section>
  );
}
