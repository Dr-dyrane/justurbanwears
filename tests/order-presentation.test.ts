import assert from "node:assert/strict";
import test from "node:test";
import {
  nextStudioOrderTransition,
  studioOrderActionLabel,
  studioOrderHasDueReturnWork,
  studioOrderHasDueWork,
  studioOrderNextActionLabel,
} from "../lib/shop/order-presentation";
import type {
  ShopCancellationRecovery,
  ShopFulfillmentStatus,
  ShopOperatorReturnTransition,
  ShopOperatorTransition,
  ShopReturnView,
  ShopServerOrder,
} from "../lib/shop/server-order/types";
import { projectConnectedStudioApplication } from "../lib/server/studio-application-projection";
import type { StudioOperator } from "../lib/server/studio-operator";
import type { StudioAuthoritySnapshot } from "../lib/studio/services/studio-authority-client";

const now = "2026-08-26T12:00:00.000Z";
const pickupAppointment = "2026-08-27T14:00:00.000Z";

interface OrderFixtureInput {
  reference?: string;
  lifecycleStatus?: ShopServerOrder["lifecycleStatus"];
  paymentReviewStatus?: ShopServerOrder["paymentReviewStatus"];
  fundsConfirmationStatus?: ShopServerOrder["fundsConfirmationStatus"];
  fulfillmentKind?: "DELIVERY" | "PICKUP";
  fulfillmentStatus?: ShopFulfillmentStatus;
  pickupAppointment?: string | null;
  cancellationRecovery?: ShopCancellationRecovery | null;
  return?: ShopReturnView | null;
  allowedTransitions?: ShopOperatorTransition[];
  allowedReturnTransitions?: ShopOperatorReturnTransition[];
}

function orderFixture(input: OrderFixtureInput = {}): ShopServerOrder {
  const fulfillmentKind = input.fulfillmentKind ?? "DELIVERY";
  const lifecycleStatus = input.lifecycleStatus ?? "ACTIVE";
  const fulfillmentStatus = input.fulfillmentStatus ?? "NOT_STARTED";
  const fundsConfirmationStatus = input.fundsConfirmationStatus ?? "CONFIRMED";
  return {
    id: `id:${input.reference ?? "JUW-20260826-ORDER"}`,
    reference: input.reference ?? "JUW-20260826-ORDER",
    lines: [{
      snapshot: "PRODUCT",
      slug: "teal-draped-mini-set",
      sku: "JUW-025",
      name: "Teal Draped Mini Set",
      taggedSize: "M",
      unitPrice: 42_500,
      quantity: 1,
    }],
    contact: {
      name: "Order Customer",
      email: "customer@example.com",
      phone: "+2348000000000",
    },
    fulfillment: fulfillmentKind === "PICKUP"
      ? { kind: "PICKUP", optionId: "pickup" }
      : {
          kind: "DELIVERY",
          optionId: "lagos",
          address: { street: "1 Test Street", area: "Ikeja", state: "Lagos", country: "Nigeria" },
        },
    subtotal: 42_500,
    deliveryFee: fulfillmentKind === "PICKUP" ? 0 : 2_500,
    total: fulfillmentKind === "PICKUP" ? 42_500 : 45_000,
    deliveryLabel: fulfillmentKind === "PICKUP" ? "Studio pickup" : "Lagos delivery",
    deliveryEstimate: fulfillmentKind === "PICKUP" ? "By appointment" : "1–3 working days",
    savedAt: "2026-08-25T10:00:00.000Z",
    reservationExpiresAt: null,
    returnEligibleUntil: lifecycleStatus === "COMPLETED" ? "2026-09-02T12:00:00.000Z" : null,
    status: lifecycleStatus === "COMPLETED" ? "DELIVERED" : "ORDER_RECEIVED",
    transmission: "SUBMITTED",
    source: "ONLINE",
    lifecycleStatus,
    paymentReviewStatus: input.paymentReviewStatus ?? "REVIEW_APPROVED",
    fundsConfirmationStatus,
    fundsConfirmation: fundsConfirmationStatus === "CONFIRMED" ? {
      transferReference: "TRF-20260826-0001",
      receivingAccountLabel: "JUW Operations",
      paidAmount: fulfillmentKind === "PICKUP" ? 42_500 : 45_000,
      paidCurrency: "NGN",
      confirmedAt: "2026-08-25T11:00:00.000Z",
      updatedAt: "2026-08-25T11:00:00.000Z",
      verifierDisplayName: "Lulu",
    } : null,
    fulfillmentStatus,
    fulfillmentFacts: {
      kind: fulfillmentKind,
      carrierName: null,
      trackingReference: null,
      trackingUrl: null,
      pickupAppointment: input.pickupAppointment ?? null,
      recipientName: null,
      dispatchReference: null,
      dispatchedAt: null,
      deliveredAt: fulfillmentStatus === "DELIVERED" ? "2026-08-26T10:00:00.000Z" : null,
      deliveryProofReference: null,
    },
    cancellationRecovery: input.cancellationRecovery ?? null,
    return: input.return ?? null,
    version: 7,
    evidence: [],
    events: [],
    allowedTransitions: input.allowedTransitions ?? [
      { dimension: "FUNDS_CONFIRMATION", target: "CORRECTED" },
      { dimension: "FULFILLMENT", target: "QUALITY_CHECK" },
    ],
    allowedReturnTransitions: input.allowedReturnTransitions ?? [],
    canRequestReturn: false,
    canRequestPaidCancellation: false,
  };
}

