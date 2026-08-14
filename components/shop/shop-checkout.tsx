"use client";

import { MapPin, ShoppingBag } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { formatNaira } from "../../lib/shop/catalog";
import {
  checkoutPayloadFingerprint,
  createConnectedCheckoutIntent,
  mapConnectedOrderFailure,
} from "../../lib/shop/connected-order-client";
import { shopDeliveryOptions, type ShopDeliveryId } from "../../lib/shop/commerce";
import type { ShopCheckoutRequest } from "../../lib/shop/domain/entities";
import { isBagCheckoutAvailable } from "../../lib/shop/domain/state";
import { authSignInPath } from "../../lib/auth/return-to";
import { ShopActionButton, ShopActionLink } from "./atoms/action";
import {
  ShopDeliveryLocation,
  type DeliveryAddressDraft,
} from "./location/shop-delivery-location";
import { ProductVisual } from "./product-visual";
import { useShop } from "./shop-provider";

const DRAFT_STORAGE_KEY = "justurban-wears:connected-checkout:v1";

interface CheckoutDraft {
  version: 1;
  bagSignature: string;
  contact: ShopCheckoutRequest["contact"];
  address: DeliveryAddressDraft;
  deliveryId: ShopDeliveryId;
  idempotencyKey: string;
  payloadFingerprint: string;
}
const emptyContact: ShopCheckoutRequest["contact"] = { name: "", email: "", phone: "" };
const emptyAddress: DeliveryAddressDraft = { street: "", area: "", state: "" };

function readDraft(): CheckoutDraft | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(DRAFT_STORAGE_KEY) ?? "null") as Partial<CheckoutDraft> | null;
    if (
      !value
      || value.version !== 1
      || typeof value.bagSignature !== "string"
      || !value.contact
      || !value.address
      || !shopDeliveryOptions.some((option) => option.id === value.deliveryId)
      || typeof value.idempotencyKey !== "string"
      || typeof value.payloadFingerprint !== "string"
    ) return null;
    return value as CheckoutDraft;
  } catch {
    return null;
  }
}

function createIdempotencyKey() {
  return `checkout:${globalThis.crypto.randomUUID()}`;
}

