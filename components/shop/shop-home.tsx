"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { formatNaira, shopModelAnchors } from "../../lib/shop/catalog";
import { resolveApprovedModelTryout } from "../../lib/shop/model-tryout";
import { ShopLink as Link } from "./atoms/shop-link";
import { ProductCard } from "./product-card";
import { ProductVisual } from "./product-visual";
import {
  countActiveShopFilters,
  defaultShopFilters,
  ShopFilterSheet,
  type ShopFilterValues,
} from "./shop-filter-sheet";
import { useShop } from "./shop-provider";

const homeShopFilters: ShopFilterValues = {
  ...defaultShopFilters,
  availability: "AVAILABLE",
};

export function ShopHome() {
  const { products } = useShop();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ShopFilterValues>(homeShopFilters);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = products.filter((product) => {
      const haystack = `${product.name} ${product.category} ${product.colour} ${product.fit}`.toLowerCase();
      return (!needle || haystack.includes(needle))
        && (filters.category === "All" || product.category === filters.category)
        && (filters.size === "All" || product.taggedSize === filters.size)
        && (filters.colour === "All" || product.colour === filters.colour)
        && (filters.availability === "ALL" || product.availability === filters.availability)
        && (filters.maximumPrice === null || product.price <= filters.maximumPrice);
    });

    return [...matches].sort((left, right) => {
      if (filters.sort === "price-low") return left.price - right.price;
      if (filters.sort === "price-high") return right.price - left.price;
      return products.indexOf(left) - products.indexOf(right);
    });
  }, [filters, products, query]);
  const dropProducts = products.filter((product) => product.availability === "AVAILABLE");
  const heroProduct = dropProducts.find((product) => resolveApprovedModelTryout(product.modelTryout))
    ?? dropProducts[0]
    ?? products[0];
  const heroModelView = heroProduct ? resolveApprovedModelTryout(heroProduct.modelTryout) : null;
  const liveAvailabilityConfirmed = products.length > 0
    && products.every((product) => product.availabilityConfirmed);
  const activeFilterCount = countActiveShopFilters(filters, homeShopFilters);
  const isRefining = query.trim().length > 0 || activeFilterCount > 0;
  const displayedProducts = !isRefining && heroProduct
    ? filtered.filter((product) => product.slug !== heroProduct.slug)
    : filtered;

  return (
    <div className="shop-home">
      <section
        aria-labelledby="shop-hero-title"
        className="shop-hero shop-hero-editorial"
        data-legacy-copy="Clothes with a second first impression."
      >
        <Link
          className={`shop-editorial-cover${heroProduct ? "" : " is-empty"}`}
          href={heroProduct ? `/shop/products/${heroProduct.slug}` : "#discover"}
        >
          <div
            className="shop-editorial-cover-media"
            data-product-transition={heroProduct?.slug}
          >
            {heroProduct ? (
              heroModelView ? (
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
                    width={heroModelView.frame.width}
                  />
                </div>
              ) : (
                <ProductVisual product={heroProduct} />
              )
            ) : (
              <div
                aria-label="Lulu V2 approved public model anchor"
                className="shop-product-visual is-photo"
                data-model-anchor={shopModelAnchors["lulu-v2"].id}
                role="img"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt=""
                  aria-hidden="true"
                  height={1619}
                  src={shopModelAnchors["lulu-v2"].src}
                  width={972}
                />
              </div>
            )}
          </div>

          <span aria-hidden="true" className="shop-editorial-cover-veil" />
          <span aria-hidden="true" className="shop-editorial-cover-wordmark">JUW</span>
          <span aria-hidden="true" className="shop-editorial-cover-folio">Drop 01 / Lagos</span>

          <div className="shop-editorial-cover-copy">
            <p className="shop-editorial-cover-kicker">Just Urban Wears · Issue 01</p>
            <h1 id="shop-hero-title">
              <span>Define</span>
              <em>urban.</em>
            </h1>
            <p className="shop-editorial-cover-lede">One-off womenswear from Lulu’s wardrobe.</p>
            <span className="shop-editorial-cover-action">
              Shop the edit <span aria-hidden="true">↗</span>
            </span>
          </div>

          <span className="shop-editorial-cover-caption">
            <span>
              <small>{heroModelView ? "On Lulu" : "Wardrobe"}</small>
              <strong>{heroProduct?.name ?? "New pieces soon"}</strong>
            </span>
            {heroProduct ? <b>{formatNaira(heroProduct.price)}</b> : null}
          </span>
        </Link>
      </section>

      <section className="shop-discovery" id="discover" aria-labelledby="discover-title">
        <div className="shop-section-title">
          <div>
            <p className="shop-kicker">{liveAvailabilityConfirmed ? "Available now" : "Browse the edit"}</p>
            <h2 id="discover-title">The wardrobe.</h2>
          </div>
          {!liveAvailabilityConfirmed ? (
            <p className="shop-catalogue-notice" role="status">
              Live availability is temporarily unavailable. Browsing remains open; checkout stays paused.
            </p>
          ) : null}
        </div>

        <div className="shop-discovery-bar glass-surface">
          <label className="shop-search">
            <Search aria-hidden="true" size={19} strokeWidth={1.75} />
            <span className="sr-only">Search the wardrobe</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search colour, fit, or piece"
              type="search"
              value={query}
            />
          </label>
          <ShopFilterSheet
            activeCount={activeFilterCount}
            onApply={setFilters}
            products={products}
            resetValues={homeShopFilters}
            values={filters}
          />
        </div>

        <div className={isRefining ? "shop-results-line" : "sr-only"} aria-live="polite" role="status">
          <span>{displayedProducts.length} {displayedProducts.length === 1 ? "result" : "results"}</span>
          <span>
            {query
              ? `Matching “${query}”`
              : liveAvailabilityConfirmed
                ? `${filters.category} · ${filters.availability === "ALL" ? "All statuses" : filters.availability.toLowerCase()}`
                : `${filters.category} · Live availability paused`}
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
            <button type="button" onClick={() => { setQuery(""); setFilters(homeShopFilters); }}>Reset filters</button>
          </div>
        )}
      </section>

    </div>
  );
}
