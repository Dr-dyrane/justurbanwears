"use client";

import { Search, SearchX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { shopCategories } from "../../lib/shop/catalog";
import { ProductCard } from "./product-card";
import {
  countActiveShopFilters,
  defaultShopFilters,
  ShopFilterSheet,
  type ShopFilterValues,
} from "./shop-filter-sheet";
import { useShop } from "./shop-provider";

function readSearchState() {
  const params = new URLSearchParams(window.location.search);
  const categoryValue = params.get("category");
  const availabilityValue = params.get("availability");
  const sortValue = params.get("sort");
  const maximumPriceValue = Number(params.get("maximumPrice"));
  const category = shopCategories.find((item) => item === categoryValue) ?? "All";
  const availability = (["AVAILABLE", "RESERVED", "SOLD"] as const)
    .find((item) => item === availabilityValue) ?? "ALL";
  const sort = (["price-low", "price-high"] as const)
    .find((item) => item === sortValue) ?? "editorial";

  return {
    query: params.get("q")?.trim() ?? "",
    filters: {
      category,
      size: params.get("size")?.trim() || "All",
      colour: params.get("colour")?.trim() || "All",
      availability,
      maximumPrice: Number.isFinite(maximumPriceValue) && maximumPriceValue > 0
        ? maximumPriceValue
        : null,
      sort,
    } satisfies ShopFilterValues,
  };
}

function writeSearchState(query: string, filters: ShopFilterValues) {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (filters.category !== "All") params.set("category", filters.category);
  if (filters.size !== "All") params.set("size", filters.size);
  if (filters.colour !== "All") params.set("colour", filters.colour);
  if (filters.availability !== "ALL") params.set("availability", filters.availability);
  if (filters.maximumPrice !== null) params.set("maximumPrice", String(filters.maximumPrice));
  if (filters.sort !== "editorial") params.set("sort", filters.sort);
  const search = params.toString();
  window.history.replaceState(
    window.history.state,
    "",
    `/shop/search${search ? `?${search}` : ""}`,
  );
}

export function ShopSearch() {
  const { products } = useShop();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ShopFilterValues>(defaultShopFilters);
  const urlReadyRef = useRef(false);

  useEffect(() => {
    function restoreSearchState() {
      const restored = readSearchState();
      setQuery(restored.query);
      setFilters(restored.filters);
      urlReadyRef.current = true;
    }

    restoreSearchState();
    window.addEventListener("popstate", restoreSearchState);
    return () => window.removeEventListener("popstate", restoreSearchState);
  }, []);

  useEffect(() => {
    if (!urlReadyRef.current) return;
    writeSearchState(query, filters);
  }, [filters, query]);

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
  const hasQuery = Boolean(query.trim());
  const hasFilters = hasQuery || activeFilterCount > 0;
  const clearLabel = hasQuery && activeFilterCount
    ? "Clear all"
    : hasQuery
      ? "Clear search"
      : "Clear filters";

  function resetFilters() {
    setQuery("");
    setFilters(defaultShopFilters);
  }

  return (
    <div className="shop-list-page shop-search-page">
      <header className="shop-list-heading shop-search-heading">
        <p className="shop-kicker">The wardrobe</p>
        <h1>Find your next piece.</h1>
      </header>

      <div className="shop-search-toolbar glass-surface">
        <label className="shop-search-input">
          <span className="sr-only">Search the wardrobe</span>
          <Search aria-hidden="true" size={18} strokeWidth={1.75} />
          <input
            autoComplete="off"
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
            {hasFilters ? <button onClick={resetFilters} type="button">{clearLabel}</button> : <span>All pieces</span>}
          </div>

          {filtered.length ? (
            <div className="shop-product-grid shop-search-grid">
              {filtered.map((product) => <ProductCard key={product.slug} product={product} />)}
            </div>
          ) : (
            <div className="shop-route-empty shop-search-empty">
              <span aria-hidden="true"><SearchX size={34} strokeWidth={1.65} /></span>
              <h2>No match in the wardrobe.</h2>
              <button className="shop-action shop-action-primary" onClick={resetFilters} type="button">{clearLabel}</button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
