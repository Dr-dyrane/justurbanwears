"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { formatNaira, shopCategories, shopModelAnchors } from "../../lib/shop/catalog";
import { resolveApprovedModelTryout } from "../../lib/shop/model-tryout";
import { ShopLink as Link } from "./atoms/shop-link";
import { ProductCard } from "./product-card";
import { ProductVisual } from "./product-visual";
import { useShop } from "./shop-provider";

type Category = (typeof shopCategories)[number];

export function ShopHome() {
  const { products } = useShop();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("All");
  const [availableOnly, setAvailableOnly] = useState(true);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = category === "All" || product.category === category;
      const matchesAvailability = !availableOnly || product.availability === "AVAILABLE";
      const haystack = `${product.name} ${product.category} ${product.colour} ${product.fit}`.toLowerCase();
      return matchesCategory && matchesAvailability && (!needle || haystack.includes(needle));
    });
  }, [availableOnly, category, products, query]);
  const dropProducts = products.filter((product) => product.availability === "AVAILABLE");
  const heroProduct = dropProducts.find((product) => resolveApprovedModelTryout(product.modelTryout))
    ?? dropProducts[0]
    ?? products[0];
  const heroModelView = heroProduct ? resolveApprovedModelTryout(heroProduct.modelTryout) : null;
  const isRefining = query.trim().length > 0 || category !== "All" || !availableOnly;
  const displayedProducts = !isRefining && heroProduct
    ? filtered.filter((product) => product.slug !== heroProduct.slug)
    : filtered;

  return (
    <div className="shop-home">
      <section className="shop-hero" aria-labelledby="shop-hero-title">
        <div className="shop-hero-copy">
          <p className="shop-kicker">Lagos · Drop 01</p>
          <h1 id="shop-hero-title">Clothes with a second first impression.</h1>
          <p className="shop-hero-lede">
            One-off urban womenswear from Lulu’s wardrobe, photographed clearly and ready to shop.
          </p>
          <div className="shop-hero-actions">
            <Link className="shop-action shop-action-primary" href="#discover">Shop Drop 01</Link>
          </div>
        </div>
        {heroProduct ? <Link
          aria-label={`View ${heroProduct.name}`}
          className="shop-hero-stage shop-hero-identity"
          href={`/shop/products/${heroProduct.slug}`}
        >
          {heroModelView ? (
            <div
              aria-label={heroModelView.frame.alt}
              className="shop-product-visual is-photo"
              data-model-anchor={heroModelView.modelAnchorId}
              role="img"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt=""
                aria-hidden="true"
                fetchPriority="high"
                height={heroModelView.frame.height}
                src={heroModelView.frame.src}
                style={{ objectPosition: heroModelView.frame.objectPosition ?? "50% 50%" }}
                width={heroModelView.frame.width}
              />
            </div>
          ) : (
            <ProductVisual product={heroProduct} />
          )}
          <span className="hero-product-caption glass-surface">
            <span>
              <small>Featured piece</small>
              <strong>{heroProduct.name}</strong>
            </span>
            <span className="hero-product-price">{formatNaira(heroProduct.price)}</span>
          </span>
        </Link> : (
          <div className="shop-hero-stage shop-hero-identity">
            <div
              aria-label="Lulu V2 approved public model anchor"
              className="shop-product-visual is-photo"
              data-model-anchor={shopModelAnchors["lulu-v2"].id}
              role="img"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" aria-hidden="true" height={1619} src={shopModelAnchors["lulu-v2"].src} width={972} />
            </div>
            <span className="hero-product-caption glass-surface"><span><small>Drop 01</small><strong>New pieces soon</strong></span></span>
          </div>
        )}
      </section>

      <section className="shop-discovery" id="discover" aria-labelledby="discover-title">
        <div className="shop-section-title">
          <div>
            <p className="shop-kicker">Shop</p>
            <h2 id="discover-title">Drop 01.</h2>
          </div>
        </div>

        <div className="shop-discovery-bar glass-surface">
          <label className="shop-search">
            <Search aria-hidden="true" size={19} strokeWidth={1.75} />
            <span className="sr-only">Search the edit</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search colour, fit, or piece"
              type="search"
              value={query}
            />
          </label>
          <div className="shop-filter-row" aria-label="Filter products">
            {shopCategories.map((item) => (
              <button
                aria-pressed={category === item}
                className={category === item ? "is-active" : undefined}
                key={item}
                onClick={() => setCategory(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
          <button
            aria-pressed={availableOnly}
            className={`availability-filter${availableOnly ? " is-active" : ""}`}
            onClick={() => setAvailableOnly((current) => !current)}
            type="button"
          >
            <span aria-hidden="true" /> Available now
          </button>
        </div>

        <div className={isRefining ? "shop-results-line" : "sr-only"} aria-live="polite" role="status">
          <span>{displayedProducts.length} {displayedProducts.length === 1 ? "result" : "results"}</span>
          <span>
            {query
              ? `Matching “${query}”`
              : availableOnly ? `${category} · Available now` : `${category} · All statuses`}
          </span>
        </div>

        {displayedProducts.length ? (
          <div className="shop-product-grid">
            {displayedProducts.map((product) => (
              <ProductCard
                key={product.slug}
                product={product}
                showModelLink={false}
                showStudyMark={false}
              />
            ))}
          </div>
        ) : (
          <div className="shop-no-results">
            <span aria-hidden="true"><Search size={23} strokeWidth={1.75} /></span>
            <div><h3>No piece matches that combination.</h3></div>
            <button type="button" onClick={() => { setQuery(""); setCategory("All"); setAvailableOnly(true); }}>Reset filters</button>
          </div>
        )}
      </section>

    </div>
  );
}
