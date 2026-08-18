"use client";

/* Protected Studio and catalogue media use stable runtime URLs. */
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useMemo, useState } from "react";
import {
  ArrowRight,
  Boxes,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  MapPin,
  PackageCheck,
  RotateCcw,
  Shirt,
  UserRound,
} from "lucide-react";
import type { StudioLifecycleState } from "../../lib/studio/domain/entities";
import type { StudioAuthorityPiece } from "../../lib/studio/services/studio-authority-client";
import { LifecycleBadge } from "./atoms/lifecycle-badge";
import { StudioLink as Link } from "./atoms/studio-link";
import { StudioSegmentedView, useStudioSegment } from "./atoms/studio-segmented-view";
import { StudioTaskSheet } from "./atoms/studio-task-sheet";
import { useStudio } from "./studio-provider";

const locations = [
  { key: "WARDROBE_RAIL", label: "Wardrobe rail" },
  { key: "PACKING_SHELF", label: "Packing shelf" },
  { key: "RETURN_INSPECTION", label: "Return inspection" },
] as const;

function shortDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date)
    : value;
}

function lifecycle(piece: StudioAuthorityPiece): StudioLifecycleState {
  if (piece.activeHold) return "RESERVED";
  if (piece.availability === "PRIVATE") return "DRAFT";
  if (piece.availability === "AVAILABLE") return "PUBLISHED";
  if (piece.availability === "ARCHIVED") return "CANCELLED";
  return piece.availability;
}

