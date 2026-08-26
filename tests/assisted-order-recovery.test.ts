import assert from "node:assert/strict";
import test from "node:test";
import { findRecoveredAssistedOrder } from "../lib/shop/assisted-order-recovery";
import type { ShopServerOrder } from "../lib/shop/server-order/types";

function order(overrides: Partial<ShopServerOrder> = {}): ShopServerOrder {
  return {
    id: "order-1",
    reference: "JUW-ORDER-1",
    lines: [{ snapshot: "PRODUCT", slug: "piece-a", sku: "JUW-001", name: "Piece", taggedSize: "M", unitPrice: 10_000, quantity: 1 }],
    contact: { name: "Ada Example", email: "ada@example.com", phone: "+2348000000000" },
    fulfillment: { kind: "PICKUP", optionId: "pickup" },
    subtotal: 10_000,
    deliveryFee: 0,
    total: 10_000,
    deliveryLabel: "Pickup",
    deliveryEstimate: "Ready soon",
    savedAt: "2026-08-26T18:00:00.000Z",
    reservationExpiresAt: null,
    returnEligibleUntil: null,
    status: "ORDER_RECEIVED",
    transmission: "SUBMITTED",
    source: "DM",
    lifecycleStatus: "ACTIVE",
    paymentReviewStatus: "AWAITING_EVIDENCE",
    fundsConfirmationStatus: "UNCONFIRMED",
    fundsConfirmation: null,
    fulfillmentStatus: "NOT_STARTED",
    fulfillmentFacts: { kind: "PICKUP", carrierName: null, trackingReference: null, trackingUrl: null, pickupAppointment: null, recipientName: null, dispatchReference: null, dispatchedAt: null, deliveredAt: null, deliveryProofReference: null },
    cancellationRecovery: null,
    return: null,
    version: 1,
    evidence: [],
    events: [],
    allowedTransitions: [],
    allowedReturnTransitions: [],
    canRequestReturn: false,
    canRequestPaidCancellation: false,
    ...overrides,
  };
}

const signature = {
  contact: { name: "Ada Example", email: "ADA@example.com", phone: "+2348000000000" },
  fulfillment: { kind: "PICKUP" as const, optionId: "pickup" },
  lines: [{ slug: "piece-a", taggedSize: "M", quantity: 1 as const }],
  sentAfter: Date.parse("2026-08-26T17:59:59.000Z"),
  source: "DM" as const,
};

test("an exact single post-dispatch order is safe to present as recovered", () => {
  const recovered = order();
  assert.equal(findRecoveredAssistedOrder([recovered], signature), recovered);
});

test("recovery fails closed for stale, different, or ambiguous orders", () => {
  assert.equal(findRecoveredAssistedOrder([order({ savedAt: "2026-08-26T17:00:00.000Z" })], signature), null);
  assert.equal(findRecoveredAssistedOrder([order({ source: "PHONE" })], signature), null);
  assert.equal(findRecoveredAssistedOrder([order(), order({ id: "order-2", reference: "JUW-ORDER-2" })], signature), null);
});
