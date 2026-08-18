"use client";

import { ArrowUpRight, PackageSearch } from "lucide-react";
import { useState, type FormEvent } from "react";
import { formatNaira } from "../../lib/shop/catalog";
import { formatConnectedOrderDate, orderStateLabel } from "../../lib/shop/order-presentation";
import type { ShopServerOrder } from "../../lib/shop/server-order/types";
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
export function ShopOrders({
  initialError = "",
  initialOrders,
}: {
  initialError?: string;
  initialOrders: readonly ShopServerOrder[];
}) {
  const [orders, setOrders] = useState<ShopServerOrder[]>([...initialOrders]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [nextPage, setNextPage] = useState<number | null>(initialOrders.length >= 50 ? 2 : null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialError);

  async function load(page: number, append: boolean) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const query = new URLSearchParams({
        page: String(page),
        limit: "50",
        search,
        filter,
      });
      const response = await fetch(`/api/shop/orders?${query}`, { cache: "no-store", credentials: "same-origin" });
      const body = await response.json().catch(() => ({})) as {
        ok?: boolean;
        orders?: ShopServerOrder[];
        nextPage?: number | null;
      };
      if (!response.ok || !body.ok || !Array.isArray(body.orders)) throw new Error("Your orders could not be opened.");
      setOrders((current) => append ? [...current, ...body.orders!] : body.orders!);
      setNextPage(body.nextPage ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your orders could not be opened.");
    } finally {
      setPending(false);
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(1, false);
  }

  return (
    <div className="shop-list-page shop-orders-page">
      <header className="shop-list-heading">
        <p className="shop-kicker">Your orders</p>
        <h1>Track every order.</h1>
      </header>

      <form className="shop-order-list-tools" onSubmit={submitSearch} role="search">
        <label><span className="sr-only">Search orders</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Order or piece" type="search" value={search} /></label>
        <label><span className="sr-only">Filter orders</span><select onChange={(event) => setFilter(event.target.value)} value={filter}><option value="ALL">All orders</option><option value="ACTIVE">Active</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option><option value="RETURNS">Returns</option></select></label>
        <button className="shop-action shop-action-secondary" disabled={pending} type="submit">{pending ? "Checking…" : "Find"}</button>
      </form>

      {error ? (
        <div className="shop-route-empty" role="alert">
          <span aria-hidden="true"><PackageSearch size={34} strokeWidth={1.65} /></span>
          <h2>{error}</h2>
          <button className="shop-action shop-action-secondary" onClick={() => void load(1, false)} type="button">Try again</button>
        </div>
      ) : orders.length ? (
        <section className="shop-orders-list" aria-label="Your orders">
          {orders.map((order) => <OrderCard key={order.reference} order={order} />)}
          {nextPage ? <button className="shop-action shop-action-secondary" disabled={pending} onClick={() => void load(nextPage, true)} type="button">{pending ? "Loading…" : "Load more"}</button> : null}
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