function receivedReturn(refundStatus: ShopReturnView["refundStatus"]): ShopReturnView {
  return {
    id: "return-1",
    status: "RECEIVED",
    reason: "WRONG_SIZE",
    detail: "The tagged size did not fit.",
    requestedAt: "2026-08-24T10:00:00.000Z",
    eligibleUntil: "2026-09-02T10:00:00.000Z",
    approvedAt: "2026-08-24T11:00:00.000Z",
    rejectedAt: null,
    receivedAt: "2026-08-25T10:00:00.000Z",
    resolvedAt: null,
    resolutionNote: null,
    refundStatus,
    refundReference: null,
    refundAmount: null,
    refundCurrency: null,
    refundUpdatedAt: null,
    disposition: null,
    items: [{
      sku: "JUW-025",
      name: "Teal Draped Mini Set",
      unitPrice: 42_500,
      refundCapAmount: 42_500,
      disposition: null,
    }],
    correctionCount: 0,
  };
}

test("payment correction stays legal without displacing fulfillment work", () => {
  const order = orderFixture({
    allowedTransitions: [
      { dimension: "FUNDS_CONFIRMATION", target: "CORRECTED" },
      { dimension: "FULFILLMENT", target: "QUALITY_CHECK" },
    ],
  });

  assert.deepEqual(nextStudioOrderTransition(order), {
    dimension: "FULFILLMENT",
    target: "QUALITY_CHECK",
  });
  assert.equal(studioOrderNextActionLabel(order), "Check the piece");
  assert.equal(studioOrderHasDueWork(order), true);
});

test("scheduled pickup makes collection due while rescheduling remains secondary", () => {
  const order = orderFixture({
    fulfillmentKind: "PICKUP",
    fulfillmentStatus: "READY_FOR_HANDOFF",
    pickupAppointment,
    allowedTransitions: [
      { dimension: "PICKUP", target: "SCHEDULED" },
      { dimension: "FUNDS_CONFIRMATION", target: "CORRECTED" },
      { dimension: "FULFILLMENT", target: "DELIVERED" },
    ],
  });

  assert.deepEqual(nextStudioOrderTransition(order), {
    dimension: "FULFILLMENT",
    target: "DELIVERED",
  });
  assert.equal(studioOrderNextActionLabel(order), "Mark collected");
  assert.equal(
    studioOrderActionLabel(
      { dimension: "PICKUP", target: "SCHEDULED" },
      "PICKUP",
      pickupAppointment,
    ),
    "Reschedule pickup",
  );
});

test("pickup scheduling is due only until an appointment exists", () => {
  const initialSchedule = orderFixture({
    fulfillmentKind: "PICKUP",
    fulfillmentStatus: "READY_FOR_HANDOFF",
    allowedTransitions: [
      { dimension: "FUNDS_CONFIRMATION", target: "CORRECTED" },
      { dimension: "PICKUP", target: "SCHEDULED" },
    ],
  });
  assert.deepEqual(nextStudioOrderTransition(initialSchedule), {
    dimension: "PICKUP",
    target: "SCHEDULED",
  });

  const rescheduleOnly = orderFixture({
    fulfillmentKind: "PICKUP",
    fulfillmentStatus: "READY_FOR_HANDOFF",
    pickupAppointment,
    allowedTransitions: [
      { dimension: "FUNDS_CONFIRMATION", target: "CORRECTED" },
      { dimension: "PICKUP", target: "SCHEDULED" },
    ],
  });
  assert.equal(nextStudioOrderTransition(rescheduleOnly), undefined);
  assert.equal(studioOrderHasDueWork(rescheduleOnly), false);
});

