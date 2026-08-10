"use client";

import { Search, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { ProductCard } from "./product-card";
import {
  countActiveShopFilters,
  defaultShopFilters,
  ShopFilterSheet,
  type ShopFilterValues,
} from "./shop-filter-sheet";
import { useShop } from "./shop-provider";

export function ShopSearch() {
  const { products } = useShop();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ShopFilterValues>(defaultShopFilters);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = products.filter((product) => {
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
        && (filters.maximumPrice === null || product.price <= filters.maximumPrice);
    });

    return [...matches].sort((left, right) => {
      if (filters.sort === "price-low") return left.price - right.price;
      if (filters.sort === "price-high") return right.price - left.price;
      return products.indexOf(left) - products.indexOf(right);
    });
  }, [filters, products, query]);

  const activeFilterCount = countActiveShopFilters(filters);
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

      <div className="shop-search-toolbar glass-surface">
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
          products={products}
          values={filters}
        />
      </div>

      <section className="shop-search-workspace" aria-label="Search products">
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
