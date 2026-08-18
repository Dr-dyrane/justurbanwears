"use client";

import { ArrowUpRight, Inbox, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { formatNaira } from "../../lib/shop/catalog";
import {
  formatConnectedOrderDate,
  nextStudioOrderTransition,
  orderStateLabel,
  studioOrderNextActionLabel,
} from "../../lib/shop/order-presentation";
import type { ShopServerOrder } from "../../lib/shop/server-order/types";
import { useStudioMobileAction } from "./mobile-action-context";

interface AvailableOrderPiece {
  slug: string;
  name: string;
  taggedSize: string;
  price: number;
}

export function ConnectedOrderInbox() {
  const [orders, setOrders] = useState<ShopServerOrder[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [products, setProducts] = useState<AvailableOrderPiece[]>([]);
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [filter, setFilter] = useState("NEEDS_ACTION");
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [source, setSource] = useState<"PHONE" | "DM" | "IN_PERSON">("DM");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [fulfillmentKind, setFulfillmentKind] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [street, setStreet] = useState("");
  const [area, setArea] = useState("");
  const [stateName, setStateName] = useState("Lagos");
  const [sourceNote, setSourceNote] = useState("");

  const loadOrders = useCallback(async (
    signal?: AbortSignal,
    quiet = false,
    page = 1,
    append = false,
  ) => {
    if (quiet) setRefreshing(true);
    else setState("loading");
    setError("");
    try {
      const query = new URLSearchParams({
        page: String(page),
        limit: "50",
        search: activeSearch,
        filter,
      });
      const response = await fetch(`/api/studio/orders?${query}`, {
        cache: "no-store",
        credentials: "same-origin",
        signal,
      });
      const body = await response.json().catch(() => ({})) as {
        ok?: boolean;
        orders?: ShopServerOrder[];
        products?: AvailableOrderPiece[];
        nextPage?: number | null;
      };
      if (!response.ok || !body.ok || !Array.isArray(body.orders)) {
        throw new Error("Orders could not be opened.");
      }
      setOrders((current) => append ? [...current, ...body.orders!] : body.orders!);
      if (Array.isArray(body.products)) setProducts(body.products);
      setNextPage(body.nextPage ?? null);
      setState("ready");
    } catch (cause: unknown) {
      if (signal?.aborted) return;
      setError(cause instanceof Error ? cause.message : "Orders could not be opened.");
      if (!quiet) setState("error");
    } finally {
      if (!signal?.aborted) setRefreshing(false);
    }
  }, [activeSearch, filter]);

  useEffect(() => {
    const controller = new AbortController();
    void loadOrders(controller.signal);
    return () => controller.abort();
  }, [loadOrders]);

  useEffect(() => {
    if (state !== "ready") return;
    const controller = new AbortController();
    let inFlight = false;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible" || inFlight) return;
      inFlight = true;
      void loadOrders(controller.signal, true).finally(() => {
        inFlight = false;
      });
    }, 15_000);
    return () => {
      window.clearInterval(interval);
      controller.abort();
    };
  }, [loadOrders, state]);

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

  function findOrders(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveSearch(search.trim());
  }

  async function createAssistedOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating || !selectedSlugs.length) return;
    setCreating(true);
    setCreateError("");
    try {
      const selected = products.filter((product) => selectedSlugs.includes(product.slug));
      const response = await fetch("/api/studio/orders", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          version: 1,
          idempotencyKey: `assisted:${crypto.randomUUID()}`,
          source,
          note: sourceNote || null,
          lines: selected.map((product) => ({
            slug: product.slug,
            taggedSize: product.taggedSize,
            quantity: 1,
          })),
          contact: { name: contactName, email: contactEmail, phone: contactPhone },
          fulfillment: fulfillmentKind === "PICKUP"
            ? { kind: "PICKUP", optionId: "pickup" }
            : {
                kind: "DELIVERY",
                optionId: stateName.trim().toLowerCase() === "lagos" ? "lagos" : "nationwide",
                address: { street, area, state: stateName, country: "Nigeria" },
              },
        }),
      });
      const body = await response.json().catch(() => ({})) as {
        ok?: boolean;
        order?: ShopServerOrder;
        error?: { message?: string };
      };
      if (!response.ok || !body.ok || !body.order) {
        throw new Error(body.error?.message || "The order could not be reserved.");
      }
      setOrders((current) => [body.order!, ...current]);
      setProducts((current) => current.filter((product) => !selectedSlugs.includes(product.slug)));
      setSelectedSlugs([]);
      setContactName("");
      setContactEmail("");
      setContactPhone("");
      setSourceNote("");
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : "The order could not be reserved.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="studio-connected-orders-page">
      <header className="studio-connected-orders-heading">
        <div>
          <p className="eyebrow">Orders</p>
          <h1>What needs you now.</h1>
          <p>Check payment. Prepare delivery. Handle returns.</p>
        </div>
        <span>{orders.length} {orders.length === 1 ? "order" : "orders"}</span>
        <button aria-busy={refreshing} className="button button-secondary" disabled={refreshing} onClick={() => void loadOrders(undefined, true)} type="button">{refreshing ? "Checking…" : "Check for updates"}</button>
      </header>

      <details className="studio-transition-action">
        <summary>Create customer order<span>Phone, message, or in person</span></summary>
        <form aria-busy={creating} className="studio-transition-action-body studio-transition-fields" onSubmit={createAssistedOrder}>
          <label><span>Order came from</span><select disabled={creating} onChange={(event) => setSource(event.target.value as typeof source)} value={source}><option value="DM">Direct message</option><option value="PHONE">Phone</option><option value="IN_PERSON">In person</option></select></label>
          <fieldset><legend>Pieces</legend>{products.map((product) => <label key={product.slug}><input checked={selectedSlugs.includes(product.slug)} disabled={creating} onChange={(event) => setSelectedSlugs((current) => event.target.checked ? [...current, product.slug] : current.filter((slug) => slug !== product.slug))} type="checkbox" /><span>{product.name} · {product.taggedSize} · {formatNaira(product.price)}</span></label>)}</fieldset>
          {!products.length ? <p>No available pieces.</p> : null}
          <label><span>Customer name</span><input disabled={creating} maxLength={100} minLength={2} onChange={(event) => setContactName(event.target.value)} required value={contactName} /></label>
          <label><span>Email</span><input disabled={creating} maxLength={320} onChange={(event) => setContactEmail(event.target.value)} required type="email" value={contactEmail} /></label>
          <label><span>Phone</span><input disabled={creating} maxLength={30} minLength={7} onChange={(event) => setContactPhone(event.target.value)} required type="tel" value={contactPhone} /></label>
          <label><span>Handoff</span><select disabled={creating} onChange={(event) => setFulfillmentKind(event.target.value as typeof fulfillmentKind)} value={fulfillmentKind}><option value="DELIVERY">Delivery</option><option value="PICKUP">Pickup</option></select></label>
          {fulfillmentKind === "DELIVERY" ? <><label><span>Street</span><input disabled={creating} maxLength={180} onChange={(event) => setStreet(event.target.value)} required value={street} /></label><label><span>Area</span><input disabled={creating} maxLength={100} onChange={(event) => setArea(event.target.value)} required value={area} /></label><label><span>State</span><input disabled={creating} maxLength={100} onChange={(event) => setStateName(event.target.value)} required value={stateName} /></label></> : null}
          <label><span>Private source note (optional)</span><textarea disabled={creating} maxLength={500} onChange={(event) => setSourceNote(event.target.value)} value={sourceNote} /></label>
          <button className="button button-primary" disabled={creating || !selectedSlugs.length} type="submit">{creating ? "Reserving…" : "Reserve order"}</button>
          {createError ? <p className="is-error" role="alert">{createError}</p> : null}
        </form>
      </details>

      <form className="studio-transition-fields studio-transition-fields-two" onSubmit={findOrders} role="search">
        <label><span>Search</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Order, customer, or piece" type="search" value={search} /></label>
        <label><span>Show</span><select onChange={(event) => setFilter(event.target.value)} value={filter}><option value="NEEDS_ACTION">Needs action</option><option value="ACTIVE">Active</option><option value="RETURNS">Returns</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option><option value="ALL">All orders</option></select></label>
        <button className="button button-secondary" type="submit">Find orders</button>
      </form>

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
                  <p>{order.lines.length} {order.lines.length === 1 ? "piece" : "pieces"} · {formatNaira(order.total)} · {order.source === "ONLINE" ? "Online" : orderStateLabel(order.source)}</p>
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
          {nextPage ? <button className="button button-secondary" disabled={refreshing} onClick={() => void loadOrders(undefined, true, nextPage, true)} type="button">{refreshing ? "Loading…" : "Load more"}</button> : null}
        </section>
      ) : null}
    </div>
  );
}
