"use client";

import { ShoppingBag } from "lucide-react";
import { useRef, useState } from "react";
import { formatNaira } from "../../lib/shop/catalog";
import { ShopActionButton, ShopActionLink } from "./atoms/action";
import { ShopLink as Link } from "./atoms/shop-link";
import { ProductVisual } from "./product-visual";
import { useShop } from "./shop-provider";

export function ShopBag() {
  const { bag, getProduct, hydration, removeFromBag } = useShop();
  const pageRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState("");
  const lines = bag.flatMap((item) => {
    const product = getProduct(item.slug);
    return product ? [{ ...item, product }] : [];
  });
  const subtotal = lines.reduce((sum, line) => sum + line.product.price, 0);
  const checkoutAvailable = lines.every(
    (line) => line.product.availabilityConfirmed && line.product.availability === "AVAILABLE",
  );
  const isRestoring = hydration === "idle" || hydration === "restoring";

  function removeLine(slug: string, name: string) {
    removeFromBag(slug);
    setNotice(`${name} removed from your bag.`);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        pageRef.current
          ?.querySelector<HTMLElement>(".shop-bag-line button, .shop-order-summary a, .shop-route-empty a")
          ?.focus();
      });
    });
  }

  return (
    <div className="shop-list-page shop-bag-page" ref={pageRef}>
      <header className="shop-list-heading">
        <p className="shop-kicker">Bag</p>
        <h1>Review your bag.</h1>
      </header>
      <p aria-live="polite" className="sr-only" role="status">{notice}</p>

      {isRestoring ? (
        <div className="shop-route-empty" aria-live="polite" role="status">
          <h2>Opening your bag…</h2>
        </div>
      ) : lines.length ? (
        <div className="shop-bag-layout">
          <section className="shop-bag-lines" aria-label="Bag items">
            {lines.map(({ product, size }) => (
              <article className="shop-bag-line" key={product.slug}>
                <Link href={`/shop/products/${product.slug}`}><ProductVisual product={product} compact /></Link>
                <div>
                  <span>{product.sku} · {size}</span>
                  <h2>{product.name}</h2>
                  <p>{formatNaira(product.price)} · Quantity 1</p>
                  <button onClick={() => removeLine(product.slug, product.name)} type="button">Remove</button>
                </div>
              </article>
            ))}
          </section>
          <aside className="shop-order-summary glass-surface">
            <p className="shop-kicker">Checkout summary</p>
            <dl>
              <div><dt>Subtotal</dt><dd>{formatNaira(subtotal)}</dd></div>
              <div><dt>Delivery</dt><dd>Chosen at checkout</dd></div>
            </dl>
            {checkoutAvailable ? (
              <ShopActionLink href="/shop/checkout">Continue to checkout</ShopActionLink>
            ) : (
              <ShopActionButton disabled tone="muted">
                Availability temporarily unavailable
              </ShopActionButton>
            )}
          </aside>
        </div>
      ) : (
        <div className="shop-route-empty">
          <span aria-hidden="true"><ShoppingBag size={34} strokeWidth={1.65} /></span>
          <h2>Your bag is clear.</h2>
          <ShopActionLink href="/shop/search">Find a piece</ShopActionLink>
        </div>
      )}
    </div>
  );
}
