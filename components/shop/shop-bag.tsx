"use client";

import { ShoppingBag } from "lucide-react";
import { formatNaira, getShopProduct } from "../../lib/shop/catalog";
import { ShopActionLink } from "./atoms/action";
import { ShopLink as Link } from "./atoms/shop-link";
import { ProductVisual } from "./product-visual";
import { useShop } from "./shop-provider";

export function ShopBag() {
  const { bag, removeFromBag } = useShop();
  const lines = bag.flatMap((item) => {
    const product = getShopProduct(item.slug);
    return product ? [{ ...item, product }] : [];
  });
  const subtotal = lines.reduce((sum, line) => sum + line.product.price, 0);

  return (
    <div className="shop-list-page shop-bag-page">
      <header className="shop-list-heading">
        <p className="shop-kicker">Bag</p>
        <h1>Review your bag.</h1>
      </header>

      {lines.length ? (
        <div className="shop-bag-layout">
          <section className="shop-bag-lines" aria-label="Bag items">
            {lines.map(({ product, size }) => (
              <article className="shop-bag-line" key={product.slug}>
                <Link href={`/shop/products/${product.slug}`}><ProductVisual product={product} compact /></Link>
                <div>
                  <span>{product.sku} · {size}</span>
                  <h2>{product.name}</h2>
                  <p>{formatNaira(product.price)} · Quantity 1</p>
                  <button onClick={() => removeFromBag(product.slug)} type="button">Remove</button>
                </div>
              </article>
            ))}
          </section>
          <aside className="shop-order-summary glass-surface">
            <p className="shop-kicker">Order summary</p>
            <dl>
              <div><dt>Subtotal</dt><dd>{formatNaira(subtotal)}</dd></div>
              <div><dt>Delivery</dt><dd>Chosen at checkout</dd></div>
              <div><dt>Order status</dt><dd>Not created</dd></div>
            </dl>
            <ShopActionLink href="/shop/checkout">Continue to checkout</ShopActionLink>
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
