"use client";

import { MapPin, ShoppingBag } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { formatNaira } from "../../lib/shop/catalog";
import { shopDeliveryOptions, type ShopDeliveryId } from "../../lib/shop/commerce";
import type {
  ShopCheckoutFailureReason,
  ShopCheckoutRequest,
} from "../../lib/shop/domain/entities";
import { createWhatsAppOrderUrl } from "../../lib/shop/whatsapp-order";
import { ShopActionButton, ShopActionLink } from "./atoms/action";
import { LocalCommerceDisclosure } from "./atoms/status";
import { ShopDeliveryLocation } from "./location/shop-delivery-location";
import { ProductVisual } from "./product-visual";
import { useShop } from "./shop-provider";

export function ShopCheckout({
  mapboxAccessToken,
  whatsappOrderNumber,
}: {
  mapboxAccessToken: string;
  whatsappOrderNumber: string | null;
}) {
  const {
    bag,
    beginCheckout,
    closeCheckout,
    getProduct,
    hydration,
    isOnline,
    lifecycle,
    saveCheckout,
  } = useShop();
  const [deliveryId, setDeliveryId] = useState<ShopDeliveryId>("lagos");
  const [deliveryAddressId, setDeliveryAddressId] = useState<Exclude<ShopDeliveryId, "pickup">>("lagos");
  const [formNotice, setFormNotice] = useState("");
  const lines = bag.flatMap((item) => {
    const product = getProduct(item.slug);
    return product ? [{ ...item, product }] : [];
  });
  const delivery = shopDeliveryOptions.find((item) => item.id === deliveryId) ?? shopDeliveryOptions[0];
  const subtotal = lines.reduce((sum, line) => sum + line.product.price, 0);
  const isSaving = lifecycle === "saving-checkout";
  const shouldOfferWhatsApp = Boolean(whatsappOrderNumber && isOnline);

  useEffect(() => {
    beginCheckout();
    return closeCheckout;
  }, [beginCheckout, closeCheckout]);

  function checkoutNotice(reason: ShopCheckoutFailureReason) {
    if (reason === "BAG_CHANGED") return "A piece changed availability. Review your bag.";
    if (reason === "AVAILABILITY_UNCONFIRMED") return "We could not confirm current availability. Please try again.";
    if (reason === "INVALID_CHECKOUT") return "Check your contact and handoff details.";
    if (reason === "PERSISTENCE_FAILED") return "This browser could not save the checkout.";
    if (reason === "IN_PROGRESS") return "Checkout is already saving.";
    return "Your bag changed. Review it before continuing.";
  }

  async function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lines.length || isSaving) return;
    setFormNotice("");
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? "");
    const contact: ShopCheckoutRequest["contact"] = {
      name: field("name"),
      email: field("email"),
      phone: field("phone"),
    };
    const fulfillment: ShopCheckoutRequest["fulfillment"] = deliveryId === "pickup"
      ? { kind: "PICKUP", optionId: "pickup" }
      : {
          kind: "DELIVERY",
          optionId: deliveryId,
          address: {
            street: field("address"),
            area: field("area"),
            state: field("state"),
            country: "Nigeria",
          },
        };
    const result = await saveCheckout({ contact, fulfillment });
    if (result.ok === false) {
      setFormNotice(checkoutNotice(result.reason));
      return;
    }
    const whatsappUrl = createWhatsAppOrderUrl(shouldOfferWhatsApp ? whatsappOrderNumber : null, {
      reference: result.orderId,
      contact,
      fulfillment: fulfillment.kind === "PICKUP"
        ? {
            kind: "PICKUP",
            label: delivery.label,
            estimate: delivery.estimate,
          }
        : {
            kind: "DELIVERY",
            label: delivery.label,
            estimate: delivery.estimate,
            address: fulfillment.address,
          },
      lines: lines.map(({ product }) => ({
        name: product.name,
        sku: product.sku,
        taggedSize: product.taggedSize,
        unitPrice: product.price,
        quantity: 1,
      })),
      subtotal,
      deliveryFee: delivery.fee,
      total: subtotal + delivery.fee,
    });
    window.location.assign(whatsappUrl ?? `/shop/orders/${result.orderId}`);
  }

  if (hydration === "idle" || hydration === "restoring") {
    return (
      <div className="shop-list-page">
        <div className="shop-route-empty" aria-live="polite" role="status">
          <h1>Opening checkout…</h1>
        </div>
      </div>
    );
  }

  if (!lines.length) {
    return (
      <div className="shop-list-page">
        <div className="shop-route-empty">
          <span aria-hidden="true"><ShoppingBag size={34} strokeWidth={1.65} /></span>
          <p className="shop-kicker">Checkout</p>
          <h1>Your bag needs a piece first.</h1>
          <ShopActionLink href="/shop/search">Search the wardrobe</ShopActionLink>
        </div>
      </div>
    );
  }

  return (
    <div className="shop-list-page shop-checkout-page">
      <header className="shop-list-heading">
        <p className="shop-kicker">Checkout</p>
        <h1>Review your handoff.</h1>
      </header>

      <form
        aria-busy={isSaving}
        className="shop-checkout-layout"
        onSubmit={submitCheckout}
      >
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
            </div>
          </section>

          <section aria-labelledby="delivery-title">
            <div className="shop-form-section-heading">
              <span>02</span>
              <div><p className="shop-kicker">Delivery</p><h2 id="delivery-title">Select a handoff.</h2></div>
            </div>
            <fieldset className="shop-delivery-options">
              <legend className="sr-only">Delivery or pickup method</legend>
              {shopDeliveryOptions.map((option) => (
                <label className={deliveryId === option.id ? "is-active" : undefined} key={option.id}>
                  <input
                    checked={deliveryId === option.id}
                    name="delivery"
                    onChange={() => {
                      setDeliveryId(option.id);
                      if (option.id !== "pickup") setDeliveryAddressId(option.id);
                    }}
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
            </fieldset>
          </section>

          <section aria-labelledby="destination-title">
            <div className="shop-form-section-heading">
              <span>03</span>
              <div>
                <p className="shop-kicker">{deliveryId === "pickup" ? "Collection" : "Destination"}</p>
                <h2 id="destination-title">
                  {deliveryId === "pickup" ? "Pickup in Lagos." : "Where should it arrive?"}
                </h2>
              </div>
            </div>
            {deliveryId === "pickup" ? (
              <div className="shop-pickup-card">
                <MapPin aria-hidden="true" size={19} strokeWidth={1.7} />
                <span>
                  <strong>justurban wears studio</strong>
                  <small>Lagos, Nigeria · Collection by appointment after payment.</small>
                </span>
              </div>
            ) : null}
            <div hidden={deliveryId === "pickup"}>
              <ShopDeliveryLocation
                accessToken={mapboxAccessToken}
                deliveryId={deliveryAddressId}
                disabled={deliveryId === "pickup"}
              />
            </div>
          </section>
        </div>

        <aside className="shop-order-summary glass-surface">
          <p className="shop-kicker">Payment required</p>
          <h2 className="shop-order-summary-title">Checkout summary</h2>
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
          <ShopActionButton disabled={isSaving} type="submit">
            {isSaving ? "Saving…" : shouldOfferWhatsApp ? "Continue on WhatsApp" : "Save checkout"}
          </ShopActionButton>
          {shouldOfferWhatsApp ? (
            <p className="shop-local-disclosure shop-order-boundary-disclosure">
              Payment is required. This draft stays on your device until WhatsApp opens for you to review and send it to Lulu.
            </p>
          ) : (
            <LocalCommerceDisclosure className="shop-order-boundary-disclosure" />
          )}
          <p className="shop-action-note" aria-live="polite" role="status">{formNotice}</p>
        </aside>
      </form>
    </div>
  );
}
