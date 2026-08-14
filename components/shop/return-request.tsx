"use client";

import { RotateCcw, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { authSignInPath } from "../../lib/auth/return-to";
import { mapConnectedOrderFailure } from "../../lib/shop/connected-order-client";
import { orderStateLabel } from "../../lib/shop/order-presentation";
import type { ShopReturnReason, ShopServerOrder } from "../../lib/shop/server-order/types";

const reasons: Array<{ value: ShopReturnReason; label: string }> = [
  { value: "WRONG_SIZE", label: "The fit or size is wrong" },
  { value: "NOT_AS_DESCRIBED", label: "The piece differs from its description" },
  { value: "DAMAGED", label: "The piece arrived damaged" },
  { value: "CHANGED_MIND", label: "I changed my mind" },
  { value: "OTHER", label: "Another reason" },
];

export function ReturnRequest({
  order,
  onUpdated,
}: {
  order: ShopServerOrder;
  onUpdated(order: ShopServerOrder): void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState<ShopReturnReason>("WRONG_SIZE");
  const [detail, setDetail] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [feedback, setFeedback] = useState("");
  const idempotencyKeyRef = useRef("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !confirmed) return;
    setPending(true);
    setFeedback("Sending your return request…");
    try {
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = `return:${order.reference}:${crypto.randomUUID()}`;
      }
      const response = await fetch(
        `/api/shop/orders/${encodeURIComponent(order.reference)}/returns`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            version: 1,
            idempotencyKey: idempotencyKeyRef.current,
            reason,
            detail,
          }),
        },
      );
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
        throw new Error(body.error?.code === "RETURN_WINDOW_CLOSED"
          ? "This order is no longer inside its return window."
          : failure.message);
      }
      onUpdated(body.order);
      setOpen(false);
      setFeedback("Return request received. Lulu will review it.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "The return request could not be sent. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (order.return) {
    const reasonLabel = reasons.find((item) => item.value === order.return?.reason)?.label
      ?? order.return.reason.replaceAll("_", " ").toLowerCase();
    return (
      <section className="shop-return-card" aria-labelledby="return-state-title">
        <p className="shop-kicker">Return</p>
        <h2 id="return-state-title">{orderStateLabel(order.return.status)}.</h2>
        <p>{order.return.detail}</p>
        <dl>
          <div><dt>Reason</dt><dd>{reasonLabel}</dd></div>
          <div><dt>Refund</dt><dd>{orderStateLabel(order.return.refundStatus)}</dd></div>
          {order.return.refundAmount && order.return.refundCurrency ? (
            <div><dt>Refund amount</dt><dd>{order.return.refundCurrency} {order.return.refundAmount.toLocaleString("en-NG")}</dd></div>
          ) : null}
          {order.return.refundReference ? <div><dt>Refund reference</dt><dd>{order.return.refundReference}</dd></div> : null}
          {order.return.disposition ? <div><dt>Resolution</dt><dd>{orderStateLabel(order.return.disposition)}</dd></div> : null}
        </dl>
        {feedback ? <p aria-live="polite">{feedback}</p> : null}
      </section>
    );
  }

  if (!order.canRequestReturn) return null;

  return (
    <section className="shop-return-card" aria-labelledby="return-request-title">
      <p className="shop-kicker">Return window</p>
      <h2 id="return-request-title">Need to return this order?</h2>
      <p>
        Send one return request before{" "}
        <time dateTime={order.returnEligibleUntil ?? undefined}>
          {order.returnEligibleUntil ? new Date(order.returnEligibleUntil).toLocaleString("en-NG") : "the window closes"}
        </time>.
      </p>
      {!open ? (
        <button className="shop-action shop-action-secondary" onClick={() => setOpen(true)} type="button">
          <RotateCcw aria-hidden="true" size={16} />
          Review return request
        </button>
      ) : (
        <div className="shop-return-sheet" role="dialog" aria-modal="false" aria-labelledby="return-sheet-title">
          <div className="shop-return-sheet-heading">
            <div><p className="shop-kicker">Return request</p><h3 id="return-sheet-title">Tell Lulu what happened.</h3></div>
            <button aria-label="Close return request" disabled={pending} onClick={() => setOpen(false)} type="button">
              <X aria-hidden="true" size={18} />
            </button>
          </div>
          <form aria-busy={pending} onSubmit={submit}>
            <fieldset className="shop-return-reasons">
              <legend>Reason</legend>
              {reasons.map((item) => (
                <label key={item.value}>
                  <input
                    checked={reason === item.value}
                    disabled={pending}
                    name="return-reason"
                    onChange={() => setReason(item.value)}
                    type="radio"
                    value={item.value}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </fieldset>
            <label>
              <span>What should Lulu know?</span>
              <textarea
                disabled={pending}
                maxLength={500}
                minLength={10}
                onChange={(event) => setDetail(event.target.value)}
                placeholder="Add condition, fit, or handoff details."
                required
                rows={4}
                value={detail}
              />
            </label>
            <label className="shop-return-confirm">
              <input
                checked={confirmed}
                disabled={pending}
                onChange={(event) => setConfirmed(event.target.checked)}
                required
                type="checkbox"
              />
              <span>I confirm this is the one return request for this delivered order.</span>
            </label>
            <button className="shop-action shop-action-primary" disabled={pending || !confirmed || detail.trim().length < 10} type="submit">
              {pending ? "Sending request…" : "Send return request"}
            </button>
          </form>
        </div>
      )}
      {feedback ? <p className="shop-evidence-feedback" aria-live="polite" role="status">{feedback}</p> : null}
    </section>
  );
}
