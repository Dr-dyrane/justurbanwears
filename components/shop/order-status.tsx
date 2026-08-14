"use client";

import { ArrowLeft, BellRing, PackageSearch, RefreshCw } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { authSignInPath } from "../../lib/auth/return-to";
import { formatNaira } from "../../lib/shop/catalog";
import {
  customerNextAction,
  formatConnectedOrderDate,
  orderNeedsEvidence,
  orderStateLabel,
  orderStateSummary,
} from "../../lib/shop/order-presentation";
import type { ShopServerOrder } from "../../lib/shop/server-order/types";
import { ShopActionLink } from "./atoms/action";
import { ShopLink as Link } from "./atoms/shop-link";
import { PaymentEvidenceUpload } from "./payment-evidence-upload";
import { ProductVisual } from "./product-visual";
import { ReturnRequest } from "./return-request";
import { useShop } from "./shop-provider";

export function OrderStatus() {
  const params = useParams<{ id: string }>();
  const reference = params.id;
  const { getProduct } = useShop();
  const [order, setOrder] = useState<ShopServerOrder | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [error, setError] = useState("");
  const [evidenceNotice, setEvidenceNotice] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load(showFailure: boolean) {
      try {
        const response = await fetch(`/api/shop/orders/${encodeURIComponent(reference)}`, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        const body = await response.json().catch(() => ({})) as { ok?: boolean; order?: ShopServerOrder };
        if (response.status === 401) {
          window.location.assign(authSignInPath(`/shop/orders/${reference}`));
          return;
        }
        if (response.status === 404) {
          setState("not-found");
          return;
        }
        if (!response.ok || !body.ok || !body.order) throw new Error("This order could not be opened. Try again.");
        setOrder(body.order);
        setState("ready");
        setError("");
      } catch (cause) {
        if (controller.signal.aborted) return;
        if (showFailure) {
          setError(cause instanceof Error ? cause.message : "This order could not be opened. Try again.");
          setState("error");
        }
      } finally {
        setRefreshing(false);
      }
    }
    void load(true);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(false);
    }, 15_000);
    return () => {
      window.clearInterval(interval);
      controller.abort();
    };
  }, [reference, refreshNonce]);

  const timeline = useMemo(
    () => [...(order?.events ?? [])].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)),
    [order?.events],
  );

  if (state === "loading") {
    return (
      <div className="shop-list-page">
        <div className="shop-route-empty" aria-live="polite" role="status"><h1>Opening your order…</h1></div>
      </div>
    );
  }

  if (state === "not-found" || state === "error" || !order) {
    return (
      <div className="shop-list-page">
        <div className="shop-route-empty" role={state === "error" ? "alert" : undefined}>
          <span aria-hidden="true"><PackageSearch size={34} strokeWidth={1.65} /></span>
          <p className="shop-kicker">Order not found</p>
          <h1>{state === "error" ? error : "That order is not available to this account."}</h1>
          <ShopActionLink href="/shop/orders">Your orders</ShopActionLink>
        </div>
      </div>
    );
  }

  const nextAction = customerNextAction(order);
  const states = orderStateSummary(order);

  return (
    <div className="shop-list-page shop-status-page">
      <div className="shop-product-topline">
        <Link href="/shop/orders"><ArrowLeft aria-hidden="true" size={15} strokeWidth={1.8} /> Your orders</Link>
        <span>{order.reference}</span>
      </div>

      <header className="shop-status-heading shop-connected-status-heading">
        <div>
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
          {evidenceNotice ? <p className="shop-evidence-feedback shop-evidence-persistent-feedback" aria-live="polite" role="status">{evidenceNotice}</p> : null}
          {orderNeedsEvidence(order) ? (
            <PaymentEvidenceUpload
              reference={order.reference}
              onReceived={(nextOrder) => {
                setOrder(nextOrder);
                setEvidenceNotice("Evidence received. Lulu will review it. This does not prove bank payment.");
              }}
            />
          ) : order.evidence.length ? (
            <section className="shop-evidence-received" aria-labelledby="evidence-state-title">
              <p className="shop-kicker">Private evidence</p>
              <h2 id="evidence-state-title">{orderStateLabel(order.paymentReviewStatus)}.</h2>
              <p>Evidence review is separate from settled-funds confirmation. Current funds state: <strong>{orderStateLabel(order.fundsConfirmationStatus)}</strong>.</p>
              <ul>
                {order.evidence.filter((item) => item.status !== "SUPERSEDED").map((item) => (
                  <li key={item.id}>
                    <span>{item.originalFileName}</span>
                    <small>{item.status === "RECEIVED" ? "Received privately" : "Upload authorized"} · {Math.ceil(item.byteSize / 1024)} KB</small>
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
                          Lulu reconciled settled funds for <strong>{formatNaira(order.total)}</strong> against the receiving account.
                        </p>
                        <dl>
                          <div><dt>Transfer reference</dt><dd>{order.fundsConfirmation.transferReference}</dd></div>
                          <div><dt>Receiving account</dt><dd>{order.fundsConfirmation.receivingAccountLabel}</dd></div>
                          <div><dt>Confirmed</dt><dd><time dateTime={order.fundsConfirmation.confirmedAt}>{formatConnectedOrderDate(order.fundsConfirmation.confirmedAt)}</time></dd></div>
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
                          {order.fulfillmentFacts.dispatchReference ? <div><dt>Dispatch record</dt><dd>{order.fulfillmentFacts.dispatchReference}</dd></div> : null}
                          {order.fulfillmentFacts.dispatchedAt ? <div><dt>Dispatched</dt><dd><time dateTime={order.fulfillmentFacts.dispatchedAt}>{formatConnectedOrderDate(order.fulfillmentFacts.dispatchedAt)}</time></dd></div> : null}
                          {order.fulfillmentFacts.recipientName ? <div><dt>Recipient</dt><dd>{order.fulfillmentFacts.recipientName}</dd></div> : null}
                          {order.fulfillmentFacts.deliveredAt ? <div><dt>Delivered</dt><dd><time dateTime={order.fulfillmentFacts.deliveredAt}>{formatConnectedOrderDate(order.fulfillmentFacts.deliveredAt)}</time></dd></div> : null}
                          {order.fulfillmentFacts.deliveryProofReference ? <div><dt>Proof reference</dt><dd>{order.fulfillmentFacts.deliveryProofReference}</dd></div> : null}
                        </dl>
                      </section>
                    ) : order.fulfillment.kind === "PICKUP" && order.fulfillmentFacts.deliveredAt ? (
                      <section className="shop-tracking-card" aria-labelledby="pickup-record-title">
                        <p className="shop-kicker">Studio pickup</p>
                        <h2 id="pickup-record-title">Collected.</h2>
                        <dl>
                          {order.fulfillmentFacts.pickupAppointment ? <div><dt>Appointment</dt><dd><time dateTime={order.fulfillmentFacts.pickupAppointment}>{formatConnectedOrderDate(order.fulfillmentFacts.pickupAppointment)}</time></dd></div> : null}
                          {order.fulfillmentFacts.recipientName ? <div><dt>Collected by</dt><dd>{order.fulfillmentFacts.recipientName}</dd></div> : null}
                          <div><dt>Collected</dt><dd><time dateTime={order.fulfillmentFacts.deliveredAt}>{formatConnectedOrderDate(order.fulfillmentFacts.deliveredAt)}</time></dd></div>
                          {order.fulfillmentFacts.deliveryProofReference ? <div><dt>Handoff reference</dt><dd>{order.fulfillmentFacts.deliveryProofReference}</dd></div> : null}
                        </dl>
                      </section>
                    ) : null}

                    <ReturnRequest order={order} onUpdated={setOrder} />

          <section className="shop-timeline shop-connected-timeline" aria-labelledby="timeline-title">
            <div className="shop-connected-section-heading">
              <div><p className="shop-kicker">Recorded updates</p><h2 id="timeline-title">Order timeline</h2></div>
              <button
                aria-busy={refreshing}
                className="shop-timeline-refresh"
                disabled={refreshing}
                onClick={() => {
                  setRefreshing(true);
                  setRefreshNonce((value) => value + 1);
                }}
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
                    <strong>{event.note ?? orderStateLabel(event.eventType)}</strong>
                    <p>{event.actorKind === "CUSTOMER" ? "Customer" : event.actorKind === "OPERATOR" ? "Lulu · Studio" : "Order system"}</p>
                    <time dateTime={event.occurredAt}>{formatConnectedOrderDate(event.occurredAt)}</time>
                  </div>
                </li>
              ))}
            </ol>
            <p className="shop-connected-notification-note"><BellRing aria-hidden="true" size={14} /> External notifications are not connected. Every accepted update remains visible here.</p>
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
                  <span><strong>{line.name}</strong><small>{line.taggedSize} · Quantity 1</small></span>
                </>
              );
              return product ? <Link href={`/shop/products/${line.slug}`} key={line.slug}>{content}</Link> : <div key={line.slug}>{content}</div>;
            })}
          </div>
          <dl>
            <div><dt>Reference</dt><dd>{order.reference}</dd></div>
            <div><dt>Reserved</dt><dd>{formatConnectedOrderDate(order.savedAt)}</dd></div>
            {order.reservationExpiresAt ? <div><dt>Reservation expires</dt><dd><time dateTime={order.reservationExpiresAt}>{formatConnectedOrderDate(order.reservationExpiresAt)}</time></dd></div> : null}
            <div><dt>Handoff</dt><dd>{order.deliveryLabel}</dd></div>
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
