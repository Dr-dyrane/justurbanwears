"use client";

import { ArrowUpRight, Inbox, RotateCcw } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { formatNaira } from "../../lib/shop/catalog";
import {
  formatConnectedOrderDate,
  nextStudioOrderTransition,
  orderStateLabel,
  studioOrderNextActionLabel,
} from "../../lib/shop/order-presentation";
import type { ShopServerOrder } from "../../lib/shop/server-order/types";
import {
  findRecoveredAssistedOrder,
  type AssistedOrderRecoverySignature,
} from "../../lib/shop/assisted-order-recovery";
import type { ShopCheckoutFulfillment } from "../../lib/shop/domain/entities";
import { StudioFeedback } from "./atoms/studio-feedback";
import { StudioLink as Link } from "./atoms/studio-link";
import { StudioLoadingStage } from "./atoms/studio-loading-stage";
import { StudioStackPage, StudioStackSection } from "./atoms/studio-stack-page";
import { StudioTaskSheet } from "./atoms/studio-task-sheet";

const orderFilters = ["NEEDS_ACTION", "ACTIVE", "RETURNS", "COMPLETED", "CANCELLED", "ALL"] as const;
type OrderFilter = typeof orderFilters[number];

const ASSISTED_ORDER_INTENT_STORAGE_KEY = "juw.studio.assisted-order-intent.v1";
const ASSISTED_ORDER_INTENT_TTL_MS = 60 * 60 * 1000;
const SHA256_FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;
const ASSISTED_IDEMPOTENCY_KEY_PATTERN = /^assisted:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface AssistedOrderIntent {
  fingerprint: string;
  idempotencyKey: string;
  expiresAt: number;
}

function isOrderFilter(value: string | null): value is typeof orderFilters[number] {
  return Boolean(value && orderFilters.includes(value as typeof orderFilters[number]));
}

function readAssistedOrderIntent(now = Date.now()): AssistedOrderIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const candidate = JSON.parse(
      window.sessionStorage.getItem(ASSISTED_ORDER_INTENT_STORAGE_KEY) ?? "null",
    ) as Record<string, unknown> | null;
    const keys = candidate && !Array.isArray(candidate) ? Object.keys(candidate) : [];
    const valid = candidate
      && keys.length === 3
      && keys.every((key) => ["fingerprint", "idempotencyKey", "expiresAt"].includes(key))
      && typeof candidate.fingerprint === "string"
      && SHA256_FINGERPRINT_PATTERN.test(candidate.fingerprint)
      && typeof candidate.idempotencyKey === "string"
      && ASSISTED_IDEMPOTENCY_KEY_PATTERN.test(candidate.idempotencyKey)
      && Number.isSafeInteger(candidate.expiresAt)
      && (candidate.expiresAt as number) > now
      && (candidate.expiresAt as number) <= now + ASSISTED_ORDER_INTENT_TTL_MS;
    if (valid) return candidate as unknown as AssistedOrderIntent;
    window.sessionStorage.removeItem(ASSISTED_ORDER_INTENT_STORAGE_KEY);
  } catch {
    try {
      window.sessionStorage.removeItem(ASSISTED_ORDER_INTENT_STORAGE_KEY);
    } catch {
      // A blocked storage API must not block an assisted order.
    }
  }
  return null;
}

function persistAssistedOrderIntent(intent: AssistedOrderIntent): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ASSISTED_ORDER_INTENT_STORAGE_KEY, JSON.stringify(intent));
  } catch {
    // The in-memory intent still protects retries during this mounted session.
  }
}

function clearAssistedOrderIntent(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(ASSISTED_ORDER_INTENT_STORAGE_KEY);
  } catch {
    // The successful server response remains authoritative when storage is unavailable.
  }
}

