import type {
  ShopFundsConfirmationStatus,
  ShopFulfillmentStatus,
  ShopOrderLifecycleStatus,
  ShopPaymentReviewStatus,
  ShopOperatorReturnTransition,
  ShopOperatorTransition,
  ShopOrderAuditEvent,
  ShopServerOrder,
} from "./server-order/types";

const labelByState: Record<string, string> = {
  ACTIVE: "Active",
  COMPLETED: "Complete",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  AWAITING_EVIDENCE: "Receipt needed",
  EVIDENCE_RECEIVED: "Receipt received",
  UNDER_REVIEW: "Being checked",
  REVIEW_APPROVED: "Receipt checked",
  REVIEW_REJECTED: "New receipt needed",
  UNCONFIRMED: "Payment to confirm",
  CONFIRMED: "Payment confirmed",
  NOT_STARTED: "Not started",
  QUALITY_CHECK: "Quality check",
  READY_FOR_HANDOFF: "Ready to go",
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
  ONLINE: "Online",
  PHONE: "Phone",
  DM: "Direct message",
  IN_PERSON: "In person",
  SCHEDULED: "Scheduled",
  RESOLVE_ITEMS: "Resolve pieces",
};

export function orderStateLabel(value: string): string {
  return labelByState[value] ?? value.toLowerCase().replaceAll("_", " ");
}

