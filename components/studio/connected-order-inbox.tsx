"use client";

import { ArrowUpRight, Inbox, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatNaira } from "../../lib/shop/catalog";
import { formatConnectedOrderDate, orderStateLabel } from "../../lib/shop/order-presentation";
import type {
  ShopOperatorReturnTransition,
  ShopOperatorTransition,
  ShopServerOrder,
} from "../../lib/shop/server-order/types";

function actionLabel(
  transition: ShopOperatorTransition | ShopOperatorReturnTransition | undefined,
): string {
  if (!transition) return "No action due";
  if (transition.dimension === "FUNDS_CONFIRMATION") return "Confirm settled funds";
  if (transition.dimension === "PAYMENT_REVIEW") {
    return transition.target === "UNDER_REVIEW" ? "Begin evidence review" : "Resolve evidence review";
  }
  if (transition.dimension === "LIFECYCLE") {
    return transition.target === "EXPIRED" ? "Release expired reservation" : "Cancel reservation";
  }
  if (transition.dimension === "RETURN") {
    return transition.target === "APPROVED"
      ? "Decide return request"
      : transition.target === "REJECTED"
        ? "Decide return request"
        : "Record returned piece";
  }
  if (transition.dimension === "REFUND") {
    return transition.target === "PENDING" ? "Start refund record" : "Resolve refund";
  }
  if (transition.dimension === "RETURN_RESOLUTION") return "Resolve returned inventory";
  return transition.target === "QUALITY_CHECK"
    ? "Begin quality check"
    : transition.target === "READY_FOR_HANDOFF"
      ? "Mark ready"
      : transition.target === "IN_TRANSIT"
        ? "Record dispatch"
        : "Complete handoff";
}

function nextTransition(order: ShopServerOrder) {
  return order.allowedReturnTransitions[0]
    ?? order.allowedTransitions.find((item) => item.dimension === "LIFECYCLE" && item.target === "EXPIRED")
    ?? order.allowedTransitions.find((item) => item.dimension === "PAYMENT_REVIEW")
    ?? order.allowedTransitions.find((item) => item.dimension === "FUNDS_CONFIRMATION")
    ?? order.allowedTransitions.find((item) => item.dimension === "FULFILLMENT")
    ?? order.allowedTransitions.find((item) => item.dimension === "LIFECYCLE");
}

export function ConnectedOrderInbox() {
  const [orders, setOrders] = useState<ShopServerOrder[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  const loadOrders = useCallback(async (signal?: AbortSignal) => {
    setState("loading");
    setError("");
    try {
      const response = await fetch("/api/studio/orders", {
        cache: "no-store",
        credentials: "same-origin",
        signal,
      });
      const body = await response.json().catch(() => ({})) as {
        ok?: boolean;
        orders?: ShopServerOrder[];
      };
      if (!response.ok || !body.ok || !Array.isArray(body.orders)) {
        throw new Error("Connected orders could not be opened.");
      }
      setOrders(body.orders);
      setState("ready");
    } catch (cause: unknown) {
      if (signal?.aborted) return;
      setError(cause instanceof Error ? cause.message : "Connected orders could not be opened.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadOrders(controller.signal);
    return () => controller.abort();
  }, [loadOrders]);

  return (
    <div className="studio-connected-orders-page">
      <header className="studio-connected-orders-heading">
        <div>
          <p className="eyebrow">Connected orders</p>
          <h1>One clear action at a time.</h1>
          <p>Customer reservations, evidence review, settled funds, handoff, and returns stay separate.</p>
        </div>
        <span>{orders.length} {orders.length === 1 ? "order" : "orders"}</span>
      </header>

      {state === "loading" ? (
        <div className="studio-loading" aria-live="polite" role="status">Opening connected orders…</div>
      ) : null}
      {state === "error" ? (
        <div className="studio-quiet-empty" role="alert">
          <Inbox aria-hidden="true" size={24} />
          <div><strong>Orders unavailable</strong><p>{error}</p></div>
          <button className="button button-secondary" onClick={() => void loadOrders()} type="button">Try again</button>
        </div>
      ) : null}
      {state === "ready" && !orders.length ? (
        <div className="studio-quiet-empty">
          <Inbox aria-hidden="true" size={24} />
          <div><strong>No connected orders yet</strong><p>Accepted customer reservations will appear here.</p></div>
        </div>
      ) : null}
      {state === "ready" && orders.length ? (
        <section className="studio-connected-order-list" aria-label="Connected order inbox">
          {orders.map((order) => {
            const firstLine = order.lines[0];
            const hasReturn = Boolean(order.return);
            return (
              <Link className="studio-connected-order-card" href={`/studio/orders/${order.reference}`} key={order.reference}>
                <div className="studio-connected-order-reference">
                  <small>{order.reference}</small>
                  <h2>{firstLine?.name ?? "Wardrobe order"}</h2>
                  <p>{order.lines.length} {order.lines.length === 1 ? "piece" : "pieces"} · {formatNaira(order.total)}</p>
                </div>
                <dl>
                  <div><dt>Evidence</dt><dd>{orderStateLabel(order.paymentReviewStatus)}</dd></div>
                  <div><dt>Funds</dt><dd>{orderStateLabel(order.fundsConfirmationStatus)}</dd></div>
                  <div><dt>Fulfilment</dt><dd>{orderStateLabel(order.fulfillmentStatus)}</dd></div>
                  <div>
                    <dt>{hasReturn ? "Return" : "Reserved"}</dt>
                    <dd>{hasReturn ? orderStateLabel(order.return!.status) : formatConnectedOrderDate(order.savedAt, false)}</dd>
                  </div>
                </dl>
                <div className="studio-connected-order-next">
                  <small>{hasReturn ? <><RotateCcw aria-hidden="true" size={13} /> Return action</> : "Next action"}</small>
                  <strong>{actionLabel(nextTransition(order))}</strong>
                  {order.reservationExpiresAt && order.lifecycleStatus === "ACTIVE" ? (
                    <time dateTime={order.reservationExpiresAt}>Reservation until {formatConnectedOrderDate(order.reservationExpiresAt)}</time>
                  ) : null}
                </div>
                <ArrowUpRight aria-hidden="true" size={19} />
              </Link>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
