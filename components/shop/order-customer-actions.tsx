"use client";

import { useState, type FormEvent } from "react";
import { authSignInPath } from "../../lib/auth/return-to";
import { mapConnectedOrderFailure } from "../../lib/shop/connected-order-client";
import type { ShopServerOrder } from "../../lib/shop/server-order/types";
import type { ShopCheckoutFulfillment } from "../../lib/shop/domain/entities";

export function OrderCustomerActions({
  order,
  onUpdated,
}: {
  order: ShopServerOrder;
  onUpdated(order: ShopServerOrder, notice: string): void;
}) {
  const [name, setName] = useState(order.contact.name);
  const [email, setEmail] = useState(order.contact.email);
  const [phone, setPhone] = useState(order.contact.phone);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelConfirmed, setCancelConfirmed] = useState(false);
  const [fulfillmentKind, setFulfillmentKind] = useState<"DELIVERY" | "PICKUP">(order.fulfillment.kind);
  const [deliveryOption, setDeliveryOption] = useState<"lagos" | "nationwide">(
    order.fulfillment.kind === "DELIVERY" ? order.fulfillment.optionId : "lagos",
  );
  const [street, setStreet] = useState(order.fulfillment.kind === "DELIVERY" ? order.fulfillment.address.street : "");
  const [area, setArea] = useState(order.fulfillment.kind === "DELIVERY" ? order.fulfillment.address.area : "");
  const [stateName, setStateName] = useState(order.fulfillment.kind === "DELIVERY" ? order.fulfillment.address.state : "Lagos");
  const [pending, setPending] = useState<"CONTACT" | "FULFILLMENT" | "CANCEL" | "PAID_CANCEL" | null>(null);
  const [error, setError] = useState("");
  const canEdit = order.lifecycleStatus === "ACTIVE" && order.fulfillmentStatus === "NOT_STARTED";
  const canCancel = canEdit
    && order.fundsConfirmationStatus === "UNCONFIRMED"
    && order.paymentReviewStatus === "AWAITING_EVIDENCE";
  const canRequestPaidCancellation = order.canRequestPaidCancellation;

  if (!canEdit && !order.cancellationRecovery) return null;

  async function mutate(
    payload: Record<string, unknown>,
    kind: "CONTACT" | "FULFILLMENT" | "CANCEL" | "PAID_CANCEL",
  ) {
    if (pending) return;
    setPending(kind);
    setError("");
    try {
      const response = await fetch(`/api/shop/orders/${encodeURIComponent(order.reference)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: order.version, ...payload }),
      });
      const body = await response.json().catch(() => ({})) as {
        ok?: boolean;
        order?: ShopServerOrder;
        error?: { code?: string; message?: string };
      };
      if (response.status === 401) {
        window.location.assign(authSignInPath(`/shop/orders/${order.reference}`));
        return;
      }
      if (!response.ok || !body.ok || !body.order) {
        const failure = mapConnectedOrderFailure(response.status, body.error?.code);
        throw new Error(body.error?.message || failure.message);
      }
      const notice = kind === "CONTACT"
        ? "Contact details updated."
        : kind === "FULFILLMENT"
          ? "Handoff details updated."
          : kind === "PAID_CANCEL"
            ? "Cancellation requested. Your pieces remain reserved until the refund is recorded."
            : "Order cancelled. The pieces are no longer reserved.";
      onUpdated(body.order, notice);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The order could not be updated.");
    } finally {
      setPending(null);
    }
  }

  function updateFulfillment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fulfillment: ShopCheckoutFulfillment = fulfillmentKind === "PICKUP"
      ? { kind: "PICKUP", optionId: "pickup" }
      : {
          kind: "DELIVERY",
          optionId: deliveryOption,
          address: { street, area, state: stateName, country: "Nigeria" },
        };
    void mutate({ action: "UPDATE_FULFILLMENT", fulfillment }, "FULFILLMENT");
  }

  function updateContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutate({ action: "UPDATE_CONTACT", contact: { name, email, phone } }, "CONTACT");
  }

  function cancelOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cancelConfirmed || cancelReason.trim().length < 4) return;
    void mutate({ action: "CANCEL", reason: cancelReason }, "CANCEL");
  }


  function requestPaidCancellation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cancelConfirmed || cancelReason.trim().length < 4) return;
    void mutate({ action: "REQUEST_PAID_CANCELLATION", reason: cancelReason }, "PAID_CANCEL");
  }

  return (
    <section className="shop-return-card" aria-labelledby="customer-order-actions-title">
      <p className="shop-kicker">Your order</p>
      <h2 id="customer-order-actions-title">{order.cancellationRecovery ? "Cancellation refund" : "Need to change something?"}</h2>
      {order.cancellationRecovery ? (
        <div aria-live="polite">
          <p><strong>{order.cancellationRecovery.status === "COMPLETED" ? "Refund recorded." : order.cancellationRecovery.status === "FAILED" ? "Refund needs another attempt." : "Refund is being arranged."}</strong></p>
          <p>{order.cancellationRecovery.status === "COMPLETED" ? "The order is cancelled and its pieces are released." : "The pieces remain reserved until Lulu records the refund."}</p>
          {order.cancellationRecovery.refundReference ? <p>Reference: {order.cancellationRecovery.refundReference}</p> : null}
        </div>
      ) : null}
      {canEdit ? <details>
        <summary>Update contact details</summary>
        <form aria-busy={pending === "CONTACT"} className="shop-form-grid" onSubmit={updateContact}>
          <label><span>Full name</span><input autoComplete="name" disabled={Boolean(pending)} maxLength={100} minLength={2} onChange={(event) => setName(event.target.value)} required value={name} /></label>
          <label><span>Email</span><input autoComplete="email" disabled={Boolean(pending)} maxLength={320} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
          <label><span>Phone</span><input autoComplete="tel" disabled={Boolean(pending)} maxLength={30} minLength={7} onChange={(event) => setPhone(event.target.value)} required type="tel" value={phone} /></label>
          <button className="shop-action shop-action-secondary" disabled={Boolean(pending)} type="submit">{pending === "CONTACT" ? "Updating…" : "Update contact"}</button>
        </form>
      </details> : null}
      {canEdit ? (
        <details>
          <summary>Change delivery or pickup</summary>
          <form aria-busy={pending === "FULFILLMENT"} className="shop-form-grid" onSubmit={updateFulfillment}>
            <label><span>Handoff</span><select disabled={Boolean(pending)} onChange={(event) => setFulfillmentKind(event.target.value as "DELIVERY" | "PICKUP")} value={fulfillmentKind}><option value="DELIVERY">Delivery</option><option value="PICKUP">Pickup</option></select></label>
            {fulfillmentKind === "DELIVERY" ? <>
              <label><span>Delivery area</span><select disabled={Boolean(pending)} onChange={(event) => setDeliveryOption(event.target.value as "lagos" | "nationwide")} value={deliveryOption}><option value="lagos">Lagos</option><option value="nationwide">Outside Lagos</option></select></label>
              <label><span>Street</span><input disabled={Boolean(pending)} maxLength={180} onChange={(event) => setStreet(event.target.value)} required value={street} /></label>
              <label><span>Area</span><input disabled={Boolean(pending)} maxLength={100} onChange={(event) => setArea(event.target.value)} required value={area} /></label>
              <label><span>State</span><input disabled={Boolean(pending)} maxLength={100} onChange={(event) => setStateName(event.target.value)} required value={stateName} /></label>
            </> : <p>Lulu will confirm a pickup time after payment.</p>}
            {order.fundsConfirmationStatus === "CONFIRMED" ? <p>Changing the handoff method cannot change the amount already paid.</p> : null}
            <button className="shop-action shop-action-secondary" disabled={Boolean(pending)} type="submit">{pending === "FULFILLMENT" ? "Updating…" : "Update handoff"}</button>
          </form>
        </details>
      ) : null}
      {canCancel ? (
        <details>
          <summary>Cancel unpaid order</summary>
          <form aria-busy={pending === "CANCEL"} onSubmit={cancelOrder}>
            <label><span>Why are you cancelling?</span><textarea disabled={Boolean(pending)} maxLength={500} minLength={4} onChange={(event) => setCancelReason(event.target.value)} required value={cancelReason} /></label>
            <label className="shop-return-confirm"><input checked={cancelConfirmed} disabled={Boolean(pending)} onChange={(event) => setCancelConfirmed(event.target.checked)} required type="checkbox" /><span>Release every piece in this unpaid order.</span></label>
            <button className="shop-action shop-action-secondary" disabled={Boolean(pending) || !cancelConfirmed || cancelReason.trim().length < 4} type="submit">{pending === "CANCEL" ? "Cancelling…" : "Cancel order"}</button>
          </form>
        </details>
      ) : canRequestPaidCancellation ? (
        <details>
          <summary>Cancel and request refund</summary>
          <form aria-busy={pending === "PAID_CANCEL"} onSubmit={requestPaidCancellation}>
            <label><span>Why are you cancelling?</span><textarea disabled={Boolean(pending)} maxLength={500} minLength={4} onChange={(event) => setCancelReason(event.target.value)} required value={cancelReason} /></label>
            <label className="shop-return-confirm"><input checked={cancelConfirmed} disabled={Boolean(pending)} onChange={(event) => setCancelConfirmed(event.target.checked)} required type="checkbox" /><span>Keep the pieces reserved until Lulu records the full refund.</span></label>
            <button className="shop-action shop-action-secondary" disabled={Boolean(pending) || !cancelConfirmed || cancelReason.trim().length < 4} type="submit">{pending === "PAID_CANCEL" ? "Requesting…" : "Request cancellation"}</button>
          </form>
        </details>
      ) : null}
      {error ? <p className="shop-evidence-feedback is-error" role="alert">{error}</p> : null}
    </section>
  );
}