function nextDayValue() {
  const next = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const local = new Date(next.getTime() - next.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function OperationsDesk() {
  const { authority, scenario } = useStudio();
  const snapshot = authority.snapshot;
  const pieces = snapshot?.pieces ?? [];
  const holds = snapshot?.holds ?? [];
  const orders = snapshot?.orders ?? [];
  const returns = orders.filter((order) => order.return);
  const activeHolds = holds.filter((hold) => hold.status === "ACTIVE");
  const actionOrders = orders.filter((order) => order.allowedTransitions.length || order.allowedReturnTransitions.length);
  const mismatches = pieces.filter((piece) => piece.hasLocationMismatch);
  const available = pieces.filter((piece) => piece.availability === "AVAILABLE" && !piece.activeHold).length;
  const segments = [
    { key: "inventory", label: "Inventory", count: pieces.length },
    { key: "holds", label: "Holds", count: activeHolds.length },
    { key: "orders", label: "Orders", count: actionOrders.length },
    { key: "returns", label: "Returns", count: returns.length },
  ];
  const { active: activeView, isPending: viewPending, select: selectView } = useStudioSegment(segments, "inventory");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [returnFocus, setReturnFocus] = useState<HTMLButtonElement | null>(null);
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdPieceKey, setHoldPieceKey] = useState<string | null>(null);
  const [holdReturnFocus, setHoldReturnFocus] = useState<HTMLButtonElement | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [contact, setContact] = useState("");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState(nextDayValue);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const selected = pieces.find((piece) => piece.pieceKey === selectedKey) ?? null;
  const holdPiece = pieces.find((piece) => piece.pieceKey === holdPieceKey) ?? null;

  const summary = useMemo(() => [
    { key: "available", icon: Boxes, value: available, label: "available now" },
    { key: "orders", icon: PackageCheck, value: actionOrders.length, label: "orders needing action" },
    { key: "holds", icon: ClipboardCheck, value: activeHolds.length, label: "customer holds" },
    { key: "mismatch", icon: CircleAlert, value: mismatches.length, label: "location differences" },
  ], [actionOrders.length, activeHolds.length, available, mismatches.length]);

  function openPiece(piece: StudioAuthorityPiece, trigger: HTMLButtonElement) {
    setSelectedKey(piece.pieceKey);
    setReturnFocus(trigger);
    setNotice("");
    setError("");
  }

  function closePiece() {
    setSelectedKey(null);
    setNotice("");
    setError("");
  }

  function openHold() {
    if (!selected) return;
    setHoldPieceKey(selected.pieceKey);
    setHoldReturnFocus(returnFocus);
    setSelectedKey(null);
    setHoldOpen(true);
    setCustomerName("");
    setContact("");
    setReason("");
    setExpiresAt(nextDayValue());
    setError("");
  }

  async function saveHold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!holdPiece?.sku) return;
    setPending(true);
    setError("");
    try {
      const consequence = await authority.createHold({
        sku: holdPiece.sku,
        customerName,
        contact,
        reason,
        expiresAt: new Date(expiresAt).toISOString(),
        idempotencyKey: `hold:${crypto.randomUUID()}`,
      });
      setNotice(consequence);
      setHoldOpen(false);
      setSelectedKey(holdPiece.pieceKey);
      setHoldPieceKey(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The hold could not be saved.");
    } finally {
      setPending(false);
    }
  }

  async function releaseHold() {
    if (!selected?.activeHold) return;
    setPending(true);
    setError("");
    try {
      setNotice(await authority.releaseHold(selected.activeHold.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The hold could not be released.");
    } finally {
      setPending(false);
    }
  }

  async function recordLocation(
    locationKey: typeof locations[number]["key"],
    command: "CONFIRM" | "MOVE",
  ) {
    if (!selected) return;
    setPending(true);
    setError("");
    try {
      setNotice(await authority.recordLocation({
        command,
        pieceKey: selected.pieceKey,
        locationKey,
        idempotencyKey: `location:${crypto.randomUUID()}`,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The location could not be saved.");
    } finally {
      setPending(false);
    }
  }

  if (authority.status === "idle" || authority.status === "loading") {
    return <div className="studio-loading" role="status">Opening operations…</div>;
  }

  if (authority.status === "error" || !snapshot) {
    return (
      <div className="studio-ops-page studio-premium-surface">
        <header className="studio-ops-heading"><div><p className="eyebrow">Operations</p><h1>Live state unavailable.</h1><p>No inventory action is available until current truth returns.</p></div></header>
        <div className="studio-quiet-empty" role="alert"><CircleAlert aria-hidden="true" size={24} /><div><strong>Couldn’t open Operations</strong><p>{authority.error}</p></div><button className="button button-secondary" onClick={() => void authority.refresh()} type="button">Try again</button></div>
      </div>
    );
  }

  return (
    <div className="studio-ops-page studio-premium-surface">
      <header className="studio-ops-heading">
        <div><p className="eyebrow">Operations</p><h1>Know where every piece is.</h1><p>Inventory, holds, orders and returns share one live record.</p></div>
        <Link className="button button-secondary" href="/studio/stocktake">Start stocktake <ArrowRight aria-hidden="true" size={15} /></Link>
      </header>

      <div className="studio-operation-summary" role="list" aria-label="Operations summary">
        {summary.map((item) => {
          const Icon = item.icon;
          return <div role="listitem" key={item.key}><span><Icon aria-hidden="true" size={18} /></span><strong>{item.value}</strong><small>{item.label}</small></div>;
        })}
      </div>

      <StudioSegmentedView active={activeView} label="Operations workspace" onSelect={selectView} pending={viewPending} segments={segments} />

      {activeView === "inventory" ? (
        <section className="studio-operation-section studio-stack-panel" id="studio-view-inventory" aria-labelledby="studio-tab-inventory" role="tabpanel">
          <div className="studio-section-title"><div><p className="eyebrow">Inventory</p><h2>Pieces and physical truth</h2></div><span>{pieces.length} pieces</span></div>
          {pieces.length ? <div className="studio-table studio-inventory-list" role="list" aria-label="Inventory pieces">
            {pieces.map((piece) => (
              <article role="listitem" key={piece.pieceKey}>
                <button aria-haspopup="dialog" className="studio-table-row studio-inventory-row-trigger" onClick={(event) => openPiece(piece, event.currentTarget)} type="button">
                  <span className={`studio-inventory-media${piece.imageSrc ? " is-photo" : ""}`}>{piece.imageSrc ? <img alt="" height={160} loading="lazy" src={piece.imageSrc} width={128} /> : <Shirt aria-hidden="true" size={22} />}</span>
                  <span className="studio-inventory-copy"><small>{piece.sku ?? "Private piece"}</small><strong>{piece.title}</strong><em>{piece.activeHold ? `Held for ${piece.activeHold.customerName}` : piece.orderReference ? `Order ${piece.orderReference}` : piece.expectedCustody.toLowerCase()}</em></span>
                  <span className="studio-inventory-stock"><strong>{piece.observedLocationLabel ?? piece.expectedLocationLabel}</strong><small>{piece.hasLocationMismatch ? `Expected ${piece.expectedLocationLabel}` : piece.observedAt ? `Confirmed ${shortDate(piece.observedAt)}` : "Expected location"}</small></span>
                  <span className="studio-inventory-action"><LifecycleBadge state={lifecycle(piece)} />{piece.hasLocationMismatch ? <CircleAlert aria-label="Location differs" size={17} /> : <ChevronRight aria-hidden="true" size={17} />}</span>
                </button>
              </article>
            ))}
          </div> : <div className="studio-quiet-empty"><Boxes aria-hidden="true" size={24} /><div><strong>No pieces yet</strong><p>Inventory begins with garment intake.</p></div><Link className="button button-primary" href="/studio/wardrobe?intake=1">Intake garment</Link></div>}
        </section>
      ) : null}

      {activeView === "holds" ? (
        <section className="studio-operation-section studio-stack-panel" id="studio-view-holds" aria-labelledby="studio-tab-holds" role="tabpanel">
          <div className="studio-section-title"><div><p className="eyebrow">Holds</p><h2>People waiting for a piece</h2></div><span>{activeHolds.length} active</span></div>
          {activeHolds.length ? <div className="studio-operation-cards">{activeHolds.map((hold) => {
            const piece = pieces.find((candidate) => candidate.sku === hold.sku);
            return <article className="studio-operation-card" key={hold.id}><button className="studio-operation-card-trigger" onClick={(event) => piece && openPiece(piece, event.currentTarget)} type="button"><div className="studio-card-heading"><div><small>{hold.sku}</small><h3>{piece?.title ?? hold.sku}</h3></div><LifecycleBadge state="RESERVED" /></div><dl><div><dt>For</dt><dd>{hold.customerName}</dd></div><div><dt>Contact</dt><dd>{hold.contact}</dd></div><div><dt>Expires</dt><dd>{shortDate(hold.expiresAt)}</dd></div></dl><span className="studio-operation-card-open">Review <ChevronRight aria-hidden="true" size={17} /></span></button></article>;
          })}</div> : <div className="studio-quiet-empty"><ClipboardCheck aria-hidden="true" size={24} /><div><strong>No active holds</strong><p>Open an available piece to hold it for a customer.</p></div></div>}
        </section>
      ) : null}

      {activeView === "orders" ? (
        <section className="studio-operation-section studio-stack-panel" id="studio-view-orders" aria-labelledby="studio-tab-orders" role="tabpanel">
          <div className="studio-section-title"><div><p className="eyebrow">Orders</p><h2>Connected customer orders</h2></div><span>{orders.length} total</span></div>
          {orders.length ? <div className="studio-operation-cards">{orders.map((order) => <article className="studio-operation-card" key={order.reference}><Link className="studio-operation-card-trigger" href={`/studio/orders/${order.reference}`}><div className="studio-card-heading"><div><small>{order.reference}</small><h3>{order.lines[0]?.name ?? "Wardrobe order"}</h3></div><LifecycleBadge state={order.lifecycleStatus === "ACTIVE" ? "RESERVED" : order.lifecycleStatus === "COMPLETED" ? "SOLD" : "CANCELLED"} /></div><dl><div><dt>Receipt</dt><dd>{order.paymentReviewStatus.toLowerCase().replaceAll("_", " ")}</dd></div><div><dt>Payment</dt><dd>{order.fundsConfirmationStatus.toLowerCase()}</dd></div><div><dt>Handoff</dt><dd>{order.fulfillmentStatus.toLowerCase().replaceAll("_", " ")}</dd></div></dl><span className="studio-operation-card-open">Open order <ChevronRight aria-hidden="true" size={17} /></span></Link></article>)}</div> : <div className="studio-quiet-empty"><PackageCheck aria-hidden="true" size={24} /><div><strong>No customer orders</strong><p>Orders appear here after checkout.</p></div></div>}
        </section>
      ) : null}

      {activeView === "returns" ? (
        <section className="studio-operation-section studio-stack-panel" id="studio-view-returns" aria-labelledby="studio-tab-returns" role="tabpanel">
          <div className="studio-section-title"><div><p className="eyebrow">Returns</p><h2>Inspect and resolve</h2></div><span>{returns.length} cases</span></div>
          {returns.length ? <div className="studio-operation-cards">{returns.map((order) => <article className="studio-operation-card" key={order.reference}><Link className="studio-operation-card-trigger" href={`/studio/orders/${order.reference}#studio-order-next-action`}><div className="studio-card-heading"><div><small>{order.reference}</small><h3>{order.lines[0]?.name ?? "Returned piece"}</h3></div><LifecycleBadge state={order.return?.status === "RESOLVED" ? "RETURNED" : "DRAFT"} /></div><dl><div><dt>Return</dt><dd>{order.return!.status.toLowerCase()}</dd></div><div><dt>Refund</dt><dd>{order.return!.refundStatus.toLowerCase().replaceAll("_", " ")}</dd></div><div><dt>Disposition</dt><dd>{order.return!.disposition?.toLowerCase() ?? "waiting"}</dd></div></dl><span className="studio-operation-card-open">Review return <ChevronRight aria-hidden="true" size={17} /></span></Link></article>)}</div> : <div className="studio-quiet-empty"><RotateCcw aria-hidden="true" size={24} /><div><strong>No returns</strong><p>Customer return requests appear here.</p></div></div>}
        </section>
      ) : null}

      <StudioTaskSheet className="studio-inventory-detail-sheet" eyebrow={selected?.sku ?? "Private piece"} onDismiss={closePiece} open={Boolean(selected)} returnFocus={returnFocus} title={selected?.title ?? "Piece"}>
        {selected ? <div className="studio-inventory-detail">
          <figure className={`studio-inventory-detail-media${selected.imageSrc ? " is-photo" : ""}`}>{selected.imageSrc ? <img alt={`${selected.title} inventory view`} height={1280} src={selected.imageSrc} width={1024} /> : <Shirt aria-hidden="true" size={42} />}<figcaption><LifecycleBadge state={lifecycle(selected)} /><span>{selected.activeHold ? "On hold" : selected.availability.toLowerCase()}</span></figcaption></figure>
          <section className="studio-inventory-detail-section">
            <div className="studio-inventory-detail-heading"><div><p className="eyebrow">Truth</p><h3>Where it is now</h3></div></div>
            <dl className="studio-inventory-detail-facts"><div><dt>Custody</dt><dd>{selected.expectedCustody.toLowerCase()}</dd></div><div><dt>Expected</dt><dd>{selected.expectedLocationLabel}</dd></div><div><dt>Last seen</dt><dd>{selected.observedLocationLabel ?? "Not confirmed"}</dd></div><div><dt>Attached to</dt><dd>{selected.activeHold ? `Hold · ${selected.activeHold.customerName}` : selected.orderReference ? `Order · ${selected.orderReference}` : "Nothing"}</dd></div></dl>
          </section>

          {selected.hasLocationMismatch ? <div className="studio-quiet-empty" role="alert"><CircleAlert aria-hidden="true" size={22} /><div><strong>Location differs</strong><p>Expected {selected.expectedLocationLabel}; last seen {selected.observedLocationLabel}.</p></div>{selected.orderReference ? <Link className="button button-secondary" href={`/studio/orders/${selected.orderReference}`}>Review order</Link> : null}</div> : null}

          {notice ? <div className="studio-quiet-empty" aria-live="polite" role="status"><Check aria-hidden="true" size={22} /><div><strong>Saved</strong><p>{notice}</p></div></div> : null}
          {error ? <p className="studio-task-error" role="alert">{error}</p> : null}

          <section className="studio-inventory-detail-section">
            <div className="studio-inventory-detail-heading"><div><p className="eyebrow">Location</p><h3>Confirm in hand</h3></div></div>
            {selected.expectedCustody === "STUDIO" ? <div className="studio-inventory-decision-grid">{locations.map((location) => {
              const confirmsExpected = selected.expectedLocationKey === location.key;
              return <button className="studio-inventory-decision" disabled={pending || Boolean(scenario)} key={location.key} onClick={() => void recordLocation(location.key, confirmsExpected ? "CONFIRM" : "MOVE")} type="button"><MapPin aria-hidden="true" size={20} /><span><strong>{confirmsExpected ? `Confirm at ${location.label}` : `Move to ${location.label}`}</strong><small>{scenario ? "Read-only scenario" : confirmsExpected ? "Check the piece is here." : `Expected location becomes ${location.label.toLowerCase()}.`}</small></span><ChevronRight aria-hidden="true" size={17} /></button>;
            })}</div> : <div className="studio-quiet-empty"><MapPin aria-hidden="true" size={22} /><div><strong>{selected.expectedLocationLabel}</strong><p>{selected.orderReference ? "Continue with the connected order." : "Confirm the handoff before moving this piece."}</p></div>{selected.orderReference ? <Link className="button button-secondary" href={`/studio/orders/${selected.orderReference}`}>Open order</Link> : null}</div>}
          </section>

          <section className="studio-inventory-detail-section">
            <div className="studio-inventory-detail-heading"><div><p className="eyebrow">Next</p><h3>Legal actions</h3></div></div>
            <div className="studio-inventory-decision-grid">
              {selected.orderReference ? <Link className="studio-inventory-decision" href={`/studio/orders/${selected.orderReference}`}><PackageCheck aria-hidden="true" size={20} /><span><strong>Open order</strong><small>Continue with this order.</small></span><ChevronRight aria-hidden="true" size={17} /></Link> : null}
              {selected.activeHold ? <button className="studio-inventory-decision" disabled={pending || Boolean(scenario)} onClick={() => void releaseHold()} type="button"><RotateCcw aria-hidden="true" size={20} /><span><strong>Release hold</strong><small>{scenario ? "Read-only scenario" : "Make this piece available again."}</small></span><ChevronRight aria-hidden="true" size={17} /></button> : null}
              {!selected.activeHold && selected.availability === "AVAILABLE" && selected.sku ? <button className="studio-inventory-decision" disabled={pending || Boolean(scenario)} onClick={openHold} type="button"><UserRound aria-hidden="true" size={20} /><span><strong>Hold for customer</strong><small>{scenario ? "Read-only scenario" : "Name, contact and expiry required."}</small></span><ChevronRight aria-hidden="true" size={17} /></button> : null}
              <Link className="studio-inventory-decision" href={`/studio/wardrobe/${encodeURIComponent(selected.wardrobeItemId ?? selected.sku ?? selected.pieceKey)}`}><Shirt aria-hidden="true" size={20} /><span><strong>Open piece</strong><small>Review garment truth and media.</small></span><ChevronRight aria-hidden="true" size={17} /></Link>
            </div>
          </section>
        </div> : null}
      </StudioTaskSheet>

      <StudioTaskSheet eyebrow="Customer hold" onDismiss={() => { setHoldOpen(false); setHoldPieceKey(null); }} open={holdOpen} returnFocus={holdReturnFocus} title={holdPiece ? `Hold ${holdPiece.title}` : "Hold piece"}>
        <form className="studio-task-sheet-body" onSubmit={saveHold}>
          <div className="studio-form-grid">
            <label className="studio-field"><span>Customer name</span><input autoComplete="name" maxLength={120} onChange={(event) => setCustomerName(event.target.value)} required value={customerName} /></label>
            <label className="studio-field"><span>Phone or email</span><input autoComplete="email" maxLength={160} onChange={(event) => setContact(event.target.value)} required value={contact} /></label>
            <label className="studio-field"><span>Expires</span><input min={new Date().toISOString().slice(0, 16)} onChange={(event) => setExpiresAt(event.target.value)} required type="datetime-local" value={expiresAt} /></label>
            <label className="studio-field"><span>Reason</span><input maxLength={240} onChange={(event) => setReason(event.target.value)} placeholder="Trying on tomorrow" required value={reason} /></label>
          </div>
          {error ? <p className="studio-task-error" role="alert">{error}</p> : null}
          <footer className="studio-task-sheet-footer"><button className="button button-secondary" onClick={() => setHoldOpen(false)} type="button">Cancel</button><button className="button button-primary" disabled={pending} type="submit">{pending ? "Holding…" : "Hold piece"}</button></footer>
        </form>
      </StudioTaskSheet>
    </div>
  );
}
