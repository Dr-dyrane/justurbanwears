import { randomUUID } from "node:crypto";
import { dispatchNotificationOutbox, type NotificationSink } from "./outbox";
import { getShopOrderStore } from "./runtime";
import type { ShopNotificationOutboxMessage } from "./types";

interface ResendConfiguration {
  apiKey: string;
  from: string;
  origin: string;
}

function configuredResend(): ResendConfiguration | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.SHOP_NOTIFICATION_FROM_EMAIL?.trim();
  const rawOrigin = process.env.SHOP_PUBLIC_ORIGIN?.trim() ?? process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!apiKey || !from || !rawOrigin || !/^.+<[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>$/.test(from)) return null;
  try {
    const origin = new URL(rawOrigin);
    if (origin.protocol !== "https:") return null;
    return { apiKey, from, origin: origin.origin };
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function notificationCopy(message: ShopNotificationOutboxMessage): { subject: string; title: string; detail: string } {
  const reference = String(message.payload.orderReference ?? "your order");
  const copy: Record<string, [string, string]> = {
    ORDER_CREATED: ["Order placed", "Your piece is reserved. Transfer payment and upload your receipt from the order page."],
    PAYMENT_EVIDENCE_RECEIVED: ["Receipt received", "Lulu will check the receipt and confirm when the payment reaches the account."],
    PAYMENT_REVIEW_REJECTED: ["New receipt needed", "Open your order to see what needs correcting, then send a clearer receipt."],
    FUNDS_CONFIRMATION_CONFIRMED: ["Payment confirmed", "Your piece can now be prepared for handoff."],
    FUNDS_CONFIRMATION_CORRECTED: ["Payment record corrected", "The exact received amount and reference were corrected on your order."],
    FULFILLMENT_READY_FOR_HANDOFF: ["Your piece is ready", "Open your order for the latest delivery or pickup details."],
    FULFILLMENT_IN_TRANSIT: ["Your order is on its way", "Open your order for the carrier and tracking reference."],
    FULFILLMENT_DELIVERED: ["Order complete", "Delivery or pickup has been recorded. Your return deadline is shown on the order."],
    PICKUP_SCHEDULED: ["Pickup scheduled", "Your confirmed pickup time is now shown on the order."],
    PICKUP_RESCHEDULED: ["Pickup time changed", "Open your order to see the new pickup time."],
    CONTACT_UPDATED: ["Contact updated", "Your order now uses the corrected contact details."],
    FULFILLMENT_DETAILS_UPDATED: ["Handoff updated", "Your delivery or pickup details were corrected before preparation began."],
    CANCELLATION_REFUND_PENDING: ["Cancellation requested", "Your pieces remain reserved while Lulu arranges the full refund."],
    CANCELLATION_REFUND_FAILED: ["Refund needs another attempt", "Your pieces remain reserved while Lulu retries the cancellation refund."],
    CANCELLATION_REFUND_COMPLETED: ["Refund recorded", "The full refund was recorded, the order was cancelled, and its pieces were released."],
    LIFECYCLE_CANCELLED: ["Order cancelled", "The order was cancelled and its pieces were released."],
    LIFECYCLE_EXPIRED: ["Reservation expired", "The unpaid reservation expired and its pieces were released."],
    RETURN_APPROVED: ["Return approved", "Open your order for the return handoff instructions before sending the piece."],
    RETURN_REJECTED: ["Return update", "Open your order to review Lulu's decision."],
    RETURN_CORRECTED: ["Return corrected", "Lulu will review your corrected return request once more."],
    RETURN_RECEIVED: ["Return received", "The Studio received your returned piece."],
    REFUND_COMPLETED: ["Refund sent", "The exact refund amount and reference are saved on your order."],
  };
  const [title, detail] = copy[message.topic] ?? ["Order updated", "A new confirmed update is available on your order."];
  return { subject: `${title} · ${reference}`, title, detail };
}

function resendSink(configuration: ResendConfiguration): NotificationSink {
  return {
    kind: "EMAIL",
    async deliver(message) {
      if (!message.recipientEmail) throw new Error("Notification recipient email is missing.");
      const copy = notificationCopy(message);
      const reference = String(message.payload.orderReference ?? "");
      const orderUrl = `${configuration.origin}/shop/orders/${encodeURIComponent(reference)}`;
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${configuration.apiKey}`,
          "content-type": "application/json",
          "idempotency-key": message.dedupeKey,
        },
        body: JSON.stringify({
          from: configuration.from,
          to: [message.recipientEmail],
          subject: copy.subject,
          html: `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#241a16"><p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase">justurban wears</p><h1 style="font-size:28px">${escapeHtml(copy.title)}</h1><p>${escapeHtml(copy.detail)}</p><p><a href="${escapeHtml(orderUrl)}">Open your order</a></p></div>`,
        }),
      });
      const result = await response.json().catch(() => null) as { id?: unknown; message?: unknown } | null;
      if (!response.ok || typeof result?.id !== "string") {
        throw new Error(typeof result?.message === "string" ? result.message : "Email provider did not accept the notification.");
      }
    },
  };
}

export function notificationEmailIsConfigured(): boolean {
  return Boolean(configuredResend());
}

export async function flushConfiguredOrderNotifications(): Promise<
  | { state: "NOT_CONFIGURED" }
  | { state: "DISPATCHED"; delivered: number; failed: number }
> {
  const configuration = configuredResend();
  if (!configuration) return { state: "NOT_CONFIGURED" };
  const result = await dispatchNotificationOutbox(
    getShopOrderStore(),
    resendSink(configuration),
    { workerId: `order-route:${randomUUID()}`, limit: 20 },
  );
  return { state: "DISPATCHED", ...result };
}

export async function flushOrderNotificationsAfterMutation(): Promise<void> {
  await flushConfiguredOrderNotifications().catch((error) => {
    console.error("Order notification dispatch failed; durable messages remain retryable.", error);
  });
}
