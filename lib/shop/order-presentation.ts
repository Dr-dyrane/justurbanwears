import type {
  ShopFundsConfirmationStatus,
  ShopFulfillmentStatus,
  ShopOrderLifecycleStatus,
  ShopPaymentReviewStatus,
  ShopServerOrder,
} from "./server-order/types";

const labelByState: Record<string, string> = {
  ACTIVE: "Active",
  COMPLETED: "Complete",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  AWAITING_EVIDENCE: "Evidence needed",
  EVIDENCE_RECEIVED: "Evidence received",
  UNDER_REVIEW: "Under review",
  REVIEW_APPROVED: "Evidence accepted",
  REVIEW_REJECTED: "Evidence needs attention",
  UNCONFIRMED: "Funds unconfirmed",
  CONFIRMED: "Funds confirmed",
  NOT_STARTED: "Not started",
  QUALITY_CHECK: "Quality check",
  READY_FOR_HANDOFF: "Ready for handoff",
  IN_TRANSIT: "In transit",
  DELIVERED: "Delivered",
  REQUESTED: "Return requested",
  APPROVED: "Return approved",
  REJECTED: "Return rejected",
  RECEIVED: "Return received",
  RESOLVED: "Return resolved",
  PENDING: "Refund pending",
  FAILED: "Refund needs attention",
  RESTOCK: "Restocked",
  WRITE_OFF: "Written off",
};

export function orderStateLabel(value: string): string {
  return labelByState[value] ?? value.toLowerCase().replaceAll("_", " ");
}

export function formatConnectedOrderDate(value: string, includeTime = true): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

export function customerNextAction(order: ShopServerOrder): { title: string; detail: string } {
  if (order.return?.status === "REQUESTED") {
    return { title: "Return requested", detail: "Lulu is reviewing your request and will record the next step here." };
  }
  if (order.return?.status === "APPROVED") {
    return { title: "Return approved", detail: "Arrange the confirmed Studio handoff before sending the piece." };
  }
  if (order.return?.status === "RECEIVED" && order.return.refundStatus !== "COMPLETED") {
    return { title: "Return received", detail: "The Studio has the piece and is recording the refund." };
  }
  if (order.return?.status === "RESOLVED") {
    return { title: "Return resolved", detail: "The return, refund, and inventory resolution are recorded." };
  }
  if (order.lifecycleStatus === "CANCELLED") {
    return { title: "No action needed", detail: "This order was cancelled and its reservation released." };
  }
  if (order.lifecycleStatus === "EXPIRED") {
    return { title: "Reservation expired", detail: "Return to the wardrobe to check current availability." };
  }
  if (order.lifecycleStatus === "COMPLETED" || order.fulfillmentStatus === "DELIVERED") {
    return {
      title: order.fulfillment.kind === "PICKUP" ? "Pickup complete" : "Delivery complete",
      detail: order.canRequestReturn
        ? "Your order is complete. A return request is available below during the recorded window."
        : "Your order journey is complete.",
    };
  }
  if (order.paymentReviewStatus === "AWAITING_EVIDENCE" || order.paymentReviewStatus === "REVIEW_REJECTED") {
    return {
      title: order.paymentReviewStatus === "REVIEW_REJECTED" ? "Upload clearer evidence" : "Upload payment evidence",
      detail: "Lulu reviews evidence separately from confirming settled funds.",
    };
  }
  if (order.paymentReviewStatus === "EVIDENCE_RECEIVED" || order.paymentReviewStatus === "UNDER_REVIEW") {
    return { title: "Lulu is reviewing your evidence", detail: "No action is needed unless Lulu requests another file." };
  }
  if (order.fundsConfirmationStatus === "UNCONFIRMED") {
    return { title: "Await funds confirmation", detail: "Lulu will check the receiving account before fulfilment begins." };
  }
  if (order.fulfillmentStatus === "NOT_STARTED" || order.fulfillmentStatus === "QUALITY_CHECK") {
    return { title: "Your piece is being prepared", detail: "The Studio will update this page when it is ready." };
  }
  if (order.fulfillmentStatus === "READY_FOR_HANDOFF") {
    return { title: "Ready for handoff", detail: order.deliveryEstimate };
  }
  return { title: "Track the handoff", detail: "Your piece is on its way." };
}

export function orderNeedsEvidence(order: ShopServerOrder): boolean {
  return order.lifecycleStatus === "ACTIVE"
    && (order.paymentReviewStatus === "AWAITING_EVIDENCE"
      || order.paymentReviewStatus === "REVIEW_REJECTED");
}

export function orderStateSummary(order: ShopServerOrder): Array<{ label: string; value: string }> {
  return [
    { label: "Order", value: orderStateLabel(order.lifecycleStatus) },
    { label: "Evidence", value: orderStateLabel(order.paymentReviewStatus) },
    { label: "Funds", value: orderStateLabel(order.fundsConfirmationStatus) },
    { label: "Fulfilment", value: orderStateLabel(order.fulfillmentStatus) },
  ];
}

export type OrderStateDimension =
  | ShopOrderLifecycleStatus
  | ShopPaymentReviewStatus
  | ShopFundsConfirmationStatus
  | ShopFulfillmentStatus;
