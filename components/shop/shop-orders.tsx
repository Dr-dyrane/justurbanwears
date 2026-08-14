"use client";

import { ArrowUpRight, PackageSearch } from "lucide-react";
import { useEffect, useState } from "react";
import { formatNaira } from "../../lib/shop/catalog";
import { formatConnectedOrderDate, orderStateLabel } from "../../lib/shop/order-presentation";
import type { ShopServerOrder } from "../../lib/shop/server-order/types";
import { authSignInPath } from "../../lib/auth/return-to";
import { ShopActionLink } from "./atoms/action";
import { ShopLink as Link } from "./atoms/shop-link";
import { ProductVisual } from "./product-visual";
import { useShop } from "./shop-provider";

function OrderCard({ order }: { order: ShopServerOrder }) {
  const { getProduct } = useShop();
  const firstLine = order.lines[0];
  const product = firstLine ? getProduct(firstLine.slug) : undefined;

  return (
    <Link className="shop-order-card" href={`/shop/orders/${order.reference}`}>
      {product ? <ProductVisual compact product={product} /> : <span className="shop-order-snapshot is-empty" aria-hidden="true" />}
      <div className="shop-order-card-copy">
        <span>Order · {orderStateLabel(order.lifecycleStatus)}</span>
        <h2>{firstLine?.name ?? "Wardrobe order"}</h2>
        <p>{order.reference} · {order.lines.length} {order.lines.length === 1 ? "piece" : "pieces"} · {formatNaira(order.total)}</p>
      </div>
      <div className="shop-connected-order-card-state">
        <strong>{orderStateLabel(order.paymentReviewStatus)}</strong>
        <small>{orderStateLabel(order.fundsConfirmationStatus)} · {formatConnectedOrderDate(order.savedAt, false)}</small>
      </div>
      <b aria-hidden="true"><ArrowUpRight size={18} strokeWidth={1.8} /></b>
    </Link>
  );
}
export function ShopOrders() {
  const [orders, setOrders] = useState<ShopServerOrder[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/shop/orders", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    }).then(async (response) => {
      const body = await response.json().catch(() => ({})) as {
        ok?: boolean;
        orders?: ShopServerOrder[];
      };
      if (response.status === 401) {
        window.location.assign(authSignInPath("/shop/orders"));
        return;
      }
      if (!response.ok || !body.ok || !Array.isArray(body.orders)) {
        throw new Error("Your orders could not be opened. Try again.");
      }
      setOrders(body.orders);
      setState("ready");
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "Your orders could not be opened. Try again.");
      setState("error");
    });
    return () => controller.abort();
  }, []);

  return (
    <div className="shop-list-page shop-orders-page">
      <header className="shop-list-heading">
        <p className="shop-kicker">Your orders</p>
        <h1>Track every order.</h1>
      </header>

      {state === "loading" ? (
        <div className="shop-route-empty" aria-live="polite" role="status">
          <h2>Opening your orders…</h2>
        </div>
      ) : state === "error" ? (
        <div className="shop-route-empty" role="alert">
          <span aria-hidden="true"><PackageSearch size={34} strokeWidth={1.65} /></span>
          <h2>{error}</h2>
          <ShopActionLink href="/shop/orders">Try again</ShopActionLink>
        </div>
      ) : orders.length ? (
        <section className="shop-orders-list" aria-label="Your orders">
          {orders.map((order) => <OrderCard key={order.reference} order={order} />)}
        </section>
      ) : (
        <div className="shop-route-empty">
          <h2>No orders yet.</h2>
          <p>Your first order will appear here as soon as it is placed.</p>
          <ShopActionLink href="/shop/search">Find a piece</ShopActionLink>
        </div>
      )}
    </div>
  );
}
