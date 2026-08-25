"use client";

import {
  FileSearch,
  RotateCcw,
  ShieldCheck,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatNaira } from "../../lib/shop/catalog";
import { mapConnectedOrderFailure } from "../../lib/shop/connected-order-client";
import {
  formatConnectedOrderDate,
  nextStudioOrderTransition,
  orderEventLabel,
  orderStateLabel,
  orderStateSummary,
  studioOrderActionLabel,
  studioOrderNextActionLabel,
} from "../../lib/shop/order-presentation";
import type {
  ShopOperatorReturnTransition,
  ShopOperatorTransition,
  ShopOrderTransitionDetails,
  ShopServerOrder,
} from "../../lib/shop/server-order/types";
import { StudioFeedback } from "./atoms/studio-feedback";
import { StudioLoadingStage } from "./atoms/studio-loading-stage";
import { StudioStackPage, StudioStackSection } from "./atoms/studio-stack-page";
import { useStudioStackRegistration } from "./navigation/studio-stack-context";

type OperatorRole = "operator" | "admin";
type StudioTransition = ShopOperatorTransition | ShopOperatorReturnTransition;

function isReturnTransition(transition: StudioTransition): transition is ShopOperatorReturnTransition {
  return transition.dimension === "RETURN"
    || transition.dimension === "REFUND"
    || transition.dimension === "RETURN_RESOLUTION";
}

function transitionKey(transition: StudioTransition): string {
  return `${transition.dimension}:${transition.target}`;
}

function confirmationCopy(transition: StudioTransition, fulfillmentKind: "DELIVERY" | "PICKUP"): string {
  if (transition.dimension === "FUNDS_CONFIRMATION") {
    return transition.target === "CORRECTED"
      ? "I checked the original payment and confirm these corrected details."
      : "I checked the receiving account and the payment arrived.";
  }
  if (transition.dimension === "FULFILLMENT" && transition.target === "DELIVERED") {
    return fulfillmentKind === "PICKUP"
      ? "I confirmed that the customer collected the piece."
      : "I confirmed that the customer received the piece.";
  }
  if (transition.dimension === "REFUND" && transition.target === "COMPLETED") {
    return "I checked the refund amount and reference.";
  }
  if (transition.dimension === "RETURN_RESOLUTION") {
    return "I inspected every returned piece and recorded its correct outcome.";
  }
  if (transition.dimension === "PICKUP") {
    return "I confirmed this pickup time with the customer.";
  }
  if (transition.dimension === "CANCELLATION_REFUND") {
    return transition.target === "COMPLETED"
      ? "I checked that the full refund left the account."
      : "I confirm this refund update is accurate.";
  }
  return `I confirm: ${studioOrderActionLabel(transition, fulfillmentKind).toLowerCase()}.`;
}

function requiresNote(transition: StudioTransition): boolean {
  return (transition.dimension === "PAYMENT_REVIEW" && transition.target === "REVIEW_REJECTED")
    || (transition.dimension === "LIFECYCLE" && transition.target === "CANCELLED")
    || (transition.dimension === "RETURN" && transition.target === "REJECTED")
    || (transition.dimension === "REFUND" && transition.target === "FAILED")
    || (transition.dimension === "CANCELLATION_REFUND" && transition.target === "FAILED");
}

function noteLabel(transition: StudioTransition): string {
  if (transition.dimension === "PAYMENT_REVIEW") return "What should the customer correct?";
  if (transition.dimension === "LIFECYCLE") return "Cancellation reason";
  if (transition.dimension === "RETURN") return "Reason for rejecting the return";
  if (transition.dimension === "CANCELLATION_REFUND") return "What blocked the refund?";
  if (transition.dimension === "REFUND") return "Refund issue";
  return "Note";
}

