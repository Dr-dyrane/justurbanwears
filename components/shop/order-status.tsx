"use client";

import { ArrowLeft, BellRing, PackageSearch, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authSignInPath } from "../../lib/auth/return-to";
import { WardrobeMotion } from "../brand/wardrobe-motion";
import { formatNaira } from "../../lib/shop/catalog";
import {
  customerNextAction,
  formatConnectedOrderDate,
  orderEventLabel,
  orderNeedsEvidence,
  orderStateLabel,
  orderStateSummary,
} from "../../lib/shop/order-presentation";
import type { ShopServerOrder } from "../../lib/shop/server-order/types";
import type { ShopCommerceGuidance } from "../../lib/shop/server-order/commerce-guidance";
import { ShopActionLink } from "./atoms/action";
import { ShopLink as Link } from "./atoms/shop-link";
import { PaymentEvidenceUpload } from "./payment-evidence-upload";
import { ProductDisplayName } from "./product-display-name";
import { ProductVisual } from "./product-visual";
import { ReturnRequest } from "./return-request";
import { OrderCustomerActions } from "./order-customer-actions";
import {
  useShopMobileAction,
  type ShopMobileAction,
} from "./shop-mobile-action-context";
import { useShop } from "./shop-provider";

type OrderStatusState = "ready" | "not-found" | "error";

function orderMobileAction(order: ShopServerOrder): ShopMobileAction {
  if (orderNeedsEvidence(order)) {
    return {
      eyebrow: "Payment required",
      href: "#shop-order-payment",
      label: order.paymentReviewStatus === "REVIEW_REJECTED" ? "Send a clearer receipt" : "Send your receipt",
    };
  }
  if (order.canRequestReturn) {
    return {
      eyebrow: "Return window",
      href: "#shop-order-return",
      label: "Request a return",
    };
  }
  if (order.return && order.return.status !== "REJECTED" && order.return.status !== "RESOLVED") {
    return {
      eyebrow: "Return update",
      href: "#shop-order-return",
      label: "Review your return",
    };
  }
  if (order.lifecycleStatus === "ACTIVE") {
    return {
      eyebrow: "Order status",
      href: "#shop-order-updates",
      label: "Check for updates",
    };
  }
  if (order.lifecycleStatus === "CANCELLED" || order.lifecycleStatus === "EXPIRED") {
    return {
      eyebrow: "The wardrobe",
      href: "/shop/search",
      label: "Find another piece",
    };
  }
  return { eyebrow: "Your orders", href: "/shop/orders", label: "View all orders" };
}

