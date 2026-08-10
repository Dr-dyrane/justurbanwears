"use client";

import { ArrowLeft, ChevronDown, Eye, Heart, Share2, Store } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { formatNaira } from "../../lib/shop/catalog";
import { resolveApprovedModelTryout } from "../../lib/shop/model-tryout";
import { ShopActionButton, ShopActionLink } from "./atoms/action";
import { ShopLink as Link } from "./atoms/shop-link";
import { ProductCard } from "./product-card";
import { ProductMediaGallery } from "./product-media-gallery";
import { ProductModelTryout } from "./product-model-tryout";
import { useShop } from "./shop-provider";

const MODEL_VIEW_EVENT = "shop:model-view-url-changed";

function subscribeToModelViewUrl(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener(MODEL_VIEW_EVENT, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(MODEL_VIEW_EVENT, listener);
  };
}

function modelViewRequested() {
  return new URL(window.location.href).searchParams.get("view") === "model";
}

function serverModelViewSnapshot() {
  return false;
}

function announceModelViewUrlChange() {
  window.dispatchEvent(new Event(MODEL_VIEW_EVENT));
}

export function ProductDetail() {
  const params = useParams<{ slug: string }>();
  const {
    addToBag,
    bag,
    following,
    getProduct,
    hydration,
    isOnline,
    persistence,
    prepareCheckout,
    products,
    saved,
    toggleFollowing,
    toggleSaved,
  } = useShop();
  const product = getProduct(params.slug);
  const [notice, setNotice] = useState("");
  const modelTryoutTriggerRef = useRef<HTMLButtonElement>(null);
  const openedModelTryoutHereRef = useRef(false);
  const approvedModelTryout = useMemo(() => (
    product?.modelTryout.modelStatus === "APPROVED"
      ? resolveApprovedModelTryout(product.modelTryout)
      : null
  ), [product]);
  const isModelViewRequested = useSyncExternalStore(
    subscribeToModelViewUrl,
    modelViewRequested,
    serverModelViewSnapshot,
  );
  const isModelTryoutOpen = Boolean(approvedModelTryout && isModelViewRequested);

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
  const related = products
    .filter((item) => item.slug !== product.slug && item.category === product.category)
    .concat(products.filter((item) => item.slug !== product.slug && item.category !== product.category))
    .slice(0, 3);

  function addProduct() {
    if (!isOnline) {
      setNotice("Reconnect to add this piece to your bag.");
      return false;
    }
    const added = addToBag({ slug: product!.slug, size: product!.taggedSize });
    setNotice(added
      ? `${product!.name} is in your bag.`
      : `${product!.name} could not be added. Try again.`);
    return added;
  }

  function openModelTryout() {
    const url = new URL(window.location.href);
    url.searchParams.set("view", "model");
    const currentState = history.state && typeof history.state === "object"
      ? history.state as Record<string, unknown>
      : {};
    history.pushState(
      { ...currentState, shopModelView: true },
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    openedModelTryoutHereRef.current = true;
    announceModelViewUrlChange();
  }

  function closeModelTryout() {
    if (openedModelTryoutHereRef.current && history.state?.shopModelView === true) {
      openedModelTryoutHereRef.current = false;
      history.back();
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("view");
    history.replaceState(
      history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    announceModelViewUrlChange();
  }

  async function buyProduct() {
    if (!isOnline) {
      setNotice("Reconnect to continue to checkout.");
      return;
    }
    const isReady = await prepareCheckout({
      slug: product!.slug,
      size: product!.taggedSize,
    });
    if (!isReady) {
      setNotice("Your bag could not be prepared. Try again.");
      return;
    }
    window.location.assign("/shop/checkout");
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
          <ProductMediaGallery product={product} />
        </div>
        <div className="shop-detail-copy">
          <p className="shop-kicker">{product.category} · {product.condition}</p>
          <div className="shop-detail-heading">
            <h1>{product.name}</h1>
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
          <p className="shop-detail-price">{formatNaira(product.price)}</p>
          <p className="shop-detail-note">{product.note}</p>
          <div className="shop-merchant-row">
            <span aria-hidden="true"><Store size={18} strokeWidth={1.7} /></span>
            <div><small>Sold by</small><strong>justurban wears</strong><p>Curated in Lagos</p></div>
            <button aria-pressed={following} onClick={toggleFollowing} type="button">{following ? "Following" : "Follow"}</button>
            <button aria-label={`Share ${product.name}`} onClick={shareProduct} type="button"><Share2 aria-hidden="true" size={17} strokeWidth={1.8} /></button>
          </div>

          <div className="shop-availability-panel" data-state={product.availability.toLowerCase()}>
            <span aria-hidden="true" />
            <div>
              <strong>{product.availability === "AVAILABLE" ? "Available now" : product.availability === "RESERVED" ? "Reserved for another shopper" : "Sold — kept as an archive reference"}</strong>
              <small>{product.availability === "AVAILABLE" ? "One piece · bag does not reserve" : product.availability === "RESERVED" ? "Primary actions are paused" : "Archive only"}</small>
            </div>
          </div>

          {approvedModelTryout ? (
            <button
              aria-haspopup="dialog"
              className="shop-model-tryout-entry"
              onClick={openModelTryout}
              ref={modelTryoutTriggerRef}
              type="button"
            >
              <span aria-hidden="true"><Eye size={19} strokeWidth={1.7} /></span>
              <span>
                <small>On model</small>
                <strong>{isOnline ? "Front view" : "Reconnect to open"}</strong>
              </span>
              <b aria-hidden="true">01</b>
            </button>
          ) : null}

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

          <div className="shop-detail-disclosures">
            <details open>
              <summary>
                <span>Measurements</span>
                <ChevronDown aria-hidden="true" size={17} strokeWidth={1.7} />
              </summary>
              <dl>
                {product.measurements.map((item) => (
                  <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>
                ))}
              </dl>
            </details>
            <details>
              <summary>
                <span>Details & care</span>
                <ChevronDown aria-hidden="true" size={17} strokeWidth={1.7} />
              </summary>
              <ul>{product.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
              <p>{product.condition}. Gently launder cold and air dry.</p>
            </details>
            <details>
              <summary>
                <span>Delivery</span>
                <ChevronDown aria-hidden="true" size={17} strokeWidth={1.7} />
              </summary>
              <p>Lagos delivery takes 1–3 working days. Pickup and nationwide delivery are selected at checkout.</p>
            </details>
          </div>
        </div>
      </section>

      <section className="shop-detail-story">
        <div>
          <p className="shop-kicker">Why it made the edit</p>
          <h2>Easy to understand. Better in motion.</h2>
        </div>
        <p>{product.story}</p>
      </section>

      <section className="shop-related">
        <div className="shop-section-title"><div><p className="shop-kicker">Keep looking</p><h2>More from the rail.</h2></div></div>
        <div className="shop-product-grid">{related.map((item) => <ProductCard key={item.slug} product={item} />)}</div>
      </section>

      {approvedModelTryout ? (
        <ProductModelTryout
          availability={product.availability}
          hydration={hydration}
          isInBag={isInBag}
          isOnline={isOnline}
          isOpen={isModelTryoutOpen}
          isSaved={isSaved}
          onAddToBag={addProduct}
          onRequestClose={closeModelTryout}
          onReturnFocus={() => modelTryoutTriggerRef.current?.focus()}
          onToggleSaved={() => toggleSaved(product.slug)}
          persistence={persistence}
          productName={product.name}
          taggedSize={product.taggedSize}
          tryout={approvedModelTryout}
        />
      ) : null}
    </div>
  );
}
