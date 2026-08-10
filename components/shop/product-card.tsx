"use client";

import { Check, Eye, Heart, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { formatNaira, type ShopProduct } from "../../lib/shop/catalog";
import { resolveApprovedModelTryout } from "../../lib/shop/model-tryout";
import { ShopLink as Link } from "./atoms/shop-link";
import { useShop } from "./shop-provider";
import { ProductVisual } from "./product-visual";

const availabilityCopy = {
  AVAILABLE: "Available",
  RESERVED: "Reserved",
  SOLD: "Sold",
} as const;

export function ProductCard({ product }: { product: ShopProduct }) {
  const { addToBag, bag, isOnline, saved, toggleSaved } = useShop();
  const [notice, setNotice] = useState("");
  const isSaved = saved.includes(product.slug);
  const isInBag = bag.some((item) => item.slug === product.slug);
  const isAvailable = product.availability === "AVAILABLE";
  const approvedModelTryout = product.modelTryout.modelStatus === "APPROVED"
    ? resolveApprovedModelTryout(product.modelTryout)
    : null;

  function quickAdd() {
    if (!isAvailable || isInBag) return;
    if (!isOnline) {
      setNotice(`${product.name} cannot be added while you are offline.`);
      return;
    }
    addToBag({ slug: product.slug, size: product.taggedSize });
    setNotice(`${product.name}, tagged ${product.taggedSize}, added to your bag. It is not reserved.`);
  }

  return (
    <article className="shop-product-card">
      <div className="shop-product-media">
        <Link
          aria-label={`View ${product.name}`}
          href={`/shop/products/${product.slug}`}
        >
          <ProductVisual product={product} compact />
        </Link>
        <span
          className={`availability-tag availability-${product.availability.toLowerCase()}`}
        >
          {availabilityCopy[product.availability]}
        </span>
        <button
          aria-label={`${isSaved ? "Remove" : "Save"} ${product.name}`}
          aria-pressed={isSaved}
          className={`product-save${isSaved ? " is-saved" : ""}`}
          onClick={() => toggleSaved(product.slug)}
          type="button"
        >
          <Heart aria-hidden="true" fill={isSaved ? "currentColor" : "none"} size={20} strokeWidth={1.8} />
        </button>
      </div>
      <Link className="shop-product-copy" href={`/shop/products/${product.slug}`}>
        <span>{product.category} · {product.taggedSize}</span>
        <h3>{product.name}</h3>
        <p>{formatNaira(product.price)}</p>
      </Link>
      {approvedModelTryout ? (
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
      <div className="product-card-action-row">
        {isAvailable ? (
          isInBag ? (
            <Link
              aria-label={`${product.name} is in your bag. Review bag`}
              className="product-card-action is-added"
              href="/shop/bag"
            >
              <Check aria-hidden="true" size={17} strokeWidth={2} />
              <span><strong>In bag</strong><small>{product.taggedSize}</small></span>
            </Link>
          ) : (
            <button
              aria-label={isOnline
                ? `Quick add ${product.name}, tagged size ${product.taggedSize}, to bag`
                : `${product.name} cannot be added while offline`}
              className={`product-card-action${isOnline ? "" : " is-offline"}`}
              disabled={!isOnline}
              onClick={quickAdd}
              type="button"
            >
              <ShoppingBag aria-hidden="true" size={17} strokeWidth={1.8} />
              <span>
                <strong>{isOnline ? "Quick add" : "Offline · add paused"}</strong>
                <small>{isOnline ? product.taggedSize : "Reconnect to quick add"}</small>
              </span>
            </button>
          )
        ) : (
          <span
            className="product-card-action is-unavailable"
            data-state={product.availability.toLowerCase()}
          >
            <i aria-hidden="true" />
            <span>
              <strong>{availabilityCopy[product.availability]}</strong>
              <small>{product.taggedSize}</small>
            </span>
          </span>
        )}
      </div>
      <p className="sr-only" aria-live="polite" role="status">{notice}</p>
    </article>
  );
}