export function OrderStatus({
  commerceGuidance,
  initialError = "",
  initialOrder,
  initialState,
  justPlaced = false,
  reference,
}: {
  commerceGuidance: ShopCommerceGuidance;
  initialError?: string;
  initialOrder: ShopServerOrder | null;
  initialState: OrderStatusState;
  justPlaced?: boolean;
  reference: string;
}) {
  const { getProduct } = useShop();
  const [order, setOrder] = useState<ShopServerOrder | null>(initialOrder);
  const [state, setState] = useState<OrderStatusState>(initialState);
  const [error, setError] = useState(initialError);
  const [evidenceNotice, setEvidenceNotice] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const manualRefreshControllerRef = useRef<AbortController | null>(null);

  const refreshOrder = useCallback(async (signal: AbortSignal, announce: boolean) => {
    try {
      const response = await fetch(`/api/shop/orders/${encodeURIComponent(reference)}`, {
        cache: "no-store",
        credentials: "same-origin",
        signal,
      });
      const body = await response.json().catch(() => ({})) as { ok?: boolean; order?: ShopServerOrder };
      if (response.status === 401) {
        window.location.assign(authSignInPath(`/shop/orders/${reference}`));
        return;
      }
      if (response.status === 404) {
        setOrder(null);
        setState("not-found");
        setRefreshError("");
        return;
      }
      if (!response.ok || !body.ok || !body.order) {
        throw new Error("Updates could not be checked.");
      }
      setOrder(body.order);
      setState("ready");
      setError("");
      setRefreshError("");
    } catch {
      if (signal.aborted) return;
      setRefreshError("Updates could not be checked. Showing the last confirmed order state.");
    } finally {
      if (announce && !signal.aborted) setRefreshing(false);
    }
  }, [reference]);

  useEffect(() => {
    if (state !== "ready") return;
    const controller = new AbortController();
    let pollInFlight = false;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible" || pollInFlight) return;
      pollInFlight = true;
      void refreshOrder(controller.signal, false).finally(() => {
        pollInFlight = false;
      });
    }, 15_000);
    return () => {
      window.clearInterval(interval);
      controller.abort();
    };
  }, [refreshOrder, state]);

  useEffect(() => () => manualRefreshControllerRef.current?.abort(), []);

  useEffect(() => {
    if (!justPlaced) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("placed");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [justPlaced]);

  const timeline = useMemo(
    () => [...(order?.events ?? [])].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)),
    [order?.events],
  );
  const mobileAction = useMemo(() => order ? orderMobileAction(order) : null, [order]);
  useShopMobileAction(mobileAction);

  function checkForUpdates() {
    if (refreshing) return;
    manualRefreshControllerRef.current?.abort();
    const controller = new AbortController();
    manualRefreshControllerRef.current = controller;
    setRefreshing(true);
    setRefreshError("");
    void refreshOrder(controller.signal, true);
  }

  if (state === "not-found" || state === "error" || !order) {
    return (
      <div className="shop-list-page">
        <div className="shop-route-empty" role={state === "error" ? "alert" : undefined}>
          {state === "not-found" ? (
            <div className="juw-absence-motion">
              <WardrobeMotion artwork="logo" polarity="light" size="sm" variant="empty" />
            </div>
          ) : <span aria-hidden="true"><PackageSearch size={34} strokeWidth={1.65} /></span>}
          <p className="shop-kicker">{state === "error" ? "Order unavailable" : "Order not found"}</p>
          <h1>{state === "error" ? error : "That order is not available to this account."}</h1>
          <ShopActionLink href="/shop/orders">Your orders</ShopActionLink>
        </div>
      </div>
    );
  }

  const nextAction = customerNextAction(order);
  const states = orderStateSummary(order);
  const showSuccessMoment = justPlaced || Boolean(order.fundsConfirmation);

  return (
    <div className="shop-list-page shop-status-page">
      <div className="shop-product-topline">
        <Link href="/shop/orders"><ArrowLeft aria-hidden="true" size={15} strokeWidth={1.8} /> Your orders</Link>
        <span>{order.reference}</span>
      </div>

      <header className="shop-status-heading shop-connected-status-heading">
        <div>
          {showSuccessMoment ? (
            <div className="juw-order-success-motion">
              <WardrobeMotion artwork="logo" polarity="light" size="sm" variant="success" />
            </div>
          ) : null}
          <p className="shop-kicker">Order status</p>
          <h1>{nextAction.title}.</h1>
          <p>{nextAction.detail}</p>
        </div>
        <span className="shop-status-pill"><i aria-hidden="true" /><span>{orderStateLabel(order.lifecycleStatus)}</span></span>
      </header>

      <section className="shop-connected-state-grid" aria-label="Order state">
        {states.map((item) => (
          <div key={item.label}>
            <small>{item.label}</small>
            <strong>{item.value}</strong>
          </div>
        ))}
      </section>

      <div className="shop-status-layout">
        <div className="shop-connected-order-main">
          {refreshError ? (
            <p className="shop-order-refresh-feedback is-error" role="alert">
              {refreshError}
            </p>
          ) : null}
          {evidenceNotice ? <p className="shop-evidence-feedback shop-evidence-persistent-feedback" aria-live="polite" role="status">{evidenceNotice}</p> : null}
          {orderNeedsEvidence(order) ? (
            <div id="shop-order-payment">
              {commerceGuidance.payment.available ? (
                <PaymentEvidenceUpload
                  paymentInstructions={commerceGuidance.payment}
                  reference={order.reference}
                  onReceived={(nextOrder) => {
                    setOrder(nextOrder);
                    setRefreshError("");
                    setEvidenceNotice("Transfer receipt received. Lulu will confirm your payment.");
                  }}
                />
              ) : (
                <section className="shop-evidence-upload" role="alert">
                  <p className="shop-kicker">Payment paused</p>
                  <h2>Do not transfer yet.</h2>
                  <p>{commerceGuidance.payment.message}</p>
                </section>
              )}
            </div>
          ) : order.evidence.length ? (
            <section className="shop-evidence-received" aria-labelledby="evidence-state-title">
              <p className="shop-kicker">Transfer receipt</p>
              <h2 id="evidence-state-title">{orderStateLabel(order.paymentReviewStatus)}.</h2>
              <p>
                {order.fundsConfirmationStatus === "CONFIRMED"
                  ? "Receipt checked. Payment confirmed."
                  : order.paymentReviewStatus === "REVIEW_APPROVED"
                    ? "Receipt checked. Lulu is confirming the payment."
                    : <>Lulu is checking your transfer. Payment: <strong>{orderStateLabel(order.fundsConfirmationStatus)}</strong>.</>}
              </p>
              <ul>
                {order.evidence.filter((item) => item.status !== "SUPERSEDED").map((item) => (
                  <li key={item.id}>
                    <span>{item.originalFileName}</span>
                    <small>{item.status === "RECEIVED" ? "Ready for review" : "Ready to upload"} · {Math.ceil(item.byteSize / 1024)} KB</small>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {order.fundsConfirmation ? (
                      <section className="shop-payment-receipt" aria-labelledby="payment-confirmed-title">
                        <p className="shop-kicker">Payment receipt</p>
                        <h2 id="payment-confirmed-title">Payment confirmed.</h2>
                        <p>
                          {order.fundsConfirmation.paidAmount && order.fundsConfirmation.paidCurrency
                            ? <>Lulu confirmed receiving <strong>{formatNaira(order.fundsConfirmation.paidAmount)}</strong>.</>
                            : "The exact amount was not recorded on the original confirmation."}
                        </p>
                        <dl>
                          <div><dt>Transfer reference</dt><dd>{order.fundsConfirmation.transferReference}</dd></div>
                          <div><dt>Receiving account</dt><dd>{order.fundsConfirmation.receivingAccountLabel}</dd></div>
                          <div><dt>Confirmed</dt><dd><time dateTime={order.fundsConfirmation.confirmedAt}>{formatConnectedOrderDate(order.fundsConfirmation.confirmedAt)}</time></dd></div>
                          {order.fundsConfirmation.updatedAt !== order.fundsConfirmation.confirmedAt ? <div><dt>Last corrected</dt><dd><time dateTime={order.fundsConfirmation.updatedAt}>{formatConnectedOrderDate(order.fundsConfirmation.updatedAt)}</time></dd></div> : null}
                          <div><dt>Verified by</dt><dd>{order.fundsConfirmation.verifierDisplayName}</dd></div>
                        </dl>
                      </section>
                    ) : null}

                    {order.fulfillment.kind === "DELIVERY" && (
                      order.fulfillmentFacts.dispatchedAt || order.fulfillmentFacts.deliveredAt
                    ) ? (
                      <section className="shop-tracking-card" aria-labelledby="delivery-tracking-title">
                        <p className="shop-kicker">Delivery tracking</p>
                        <h2 id="delivery-tracking-title">
                          {order.fulfillmentFacts.deliveredAt ? "Delivered." : "Dispatched."}
                        </h2>
                        <dl>
                          {order.fulfillmentFacts.carrierName ? <div><dt>Carrier</dt><dd>{order.fulfillmentFacts.carrierName}</dd></div> : null}
                          {order.fulfillmentFacts.trackingReference ? <div><dt>Tracking reference</dt><dd>{order.fulfillmentFacts.trackingReference}</dd></div> : null}
                          {order.fulfillmentFacts.trackingUrl ? <div><dt>Track online</dt><dd><a href={order.fulfillmentFacts.trackingUrl} rel="noreferrer" target="_blank">Open carrier tracking</a></dd></div> : null}
                          {order.fulfillmentFacts.dispatchedAt ? <div><dt>Dispatched</dt><dd><time dateTime={order.fulfillmentFacts.dispatchedAt}>{formatConnectedOrderDate(order.fulfillmentFacts.dispatchedAt)}</time></dd></div> : null}
                          {order.fulfillmentFacts.recipientName ? <div><dt>Recipient</dt><dd>{order.fulfillmentFacts.recipientName}</dd></div> : null}
                          {order.fulfillmentFacts.deliveredAt ? <div><dt>Delivered</dt><dd><time dateTime={order.fulfillmentFacts.deliveredAt}>{formatConnectedOrderDate(order.fulfillmentFacts.deliveredAt)}</time></dd></div> : null}
                        </dl>
                      </section>
                    ) : order.fulfillment.kind === "PICKUP" && (order.fulfillmentFacts.pickupAppointment || order.fulfillmentFacts.deliveredAt) ? (
                      <section className="shop-tracking-card" aria-labelledby="pickup-record-title">
                        <p className="shop-kicker">Studio pickup</p>
                        <h2 id="pickup-record-title">{order.fulfillmentFacts.deliveredAt ? "Collected." : "Pickup scheduled."}</h2>
                        <dl>
                          {order.fulfillmentFacts.pickupAppointment ? <div><dt>Appointment</dt><dd><time dateTime={order.fulfillmentFacts.pickupAppointment}>{formatConnectedOrderDate(order.fulfillmentFacts.pickupAppointment)}</time></dd></div> : null}
                          {order.fulfillmentFacts.recipientName ? <div><dt>Collected by</dt><dd>{order.fulfillmentFacts.recipientName}</dd></div> : null}
                          {order.fulfillmentFacts.deliveredAt ? <div><dt>Collected</dt><dd><time dateTime={order.fulfillmentFacts.deliveredAt}>{formatConnectedOrderDate(order.fulfillmentFacts.deliveredAt)}</time></dd></div> : null}
                        </dl>
                      </section>
                    ) : null}

                    <ReturnRequest
                      commerceGuidance={commerceGuidance}
                      order={order}
                      onUpdated={(nextOrder) => {
                        setOrder(nextOrder);
                        setRefreshError("");
                      }}
                    />

                    <OrderCustomerActions
                      order={order}
                      onUpdated={(nextOrder, notice) => {
                        setOrder(nextOrder);
                        setRefreshError("");
                        setEvidenceNotice(notice);
                      }}
                    />

          <section className="shop-timeline shop-connected-timeline" id="shop-order-updates" aria-labelledby="timeline-title">
            <div className="shop-connected-section-heading">
              <div><p className="shop-kicker">Recorded updates</p><h2 id="timeline-title">Order timeline</h2></div>
              <button
                aria-busy={refreshing}
                className="shop-timeline-refresh"
                disabled={refreshing}
                onClick={checkForUpdates}
                type="button"
              >
                <RefreshCw aria-hidden="true" size={15} />
                {refreshing ? "Checking…" : "Check for updates"}
              </button>
            </div>
            <ol>
              {timeline.map((event, index) => (
                <li aria-current={index === timeline.length - 1 ? "step" : undefined} className={index === timeline.length - 1 ? "is-current" : "is-complete"} key={event.id}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{orderEventLabel(event, order.fulfillment.kind)}</strong>
                    {event.note ? <p>{event.note}</p> : null}
                    <p>{event.actorKind === "CUSTOMER" ? "Customer" : event.actorKind === "OPERATOR" ? "Lulu · Studio" : "Order system"}</p>
                    <time dateTime={event.occurredAt}>{formatConnectedOrderDate(event.occurredAt)}</time>
                  </div>
                </li>
              ))}
            </ol>
            <p className="shop-connected-notification-note"><BellRing aria-hidden="true" size={14} /> Updates are always saved here.</p>
          </section>
        </div>

        <aside className="shop-status-summary glass-surface">
          <p className="shop-kicker">Order overview</p>
          <div className="shop-status-products">
            {order.lines.map((line) => {
              const product = getProduct(line.slug);
              const content = (
                <>
                  {product ? <ProductVisual compact product={product} /> : <span className="shop-status-product-placeholder" aria-hidden="true" />}
                  <span><strong><ProductDisplayName name={line.name} /></strong><small>{line.taggedSize} · Quantity 1</small></span>
                </>
              );
              return product ? <Link href={`/shop/products/${line.slug}`} key={line.slug}>{content}</Link> : <div key={line.slug}>{content}</div>;
            })}
          </div>
          <dl>
            <div><dt>Reference</dt><dd>{order.reference}</dd></div>
            <div><dt>Reserved</dt><dd>{formatConnectedOrderDate(order.savedAt)}</dd></div>
            {order.reservationExpiresAt ? <div><dt>Reservation expires</dt><dd><time dateTime={order.reservationExpiresAt}>{formatConnectedOrderDate(order.reservationExpiresAt)}</time></dd></div> : null}
            <div><dt>{order.fulfillment.kind === "PICKUP" ? "Pickup" : "Delivery"}</dt><dd>{order.deliveryLabel}</dd></div>
            <div><dt>Estimate</dt><dd>{order.deliveryEstimate}</dd></div>
            <div><dt>Contact</dt><dd>{order.contact.email}</dd></div>
            {order.fulfillment.kind === "DELIVERY" ? (
              <div><dt>Destination</dt><dd>{order.fulfillment.address.street}, {order.fulfillment.address.area}, {order.fulfillment.address.state}</dd></div>
            ) : <div><dt>Collection</dt><dd>Lagos studio</dd></div>}
            <div><dt>Total</dt><dd>{formatNaira(order.total)}</dd></div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
