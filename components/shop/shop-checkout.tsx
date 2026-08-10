"use client";

import { ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { formatNaira, getShopProduct } from "../../lib/shop/catalog";
import { shopDeliveryOptions, type ShopDeliveryId } from "../../lib/shop/commerce";
import { ShopActionButton, ShopActionLink } from "./atoms/action";
import { LocalCommerceDisclosure } from "./atoms/status";
import { ProductVisual } from "./product-visual";
import { useShop } from "./shop-provider";

export function ShopCheckout() {
  const router = useRouter();
  const { bag, beginCheckout, closeCheckout, isOnline, placeOrder } = useShop();
  const [deliveryId, setDeliveryId] = useState<ShopDeliveryId>("lagos");
  const [formNotice, setFormNotice] = useState("");
  const lines = bag.flatMap((item) => {
    const product = getShopProduct(item.slug);
    return product ? [{ ...item, product }] : [];
  });
  const delivery = shopDeliveryOptions.find((item) => item.id === deliveryId) ?? shopDeliveryOptions[0];
  const subtotal = lines.reduce((sum, line) => sum + line.product.price, 0);

  useEffect(() => {
    beginCheckout();
    return closeCheckout;
  }, [beginCheckout, closeCheckout]);

  function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lines.length) return;
    const orderId = placeOrder(deliveryId);
    if (!orderId) {
      setFormNotice("Reconnect before placing this order.");
      return;
    }
    router.push(`/shop/orders/${orderId}`);
  }

  if (!lines.length) {
    return (
      <div className="shop-list-page">
        <div className="shop-route-empty">
          <span aria-hidden="true"><ShoppingBag size={34} strokeWidth={1.65} /></span>
          <p className="shop-kicker">Checkout</p>
          <h1>Your bag needs a piece first.</h1>
          <ShopActionLink href="/shop/search">Search the edit</ShopActionLink>
        </div>
      </div>
    );
  }

  return (
    <div className="shop-list-page shop-checkout-page">
      <header className="shop-list-heading">
        <p className="shop-kicker">Checkout</p>
        <h1>Choose your delivery.</h1>
      </header>

      <form className="shop-checkout-layout" onSubmit={submitOrder}>
        <div className="shop-checkout-form">
          <section aria-labelledby="contact-title">
            <div className="shop-form-section-heading">
              <span>01</span>
              <div><p className="shop-kicker">Contact details</p><h2 id="contact-title">Where should we reach you?</h2></div>
            </div>
            <div className="shop-form-grid">
              <label>
                <span>Full name</span>
                <input autoComplete="name" name="name" required />
              </label>
              <label>
                <span>Email</span>
                <input autoComplete="email" name="email" required type="email" />
              </label>
              <label>
                <span>Phone</span>
                <input autoComplete="tel" inputMode="tel" name="phone" required type="tel" />
              </label>
              <label className="shop-form-wide">
                <span>Street address</span>
                <input autoComplete="street-address" name="address" required />
              </label>
              <label>
                <span>Area or city</span>
                <input autoComplete="address-level2" name="area" required />
              </label>
              <label>
                <span>State</span>
                <input autoComplete="address-level1" name="state" required />
              </label>
            </div>
          </section>

          <section aria-labelledby="delivery-title">
            <div className="shop-form-section-heading">
              <span>02</span>
              <div><p className="shop-kicker">Delivery</p><h2 id="delivery-title">Select a handoff.</h2></div>
            </div>
            <div className="shop-delivery-options">
              {shopDeliveryOptions.map((option) => (
                <label className={deliveryId === option.id ? "is-active" : undefined} key={option.id}>
                  <input
                    checked={deliveryId === option.id}
                    name="delivery"
                    onChange={() => setDeliveryId(option.id)}
                    type="radio"
                    value={option.id}
                  />
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.estimate} · {option.note}</small>
                  </span>
                  <b>{option.fee ? formatNaira(option.fee) : "Free"}</b>
                </label>
              ))}
            </div>
          </section>

        </div>

        <aside className="shop-order-summary glass-surface">
          <p className="shop-kicker">Review order</p>
          <div className="shop-checkout-lines">
            {lines.map(({ product, size }) => (
              <div key={product.slug}>
                <ProductVisual compact product={product} />
                <span><strong>{product.name}</strong><small>{size} · Quantity 1</small></span>
                <b>{formatNaira(product.price)}</b>
              </div>
            ))}
          </div>
          <dl>
            <div><dt>Subtotal</dt><dd>{formatNaira(subtotal)}</dd></div>
            <div><dt>{delivery.label}</dt><dd>{delivery.fee ? formatNaira(delivery.fee) : "Free"}</dd></div>
            <div className="shop-summary-total"><dt>Total</dt><dd>{formatNaira(subtotal + delivery.fee)}</dd></div>
          </dl>
          <ShopActionButton disabled={!isOnline} type="submit">Place order</ShopActionButton>
          <LocalCommerceDisclosure className="shop-order-boundary-disclosure" />
          <p className="shop-action-note" aria-live="polite" role="status">{formNotice}</p>
        </aside>
      </form>
    </div>
  );
}