export function orderEventLabel(
  event: ShopOrderAuditEvent,
  fulfillmentKind: "DELIVERY" | "PICKUP",
): string {
  switch (event.eventType) {
    case "ORDER_CREATED":
      return "Order placed. Send your transfer receipt.";
    case "PAYMENT_EVIDENCE_AUTHORIZED":
      return "Receipt upload opened.";
    case "PAYMENT_EVIDENCE_RECEIVED":
      return "Receipt sent. Lulu will check it.";
    case "PAYMENT_UNDER_REVIEW":
      return "Lulu is checking the receipt.";
    case "PAYMENT_REVIEW_APPROVED":
      return "Receipt checked.";
    case "PAYMENT_REVIEW_REJECTED":
      return "A clearer receipt is needed.";
    case "FUNDS_CONFIRMATION_CONFIRMED":
      return "Payment confirmed.";
    case "FUNDS_CONFIRMATION_CORRECTED":
      return "Payment record corrected.";
    case "PICKUP_SCHEDULED":
      return "Pickup scheduled.";
    case "PICKUP_RESCHEDULED":
      return "Pickup time changed.";
    case "CANCELLATION_REFUND_PENDING":
      return "Cancellation refund requested.";
    case "CANCELLATION_REFUND_FAILED":
      return "Cancellation refund needs attention.";
    case "CANCELLATION_REFUND_COMPLETED":
      return "Full refund recorded. Order cancelled.";
    case "ORDER_CONTACT_UPDATED":
    case "CONTACT_UPDATED":
      return "Contact details updated.";
    case "ORDER_FULFILLMENT_UPDATED":
    case "FULFILLMENT_DETAILS_UPDATED":
      return "Handoff details updated.";
    case "RETURN_CORRECTED":
      return "Return request corrected.";
    case "FULFILLMENT_QUALITY_CHECK":
      return "The piece was checked.";
    case "FULFILLMENT_READY_FOR_HANDOFF":
      return fulfillmentKind === "PICKUP" ? "Ready for pickup." : "Ready to send.";
    case "FULFILLMENT_IN_TRANSIT":
      return "The order was sent.";
    case "FULFILLMENT_DELIVERED":
      return fulfillmentKind === "PICKUP" ? "Collected from the Studio." : "Delivered.";
    case "RETURN_REQUESTED":
      return "Return requested.";
    case "RETURN_APPROVED":
      return "Return approved.";
    case "RETURN_REJECTED":
      return "Return declined.";
    case "RETURN_RECEIVED":
      return "Returned piece received.";
    case "REFUND_PENDING":
      return "Refund is being prepared.";
    case "REFUND_COMPLETED":
      return "Refund sent.";
    case "REFUND_FAILED":
      return "Refund needs attention.";
    case "RETURN_RESOLVED_RESTOCK":
      return "Piece returned to wardrobe.";
    case "RETURN_RESOLVED_WRITE_OFF":
      return "Piece removed from sale.";
    case "RETURN_RESOLVED":
      return "Returned pieces resolved.";
    default:
      return event.note ?? orderStateLabel(event.eventType);
  }
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
  if (order.cancellationRecovery?.status === "PENDING") {
    return { title: "Refund is being arranged", detail: "Your pieces stay reserved until Lulu records the full refund." };
  }
  if (order.cancellationRecovery?.status === "FAILED") {
    return { title: "Refund needs another attempt", detail: "Lulu still has the pieces reserved and will update this page." };
  }
  if (order.return?.status === "REQUESTED") {
    return { title: "Return requested", detail: "Lulu is reviewing your request and will record the next step here." };
  }
  if (order.return?.status === "APPROVED") {
    return { title: "Return approved", detail: "Arrange the return with Lulu before sending the piece." };
  }
  if (order.return?.status === "RECEIVED" && order.return.refundStatus !== "COMPLETED") {
    return { title: "Return received", detail: "The Studio has the piece and is recording the refund." };
  }
  if (order.return?.status === "RESOLVED") {
    return { title: "Return complete", detail: "Your return and refund are complete." };
  }
  if (order.lifecycleStatus === "CANCELLED") {
    return { title: "Order cancelled", detail: "The piece is available again." };
  }
  if (order.lifecycleStatus === "EXPIRED") {
    return { title: "Reservation expired", detail: "Return to the wardrobe to check current availability." };
  }
  if (order.lifecycleStatus === "COMPLETED" || order.fulfillmentStatus === "DELIVERED") {
    return {
      title: order.fulfillment.kind === "PICKUP" ? "Pickup complete" : "Delivery complete",
      detail: order.canRequestReturn
        ? "Your order is complete. You can request a return below before the deadline."
        : "Your order journey is complete.",
    };
  }
  if (order.paymentReviewStatus === "AWAITING_EVIDENCE" || order.paymentReviewStatus === "REVIEW_REJECTED") {
    return {
      title: order.paymentReviewStatus === "REVIEW_REJECTED" ? "Send a clearer receipt" : "Send your transfer receipt",
      detail: "Lulu will check the receipt and confirm when the money arrives.",
    };
  }
  if (order.paymentReviewStatus === "EVIDENCE_RECEIVED" || order.paymentReviewStatus === "UNDER_REVIEW") {
    return { title: "Lulu is checking your receipt", detail: "Nothing else is needed unless Lulu asks for another copy." };
  }
  if (order.fundsConfirmationStatus === "UNCONFIRMED") {
    return { title: "Waiting for payment confirmation", detail: "Lulu is checking the receiving account." };
  }
  if (order.fulfillmentStatus === "NOT_STARTED" || order.fulfillmentStatus === "QUALITY_CHECK") {
    return { title: "Your piece is being prepared", detail: "The Studio will update this page when it is ready." };
  }
  if (order.fulfillmentStatus === "READY_FOR_HANDOFF") {
    if (order.fulfillment.kind === "PICKUP" && order.fulfillmentFacts.pickupAppointment) {
      return { title: "Pickup scheduled", detail: `Come at ${formatConnectedOrderDate(order.fulfillmentFacts.pickupAppointment)}.` };
    }
    return { title: order.fulfillment.kind === "PICKUP" ? "Ready for pickup" : "Ready to send", detail: order.deliveryEstimate };
  }
  return { title: "Track your order", detail: "Your piece is on its way." };
}

export function orderNeedsEvidence(order: ShopServerOrder): boolean {
  return order.lifecycleStatus === "ACTIVE"
    && (order.paymentReviewStatus === "AWAITING_EVIDENCE"
      || order.paymentReviewStatus === "REVIEW_REJECTED");
}

