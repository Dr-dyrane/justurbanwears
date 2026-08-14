"use client";

import { ArrowUpRight, Inbox, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatNaira } from "../../lib/shop/catalog";
import {
  formatConnectedOrderDate,
  nextStudioOrderTransition,
  orderStateLabel,
  studioOrderNextActionLabel,
} from "../../lib/shop/order-presentation";
import type { ShopServerOrder } from "../../lib/shop/server-order/types";
import { useStudioMobileAction } from "./mobile-action-context";

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
        throw new Error("Orders could not be opened.");
      }
      setOrders(body.orders);
      setState("ready");
    } catch (cause: unknown) {
      if (signal?.aborted) return;
      setError(cause instanceof Error ? cause.message : "Orders could not be opened.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadOrders(controller.signal);
    return () => controller.abort();
  }, [loadOrders]);

  const nextOrder = orders.find((order) => nextStudioOrderTransition(order));
  useStudioMobileAction(
    state === "ready" && nextOrder
      ? {
          href: `/studio/orders/${nextOrder.reference}#studio-order-next-action`,
          label: studioOrderNextActionLabel(nextOrder),
        }
      : state === "ready"
        ? { href: "/studio/wardrobe", label: "Open wardrobe" }
        : null,
  );

  return (
    <div className="studio-connected-orders-page">
      <header className="studio-connected-orders-heading">
        <div>
          <p className="eyebrow">Orders</p>
          <h1>What needs you now.</h1>
          <p>Check payment. Prepare delivery. Handle returns.</p>
        </div>
        <span>{orders.length} {orders.length === 1 ? "order" : "orders"}</span>
      </header>

      {state === "loading" ? (
        <div className="studio-loading" aria-live="polite" role="status">Opening orders…</div>
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
          <div><strong>No orders yet</strong><p>New customer orders appear here.</p></div>
        </div>
      ) : null}
      {state === "ready" && orders.length ? (
        <section className="studio-connected-order-list" aria-label="Orders">
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
                  <div><dt>Receipt</dt><dd>{orderStateLabel(order.paymentReviewStatus)}</dd></div>
                  <div><dt>Payment</dt><dd>{orderStateLabel(order.fundsConfirmationStatus)}</dd></div>
                  <div><dt>{order.fulfillment.kind === "PICKUP" ? "Pickup" : "Delivery"}</dt><dd>{orderStateLabel(order.fulfillmentStatus)}</dd></div>
                  <div>
                    <dt>{hasReturn ? "Return" : "Reserved"}</dt>
                    <dd>{hasReturn ? orderStateLabel(order.return!.status) : formatConnectedOrderDate(order.savedAt, false)}</dd>
                  </div>
                </dl>
                <div className="studio-connected-order-next">
                  <small>{hasReturn ? <><RotateCcw aria-hidden="true" size={13} /> Return action</> : "Next action"}</small>
                  <strong>{studioOrderNextActionLabel(order)}</strong>
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
