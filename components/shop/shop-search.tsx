"use client";

import { Search, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { shopProducts } from "../../lib/shop/catalog";
import { ProductCard } from "./product-card";
import {
  defaultShopFilters,
  ShopFilterControls,
  ShopFilterSheet,
  type ShopFilterValues,
} from "./shop-filter-sheet";

export function ShopSearch() {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ShopFilterValues>(defaultShopFilters);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = shopProducts.filter((product) => {
      const searchable = [
        product.name,
        product.category,
        product.colour,
        product.fit,
        product.note,
        product.condition,
      ].join(" ").toLowerCase();

      return (!needle || searchable.includes(needle))
        && (filters.category === "All" || product.category === filters.category)
        && (filters.size === "All" || product.taggedSize === filters.size)
        && (filters.colour === "All" || product.colour === filters.colour)
        && (filters.availability === "ALL" || product.availability === filters.availability)
        && product.price <= filters.maximumPrice;
    });

    return [...matches].sort((left, right) => {
      if (filters.sort === "price-low") return left.price - right.price;
      if (filters.sort === "price-high") return right.price - left.price;
      return shopProducts.indexOf(left) - shopProducts.indexOf(right);
    });
  }, [filters, query]);

  const activeFilterCount = [
    filters.category !== defaultShopFilters.category,
    filters.size !== defaultShopFilters.size,
    filters.colour !== defaultShopFilters.colour,
    filters.availability !== defaultShopFilters.availability,
    filters.maximumPrice !== defaultShopFilters.maximumPrice,
    filters.sort !== defaultShopFilters.sort,
  ].filter(Boolean).length;
  const hasFilters = Boolean(query.trim()) || activeFilterCount > 0;

  function resetFilters() {
    setQuery("");
    setFilters(defaultShopFilters);
  }

  return (
    <div className="shop-list-page shop-search-page">
      <header className="shop-list-heading shop-search-heading">
        <p className="shop-kicker">Search the whole rail</p>
        <h1>Find the shape you have in mind.</h1>
      </header>

      <div className="shop-mobile-search-tools">
        <label className="shop-search-input">
          <span className="sr-only">Search the whole rail</span>
          <Search aria-hidden="true" size={18} strokeWidth={1.75} />
          <input
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the edit"
            type="search"
            value={query}
          />
        </label>
        <ShopFilterSheet
          activeCount={activeFilterCount}
          onApply={setFilters}
          values={filters}
        />
      </div>

      <section className="shop-search-workspace" aria-label="Search and refine products">
        <div className="shop-search-panel shop-desktop-search-panel glass-surface">
          <label className="shop-search-field">
            <span>Search</span>
            <span className="shop-search-input">
              <Search aria-hidden="true" size={18} strokeWidth={1.75} />
              <input
                autoComplete="off"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Try ‘coral’, ‘oversized’, or ‘trouser’"
                type="search"
                value={query}
              />
            </span>
          </label>
          <ShopFilterControls onChange={setFilters} values={filters} />
        </div>

        <div className="shop-search-results">
          <div className="shop-results-heading">
            <div aria-atomic="true" aria-live="polite" role="status">
              <p className="shop-kicker">Current results</p>
              <h2>{filtered.length} {filtered.length === 1 ? "piece" : "pieces"}</h2>
            </div>
            {hasFilters ? <button onClick={resetFilters} type="button">Clear filters</button> : <span>Complete edit</span>}
          </div>

          {filtered.length ? (
            <div className="shop-product-grid shop-search-grid">
              {filtered.map((product) => <ProductCard key={product.slug} product={product} />)}
            </div>
          ) : (
            <div className="shop-route-empty shop-search-empty">
              <span aria-hidden="true"><SearchX size={34} strokeWidth={1.65} /></span>
              <h2>No match in this edit.</h2>
              <button className="shop-action shop-action-primary" onClick={resetFilters} type="button">Reset search</button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