test("refund work wins over correction and alternative failure transitions", () => {
  const cancellationRefund = orderFixture({
    cancellationRecovery: {
      status: "PENDING",
      reason: "Customer cancelled before handoff.",
      requestedAt: "2026-08-25T09:00:00.000Z",
      updatedAt: "2026-08-25T09:00:00.000Z",
      refundReference: null,
      refundAmount: null,
      refundCurrency: null,
    },
    allowedTransitions: [
      { dimension: "FUNDS_CONFIRMATION", target: "CORRECTED" },
      { dimension: "CANCELLATION_REFUND", target: "FAILED" },
      { dimension: "CANCELLATION_REFUND", target: "COMPLETED" },
    ],
  });
  assert.deepEqual(nextStudioOrderTransition(cancellationRefund), {
    dimension: "CANCELLATION_REFUND",
    target: "COMPLETED",
  });

  const returnRefund = orderFixture({
    lifecycleStatus: "COMPLETED",
    fulfillmentStatus: "DELIVERED",
    return: receivedReturn("PENDING"),
    allowedTransitions: [{ dimension: "FUNDS_CONFIRMATION", target: "CORRECTED" }],
    allowedReturnTransitions: [
      { dimension: "REFUND", target: "FAILED" },
      { dimension: "REFUND", target: "COMPLETED" },
    ],
  });
  assert.deepEqual(nextStudioOrderTransition(returnRefund), {
    dimension: "REFUND",
    target: "COMPLETED",
  });
  assert.equal(studioOrderHasDueReturnWork(returnRefund), true);
});

test("completed correction and active cancellation are optional, not due work", () => {
  const completed = orderFixture({
    lifecycleStatus: "COMPLETED",
    fulfillmentStatus: "DELIVERED",
    allowedTransitions: [{ dimension: "FUNDS_CONFIRMATION", target: "CORRECTED" }],
  });
  assert.equal(nextStudioOrderTransition(completed), undefined);
  assert.equal(studioOrderHasDueWork(completed), false);
  assert.equal(studioOrderNextActionLabel(completed), "Open order");

  const waitingForCustomer = orderFixture({
    paymentReviewStatus: "AWAITING_EVIDENCE",
    fundsConfirmationStatus: "UNCONFIRMED",
    allowedTransitions: [{ dimension: "LIFECYCLE", target: "CANCELLED" }],
  });
  assert.equal(nextStudioOrderTransition(waitingForCustomer), undefined);
  assert.equal(studioOrderHasDueWork(waitingForCustomer), false);
});

const operator: StudioOperator = {
  subject: "private-subject",
  email: "lulu@example.com",
  displayName: "Lulu",
  role: "admin",
};

function authorityWithOrders(orders: ShopServerOrder[]): StudioAuthoritySnapshot {
  return {
    generatedAt: now,
    pieces: [],
    orders,
    holds: [],
    models: [],
    media: [],
    notifications: [],
  };
}

test("Studio projection counts due work instead of every legal transition", () => {
  const completedCorrection = orderFixture({
    reference: "JUW-20260826-COMPLETE",
    lifecycleStatus: "COMPLETED",
    fulfillmentStatus: "DELIVERED",
    allowedTransitions: [{ dimension: "FUNDS_CONFIRMATION", target: "CORRECTED" }],
  });
  const clear = projectConnectedStudioApplication({
    operator,
    now,
    authority: authorityWithOrders([completedCorrection]),
  });
  assert.equal(clear.summary.attention.value, 0);
  assert.equal(clear.continueAction?.id, "add-piece");

  const fulfillment = orderFixture({
    reference: "JUW-20260826-FULFILL",
    allowedTransitions: [
      { dimension: "FUNDS_CONFIRMATION", target: "CORRECTED" },
      { dimension: "FULFILLMENT", target: "QUALITY_CHECK" },
    ],
  });
  const oneDue = projectConnectedStudioApplication({
    operator,
    now,
    authority: authorityWithOrders([completedCorrection, fulfillment]),
  });
  assert.equal(oneDue.summary.attention.value, 1);
  assert.deepEqual(oneDue.continueAction, {
    id: "orders",
    label: "Prepare 1 order",
    href: "/studio/orders",
    openCount: 1,
    source: "CONNECTED",
  });
});