function localDateTimeNow(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function isoDate(value: string): string {
  return new Date(value).toISOString();
}

function localDateTime(value: string | null): string {
  if (!value) return localDateTimeNow();
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function MutationAction({
  operatorRole,
  order,
  transition,
  isNextAction = false,
  onApplied,
  onVersionConflict,
}: {
  operatorRole: OperatorRole;
  order: ShopServerOrder;
  transition: StudioTransition;
  isNextAction?: boolean;
  onApplied(order: ShopServerOrder, notice: string): void;
  onVersionConflict(): void;
}) {
  const [pending, setPending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [transferReference, setTransferReference] = useState(
    transition.dimension === "FUNDS_CONFIRMATION" && transition.target === "CORRECTED"
      ? order.fundsConfirmation?.transferReference ?? ""
      : "",
  );
  const [receivingAccountLabel, setReceivingAccountLabel] = useState(
    transition.dimension === "FUNDS_CONFIRMATION" && transition.target === "CORRECTED"
      ? order.fundsConfirmation?.receivingAccountLabel ?? ""
      : "",
  );
  const [paidAmount, setPaidAmount] = useState(
    transition.dimension === "FUNDS_CONFIRMATION" && transition.target === "CORRECTED"
      ? String(order.fundsConfirmation?.paidAmount ?? order.total)
      : String(order.total),
  );
  const [carrierName, setCarrierName] = useState("");
  const [trackingReference, setTrackingReference] = useState("");
  const [dispatchReference, setDispatchReference] = useState("");
  const [dispatchTime, setDispatchTime] = useState(localDateTimeNow);
  const [recipientName, setRecipientName] = useState("");
  const [handoffTime, setHandoffTime] = useState(localDateTimeNow);
  const [pickupAppointment, setPickupAppointment] = useState(
    localDateTime(order.fulfillmentFacts.pickupAppointment),
  );
  const [proofReference, setProofReference] = useState("");
  const [refundReference, setRefundReference] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [lineDispositions, setLineDispositions] = useState<Record<string, "RESTOCK" | "WRITE_OFF">>(() => (
    Object.fromEntries((order.return?.items ?? []).map((item) => [item.sku, item.disposition ?? "RESTOCK"]))
  ));
  const financeAction = (transition.dimension === "FUNDS_CONFIRMATION")
    || (transition.dimension === "REFUND" && transition.target === "COMPLETED")
    || (transition.dimension === "CANCELLATION_REFUND" && transition.target === "COMPLETED");
  const adminLocked = financeAction && operatorRole !== "admin";
  const label = studioOrderActionLabel(transition, order.fulfillment.kind);
  const confirmationId = `studio-confirm-${transitionKey(transition).toLowerCase().replaceAll(":", "-")}-${order.version}`;
  const noteRequired = requiresNote(transition);
  const returnRefundCap = order.return?.items.reduce(
    (sum, item) => sum + (item.refundCapAmount ?? item.unitPrice),
    0,
  ) ?? 0;
  const paidRefundCap = order.fundsConfirmation?.paidAmount ?? 0;

  let fieldsValid = !noteRequired || note.trim().length > 0;
  if (transition.dimension === "FUNDS_CONFIRMATION") {
    const amount = Number(paidAmount);
    fieldsValid = transferReference.trim().length >= 4
      && receivingAccountLabel.trim().length >= 3
      && Number.isSafeInteger(amount)
      && amount > 0;
  } else if (transition.dimension === "FULFILLMENT" && transition.target === "IN_TRANSIT") {
    fieldsValid = carrierName.trim().length >= 2
      && trackingReference.trim().length >= 3
      && dispatchReference.trim().length >= 3
      && Boolean(dispatchTime);
  } else if (transition.dimension === "FULFILLMENT" && transition.target === "DELIVERED") {
    fieldsValid = recipientName.trim().length >= 2
      && proofReference.trim().length >= 3
      && Boolean(handoffTime)
      && (order.fulfillment.kind === "DELIVERY" || Boolean(order.fulfillmentFacts.pickupAppointment));
  } else if (transition.dimension === "PICKUP") {
    fieldsValid = Boolean(pickupAppointment) && new Date(pickupAppointment) > new Date();
  } else if (transition.dimension === "REFUND" && transition.target === "COMPLETED") {
    const amount = Number(refundAmount);
    fieldsValid = refundReference.trim().length >= 4
      && Number.isSafeInteger(amount)
      && amount > 0
      && amount <= returnRefundCap;
  } else if (transition.dimension === "CANCELLATION_REFUND" && transition.target === "COMPLETED") {
    const amount = Number(refundAmount);
    fieldsValid = refundReference.trim().length >= 4
      && paidRefundCap > 0
      && Number.isSafeInteger(amount)
      && amount === paidRefundCap;
  } else if (transition.dimension === "RETURN_RESOLUTION") {
    fieldsValid = Boolean(order.return?.items.length)
      && order.return!.items.every((item) => Boolean(lineDispositions[item.sku]));
  }

  function orderDetails(): ShopOrderTransitionDetails | null {
    if (transition.dimension === "FUNDS_CONFIRMATION") {
      return {
        kind: "FUNDS_CONFIRMATION",
        transferReference: transferReference.trim(),
        receivingAccountLabel: receivingAccountLabel.trim(),
        paidAmount: Number(paidAmount),
        paidCurrency: "NGN",
      };
    }
    if (transition.dimension === "FULFILLMENT" && transition.target === "IN_TRANSIT") {
      return {
        kind: "DELIVERY_DISPATCH",
        carrierName: carrierName.trim(),
        trackingReference: trackingReference.trim(),
        dispatchReference: dispatchReference.trim(),
        dispatchedAt: isoDate(dispatchTime),
      };
    }
    if (transition.dimension === "FULFILLMENT" && transition.target === "DELIVERED") {
      if (order.fulfillment.kind === "PICKUP") {
        return {
          kind: "PICKUP_COMPLETE",
          pickupAppointment: order.fulfillmentFacts.pickupAppointment!,
          recipientName: recipientName.trim(),
          deliveredAt: isoDate(handoffTime),
          deliveryProofReference: proofReference.trim(),
        };
      }
      return {
        kind: "DELIVERY_COMPLETE",
        recipientName: recipientName.trim(),
        deliveredAt: isoDate(handoffTime),
        deliveryProofReference: proofReference.trim(),
      };
    }
    if (transition.dimension === "PICKUP") {
      return { kind: "PICKUP_SCHEDULE", pickupAppointment: isoDate(pickupAppointment) };
    }
    if (transition.dimension === "CANCELLATION_REFUND") {
      return {
        kind: "CANCELLATION_REFUND",
        refundReference: transition.target === "COMPLETED" ? refundReference.trim() : null,
        refundAmount: transition.target === "COMPLETED" ? Number(refundAmount) : null,
        refundCurrency: transition.target === "COMPLETED" ? "NGN" : null,
      };
    }
    return null;
  }

  async function applyTransition() {
    if (pending || !confirmed || !fieldsValid || adminLocked) return;
    setPending(true);
    setError("");
    const returnMutation = isReturnTransition(transition);
    try {
      const response = await fetch(
        `/api/studio/orders/${encodeURIComponent(order.reference)}/${returnMutation ? "returns/transitions" : "transitions"}`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(returnMutation
            ? {
                expectedVersion: order.version,
                transition,
                refundReference: transition.dimension === "REFUND" && transition.target === "COMPLETED"
                  ? refundReference.trim()
                  : null,
                refundAmount: transition.dimension === "REFUND" && transition.target === "COMPLETED"
                  ? Number(refundAmount)
                  : null,
                refundCurrency: transition.dimension === "REFUND" && transition.target === "COMPLETED"
                  ? "NGN"
                  : null,
                lineDispositions: transition.dimension === "RETURN_RESOLUTION"
                  ? order.return?.items.map((item) => ({
                      sku: item.sku,
                      disposition: lineDispositions[item.sku],
                    }))
                  : null,
                note: note.trim() || null,
              }
            : {
                expectedVersion: order.version,
                transition,
                details: orderDetails(),
                note: note.trim() || null,
              }),
        },
      );
      const body = await response.json().catch(() => ({})) as {
        ok?: boolean;
        order?: ShopServerOrder;
        error?: { code?: string; message?: string };
      };
      if (!response.ok || !body.ok || !body.order) {
        if (body.error?.code === "VERSION_CONFLICT") onVersionConflict();
        const mapped = mapConnectedOrderFailure(response.status, body.error?.code);
        throw new Error(body.error?.message || mapped.message);
      }
      const nextTransition = nextStudioOrderTransition(body.order);
      onApplied(
        body.order,
        `${label} saved. Order is ${orderStateLabel(body.order.lifecycleStatus).toLowerCase()}. Next: ${nextTransition ? studioOrderNextActionLabel(body.order) : "return to Orders"}.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The order could not be updated.");
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="studio-transition-action" id={isNextAction ? "studio-order-next-action" : undefined} open={isNextAction || undefined}>
      <summary>{label}<span>Review and confirm</span></summary>
      <div className="studio-transition-action-body">
        {adminLocked ? (
          <p className="studio-order-finance-lock" role="note">
            Only a Studio admin can confirm payments and refunds.
          </p>
        ) : null}

        {transition.dimension === "FUNDS_CONFIRMATION" ? (
          <div className="studio-transition-fields studio-transition-fields-two">
            <label><span>Amount received (NGN)</span><input inputMode="numeric" min={1} onChange={(event) => setPaidAmount(event.target.value)} required step={1} type="number" value={paidAmount} /><small>Record the amount that actually reached the account.</small></label>
            <label><span>Bank transfer reference</span><input autoComplete="off" maxLength={120} onChange={(event) => setTransferReference(event.target.value)} required value={transferReference} /></label>
            <label><span>Receiving account label</span><input autoComplete="off" maxLength={120} onChange={(event) => setReceivingAccountLabel(event.target.value)} placeholder="e.g. GTBank · Lulu Studio" required value={receivingAccountLabel} /></label>
          </div>
        ) : null}

        {transition.dimension === "FULFILLMENT" && transition.target === "IN_TRANSIT" ? (
          <div className="studio-transition-fields studio-transition-fields-two">
            <label><span>Carrier</span><input maxLength={120} onChange={(event) => setCarrierName(event.target.value)} required value={carrierName} /></label>
            <label><span>Tracking reference</span><input maxLength={120} onChange={(event) => setTrackingReference(event.target.value)} required value={trackingReference} /></label>
            <label><span>Delivery note</span><input maxLength={120} onChange={(event) => setDispatchReference(event.target.value)} required value={dispatchReference} /></label>
            <label><span>Dispatched at</span><input onChange={(event) => setDispatchTime(event.target.value)} required type="datetime-local" value={dispatchTime} /></label>
          </div>
        ) : null}

        {transition.dimension === "FULFILLMENT" && transition.target === "DELIVERED" ? (
          <div className="studio-transition-fields studio-transition-fields-two">
            {order.fulfillment.kind === "PICKUP" ? (
              <p><strong>Scheduled pickup</strong><br />{order.fulfillmentFacts.pickupAppointment ? formatConnectedOrderDate(order.fulfillmentFacts.pickupAppointment) : "Schedule pickup first."}</p>
            ) : null}
            <label><span>{order.fulfillment.kind === "PICKUP" ? "Collected by" : "Recipient"}</span><input maxLength={120} onChange={(event) => setRecipientName(event.target.value)} required value={recipientName} /></label>
            <label><span>{order.fulfillment.kind === "PICKUP" ? "Collected at" : "Delivered at"}</span><input onChange={(event) => setHandoffTime(event.target.value)} required type="datetime-local" value={handoffTime} /></label>
            <label><span>{order.fulfillment.kind === "PICKUP" ? "Collection note" : "Delivery note"}</span><input maxLength={160} onChange={(event) => setProofReference(event.target.value)} required value={proofReference} /></label>
          </div>
        ) : null}

        {transition.dimension === "PICKUP" ? (
          <div className="studio-transition-fields">
            <label><span>Pickup time</span><input min={localDateTimeNow()} onChange={(event) => setPickupAppointment(event.target.value)} required type="datetime-local" value={pickupAppointment} /><small>The customer will see this time.</small></label>
          </div>
        ) : null}

        {transition.dimension === "REFUND" && transition.target === "COMPLETED" ? (
          <div className="studio-transition-fields studio-transition-fields-two">
            <label><span>Exact refund amount (NGN)</span><input inputMode="numeric" max={returnRefundCap} min={1} onChange={(event) => setRefundAmount(event.target.value)} required step={1} type="number" value={refundAmount} /><small>Selected pieces cap: {formatNaira(returnRefundCap)}.</small></label>
            <label><span>Refund reference</span><input maxLength={160} onChange={(event) => setRefundReference(event.target.value)} required value={refundReference} /></label>
          </div>
        ) : null}

        {transition.dimension === "CANCELLATION_REFUND" && transition.target === "COMPLETED" ? (
          <div className="studio-transition-fields studio-transition-fields-two">
            <label><span>Full refund amount (NGN)</span><input inputMode="numeric" max={paidRefundCap || undefined} min={1} onChange={(event) => setRefundAmount(event.target.value)} required step={1} type="number" value={refundAmount} /><small>Must equal the recorded payment: {paidRefundCap ? formatNaira(paidRefundCap) : "record the paid amount first"}.</small></label>
            <label><span>Refund reference</span><input maxLength={160} onChange={(event) => setRefundReference(event.target.value)} required value={refundReference} /></label>
          </div>
        ) : null}

        {transition.dimension === "RETURN_RESOLUTION" && order.return ? (
          <fieldset className="studio-transition-fields">
            <legend>Each returned piece</legend>
            {order.return.items.map((item) => (
              <label key={item.sku}>
                <span>{item.name}</span>
                <select onChange={(event) => setLineDispositions((current) => ({ ...current, [item.sku]: event.target.value as "RESTOCK" | "WRITE_OFF" }))} value={lineDispositions[item.sku] ?? "RESTOCK"}>
                  <option value="RESTOCK">Return to sale</option>
                  <option value="WRITE_OFF">Remove from sale</option>
                </select>
              </label>
            ))}
          </fieldset>
        ) : null}

        {noteRequired || transition.dimension === "RETURN_RESOLUTION" ? (
          <label className="studio-transition-note">
            <span>{noteRequired ? noteLabel(transition) : "Note (optional)"}</span>
            <textarea maxLength={500} onChange={(event) => setNote(event.target.value)} required={noteRequired} value={note} />
          </label>
        ) : null}

        <label className="studio-funds-confirmation" htmlFor={confirmationId}>
          <input checked={confirmed} disabled={adminLocked} id={confirmationId} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
          <span className="sr-only">Confirm this Studio action</span>
          <span><strong>{confirmationCopy(transition, order.fulfillment.kind)}</strong><small>The customer will see this update.</small></span>
        </label>
        <button
          aria-busy={pending}
          className={`button ${transition.dimension === "LIFECYCLE" || transition.target === "REVIEW_REJECTED" || transition.target === "REJECTED" || transition.target === "FAILED" ? "button-secondary" : "button-primary"}`}
          disabled={pending || !confirmed || !fieldsValid || adminLocked}
          onClick={() => void applyTransition()}
          type="button"
        >
          {pending ? "Saving…" : label}
        </button>
        {error ? <p className="is-error" role="alert">{error} Refresh the order, then try again.</p> : null}
      </div>
    </details>
  );
}

export function ConnectedOrderDetail() {
  const params = useParams<{ reference: string }>();
  const reference = params.reference;
  const [order, setOrder] = useState<ShopServerOrder | null>(null);
  const [operatorRole, setOperatorRole] = useState<OperatorRole>("operator");
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [error, setError] = useState("");
  const [updateNotice, setUpdateNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const updateNoticeRef = useRef<HTMLParagraphElement>(null);
  useStudioStackRegistration({
    backHref: "/studio/orders",
    backLabel: "Orders",
    title: order?.reference ?? reference,
  });

  const loadOrder = useCallback(async (signal?: AbortSignal, quiet = false) => {
    if (!quiet) setState("loading");
    setRefreshing(quiet);
    try {
      const response = await fetch(`/api/studio/orders/${encodeURIComponent(reference)}`, {
        cache: "no-store",
        credentials: "same-origin",
        signal,
      });
      const body = await response.json().catch(() => ({})) as {
        ok?: boolean;
        order?: ShopServerOrder;
        operatorRole?: OperatorRole;
      };
      if (response.status === 404) {
        setState("not-found");
        return;
      }
      if (!response.ok || !body.ok || !body.order) {
        throw new Error("This order could not be opened.");
      }
      setOrder(body.order);
      setOperatorRole(body.operatorRole === "admin" ? "admin" : "operator");
      setState("ready");
      setError("");
    } catch (cause: unknown) {
      if (signal?.aborted) return;
      setError(cause instanceof Error ? cause.message : "This order could not be opened.");
      if (!quiet) setState("error");
    } finally {
      setRefreshing(false);
    }
  }, [reference]);

  useEffect(() => {
    const controller = new AbortController();
    void loadOrder(controller.signal);
    return () => controller.abort();
  }, [loadOrder]);

  const timeline = useMemo(
    () => [...(order?.events ?? [])].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)),
    [order?.events],
  );
  const primaryTransition = order ? nextStudioOrderTransition(order) : undefined;
  if (state === "loading") {
    return <StudioLoadingStage label="Opening order…" />;
  }
  if (state === "not-found" || state === "error" || !order) {
    return (
      <StudioFeedback
        action={<>{state === "error" ? <button className="button button-secondary" onClick={() => void loadOrder()} type="button">Try again</button> : null}<Link className="button button-primary" href="/studio/orders">Orders</Link></>}
        detail={state === "error" ? error : "This reference is not in the connected order queue."}
        state={state === "error" ? "error" : "empty"}
        title={state === "error" ? "Order unavailable" : "Order not found"}
      />
    );
  }

  const paymentTransitions = order.allowedTransitions.filter((item) => item.dimension === "PAYMENT_REVIEW");
  const fundsTransitions = order.allowedTransitions.filter((item) => item.dimension === "FUNDS_CONFIRMATION");
  const fulfillmentTransitions = order.allowedTransitions.filter((item) => item.dimension === "FULFILLMENT");
  const pickupTransitions = order.allowedTransitions.filter((item) => item.dimension === "PICKUP");
  const recoveryTransitions = order.allowedTransitions.filter((item) => item.dimension === "CANCELLATION_REFUND");
  const lifecycleTransitions = order.allowedTransitions.filter((item) => item.dimension === "LIFECYCLE");
  const returnTransitions = order.allowedReturnTransitions;
  const applyOrderUpdate = (nextOrder: ShopServerOrder, notice: string) => {
    setOrder(nextOrder);
    setUpdateNotice(notice);
    window.requestAnimationFrame(() => updateNoticeRef.current?.focus());
  };
  const action = (transition: StudioTransition) => (
    <MutationAction
      isNextAction={primaryTransition ? transitionKey(transition) === transitionKey(primaryTransition) : false}
      key={`${transitionKey(transition)}:${order.version}`}
      onApplied={applyOrderUpdate}
      onVersionConflict={() => void loadOrder(undefined, true)}
      operatorRole={operatorRole}
      order={order}
      transition={transition}
    />
  );
  const secondaryActions = (transitions: StudioTransition[]) => transitions
    .filter((transition) => !primaryTransition || transitionKey(transition) !== transitionKey(primaryTransition))
    .map(action);

  return (
    <StudioStackPage className="studio-connected-order-detail" kind="record">
      <header className="studio-connected-detail-heading">
        <div>
          <h1>{order.lines[0]?.name ?? "Wardrobe order"}</h1>
          <p>{order.contact.name} · {order.deliveryLabel} · {formatNaira(order.total)}</p>
        </div>
        <span>{orderStateLabel(order.lifecycleStatus)}</span>
      </header>

      <section className="studio-connected-state-grid" aria-label="Order status">
        {orderStateSummary(order).map((item) => <div key={item.label}><small>{item.label}</small><strong>{item.value}</strong></div>)}
      </section>
      {updateNotice ? (
        <div ref={updateNoticeRef} tabIndex={-1}>
          <StudioFeedback className="studio-order-update-notice" detail={updateNotice} state="success" title="Order updated" />
        </div>
      ) : null}

      <StudioStackSection
        meta="Next action"
        title={primaryTransition ? studioOrderNextActionLabel(order) : "Order is up to date"}
      >
        {primaryTransition ? action(primaryTransition) : <StudioFeedback detail="No customer or fulfilment action is currently due." state="success" title="Nothing waiting" />}
      </StudioStackSection>

      <details className="studio-transition-action studio-order-secondary-details">
        <summary>Order details<span>Evidence, fulfilment, and history</span></summary>
        <div className="studio-transition-action-body">
          <div className="studio-connected-detail-grid">
            <main>
          <section className="studio-order-action-section" aria-labelledby="receipt-review-title">
            <div className="studio-order-action-heading"><span><FileSearch aria-hidden="true" size={19} /></span><div><p className="eyebrow">Transfer receipt</p><h2 id="receipt-review-title">Check the receipt.</h2></div></div>
            <p>Check the receipt first. Confirm payment only after the money reaches the account.</p>
            {order.evidence.filter((item) => item.status === "RECEIVED").length ? (
              <div className="studio-evidence-list">
                {order.evidence.filter((item) => item.status === "RECEIVED").map((item) => (
                  <a href={`/api/studio/orders/${encodeURIComponent(order.reference)}/payment-evidence/${encodeURIComponent(item.id)}`} key={item.id} rel="noreferrer" target="_blank">
                    <span><strong>{item.originalFileName}</strong><small>{Math.ceil(item.byteSize / 1024)} KB</small></span>
                    <span>Open receipt</span>
                  </a>
                ))}
              </div>
            ) : <p className="studio-order-quiet-note">No transfer receipt yet.</p>}
            <div className="studio-transition-list">{secondaryActions(paymentTransitions)}</div>
          </section>

          <section className="studio-order-action-section studio-funds-section" aria-labelledby="payment-title">
            <div className="studio-order-action-heading"><span><ShieldCheck aria-hidden="true" size={19} /></span><div><p className="eyebrow">Payment</p><h2 id="payment-title">Check the receiving account.</h2></div></div>
            <p>Status: <strong>{orderStateLabel(order.fundsConfirmationStatus)}</strong>. Only an admin can confirm that payment arrived.</p>
            {order.fundsConfirmation ? (
              <dl className="studio-order-facts">
                <div><dt>Transfer reference</dt><dd>{order.fundsConfirmation.transferReference}</dd></div>
                <div><dt>Receiving account</dt><dd>{order.fundsConfirmation.receivingAccountLabel}</dd></div>
                <div><dt>Amount received</dt><dd>{order.fundsConfirmation.paidAmount && order.fundsConfirmation.paidCurrency ? formatNaira(order.fundsConfirmation.paidAmount) : "Not recorded on the original confirmation"}</dd></div>
                <div><dt>Confirmed</dt><dd>{formatConnectedOrderDate(order.fundsConfirmation.confirmedAt)}</dd></div>
                {order.fundsConfirmation.updatedAt !== order.fundsConfirmation.confirmedAt ? <div><dt>Last corrected</dt><dd>{formatConnectedOrderDate(order.fundsConfirmation.updatedAt)}</dd></div> : null}
                <div><dt>Verified by</dt><dd>{order.fundsConfirmation.verifierDisplayName}</dd></div>
              </dl>
            ) : null}
            <div className="studio-transition-list">{secondaryActions(fundsTransitions)}</div>
            {!fundsTransitions.length && !order.fundsConfirmation ? <p className="studio-order-quiet-note">Available after the receipt is checked.</p> : null}
          </section>

          <section className="studio-order-action-section" aria-labelledby="delivery-title">
            <div className="studio-order-action-heading"><span><Truck aria-hidden="true" size={19} /></span><div><p className="eyebrow">{order.fulfillment.kind === "PICKUP" ? "Pickup" : "Delivery"}</p><h2 id="delivery-title">{order.fulfillment.kind === "PICKUP" ? "Prepare for collection." : "Prepare and send."}</h2></div></div>
            <p>Status: <strong>{orderStateLabel(order.fulfillmentStatus)}</strong>.</p>
            {order.fulfillmentFacts.dispatchedAt || order.fulfillmentFacts.deliveredAt ? (
              <dl className="studio-order-facts">
                {order.fulfillmentFacts.carrierName ? <div><dt>Carrier</dt><dd>{order.fulfillmentFacts.carrierName}</dd></div> : null}
                {order.fulfillmentFacts.trackingReference ? <div><dt>Tracking</dt><dd>{order.fulfillmentFacts.trackingReference}</dd></div> : null}
                {order.fulfillmentFacts.pickupAppointment ? <div><dt>Appointment</dt><dd>{formatConnectedOrderDate(order.fulfillmentFacts.pickupAppointment)}</dd></div> : null}
                {order.fulfillmentFacts.recipientName ? <div><dt>{order.fulfillment.kind === "PICKUP" ? "Collected by" : "Recipient"}</dt><dd>{order.fulfillmentFacts.recipientName}</dd></div> : null}
                {order.fulfillmentFacts.deliveredAt ? <div><dt>{order.fulfillment.kind === "PICKUP" ? "Collected" : "Delivered"}</dt><dd>{formatConnectedOrderDate(order.fulfillmentFacts.deliveredAt)}</dd></div> : null}
              </dl>
            ) : null}
            <div className="studio-transition-list">
              {secondaryActions(pickupTransitions)}
              {secondaryActions(fulfillmentTransitions)}
              {secondaryActions(lifecycleTransitions)}
            </div>
          </section>

          {order.cancellationRecovery ? (
            <section className="studio-order-action-section studio-funds-section" aria-labelledby="cancellation-refund-title">
              <div className="studio-order-action-heading"><span><ShieldCheck aria-hidden="true" size={19} /></span><div><p className="eyebrow">Cancellation</p><h2 id="cancellation-refund-title">Refund before release.</h2></div></div>
              <p>The pieces stay reserved until the full refund reference and amount are recorded.</p>
              <dl className="studio-order-facts">
                <div><dt>Status</dt><dd>{orderStateLabel(order.cancellationRecovery.status)}</dd></div>
                <div><dt>Reason</dt><dd>{order.cancellationRecovery.reason}</dd></div>
                {order.cancellationRecovery.refundAmount ? <div><dt>Refund</dt><dd>{formatNaira(order.cancellationRecovery.refundAmount)}</dd></div> : null}
                {order.cancellationRecovery.refundReference ? <div><dt>Reference</dt><dd>{order.cancellationRecovery.refundReference}</dd></div> : null}
              </dl>
              <div className="studio-transition-list">{secondaryActions(recoveryTransitions)}</div>
            </section>
          ) : null}

          {order.return ? (
            <section className="studio-order-action-section studio-return-section" aria-labelledby="return-title">
              <div className="studio-order-action-heading"><span><RotateCcw aria-hidden="true" size={19} /></span><div><p className="eyebrow">Return and refund</p><h2 id="return-title">Resolve the customer request.</h2></div></div>
              <dl className="studio-order-facts">
                <div><dt>Return</dt><dd>{orderStateLabel(order.return.status)}</dd></div>
                <div><dt>Reason</dt><dd>{orderStateLabel(order.return.reason)}</dd></div>
                <div><dt>Customer detail</dt><dd>{order.return.detail}</dd></div>
                <div><dt>Requested</dt><dd>{formatConnectedOrderDate(order.return.requestedAt)}</dd></div>
                <div><dt>Refund</dt><dd>{orderStateLabel(order.return.refundStatus)}</dd></div>
                {order.return.refundAmount && order.return.refundCurrency ? <div><dt>Refund amount</dt><dd>{formatNaira(order.return.refundAmount)}</dd></div> : null}
                {order.return.refundReference ? <div><dt>Refund reference</dt><dd>{order.return.refundReference}</dd></div> : null}
                {order.return.disposition ? <div><dt>Inventory</dt><dd>{orderStateLabel(order.return.disposition)}</dd></div> : null}
              </dl>
              <ul className="studio-order-return-items">
                {order.return.items.map((item) => <li key={item.sku}><span><strong>{item.name}</strong><small>{item.sku}</small></span><b>{item.disposition ? orderStateLabel(item.disposition) : formatNaira(item.unitPrice)}</b></li>)}
              </ul>
              <div className="studio-transition-list">{secondaryActions(returnTransitions)}</div>
              {!returnTransitions.length ? <p className="studio-order-quiet-note">No return action is currently due.</p> : null}
            </section>
          ) : null}

          <details className="studio-transition-action studio-order-timeline">
            <summary>Order timeline<span>{timeline.length} update{timeline.length === 1 ? "" : "s"}</span></summary>
            <div className="studio-transition-action-body">
              <button aria-busy={refreshing} className="button button-secondary" disabled={refreshing} onClick={() => void loadOrder(undefined, true)} type="button">{refreshing ? "Checking…" : "Check for updates"}</button>
              <ol>
                {timeline.map((event, index) => (
                  <li aria-current={index === timeline.length - 1 ? "step" : undefined} key={event.id}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div><strong>{orderEventLabel(event, order.fulfillment.kind)}</strong>{event.note ? <p>{event.note}</p> : null}<small>{event.actorKind === "OPERATOR" ? "Studio operator" : event.actorKind === "CUSTOMER" ? "Customer" : "Order system"}</small><time dateTime={event.occurredAt}>{formatConnectedOrderDate(event.occurredAt)}</time></div>
                  </li>
                ))}
              </ol>
            </div>
          </details>
            </main>

            <aside className="studio-connected-order-summary">
          <dl>
            <div><dt>Reference</dt><dd>{order.reference}</dd></div>
            <div><dt>Source</dt><dd>{order.source === "ONLINE" ? "Online" : orderStateLabel(order.source)}</dd></div>
            <div><dt>Customer</dt><dd>{order.contact.name}</dd></div>
            <div><dt>Email</dt><dd>{order.contact.email}</dd></div>
            <div><dt>Phone</dt><dd>{order.contact.phone}</dd></div>
            <div><dt>Reserved</dt><dd>{formatConnectedOrderDate(order.savedAt)}</dd></div>
            {order.reservationExpiresAt ? <div><dt>Expires</dt><dd><time dateTime={order.reservationExpiresAt}>{formatConnectedOrderDate(order.reservationExpiresAt)}</time></dd></div> : null}
            {order.returnEligibleUntil ? <div><dt>Return window</dt><dd><time dateTime={order.returnEligibleUntil}>Until {formatConnectedOrderDate(order.returnEligibleUntil)}</time></dd></div> : null}
            <div><dt>{order.fulfillment.kind === "PICKUP" ? "Pickup" : "Delivery"}</dt><dd>{order.deliveryLabel}</dd></div>
            {order.fulfillment.kind === "DELIVERY" ? <div><dt>Destination</dt><dd>{order.fulfillment.address.street}, {order.fulfillment.address.area}, {order.fulfillment.address.state}</dd></div> : null}
            <div><dt>Subtotal</dt><dd>{formatNaira(order.subtotal)}</dd></div>
            <div><dt>Delivery</dt><dd>{formatNaira(order.deliveryFee)}</dd></div>
            <div><dt>Total</dt><dd>{formatNaira(order.total)}</dd></div>
          </dl>
          <h2>Pieces</h2>
          <ul>{order.lines.map((line) => <li key={line.slug}><span><strong>{line.name}</strong><small>{line.sku} · {line.taggedSize}</small></span><b>{formatNaira(line.unitPrice)}</b></li>)}</ul>
            </aside>
          </div>
        </div>
      </details>
    </StudioStackPage>
  );
}