export function orderStateSummary(order: ShopServerOrder): Array<{ label: string; value: string }> {
  const fulfillmentValue = order.fulfillment.kind === "PICKUP"
    ? order.fulfillmentStatus === "DELIVERED"
      ? "Collected"
      : order.fulfillmentStatus === "READY_FOR_HANDOFF"
        ? "Ready for pickup"
        : orderStateLabel(order.fulfillmentStatus)
    : orderStateLabel(order.fulfillmentStatus);

  return [
    { label: "Order", value: orderStateLabel(order.lifecycleStatus) },
    { label: "Receipt", value: orderStateLabel(order.paymentReviewStatus) },
    { label: "Payment", value: orderStateLabel(order.fundsConfirmationStatus) },
    { label: order.fulfillment.kind === "PICKUP" ? "Pickup" : "Delivery", value: fulfillmentValue },
  ];
}

export type StudioOrderTransition = ShopOperatorTransition | ShopOperatorReturnTransition;

export function studioOrderActionLabel(
  transition: StudioOrderTransition | undefined,
  fulfillmentKind: "DELIVERY" | "PICKUP" = "DELIVERY",
): string {
  if (!transition) return "Open order";
  if (transition.dimension === "FUNDS_CONFIRMATION") {
    return transition.target === "CORRECTED" ? "Correct payment record" : "Confirm payment";
  }
  if (transition.dimension === "PAYMENT_REVIEW") {
    if (transition.target === "UNDER_REVIEW") return "Check transfer receipt";
    return transition.target === "REVIEW_APPROVED" ? "Accept receipt" : "Ask for a clearer receipt";
  }
  if (transition.dimension === "LIFECYCLE") {
    return transition.target === "EXPIRED" ? "Release piece" : "Cancel order";
  }
  if (transition.dimension === "FULFILLMENT") {
    if (transition.target === "QUALITY_CHECK") return "Check the piece";
    if (transition.target === "READY_FOR_HANDOFF") return fulfillmentKind === "PICKUP" ? "Mark ready for pickup" : "Mark ready to send";
    if (transition.target === "IN_TRANSIT") return "Mark dispatched";
    return fulfillmentKind === "PICKUP" ? "Mark collected" : "Mark delivered";
  }
  if (transition.dimension === "RETURN") {
    if (transition.target === "APPROVED") return "Approve return";
    if (transition.target === "REJECTED") return "Decline return";
    return "Mark piece received";
  }
  if (transition.dimension === "REFUND") {
    if (transition.target === "PENDING") return "Start refund";
    if (transition.target === "COMPLETED") return "Mark refund sent";
    return "Flag refund problem";
  }
  if (transition.dimension === "PICKUP") return "Schedule pickup";
  if (transition.dimension === "CANCELLATION_REFUND") {
    if (transition.target === "PENDING") return "Retry cancellation refund";
    if (transition.target === "COMPLETED") return "Record full refund";
    return "Flag refund problem";
  }
  return "Resolve returned pieces";
}

export function nextStudioOrderTransition(order: ShopServerOrder): StudioOrderTransition | undefined {
  return order.allowedReturnTransitions[0]
    ?? order.allowedTransitions.find((item) => item.dimension === "LIFECYCLE" && item.target === "EXPIRED")
    ?? order.allowedTransitions.find((item) => item.dimension === "PAYMENT_REVIEW")
    ?? order.allowedTransitions.find((item) => item.dimension === "FUNDS_CONFIRMATION")
    ?? order.allowedTransitions.find((item) => item.dimension === "CANCELLATION_REFUND")
    ?? order.allowedTransitions.find((item) => item.dimension === "PICKUP")
    ?? order.allowedTransitions.find((item) => item.dimension === "FULFILLMENT")
    ?? order.allowedTransitions.find((item) => item.dimension === "LIFECYCLE");
}

export function studioOrderNextActionLabel(order: ShopServerOrder): string {
  if (order.return?.status === "REQUESTED") return "Review return";
  if (order.paymentReviewStatus === "EVIDENCE_RECEIVED") return "Check receipt";
  if (order.paymentReviewStatus === "UNDER_REVIEW") return "Review receipt";
  return studioOrderActionLabel(nextStudioOrderTransition(order), order.fulfillment.kind);
}

export type OrderStateDimension =
  | ShopOrderLifecycleStatus
  | ShopPaymentReviewStatus
  | ShopFundsConfirmationStatus
  | ShopFulfillmentStatus;
