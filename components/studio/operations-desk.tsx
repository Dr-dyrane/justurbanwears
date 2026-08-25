"use client";

/* Protected Studio and catalogue media use stable runtime URLs. */
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useEffect, useState } from "react";
import {
  Check,
  ChevronRight,
  CircleAlert,
  MapPin,
  PackageCheck,
  RotateCcw,
  Shirt,
  UserRound,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type { StudioLifecycleState } from "../../lib/studio/domain/entities";
import type { StudioAuthorityPiece } from "../../lib/studio/services/studio-authority-client";
import { LifecycleMeta, STUDIO_LIFECYCLE_PRESENTATION } from "./atoms/lifecycle-meta";
import { StudioFeedback } from "./atoms/studio-feedback";
import { StudioLoadingStage } from "./atoms/studio-loading-stage";
import { StudioLink as Link } from "./atoms/studio-link";
import { StudioSegmentedView, useStudioSegment } from "./atoms/studio-segmented-view";
import { StudioStackPage, StudioStackSection } from "./atoms/studio-stack-page";
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authority, scenario } = useStudio();
  const snapshot = authority.snapshot;
  const pieces = snapshot?.pieces ?? [];
  const holds = snapshot?.holds ?? [];
  const orders = snapshot?.orders ?? [];
  const activeHolds = holds.filter((hold) => hold.status === "ACTIVE");
  const actionOrders = orders.filter((order) => order.allowedTransitions.length || order.allowedReturnTransitions.length);
  const mismatches = pieces.filter((piece) => piece.hasLocationMismatch);
  const segments = [
    { key: "attention", label: "Attention", count: mismatches.length + actionOrders.length },
    { key: "inventory", label: "Inventory", count: pieces.length },
    { key: "holds", label: "Holds", count: activeHolds.length },
  ];
  const { active: activeView, isPending: viewPending, select: selectView } = useStudioSegment(segments, "attention");
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
  const nextMismatch = mismatches[0] ?? null;
  const nextActionOrder = actionOrders.find((order) => order.allowedReturnTransitions.length > 0)
    ?? actionOrders[0]
    ?? null;
  const nextHeldPiece = activeHolds
    .map((hold) => pieces.find((piece) => piece.sku === hold.sku) ?? null)
    .find((piece): piece is StudioAuthorityPiece => Boolean(piece))
    ?? null;
  const scenarioOrderReference = scenario ? searchParams.get("order") : null;
  const scenarioOrder = scenarioOrderReference
    ? orders.find((order) => order.reference === scenarioOrderReference) ?? null
    : null;

  useEffect(() => {
    const legacyView = searchParams.get("view");
    if (legacyView === "orders" && !scenario) {
      router.replace("/studio/orders");
    } else if (legacyView === "returns" && !scenario) {
      router.replace("/studio/orders?filter=RETURNS");
    }
  }, [router, scenario, searchParams]);

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
    return <StudioLoadingStage label="Opening Operations…" />;
  }

  if (authority.status === "error" || !snapshot) {
    return (
      <StudioStackPage className="studio-ops-page studio-premium-surface" kind="service">
        <h1 className="sr-only">Operations</h1>
        <StudioFeedback action={<button className="button button-secondary" onClick={() => void authority.refresh()} type="button">Try again</button>} detail={authority.error} state="error" title="Operations unavailable" />
      </StudioStackPage>
    );
  }

  return (
    <StudioStackPage className="studio-ops-page studio-premium-surface" kind="service">
      <h1 className="sr-only">Operations</h1>

      {scenarioOrderReference ? (
        <section className="studio-piece-next" id="studio-scenario-order" aria-label={`Scenario order ${scenarioOrderReference}`}>
          <span>{scenarioOrder ? <PackageCheck aria-hidden="true" size={20} /> : <CircleAlert aria-hidden="true" size={20} />}</span>
          <div>
            <small>Scenario order</small>
            <strong>{scenarioOrder?.reference ?? scenarioOrderReference}</strong>
            <p>{scenarioOrder
              ? `${scenarioOrder.lines[0]?.name ?? "Wardrobe order"} · ${scenarioOrder.lifecycleStatus.toLowerCase()} · ${scenarioOrder.fulfillmentStatus.toLowerCase().replaceAll("_", " ")}`
              : "This order is not part of the current scenario snapshot."}</p>
          </div>
        </section>
      ) : null}

      <section className="studio-piece-next" aria-label="Next Operations action">
        <span>{nextMismatch || nextActionOrder ? <CircleAlert aria-hidden="true" size={20} /> : <Check aria-hidden="true" size={20} />}</span>
        <div>
          <small>Continue</small>
          <strong>{nextMismatch ? `Reconcile ${nextMismatch.title}` : nextActionOrder ? (nextActionOrder.return ? "Review return" : "Continue order") : nextHeldPiece ? `Review hold for ${nextHeldPiece.title}` : "Inventory reconciled"}</strong>
          <p>{nextMismatch ? `${nextMismatch.observedLocationLabel ?? "Last seen location"} differs from ${nextMismatch.expectedLocationLabel}.` : nextActionOrder ? `${nextActionOrder.reference} has a legal next action.` : nextHeldPiece ? "Confirm the customer hold is still current." : "No exception is waiting. A stocktake is the next available check."}</p>
        </div>
        {nextMismatch ? <button className="button button-primary" onClick={(event) => openPiece(nextMismatch, event.currentTarget)} type="button">Review location</button> : nextActionOrder ? <Link className="button button-primary" href={`/studio/orders/${nextActionOrder.reference}#studio-order-next-action`}>{nextActionOrder.return ? "Review return" : "Open order"}</Link> : nextHeldPiece ? <button className="button button-primary" onClick={(event) => openPiece(nextHeldPiece, event.currentTarget)} type="button">Review hold</button> : <Link className="button button-primary" href="/studio/stocktake">Start stocktake</Link>}
      </section>

      <StudioSegmentedView active={activeView} label="Operations workspace" onSelect={selectView} pending={viewPending} segments={segments} />

      {activeView === "attention" ? (
        <StudioStackSection className="studio-operation-section studio-stack-panel" id="studio-view-attention" aria-labelledby="studio-tab-attention" role="tabpanel">
          {mismatches.length || actionOrders.length ? <div className="studio-operation-cards">
            {mismatches.map((piece) => <article className="studio-operation-card studio-compact-row" data-state-tone="critical" key={`location:${piece.pieceKey}`}><button className="studio-operation-card-trigger" onClick={(event) => openPiece(piece, event.currentTarget)} type="button"><div className="studio-card-heading"><div><small>{piece.sku ?? "Private piece"}</small><h3>{piece.title}</h3></div><CircleAlert aria-label="Location differs" size={18} /></div><dl><div><dt>Expected</dt><dd>{piece.expectedLocationLabel}</dd></div><div><dt>Last seen</dt><dd>{piece.observedLocationLabel ?? "Not confirmed"}</dd></div></dl><span className="studio-operation-card-open"><span className="sr-only">Review location</span><ChevronRight aria-hidden="true" size={17} /></span></button></article>)}
            {actionOrders.map((order) => <article className="studio-operation-card studio-compact-row" data-state-tone={order.return ? "critical" : "caution"} key={`order:${order.reference}`}><Link className="studio-operation-card-trigger" href={`/studio/orders/${order.reference}#studio-order-next-action`}><div className="studio-card-heading"><div><small>{order.reference}</small><h3>{order.lines[0]?.name ?? "Wardrobe order"}</h3><LifecycleMeta state={order.return ? "DRAFT" : "RESERVED"} /></div></div><dl><div><dt>Exception</dt><dd>{order.return ? "Return needs review" : "Order needs action"}</dd></div><div><dt>Payment</dt><dd>{order.fundsConfirmationStatus.toLowerCase()}</dd></div></dl><span className="studio-operation-card-open"><span className="sr-only">Open in Orders</span><ChevronRight aria-hidden="true" size={17} /></span></Link></article>)}
          </div> : <StudioFeedback state="empty" title="Nothing needs attention" />}
        </StudioStackSection>
      ) : null}

      {activeView === "inventory" ? (
        <StudioStackSection className="studio-operation-section studio-stack-panel" id="studio-view-inventory" aria-labelledby="studio-tab-inventory" role="tabpanel">
          {pieces.length ? <div className="studio-table studio-inventory-list" role="list" aria-label="Inventory pieces">
            {pieces.map((piece) => {
              const pieceState = lifecycle(piece);
              const status = STUDIO_LIFECYCLE_PRESENTATION[pieceState];
              return (
              <article role="listitem" key={piece.pieceKey}>
                <button aria-haspopup="dialog" className="studio-table-row studio-inventory-row-trigger studio-compact-row" data-state-tone={status.tone} onClick={(event) => openPiece(piece, event.currentTarget)} type="button">
                  <span className={`studio-inventory-media${piece.imageSrc ? " is-photo" : ""}`}>{piece.imageSrc ? <img alt="" height={160} loading="lazy" src={piece.imageSrc} width={128} /> : <Shirt aria-hidden="true" size={22} />}</span>
                  <span className="studio-inventory-copy"><small>{piece.sku ?? "Private piece"}</small><strong>{piece.title}</strong><span className="studio-inventory-meta"><LifecycleMeta state={pieceState} /><i aria-hidden="true">·</i><em>{piece.observedLocationLabel ?? piece.expectedLocationLabel}</em></span></span>
                  <span className="studio-inventory-stock"><strong>{piece.observedLocationLabel ?? piece.expectedLocationLabel}</strong><small>{piece.hasLocationMismatch ? `Expected ${piece.expectedLocationLabel}` : piece.observedAt ? `Confirmed ${shortDate(piece.observedAt)}` : "Expected location"}</small></span>
                  <span className="studio-inventory-action">{piece.hasLocationMismatch ? <CircleAlert aria-label="Location differs" size={17} /> : <ChevronRight aria-hidden="true" size={17} />}</span>
                </button>
              </article>
              );
            })}
          </div> : <StudioFeedback action={<Link className="button button-primary" href="/studio/wardrobe?intake=1">Add garment</Link>} state="empty" title="No pieces yet" />}
        </StudioStackSection>
      ) : null}

      {activeView === "holds" ? (
        <StudioStackSection className="studio-operation-section studio-stack-panel" id="studio-view-holds" aria-labelledby="studio-tab-holds" role="tabpanel">
          {activeHolds.length ? <div className="studio-operation-cards">{activeHolds.map((hold) => {
            const piece = pieces.find((candidate) => candidate.sku === hold.sku);
            return <article className="studio-operation-card studio-compact-row" data-state-tone="caution" key={hold.id}><button className="studio-operation-card-trigger" onClick={(event) => piece && openPiece(piece, event.currentTarget)} type="button"><div className="studio-card-heading"><div><small>{hold.sku}</small><h3>{piece?.title ?? hold.sku}</h3><LifecycleMeta state="RESERVED" /></div></div><dl><div><dt>For</dt><dd>{hold.customerName}</dd></div><div><dt>Contact</dt><dd>{hold.contact}</dd></div><div><dt>Expires</dt><dd>{shortDate(hold.expiresAt)}</dd></div></dl><span className="studio-operation-card-open"><span className="sr-only">Review</span><ChevronRight aria-hidden="true" size={17} /></span></button></article>;
          })}</div> : <StudioFeedback state="empty" title="No active holds" />}
        </StudioStackSection>
      ) : null}

      <StudioTaskSheet className="studio-inventory-detail-sheet" eyebrow={selected?.sku ?? "Private piece"} onDismiss={closePiece} open={Boolean(selected)} returnFocus={returnFocus} title={selected?.title ?? "Piece"}>
        {selected ? <div className="studio-inventory-detail">
          {selected.imageSrc ? <figure className="studio-inventory-detail-media is-photo"><img alt={`${selected.title} inventory view`} height={1280} src={selected.imageSrc} width={1024} /></figure> : null}
          <LifecycleMeta className="studio-inventory-detail-state" state={lifecycle(selected)} />
          <section className="studio-inventory-detail-section">
            <div className="studio-inventory-detail-heading"><h3>Location</h3></div>
            <dl className="studio-inventory-detail-facts"><div><dt>Custody</dt><dd>{selected.expectedCustody.toLowerCase()}</dd></div><div><dt>Expected</dt><dd>{selected.expectedLocationLabel}</dd></div><div><dt>Last seen</dt><dd>{selected.observedLocationLabel ?? "Not confirmed"}</dd></div><div><dt>Attached to</dt><dd>{selected.activeHold ? `Hold · ${selected.activeHold.customerName}` : selected.orderReference ? `Order · ${selected.orderReference}` : "Nothing"}</dd></div></dl>
          </section>

          {selected.hasLocationMismatch ? <StudioFeedback action={selected.orderReference ? <Link className="button button-secondary" href={`/studio/orders/${selected.orderReference}`}>Review order</Link> : undefined} detail={`Expected ${selected.expectedLocationLabel}; last seen ${selected.observedLocationLabel}.`} state="error" title="Location differs" /> : null}

          {notice ? <StudioFeedback detail={notice} state="success" title="Saved" /> : null}
          {error ? <StudioFeedback detail={error} state="error" title="Couldn’t save" /> : null}

          <section className="studio-inventory-detail-section">
            <div className="studio-inventory-detail-heading"><h3>Confirm location</h3></div>
            {selected.expectedCustody === "STUDIO" ? <div className="studio-inventory-decision-grid">{locations.map((location) => {
              const confirmsExpected = selected.expectedLocationKey === location.key;
              return <button className="studio-inventory-decision" disabled={pending || Boolean(scenario)} key={location.key} onClick={() => void recordLocation(location.key, confirmsExpected ? "CONFIRM" : "MOVE")} type="button"><MapPin aria-hidden="true" size={20} /><span><strong>{confirmsExpected ? `Confirm at ${location.label}` : `Move to ${location.label}`}</strong><small>{scenario ? "Read-only scenario" : confirmsExpected ? "Check the piece is here." : `Expected location becomes ${location.label.toLowerCase()}.`}</small></span><ChevronRight aria-hidden="true" size={17} /></button>;
            })}</div> : <div className="studio-quiet-empty"><MapPin aria-hidden="true" size={22} /><div><strong>{selected.expectedLocationLabel}</strong><p>{selected.orderReference ? "Continue with the connected order." : "Confirm the handoff before moving this piece."}</p></div>{selected.orderReference ? <Link className="button button-secondary" href={`/studio/orders/${selected.orderReference}`}>Open order</Link> : null}</div>}
          </section>

          <section className="studio-inventory-detail-section">
            <div className="studio-inventory-detail-heading"><h3>Actions</h3></div>
            <div className="studio-inventory-decision-grid">
              {selected.orderReference ? <Link className="studio-inventory-decision" href={`/studio/orders/${selected.orderReference}`}><PackageCheck aria-hidden="true" size={20} /><span><strong>Open order</strong><small>Continue with this order.</small></span><ChevronRight aria-hidden="true" size={17} /></Link> : null}
              {selected.activeHold ? <button className="studio-inventory-decision" disabled={pending || Boolean(scenario)} onClick={() => void releaseHold()} type="button"><RotateCcw aria-hidden="true" size={20} /><span><strong>Release hold</strong><small>{scenario ? "Read-only scenario" : "Make this piece available again."}</small></span><ChevronRight aria-hidden="true" size={17} /></button> : null}
              {!selected.activeHold && selected.availability === "AVAILABLE" && selected.sku ? <button className="studio-inventory-decision" disabled={pending || Boolean(scenario)} onClick={openHold} type="button"><UserRound aria-hidden="true" size={20} /><span><strong>Hold for customer</strong><small>{scenario ? "Read-only scenario" : "Name, contact and expiry required."}</small></span><ChevronRight aria-hidden="true" size={17} /></button> : null}
              <Link className="studio-inventory-decision" href={`/studio/wardrobe/${encodeURIComponent(selected.wardrobeItemId ?? selected.sku ?? selected.pieceKey)}`}><Shirt aria-hidden="true" size={20} /><span><strong>Open piece</strong><small>Review garment truth and media.</small></span><ChevronRight aria-hidden="true" size={17} /></Link>
            </div>
          </section>
        </div> : null}
      </StudioTaskSheet>

      <StudioTaskSheet eyebrow="Customer hold" onDismiss={() => { setHoldOpen(false); setHoldPieceKey(null); }} onSubmit={saveHold} open={holdOpen} returnFocus={holdReturnFocus} title={holdPiece ? `Hold ${holdPiece.title}` : "Hold piece"}>
          <div className="studio-form-grid">
            <label className="studio-field"><span>Customer name</span><input autoComplete="name" maxLength={120} onChange={(event) => setCustomerName(event.target.value)} required value={customerName} /></label>
            <label className="studio-field"><span>Phone or email</span><input autoComplete="email" maxLength={160} onChange={(event) => setContact(event.target.value)} required value={contact} /></label>
            <label className="studio-field"><span>Expires</span><input min={new Date().toISOString().slice(0, 16)} onChange={(event) => setExpiresAt(event.target.value)} required type="datetime-local" value={expiresAt} /></label>
            <label className="studio-field"><span>Reason</span><input maxLength={240} onChange={(event) => setReason(event.target.value)} placeholder="Trying on tomorrow" required value={reason} /></label>
          </div>
          {error ? <StudioFeedback detail={error} state="error" title="Couldn’t save" /> : null}
          <footer className="studio-task-sheet-footer"><button className="button button-secondary" onClick={() => setHoldOpen(false)} type="button">Cancel</button><button className="button button-primary" disabled={pending} type="submit">{pending ? "Holding…" : "Hold piece"}</button></footer>
      </StudioTaskSheet>
    </StudioStackPage>
  );
}