async function sha256Fingerprint(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function emptyOrdersCopy(filter: OrderFilter, search: string): {
  detail: string;
  title: string;
  viewAll: boolean;
} {
  if (search) {
    return {
      detail: `No orders match “${search}” in this view.`,
      title: "No matching orders",
      viewAll: true,
    };
  }
  if (filter === "NEEDS_ACTION") {
    return {
      detail: "There are no customer, payment, delivery, or return actions waiting.",
      title: "No orders need action",
      viewAll: true,
    };
  }
  if (filter === "ACTIVE") {
    return { detail: "There are no active orders in this view.", title: "No active orders", viewAll: true };
  }
  if (filter === "RETURNS") {
    return { detail: "There are no orders with a return request.", title: "No returns", viewAll: true };
  }
  if (filter === "COMPLETED") {
    return { detail: "There are no completed orders in this view.", title: "No completed orders", viewAll: true };
  }
  if (filter === "CANCELLED") {
    return { detail: "There are no cancelled or expired orders in this view.", title: "No cancelled orders", viewAll: true };
  }
  return { detail: "New customer orders will appear here.", title: "No orders yet", viewAll: false };
}

interface AvailableOrderPiece {
  slug: string;
  name: string;
  taggedSize: string;
  price: number;
}

export function ConnectedOrderInbox() {
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<ShopServerOrder[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [products, setProducts] = useState<AvailableOrderPiece[]>([]);
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [filter, setFilter] = useState<OrderFilter>("NEEDS_ACTION");
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createErrorTitle, setCreateErrorTitle] = useState("Order not created");
  const [createOpen, setCreateOpen] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<ShopServerOrder | null>(null);
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
  const createPendingRef = useRef(false);
  const createIntentRef = useRef<AssistedOrderIntent | null>(null);
  const createButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const requestedFilter = searchParams.get("filter");
    if (isOrderFilter(requestedFilter)) setFilter(requestedFilter);
  }, [searchParams]);

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
      return body.orders;
    } catch (cause: unknown) {
      if (signal?.aborted) return;
      setError(cause instanceof Error ? cause.message : "Orders could not be opened.");
      if (!quiet) setState("error");
      return null;
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
      if (document.visibilityState !== "visible" || inFlight || createPendingRef.current) return;
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
  const emptyState = emptyOrdersCopy(filter, activeSearch);

  function findOrders(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveSearch(search.trim());
  }

  function acceptCreatedOrder(order: ShopServerOrder) {
    setOrders((current) => current.some((candidate) => candidate.reference === order.reference)
      ? current
      : [order, ...current]);
    setProducts((current) => current.filter((product) => !selectedSlugs.includes(product.slug)));
    setSelectedSlugs([]);
    setContactName("");
    setContactEmail("");
    setContactPhone("");
    setSourceNote("");
    createIntentRef.current = null;
    clearAssistedOrderIntent();
    setCreateError("");
    setCreatedOrder(order);
    setCreateOpen(false);
  }

  async function createAssistedOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createPendingRef.current || creating || !selectedSlugs.length) return;
    createPendingRef.current = true;
    setCreating(true);
    setCreateError("");
    setCreateErrorTitle("Order not created");
    let mutationDispatched = false;
    let authoritativeClientFailure = false;
    let recoverySignature: AssistedOrderRecoverySignature | null = null;
    try {
      const selected = products.filter((product) => selectedSlugs.includes(product.slug));
      const fulfillment: ShopCheckoutFulfillment = fulfillmentKind === "PICKUP"
        ? { kind: "PICKUP", optionId: "pickup" }
        : {
            kind: "DELIVERY",
            optionId: stateName.trim().toLowerCase() === "lagos" ? "lagos" : "nationwide",
            address: { street, area, state: stateName, country: "Nigeria" },
          };
      const command = {
        version: 1 as const,
        source,
        note: sourceNote || null,
        lines: selected.map((product) => ({
          slug: product.slug,
          taggedSize: product.taggedSize,
          quantity: 1 as const,
        })),
        contact: { name: contactName, email: contactEmail, phone: contactPhone },
        fulfillment,
      };
      const fingerprint = await sha256Fingerprint(JSON.stringify(command));
      const now = Date.now();
      const storedIntent = readAssistedOrderIntent(now);
      const inMemoryIntent = createIntentRef.current?.fingerprint === fingerprint
        && createIntentRef.current.expiresAt > now
        ? createIntentRef.current
        : null;
      const intent = inMemoryIntent ?? (storedIntent?.fingerprint === fingerprint
        ? storedIntent
        : {
          fingerprint,
          idempotencyKey: `assisted:${crypto.randomUUID()}`,
          expiresAt: now + ASSISTED_ORDER_INTENT_TTL_MS,
        });
      createIntentRef.current = intent;
      persistAssistedOrderIntent(intent);
      recoverySignature = {
        contact: command.contact,
        fulfillment: command.fulfillment,
        lines: command.lines,
        sentAfter: intent.expiresAt - ASSISTED_ORDER_INTENT_TTL_MS,
        source: command.source,
      };
      mutationDispatched = true;
      const response = await fetch("/api/studio/orders", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...command,
          idempotencyKey: intent.idempotencyKey,
        }),
      });
      const body = await response.json().catch(() => ({})) as {
        ok?: boolean;
        order?: ShopServerOrder;
        error?: { message?: string };
      };
      authoritativeClientFailure = response.status >= 400 && response.status < 500;
      if (!response.ok || !body.ok || !body.order) {
        throw new Error(body.error?.message || "The order could not be reserved.");
      }
      acceptCreatedOrder(body.order);
    } catch (cause) {
      if (mutationDispatched && !authoritativeClientFailure) {
        const reconciledOrders = await loadOrders(undefined, true);
        const recovered = reconciledOrders && recoverySignature
          ? findRecoveredAssistedOrder(reconciledOrders, recoverySignature)
          : null;
        if (recovered) {
          acceptCreatedOrder(recovered);
          return;
        }
      }
      const message = cause instanceof Error ? cause.message : "The order could not be reserved.";
      if (mutationDispatched && !authoritativeClientFailure) {
        setCreateErrorTitle("Order outcome not confirmed");
        setCreateError(`${message} We checked Orders but could not identify one exact new reservation. Try again to safely reuse this reservation attempt.`);
      } else {
        setCreateErrorTitle("Order not created");
        setCreateError(message);
      }
    } finally {
      createPendingRef.current = false;
      setCreating(false);
    }
  }

  return (
    <StudioStackPage className="studio-connected-orders-page" kind="service">
      <header className="studio-page-tools">
        <h1 className="sr-only">Orders</h1>
        <span className="studio-page-tools-count">{state === "ready" ? `${orders.length} ${orders.length === 1 ? "order" : "orders"}` : state === "error" ? "Orders —" : "Opening…"}</span>
        <div>
          <button className="button button-primary" onClick={() => { setCreateError(""); setCreateErrorTitle("Order not created"); setCreateOpen(true); }} ref={createButtonRef} type="button">New order</button>
          <button aria-busy={refreshing} className="button button-secondary" disabled={refreshing} onClick={() => void loadOrders(undefined, true)} type="button">{refreshing ? "Checking…" : "Check for updates"}</button>
        </div>
      </header>

      {createdOrder ? (
        <StudioFeedback
          action={<Link className="button button-secondary" href={`/studio/orders/${createdOrder.reference}`}>Open order</Link>}
          detail={`${createdOrder.reference} is reserved and now appears in Orders.`}
          state="success"
          title="Customer order created"
        />
      ) : null}

      <StudioStackSection aria-label="Order queue">
        {state === "ready" ? <section className="studio-piece-next" aria-label="Next Orders action">
          <span>{nextOrder ? <RotateCcw aria-hidden="true" size={20} /> : <Inbox aria-hidden="true" size={20} />}</span>
          <div><small>Continue</small><strong>{nextOrder ? studioOrderNextActionLabel(nextOrder) : "No customer action waiting"}</strong><p>{nextOrder ? `${nextOrder.reference} is the next order requiring attention.` : "The current order queue is clear."}</p></div>
          {nextOrder ? <Link className="button button-primary" href={`/studio/orders/${nextOrder.reference}#studio-order-next-action`}>Open order</Link> : <Link className="button button-secondary" href="/studio/wardrobe">Open wardrobe</Link>}
        </section> : null}

        <details className="studio-stack-filter">
          <summary>Find orders <span>{filter.toLowerCase().replaceAll("_", " ")}</span></summary>
          <form className="studio-transition-fields studio-transition-fields-two" onSubmit={findOrders} role="search">
            <label><span>Search</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Order, customer, or piece" type="search" value={search} /></label>
            <label><span>Show</span><select onChange={(event) => setFilter(event.target.value as OrderFilter)} value={filter}><option value="NEEDS_ACTION">Needs action</option><option value="ACTIVE">Active</option><option value="RETURNS">Returns</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option><option value="ALL">All orders</option></select></label>
            <button className="button button-secondary" type="submit">Find orders</button>
          </form>
        </details>

        {state === "loading" ? <StudioLoadingStage label="Opening orders…" /> : null}
        {state === "error" ? <StudioFeedback action={<button className="button button-secondary" onClick={() => void loadOrders()} type="button">Try again</button>} detail={error} state="error" title="Orders unavailable" /> : null}
        {state === "ready" && error ? <StudioFeedback action={<button className="button button-secondary" disabled={refreshing} onClick={() => void loadOrders(undefined, true)} type="button">Try again</button>} detail={`${error} Existing orders are shown, but they may be out of date.`} state="error" title="Orders need an update" /> : null}
        {state === "ready" && !orders.length ? (
          <StudioFeedback
            action={emptyState.viewAll ? <button className="button button-secondary" onClick={() => { setSearch(""); setActiveSearch(""); setFilter("ALL"); }} type="button">View all</button> : undefined}
            detail={emptyState.detail}
            state="empty"
            title={emptyState.title}
          />
        ) : null}
        {state === "ready" && orders.length ? (
          <section className="studio-connected-order-list" aria-label="Orders">
            {orders.map((order) => {
              const firstLine = order.lines[0];
              const hasReturn = Boolean(order.return);
              const needsAction = Boolean(nextStudioOrderTransition(order));
              return (
                <Link className="studio-connected-order-card studio-compact-row" data-state-tone={hasReturn ? "critical" : needsAction ? "caution" : "neutral"} href={`/studio/orders/${order.reference}`} key={order.reference}>
                  <div className="studio-connected-order-reference">
                    <small>{order.reference}</small>
                    <h2>{firstLine?.name ?? "Wardrobe order"}</h2>
                    <p>{order.lines.length} {order.lines.length === 1 ? "piece" : "pieces"} · {formatNaira(order.total)} · {order.source === "ONLINE" ? "Online" : orderStateLabel(order.source)}</p>
                  </div>
                  <dl>
                    <div><dt>Receipt</dt><dd>{orderStateLabel(order.paymentReviewStatus)}</dd></div>
                    <div><dt>Payment</dt><dd>{orderStateLabel(order.fundsConfirmationStatus)}</dd></div>
                    <div><dt>{order.fulfillment.kind === "PICKUP" ? "Pickup" : "Delivery"}</dt><dd>{orderStateLabel(order.fulfillmentStatus)}</dd></div>
                    <div><dt>{hasReturn ? "Return" : "Reserved"}</dt><dd>{hasReturn ? orderStateLabel(order.return!.status) : formatConnectedOrderDate(order.savedAt, false)}</dd></div>
                  </dl>
                  <div className="studio-connected-order-next">
                    <small>{hasReturn ? <><RotateCcw aria-hidden="true" size={13} /> Return action</> : "Next action"}</small>
                    <strong>{studioOrderNextActionLabel(order)}</strong>
                    {order.reservationExpiresAt && order.lifecycleStatus === "ACTIVE" ? <time dateTime={order.reservationExpiresAt}>Reservation until {formatConnectedOrderDate(order.reservationExpiresAt)}</time> : null}
                  </div>
                  <ArrowUpRight aria-hidden="true" size={19} />
                </Link>
              );
            })}
            {nextPage ? <button className="button button-secondary" disabled={refreshing} onClick={() => void loadOrders(undefined, true, nextPage, true)} type="button">{refreshing ? "Loading…" : "Load more"}</button> : null}
          </section>
        ) : null}
      </StudioStackSection>

      <StudioTaskSheet
        busy={creating}
        busyLabel="Reserving this order"
        eyebrow="New order"
        onDismiss={() => { if (creating) return false; setCreateOpen(false); }}
        onSubmit={createAssistedOrder}
        open={createOpen}
        returnFocus={createButtonRef.current}
        title="Customer order"
      >
        <div className="studio-transition-fields">
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
          {createError ? <StudioFeedback detail={createError} state="error" title={createErrorTitle} /> : null}
        </div>
      </StudioTaskSheet>
    </StudioStackPage>
  );
}
