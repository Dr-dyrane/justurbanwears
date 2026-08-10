"use client";

import { ArrowUpRight, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { shopCategories, shopProducts } from "../../lib/shop/catalog";
import { ProductCard } from "./product-card";
import { ProductVisual } from "./product-visual";

type Category = (typeof shopCategories)[number];

export function ShopHome() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("All");
  const [availableOnly, setAvailableOnly] = useState(false);
  const featured = shopProducts[0];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return shopProducts.filter((product) => {
      const matchesCategory = category === "All" || product.category === category;
      const matchesAvailability = !availableOnly || product.availability === "AVAILABLE";
      const haystack = `${product.name} ${product.category} ${product.colour} ${product.fit}`.toLowerCase();
      return matchesCategory && matchesAvailability && (!needle || haystack.includes(needle));
    });
  }, [availableOnly, category, query]);

  return (
    <div className="shop-home">
      <section className="shop-hero" aria-labelledby="shop-hero-title">
        <div className="shop-hero-copy">
          <p className="shop-kicker">Urban ladies’ wear · August 2026</p>
          <h1 id="shop-hero-title">Clothes with a second first impression.</h1>
          <p className="shop-hero-lede">
            A sharp Lagos edit of pre-loved urban womenswear, measured and described so you can choose with less guesswork.
          </p>
          <div className="shop-hero-actions">
            <Link className="shop-action shop-action-primary" href="#discover">Shop the edit</Link>
            <Link className="shop-text-action" href="/shop/search">Search every piece <ArrowUpRight aria-hidden="true" size={14} strokeWidth={1.8} /></Link>
          </div>
        </div>
        <Link className="shop-hero-stage" href={`/shop/products/${featured.slug}`} aria-label={`View ${featured.name}`}>
          <ProductVisual product={featured} />
          <span className="hero-product-caption glass-surface">
            <span><small>Featured find</small><strong>{featured.name}</strong></span>
            <b aria-hidden="true"><ArrowUpRight size={18} strokeWidth={1.8} /></b>
          </span>
        </Link>
        <p className="shop-hero-aside">Curated slowly<br />worn freely</p>
      </section>

      <section className="shop-discovery" id="discover" aria-labelledby="discover-title">
        <div className="shop-section-title">
          <div>
            <p className="shop-kicker">Browse the rail</p>
            <h2 id="discover-title">Find your next repeat wear.</h2>
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

        <div className="shop-results-line" aria-live="polite" role="status">
          <span>{filtered.length} {filtered.length === 1 ? "find" : "finds"}</span>
          <span>{query ? `Matching “${query}”` : "Showing the complete edit"}</span>
        </div>

        {filtered.length ? (
          <div className="shop-product-grid">
            {filtered.map((product) => <ProductCard key={product.slug} product={product} />)}
          </div>
        ) : (
          <div className="shop-no-results">
            <span aria-hidden="true"><Search size={23} strokeWidth={1.75} /></span>
            <div><h3>No piece matches that combination.</h3></div>
            <button type="button" onClick={() => { setQuery(""); setCategory("All"); setAvailableOnly(false); }}>Reset filters</button>
          </div>
        )}
      </section>

      <section className="shop-editorial-rail" aria-labelledby="editorial-title">
        <div>
          <p className="shop-kicker">The city edit</p>
          <h2 id="editorial-title">Warm colour. Easy movement. No costume.</h2>
          <p>Coral for impact, cocoa for repeat wear, and soft shirts for Lagos heat.</p>
          <Link className="shop-action shop-action-secondary" href="/shop/search">Refine the full edit</Link>
        </div>
        <div className="shop-editorial-products">
          {shopProducts.filter((product) => ["coral", "cocoa", "salmon"].includes(product.tone)).slice(0, 3).map((product) => (
            <Link href={`/shop/products/${product.slug}`} key={product.slug}>
              <ProductVisual compact product={product} />
              <span>{product.name}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="shop-values" aria-label="How the edit works">
        <p className="shop-kicker">A clearer way to thrift online</p>
        <div>
          <article><span>01</span><h2>Measured, not guessed.</h2></article>
          <article><span>02</span><h2>Condition in plain words.</h2></article>
          <article><span>03</span><h2>State stays honest.</h2></article>
        </div>
      </section>
    </div>
  );
}
