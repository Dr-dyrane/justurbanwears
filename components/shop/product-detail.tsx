"use client";

import { ArrowLeft, Heart, Share2, Store } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { formatNaira, getShopProduct, shopProducts } from "../../lib/shop/catalog";
import { ShopActionButton, ShopActionLink } from "./atoms/action";
import { ProductCard } from "./product-card";
import { ProductVisual } from "./product-visual";
import { useShop } from "./shop-provider";

export function ProductDetail() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const product = getShopProduct(params.slug);
  const {
    addToBag,
    bag,
    following,
    isOnline,
    saved,
    toggleFollowing,
    toggleSaved,
  } = useShop();
  const [notice, setNotice] = useState("");

  if (!product) {
    return (
      <div className="shop-route-empty">
        <p className="shop-kicker">Piece not found</p>
        <h1>This find has left the rail.</h1>
        <Link className="shop-action shop-action-primary" href="/shop">Return to the edit</Link>
      </div>
    );
  }

  const isSaved = saved.includes(product.slug);
  const isInBag = bag.some((item) => item.slug === product.slug);
  const related = shopProducts
    .filter((item) => item.slug !== product.slug && item.category === product.category)
    .concat(shopProducts.filter((item) => item.slug !== product.slug && item.category !== product.category))
    .slice(0, 3);

  function addProduct() {
    if (!isOnline) {
      setNotice("Reconnect to add this piece to your bag.");
      return;
    }
    addToBag({ slug: product!.slug, size: product!.taggedSize });
    setNotice(`${product!.name} is in your bag. No order has been created.`);
  }

  function buyProduct() {
    if (!isOnline) {
      setNotice("Reconnect to continue to checkout.");
      return;
    }
    if (!isInBag) addToBag({ slug: product!.slug, size: product!.taggedSize });
    router.push("/shop/checkout");
  }

  async function shareProduct() {
    const shareData = {
      title: `${product!.name} · justurban wears`,
      text: product!.note,
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setNotice("Share sheet opened.");
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareData.url);
        setNotice("Product link copied.");
      } else {
        setNotice("Copy this page address to share the piece.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice("The share action was unavailable. Copy this page address instead.");
    }
  }

  return (
    <div className="shop-product-page">
      <div className="shop-product-topline">
        <Link href="/shop#discover"><ArrowLeft aria-hidden="true" size={15} strokeWidth={1.8} /> Back to the edit</Link>
        <span>{product.drop} · {product.sku}</span>
      </div>
      <section className="shop-detail-hero">
        <div className="shop-detail-stage">
          <ProductVisual product={product} />
          <button
            aria-label={`${isSaved ? "Remove" : "Save"} ${product.name}`}
            aria-pressed={isSaved}
            className={`detail-save glass-surface${isSaved ? " is-saved" : ""}`}
            onClick={() => toggleSaved(product.slug)}
            type="button"
          >
            <Heart aria-hidden="true" fill={isSaved ? "currentColor" : "none"} size={18} strokeWidth={1.8} />
            {isSaved ? "Saved" : "Save"}
          </button>
        </div>
        <div className="shop-detail-copy">
          <p className="shop-kicker">{product.category} · {product.condition}</p>
          <div className="shop-merchant-row">
            <span aria-hidden="true"><Store size={18} strokeWidth={1.7} /></span>
            <div><small>Sold by</small><strong>justurban wears</strong><p>Curated in Lagos</p></div>
            <button aria-pressed={following} onClick={toggleFollowing} type="button">{following ? "Following" : "Follow"}</button>
            <button aria-label={`Share ${product.name}`} onClick={shareProduct} type="button"><Share2 aria-hidden="true" size={17} strokeWidth={1.8} /></button>
          </div>
          <h1>{product.name}</h1>
          <p className="shop-detail-price">{formatNaira(product.price)}</p>
          <p className="shop-detail-note">{product.note}</p>

          <div className="shop-availability-panel" data-state={product.availability.toLowerCase()}>
            <span aria-hidden="true" />
            <div>
              <strong>{product.availability === "AVAILABLE" ? "Available now" : product.availability === "RESERVED" ? "Reserved for another shopper" : "Sold — kept as an archive reference"}</strong>
              <small>{product.availability === "AVAILABLE" ? "One piece · bag does not reserve" : product.availability === "RESERVED" ? "Primary actions are paused" : "Archive only"}</small>
            </div>
          </div>

          <fieldset className="shop-size-fieldset">
            <legend>Tagged size</legend>
            <button aria-pressed="true" type="button">{product.taggedSize}</button>
            <p>Fit: {product.fit}</p>
          </fieldset>

          {product.availability === "AVAILABLE" ? (
            <div className="shop-purchase-actions">
              <ShopActionButton disabled={!isOnline} onClick={buyProduct}>Buy now</ShopActionButton>
              {isInBag ? (
                <ShopActionLink href="/shop/bag" tone="secondary">Review bag</ShopActionLink>
              ) : (
                <ShopActionButton disabled={!isOnline} onClick={addProduct} tone="secondary">Add to bag</ShopActionButton>
              )}
            </div>
          ) : (
            <ShopActionButton disabled tone="muted">
              {product.availability === "RESERVED" ? "Currently reserved" : "Sold"}
            </ShopActionButton>
          )}
          <p className="shop-delivery-note"><strong>Lagos delivery:</strong> 1–3 working days from ₦2,500.</p>
          <p className="shop-action-note" aria-live="polite" role="status">{notice}</p>
        </div>
      </section>

      <section className="shop-detail-story">
        <div>
          <p className="shop-kicker">Why it made the edit</p>
          <h2>Easy to understand. Better in motion.</h2>
        </div>
        <p>{product.story}</p>
      </section>

      <section className="shop-product-facts" aria-label="Product details and measurements">
        <div>
          <p className="shop-kicker">Details</p>
          <ul>{product.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
        </div>
        <div>
          <p className="shop-kicker">Garment measurements</p>
          <dl>{product.measurements.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
        </div>
        <div>
          <p className="shop-kicker">Care & condition</p>
          <p>{product.condition}. Gently launder cold and air dry.</p>
        </div>
      </section>

      <section className="shop-related">
        <div className="shop-section-title"><div><p className="shop-kicker">Keep looking</p><h2>More from the rail.</h2></div></div>
        <div className="shop-product-grid">{related.map((item) => <ProductCard key={item.slug} product={item} />)}</div>
      </section>
    </div>
  );
}
