"use client";

import { ArrowLeft, Eye, Heart, LoaderCircle, Share2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { formatNaira } from "../../lib/shop/catalog";
import { resolveApprovedModelTryout } from "../../lib/shop/model-tryout";
import { ShopActionButton, ShopActionLink } from "./atoms/action";
import { ShopLink as Link } from "./atoms/shop-link";
import { ProductCard } from "./product-card";
import { ProductMediaGallery } from "./product-media-gallery";
import { ProductInfoSheet } from "./product-info-sheet";
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
    getProduct,
    hydration,
    isOnline,
    persistence,
    prepareCheckout,
    products,
    saved,
    toggleSaved,
  } = useShop();
  const product = getProduct(params.slug);
  const [notice, setNotice] = useState("");
  const [isPreparingCheckout, setIsPreparingCheckout] = useState(false);
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

  function toggleProductSaved() {
    toggleSaved(product!.slug);
    setNotice(isSaved
      ? `${product!.name} removed from saved pieces.`
      : `${product!.name} saved.`);
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
    if (isPreparingCheckout) return;
    if (!isOnline) {
      setNotice("Reconnect to continue to checkout.");
      return;
    }
    setIsPreparingCheckout(true);
    try {
      const isReady = await prepareCheckout({
        slug: product!.slug,
        size: product!.taggedSize,
      });
      if (!isReady) {
        setNotice("Your bag could not be prepared. Try again.");
        setIsPreparingCheckout(false);
        return;
      }
      window.location.assign("/shop/checkout");
    } catch {
      setNotice("Your bag could not be prepared. Try again.");
      setIsPreparingCheckout(false);
    }
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
          </div>
          <p className="shop-detail-price">{formatNaira(product.price)}</p>
          <p className="shop-detail-note">{product.note}</p>

          <div className="shop-detail-utility-row" aria-label="Product actions">
            {approvedModelTryout ? (
              <button
                aria-haspopup="dialog"
                className="shop-detail-utility"
                onClick={openModelTryout}
                ref={modelTryoutTriggerRef}
                type="button"
              >
                <Eye aria-hidden="true" size={18} strokeWidth={1.8} />
                {isOnline ? "On Lulu" : "Offline"}
              </button>
            ) : null}
            <button
              aria-label={`${isSaved ? "Remove" : "Save"} ${product.name}`}
              aria-pressed={isSaved}
              className={`shop-detail-utility${isSaved ? " is-saved" : ""}`}
              onClick={toggleProductSaved}
              type="button"
            >
              <Heart aria-hidden="true" fill={isSaved ? "currentColor" : "none"} size={18} strokeWidth={1.8} />
              {isSaved ? "Saved" : "Save"}
            </button>
            <button
              aria-label={`Share ${product.name}`}
              className="shop-detail-utility"
              onClick={shareProduct}
              type="button"
            >
              <Share2 aria-hidden="true" size={18} strokeWidth={1.8} />
              Share
            </button>
          </div>

          <div className="shop-product-choice-row" id="shop-purchase">
            <div
              className="shop-availability-panel"
              data-state={product.availabilityConfirmed ? product.availability.toLowerCase() : "unconfirmed"}
            >
              <span aria-hidden="true" />
              <div>
                <strong>{!product.availabilityConfirmed ? "Live availability is unavailable" : product.availability === "AVAILABLE" ? "Available now" : product.availability === "RESERVED" ? "Reserved for another shopper" : "Sold — kept as an archive reference"}</strong>
                <small>{!product.availabilityConfirmed ? "Checkout stays paused until the catalogue reconnects" : product.availability === "AVAILABLE" ? "One piece · bag does not reserve" : product.availability === "RESERVED" ? "Primary actions are paused" : "Archive only"}</small>
              </div>
            </div>
            <fieldset className="shop-size-fieldset">
              <legend>Size</legend>
              <button aria-pressed="true" type="button">{product.taggedSize}</button>
              <p>{product.fit}</p>
            </fieldset>
          </div>

          {product.availabilityConfirmed && product.availability === "AVAILABLE" ? (
            <div className="shop-purchase-actions">
              <ShopActionButton
                aria-busy={isPreparingCheckout}
                disabled={!isOnline || isPreparingCheckout}
                onClick={buyProduct}
              >
                {isPreparingCheckout ? (
                  <><LoaderCircle aria-hidden="true" className="shop-action-spinner" size={17} strokeWidth={1.9} /> Preparing</>
                ) : "Buy now"}
              </ShopActionButton>
              {isInBag ? (
                <ShopActionLink href="/shop/bag" tone="secondary">Review bag</ShopActionLink>
              ) : (
                <ShopActionButton disabled={!isOnline} onClick={addProduct} tone="secondary">Add to bag</ShopActionButton>
              )}
            </div>
          ) : (
            <ShopActionButton disabled tone="muted">
              {!product.availabilityConfirmed
                ? "Availability temporarily unavailable"
                : product.availability === "RESERVED"
                  ? "Currently reserved"
                  : "Sold"}
            </ShopActionButton>
          )}
          <p className="shop-action-note" aria-live="polite" role="status">{notice}</p>
          <p className="shop-delivery-note">Lagos in 1–3 working days · Pickup and nationwide options at checkout.</p>
          <ProductInfoSheet
            condition={product.condition}
            details={product.details}
            measurements={product.measurements}
            productName={product.name}
          />
        </div>
      </section>

      <section className="shop-detail-story">
        <div>
          <p className="shop-kicker">Why it works</p>
          <h2>Easy to understand. Better in motion.</h2>
        </div>
        <p>{product.story}</p>
      </section>

      <section className="shop-related">
        <div className="shop-section-title"><div><p className="shop-kicker">Keep looking</p><h2>More from the wardrobe.</h2></div></div>
        <div className="shop-product-grid">{related.map((item) => <ProductCard key={item.slug} product={item} />)}</div>
      </section>

      {approvedModelTryout ? (
        <ProductModelTryout
          availability={product.availability}
          availabilityConfirmed={product.availabilityConfirmed}
          hydration={hydration}
          isInBag={isInBag}
          isOnline={isOnline}
          isOpen={isModelTryoutOpen}
          isSaved={isSaved}
          onAddToBag={addProduct}
          onRequestClose={closeModelTryout}
          onReturnFocus={() => modelTryoutTriggerRef.current?.focus()}
          onToggleSaved={toggleProductSaved}
          persistence={persistence}
          productName={product.name}
          taggedSize={product.taggedSize}
          tryout={approvedModelTryout}
        />
      ) : null}
    </div>
  );
}
