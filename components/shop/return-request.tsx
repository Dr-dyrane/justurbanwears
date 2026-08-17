"use client";

import { RotateCcw, X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { useDocumentScrollLock } from "../../hooks/use-document-scroll-lock";
import { useHistoryBackedDialog } from "../../hooks/use-history-backed-dialog";
import { useSheetDismissGesture } from "../../hooks/use-sheet-dismiss-gesture";
import { authSignInPath } from "../../lib/auth/return-to";
import { mapConnectedOrderFailure } from "../../lib/shop/connected-order-client";
import { orderStateLabel } from "../../lib/shop/order-presentation";
import type { ShopReturnReason, ShopServerOrder } from "../../lib/shop/server-order/types";
import {
  ShopSheet,
  ShopSheetCloseButton,
  ShopSheetHandle,
} from "./atoms/sheet";

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
  const [feedbackIsError, setFeedbackIsError] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const focusResultRef = useRef(false);
  const idempotencyKeyRef = useRef("");
  const pendingRef = useRef(false);
  const dialogId = useId();
  const titleId = `${dialogId}-title`;
  const descriptionId = `${dialogId}-description`;

  useDocumentScrollLock(open);
  const { openWithHistory, requestClose } = useHistoryBackedDialog({
    marker: `return-request:${order.reference}:${dialogId}`,
    isOpen: open,
    onDismiss: dismissSheet,
  });
  const sheetGesture = useSheetDismissGesture({
    dialogRef,
    onDismiss: requestClose,
  });

  useEffect(() => {
    if (!order.return || !focusResultRef.current) return;
    focusResultRef.current = false;
    window.requestAnimationFrame(() => resultRef.current?.focus());
  }, [order.return]);

  function dismissSheet() {
    if (pendingRef.current) return false;
    if (dialogRef.current?.open) dialogRef.current.close();
    else setOpen(false);
    return true;
  }

  function openSheet() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    setOpen(true);
    openWithHistory();
    dialog.showModal();
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());
  }

  function handleClosed() {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function closeFromBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const outside = event.clientX < bounds.left
      || event.clientX > bounds.right
      || event.clientY < bounds.top
      || event.clientY > bounds.bottom;
    if (outside) requestClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current || !confirmed) return;
    pendingRef.current = true;
    setPending(true);
    setFeedbackIsError(false);
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

      pendingRef.current = false;
      setPending(false);
      setFeedbackIsError(false);
      setFeedback("Return request received. Lulu will review it.");
      dialogRef.current?.close();
      setOpen(false);
      focusResultRef.current = true;
      onUpdated(body.order);
    } catch (error) {
      setFeedbackIsError(true);
      setFeedback(error instanceof Error ? error.message : "The return request could not be sent. Try again.");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  if (order.return) {
    const reasonLabel = reasons.find((item) => item.value === order.return?.reason)?.label
      ?? order.return.reason.replaceAll("_", " ").toLowerCase();
    return (
      <section className="shop-return-card" id="shop-order-return" aria-labelledby="return-state-title" ref={resultRef} tabIndex={-1}>
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
        {feedback ? <p aria-live="polite" role="status">{feedback}</p> : null}
      </section>
    );
  }

  if (!order.canRequestReturn) return null;

  return (
    <section className="shop-return-card" id="shop-order-return" aria-labelledby="return-request-title">
      <p className="shop-kicker">Return window</p>
      <h2 id="return-request-title">Need to return this order?</h2>
      <p>
        Send one return request before{" "}
        <time dateTime={order.returnEligibleUntil ?? undefined}>
          {order.returnEligibleUntil ? new Date(order.returnEligibleUntil).toLocaleString("en-NG") : "the window closes"}
        </time>.
      </p>
      <button
        aria-controls={dialogId}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="shop-action shop-action-secondary"
        onClick={openSheet}
        ref={triggerRef}
        type="button"
      >
        <RotateCcw aria-hidden="true" size={16} />
        Review return request
      </button>

      <ShopSheet
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="shop-return-sheet"
        id={dialogId}
        onCancel={(event) => {
          event.preventDefault();
          requestClose();
        }}
        onClick={closeFromBackdrop}
        onClose={handleClosed}
        ref={dialogRef}
      >
        <ShopSheetHandle {...sheetGesture} />
        <header className="shop-return-sheet-heading">
          <div>
            <p className="shop-kicker">Return request</p>
            <h3 id={titleId}>Tell Lulu what happened.</h3>
            <p id={descriptionId}>One request for order {order.reference}.</p>
          </div>
          <ShopSheetCloseButton
            aria-label="Close return request"
            disabled={pending}
            onClick={requestClose}
            ref={closeButtonRef}
          >
            <X aria-hidden="true" size={18} />
          </ShopSheetCloseButton>
        </header>

        <div className="shop-return-sheet-body">
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
          {feedback ? (
            <p
              aria-live="polite"
              className={`shop-evidence-feedback${feedbackIsError ? " is-error" : ""}`}
              role={feedbackIsError ? "alert" : "status"}
            >
              {feedback}
            </p>
          ) : null}
        </div>
      </ShopSheet>
    </section>
  );
}