export function ShopCheckout({ mapboxAccessToken }: { mapboxAccessToken: string }) {
  const {
    bag,
    beginCheckout,
    closeCheckout,
    commitConnectedOrder,
    getProduct,
    hydration,
    isOnline,
    products,
  } = useShop();
  const [deliveryId, setDeliveryId] = useState<ShopDeliveryId>("lagos");
  const [deliveryAddressId, setDeliveryAddressId] = useState<Exclude<ShopDeliveryId, "pickup">>("lagos");
  const [contact, setContact] = useState(emptyContact);
  const [address, setAddress] = useState(emptyAddress);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [payloadFingerprint, setPayloadFingerprint] = useState("");
  const [restored, setRestored] = useState(false);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState("");
  const [formError, setFormError] = useState("");
  const lines = bag.flatMap((item) => {
    const product = getProduct(item.slug);
    return product ? [{ ...item, product }] : [];
  });
  const bagSignature = useMemo(
    () => bag.map((item) => `${item.slug}:${item.size}`).sort().join("|"),
    [bag],
  );
  const delivery = shopDeliveryOptions.find((item) => item.id === deliveryId) ?? shopDeliveryOptions[0];
  const subtotal = lines.reduce((sum, line) => sum + line.product.price, 0);
  const checkoutAvailable = isBagCheckoutAvailable(bag, products);

  useEffect(() => {
    beginCheckout();
    return closeCheckout;
  }, [beginCheckout, closeCheckout]);

  useEffect(() => {
    if (hydration === "idle" || hydration === "restoring" || restored) return;
    const draft = readDraft();
    const frame = window.requestAnimationFrame(() => {
      if (draft?.bagSignature === bagSignature) {
        setContact(draft.contact);
        setAddress(draft.address);
        setDeliveryId(draft.deliveryId);
        if (draft.deliveryId !== "pickup") setDeliveryAddressId(draft.deliveryId);
        setIdempotencyKey(draft.idempotencyKey);
        setPayloadFingerprint(draft.payloadFingerprint);
      }
      if (new URL(window.location.href).searchParams.get("resume") === "1") {
        setProgress("Signed in. Review your details, then place the order.");
      }
      setRestored(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [bagSignature, hydration, restored]);

  useEffect(() => {
    if (!restored || !bagSignature) return;
    const draft: CheckoutDraft = {
      version: 1,
      bagSignature,
      contact,
      address,
      deliveryId,
      idempotencyKey,
      payloadFingerprint,
    };
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [address, bagSignature, contact, deliveryId, idempotencyKey, payloadFingerprint, restored]);

  async function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lines.length || pending) return;
    setFormError("");
    setProgress("Reserving your piece…");

    const request: ShopCheckoutRequest = {
      contact,
      fulfillment: deliveryId === "pickup"
        ? { kind: "PICKUP", optionId: "pickup" }
        : {
            kind: "DELIVERY",
            optionId: deliveryId,
            address: { ...address, country: "Nigeria" },
          },
    };
    const nextFingerprint = checkoutPayloadFingerprint(bag, request);
    const nextIdempotencyKey = idempotencyKey && payloadFingerprint === nextFingerprint
      ? idempotencyKey
      : createIdempotencyKey();
    const intent = createConnectedCheckoutIntent(bag, products, request, nextIdempotencyKey);
    if (!intent) {
      setProgress("");
      setFormError("A piece changed availability. Review your bag before placing the order.");
      return;
    }

    setIdempotencyKey(nextIdempotencyKey);
    setPayloadFingerprint(nextFingerprint);
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
      version: 1,
      bagSignature,
      contact,
      address,
      deliveryId,
      idempotencyKey: nextIdempotencyKey,
      payloadFingerprint: nextFingerprint,
    } satisfies CheckoutDraft));

    setPending(true);
    let response: Response;
    let body: {
      ok?: boolean;
      order?: { reference?: string; lines?: Array<{ slug?: string }> };
      error?: { code?: string; message?: string };
    } = {};
    try {
      response = await fetch("/api/shop/orders", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(intent),
      });
      body = await response.json().catch(() => ({}));
    } catch {
      setPending(false);
      setProgress("");
      setFormError("Orders are briefly unavailable. Your bag is safe; try again shortly.");
      return;
    }

    if (!response.ok || !body.ok || !body.order?.reference) {
      const failure = mapConnectedOrderFailure(response.status, body.error?.code);
      setPending(false);
      setProgress("");
      if (failure.kind === "AUTH_REQUIRED") {
        window.location.assign(authSignInPath("/shop/checkout?resume=1"));
        return;
      }
      if (failure.kind === "IDEMPOTENCY") {
        setIdempotencyKey("");
        setPayloadFingerprint("");
      }
      setFormError(failure.message);
      return;
    }

    const committedSlugs = intent.lines.map((line) => line.slug);
    const responseSlugs = body.order.lines?.map((line) => line.slug).filter((slug): slug is string => Boolean(slug)) ?? [];
    if (
      responseSlugs.length !== committedSlugs.length
      || committedSlugs.some((slug) => !responseSlugs.includes(slug))
    ) {
      setPending(false);
      setProgress("");
      setFormError("The order was received, but its confirmation was incomplete. Open Orders before trying again.");
      return;
    }

    setProgress("Your piece is reserved. Payment is still required.");
    try {
      await commitConnectedOrder(committedSlugs);
    } catch {
      // The authoritative order already exists. Its idempotency key remains stable
      // and the destination page will show server truth even if local storage fails.
    }
    window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    window.location.assign(`/shop/orders/${encodeURIComponent(body.order.reference)}`);
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

  if (!checkoutAvailable) {
    return (
      <div className="shop-list-page shop-checkout-page">
        <div className="shop-route-empty" aria-live="polite" role="status">
          <ShoppingBag aria-hidden="true" size={34} strokeWidth={1.65} />
          <p className="shop-kicker">Checkout paused</p>
          <h1>Availability needs a live check.</h1>
          <p>Your bag is still here. Checkout stays closed until every one-off piece is confirmed.</p>
          <ShopActionLink href="/shop/bag">Review your bag</ShopActionLink>
        </div>
      </div>
    );
  }

  return (
    <div className="shop-list-page shop-checkout-page">
      <header className="shop-list-heading">
        <p className="shop-kicker">Checkout</p>
        <h1>Review your order.</h1>
      </header>

      <form aria-busy={pending} className="shop-checkout-layout" onSubmit={submitCheckout}>
        <div className="shop-checkout-form">
          <section aria-labelledby="contact-title">
            <div className="shop-form-section-heading">
              <span>01</span>
              <div><p className="shop-kicker">Contact details</p><h2 id="contact-title">Where should we reach you?</h2></div>
            </div>
            <div className="shop-form-grid">
              <label>
                <span>Full name</span>
                <input autoComplete="name" name="name" onChange={(event) => setContact((value) => ({ ...value, name: event.target.value }))} required value={contact.name} />
              </label>
              <label>
                <span>Email</span>
                <input autoComplete="email" name="email" onChange={(event) => setContact((value) => ({ ...value, email: event.target.value }))} required type="email" value={contact.email} />
              </label>
              <label>
                <span>Phone</span>
                <input autoComplete="tel" inputMode="tel" name="phone" onChange={(event) => setContact((value) => ({ ...value, phone: event.target.value }))} required type="tel" value={contact.phone} />
              </label>
            </div>
          </section>

          <section aria-labelledby="delivery-title">
            <div className="shop-form-section-heading">
              <span>02</span>
              <div><p className="shop-kicker">Delivery</p><h2 id="delivery-title">Delivery or pickup?</h2></div>
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
                <h2 id="destination-title">{deliveryId === "pickup" ? "Pickup in Lagos." : "Where should it arrive?"}</h2>
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
                address={address}
                deliveryId={deliveryAddressId}
                disabled={deliveryId === "pickup"}
                onAddressChange={setAddress}
              />
            </div>
          </section>
        </div>

        <aside className="shop-order-summary glass-surface">
          <p className="shop-kicker">Payment required</p>
          <h2 className="shop-order-summary-title">Order summary</h2>
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
          <ShopActionButton disabled={pending || !isOnline} type="submit">
            {pending ? "Reserving your piece…" : "Place order"}
          </ShopActionButton>
          <p className="shop-local-disclosure shop-order-boundary-disclosure">
            Your piece is reserved when you place the order. Payment comes next.
          </p>
          {progress ? <p className="shop-action-note" aria-live="polite" role="status">{progress}</p> : null}
          {formError ? <p className="shop-action-note is-error" role="alert">{formError}</p> : null}
        </aside>
      </form>
    </div>
  );
}
