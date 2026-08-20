"use client";

import { Check, Eye, Heart, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { formatNaira, type ShopProduct } from "../../lib/shop/catalog";
import { resolveApprovedModelTryout } from "../../lib/shop/model-tryout";
import { ShopLink as Link } from "./atoms/shop-link";
import { ProductVisual } from "./product-visual";
import { useShop } from "./shop-provider";

const availabilityCopy = {
  AVAILABLE: "Available",
  RESERVED: "Reserved",
  SOLD: "Sold",
} as const;

function formatIndex(value: number) {
  return String(value).padStart(2, "0");
}

export function ProductCard({
  index,
  onSavedChange,
  product,
  showModelLink = true,
  showStudyMark = true,
  total,
}: {
  index?: number;
  onSavedChange?: (notice: string, saved: boolean) => void;
  product: ShopProduct;
  showModelLink?: boolean;
  showStudyMark?: boolean;
  total?: number;
}) {
  const { addToBag, bag, isOnline, saved, toggleSaved } = useShop();
  const [notice, setNotice] = useState("");
  const isSaved = saved.includes(product.slug);
  const isInBag = bag.some((item) => item.slug === product.slug);
  const isAvailable = product.availabilityConfirmed && product.availability === "AVAILABLE";
  const availabilityLabel = product.availabilityConfirmed
    ? availabilityCopy[product.availability]
    : "Live check paused";
  const approvedModelTryout = product.modelTryout.modelStatus === "APPROVED"
    ? resolveApprovedModelTryout(product.modelTryout)
    : null;
  const actionVisibility = isInBag || !isOnline ? "always" : "intent";

  function quickAdd() {
    if (!isAvailable || isInBag) return;
    if (!isOnline) {
      setNotice(`${product.name} cannot be added while you are offline.`);
      return;
    }
    addToBag({ slug: product.slug, size: product.taggedSize });
    setNotice(`${product.name}, tagged ${product.taggedSize}, added to your bag. It is not reserved.`);
  }

  function toggleProductSaved() {
    const nextSaved = !isSaved;
    const nextNotice = isSaved
      ? `${product.name} removed from saved pieces.`
      : `${product.name} saved.`;
    toggleSaved(product.slug);
    setNotice(nextNotice);
    onSavedChange?.(nextNotice, nextSaved);
  }

  return (
    <article
      className="shop-product-card"
      data-card-state={isAvailable ? "available" : "unavailable"}
    >
      <div className="shop-product-media">
        <Link
          aria-label={`View ${product.name}`}
          data-product-transition={product.slug}
          href={`/shop/products/${product.slug}`}
        >
          <ProductVisual product={product} compact showStudyMark={showStudyMark} />
          <span className="product-card-view-cue">
            View piece <span aria-hidden="true">↗</span>
          </span>
        </Link>

        {index ? (
          <span aria-hidden="true" className="product-card-index">
            {formatIndex(index)}
            {total ? <small> / {formatIndex(total)}</small> : null}
          </span>
        ) : null}

        {!isAvailable ? (
          <span className={`availability-tag availability-${product.availabilityConfirmed ? product.availability.toLowerCase() : "unconfirmed"}`}>
            {availabilityLabel}
          </span>
        ) : null}

        <button
          aria-label={`${isSaved ? "Remove" : "Save"} ${product.name}`}
          aria-pressed={isSaved}
          className={`product-save${isSaved ? " is-saved" : ""}`}
          onClick={toggleProductSaved}
          type="button"
        >
          <Heart aria-hidden="true" fill={isSaved ? "currentColor" : "none"} size={20} strokeWidth={1.8} />
        </button>

        {isAvailable ? (
          <div className="product-card-action-row" data-visibility={actionVisibility}>
            {isInBag ? (
              <Link
                aria-label={`${product.name} is in your bag. Review bag`}
                className="product-card-action is-added"
                href="/shop/bag"
              >
                <span aria-hidden="true" className="product-card-action-icon">
                  <Check size={18} strokeWidth={2} />
                </span>
                <span><strong>In bag</strong><small>{product.taggedSize}</small></span>
              </Link>
            ) : (
              <button
                aria-label={isOnline
                  ? `Add ${product.name}, tagged size ${product.taggedSize}, to bag`
                  : `${product.name} cannot be added while offline`}
                className={`product-card-action${isOnline ? "" : " is-offline"}`}
                disabled={!isOnline}
                onClick={quickAdd}
                type="button"
              >
                <span aria-hidden="true" className="product-card-action-icon">
                  <ShoppingBag size={18} strokeWidth={1.8} />
                </span>
                <span>
                  <strong>{isOnline ? "Add to bag" : "Offline · add paused"}</strong>
                  <small>{isOnline ? product.taggedSize : "Reconnect to add"}</small>
                </span>
              </button>
            )}
          </div>
        ) : null}
      </div>

      <Link className="shop-product-copy" href={`/shop/products/${product.slug}`}>
        <span>{product.category} · {product.taggedSize}</span>
        <h3>{product.name}</h3>
        <p>{formatNaira(product.price)}</p>
      </Link>

      {showModelLink && approvedModelTryout ? (
        isOnline ? (
          <Link
            aria-label={`Open the model front view of ${product.name}`}
            className="product-model-link"
            href={`/shop/products/${product.slug}?view=model`}
          >
            <Eye aria-hidden="true" size={15} strokeWidth={1.8} />
            <span>On model</span>
          </Link>
        ) : (
          <span className="product-model-link is-offline" title="Reconnect to open the model view">
            <Eye aria-hidden="true" size={15} strokeWidth={1.8} />
            <span>On model · Offline</span>
          </span>
        )
      ) : null}

      <p className="sr-only" aria-live="polite" role="status">{notice}</p>
    </article>
  );
}
