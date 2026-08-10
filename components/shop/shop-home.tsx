"use client";

import { ArrowUpRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { shopCategories, shopProducts } from "../../lib/shop/catalog";
import { resolveApprovedModelTryout } from "../../lib/shop/model-tryout";
import { ShopLink as Link } from "./atoms/shop-link";
import { ProductCard } from "./product-card";
import { ProductVisual } from "./product-visual";

type Category = (typeof shopCategories)[number];

const dropProducts = shopProducts.filter((product) => product.availability === "AVAILABLE");
const heroProduct = dropProducts.find((product) => resolveApprovedModelTryout(product.modelTryout))
  ?? dropProducts[0]!;
const heroModelView = resolveApprovedModelTryout(heroProduct.modelTryout);

export function ShopHome() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("All");
  const [availableOnly, setAvailableOnly] = useState(true);

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
          <p className="shop-kicker">Drop 01 · Live now</p>
          <h1 id="shop-hero-title">Four pieces. One clean release.</h1>
          <p className="shop-hero-lede">
            A tightly held edit of one-off urban womenswear—measured, condition-checked, and ready to move. The live rail shows only what you can buy now.
          </p>
          <div className="shop-hero-actions">
            <Link className="shop-action shop-action-primary" href="#discover">Shop Drop 01</Link>
            <Link className="shop-text-action" href="/shop/search">See the full rail <ArrowUpRight aria-hidden="true" size={14} strokeWidth={1.8} /></Link>
          </div>
        </div>
        <Link
          aria-label={heroModelView
            ? `Open the model view for ${heroProduct.name}`
            : `View ${heroProduct.name}`}
          className="shop-hero-stage shop-hero-identity"
          href={`/shop/products/${heroProduct.slug}${heroModelView ? "?view=model" : ""}`}
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
              <small>{heroProduct.sku} · {heroModelView ? "On Lulu" : "Drop 01"}</small>
              <strong>{heroProduct.name}</strong>
            </span>
            <b aria-hidden="true">01</b>
          </span>
        </Link>
        <p className="shop-hero-aside">Four pieces<br />one of each</p>
      </section>

      <section className="shop-discovery" id="discover" aria-labelledby="discover-title">
        <div className="shop-section-title">
          <div>
            <p className="shop-kicker">Drop 01 · Available now</p>
            <h2 id="discover-title">Released to the rail.</h2>
          </div>
          <nav className="shop-release-index" aria-label="Drop 01 release index">
            <span className="shop-release-count">Drop 01 · 4 live pieces</span>
            {dropProducts.map((product, index) => (
              <Link
                className="shop-release-link"
                data-sku={product.sku}
                href={`/shop/products/${product.slug}`}
                key={product.slug}
              >
                <span aria-hidden="true">0{index + 1}</span>
                <span>{product.name}</span>
              </Link>
            ))}
          </nav>
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
          <span>
            {query
              ? `Matching “${query}”`
              : availableOnly
                ? "Drop 01 · Available now"
                : "All statuses · Reserved and sold included"}
          </span>
        </div>

        {filtered.length ? (
          <div className="shop-product-grid">
            {filtered.map((product) => <ProductCard key={product.slug} product={product} />)}
          </div>
        ) : (
          <div className="shop-no-results">
            <span aria-hidden="true"><Search size={23} strokeWidth={1.75} /></span>
            <div><h3>No piece matches that combination.</h3></div>
            <button type="button" onClick={() => { setQuery(""); setCategory("All"); setAvailableOnly(true); }}>Reset filters</button>
          </div>
        )}
      </section>

      <section className="shop-editorial-rail" aria-labelledby="editorial-title">
        <div>
          <p className="shop-kicker">The Drop 01 palette</p>
          <h2 id="editorial-title">Warm colour. Clean movement.</h2>
          <p>Coral impact, moss restraint, cocoa depth, and salmon lightness—each piece released once.</p>
          <Link className="shop-action shop-action-secondary" href="#discover">Shop what is live</Link>
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
