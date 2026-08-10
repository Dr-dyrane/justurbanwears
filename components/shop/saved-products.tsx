"use client";

import { Heart } from "lucide-react";
import { useRef, useState } from "react";
import { ShopActionLink } from "./atoms/action";
import { ProductCard } from "./product-card";
import { useShop } from "./shop-provider";

export function SavedProducts() {
  const { hydration, products: catalog, saved } = useShop();
  const pageRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState("");
  const products = catalog.filter((product) => saved.includes(product.slug));
  const isRestoring = hydration === "idle" || hydration === "restoring";

  function handleSavedChange(nextNotice: string, isSaved: boolean) {
    setNotice(nextNotice);
    if (isSaved) return;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        pageRef.current
          ?.querySelector<HTMLElement>(".product-save, .shop-route-empty a")
          ?.focus();
      });
    });
  }

  return (
    <div className="shop-list-page" ref={pageRef}>
      <header className="shop-list-heading">
        <p className="shop-kicker">Your shortlist</p>
        <h1>Saved for another look.</h1>
      </header>
      <p aria-live="polite" className="sr-only" role="status">{notice}</p>
      {isRestoring ? (
        <div className="shop-route-empty" aria-live="polite" role="status">
          <h2>Opening saved pieces…</h2>
        </div>
      ) : products.length ? (
        <div className="shop-product-grid">{products.map((product) => (
          <ProductCard key={product.slug} onSavedChange={handleSavedChange} product={product} />
        ))}</div>
      ) : (
        <div className="shop-route-empty">
          <span aria-hidden="true"><Heart size={34} strokeWidth={1.65} /></span>
          <h2>Nothing saved yet.</h2>
          <ShopActionLink href="/shop#discover">Browse the wardrobe</ShopActionLink>
        </div>
      )}
    </div>
  );
}
