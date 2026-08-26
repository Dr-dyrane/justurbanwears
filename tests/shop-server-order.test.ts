import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  customerActorFromSession,
} from "../lib/shop/server-order/actors";
import { shopRoute } from "../lib/shop/server-order/http";
import { MemoryShopOrderStore } from "../lib/shop/server-order/memory-store";
import {
  uploadAuthorizedPaymentEvidence,
  type PrivatePaymentEvidenceBlobStore,
} from "../lib/shop/server-order/payment-evidence";
import { ShopOrderService } from "../lib/shop/server-order/service";
import {
  PAYMENT_EVIDENCE_RECEIVED_NOTICE,
  ShopOrderError,
  type ShopCustomerActor,
  type ShopOperatorActor,
} from "../lib/shop/server-order/types";
import type { ShopCheckoutSubmissionIntent } from "../lib/shop/domain/entities";

const catalogue = [{
  sku: "JUW-001",
  slug: "coral-drift-dress",
  name: "Coral Drift Dress",
  taggedSize: "M",
  price: 32_000,
}] as const;

const customer: ShopCustomerActor = {
  kind: "CUSTOMER",
  subject: "auth:customer-1",
  email: "customer@example.com",
  displayName: "Customer One",
};
const anotherCustomer: ShopCustomerActor = {
  kind: "CUSTOMER",
  subject: "auth:customer-2",
  email: "other@example.com",
};
const operator: ShopOperatorActor = {
  kind: "OPERATOR",
  subject: "auth:operator-1",
  email: "operator@example.com",
  displayName: "Lulu Admin",
  role: "admin",
};
const limitedOperator: ShopOperatorActor = {
  ...operator,
  subject: "auth:operator-2",
  role: "operator",
};

function pickupIntent(idempotencyKey = "checkout:local-0001") {
  return {
    version: 1,
    idempotencyKey,
    lines: [{ slug: "coral-drift-dress", taggedSize: "M", quantity: 1 }],
    contact: {
      name: "Customer One",
      email: "customer@example.com",
      phone: "+234 800 000 0000",
    },
    fulfillment: { kind: "PICKUP", optionId: "pickup" },
  };
}

function deliveryIntent(idempotencyKey = "checkout:local-0001") {
  return {
    ...pickupIntent(idempotencyKey),
    fulfillment: {
      kind: "DELIVERY",
      optionId: "lagos",
      address: {
        street: "12 Coral Road",
        area: "Victoria Island",
        state: "Lagos",
        country: "Nigeria",
      },
    },
  };
}

function setup(
  initial = new Date("2026-08-11T12:00:00.000Z"),
  returnWindowMs = 7 * 24 * 60 * 60 * 1000,
) {
  let now = new Date(initial);
  const store = new MemoryShopOrderStore(catalogue, () => new Date(now));
  const service = new ShopOrderService(store, { now: () => new Date(now), returnWindowMs });
  return {
    store,
    service,
    setNow(value: string) {
      now = new Date(value);
    },
  };
}

async function settleAndDeliverPickup(
  service: ShopOrderService,
  suffix: string,
  handoff: {
    beforeDelivery?: () => void;
    pickupAppointment?: string;
    deliveredAt?: string;
  } = {},
) {
  let order = await service.createOrder(customer, pickupIntent(`checkout:${suffix}`));
  const bytes = new TextEncoder().encode(`evidence-${suffix}`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const authorization = await service.authorizePaymentEvidence(customer, order.reference, {
    idempotencyKey: `evidence:${suffix}`,
    originalFileName: "receipt.pdf",
    contentType: "application/pdf",
    byteSize: bytes.byteLength,
    sha256,
  });
  order = await service.completePaymentEvidence(customer, {
    reference: order.reference,
    authorizationId: authorization.id,
    contentType: authorization.contentType,
    byteSize: authorization.byteSize,
    sha256,
    blobPathname: `shop/payment-evidence/${authorization.orderId}/${authorization.id}.pdf`,
    blobUrl: `https://private.example/${authorization.id}`,
  });
  order = await service.transitionOrder(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "PAYMENT_REVIEW", target: "REVIEW_APPROVED" },
  });
  order = await service.transitionOrder(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "FUNDS_CONFIRMATION", target: "CONFIRMED" },
    details: {
      kind: "FUNDS_CONFIRMATION",
      transferReference: `TRF-${suffix}`,
      receivingAccountLabel: "JUW Operations · 0123",
      paidAmount: order.total,
      paidCurrency: "NGN",
    },
  });
  order = await service.transitionOrder(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "FULFILLMENT", target: "QUALITY_CHECK" },
  });
  order = await service.transitionOrder(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "FULFILLMENT", target: "READY_FOR_HANDOFF" },
  });
  const pickupAppointment = handoff.pickupAppointment ?? "2026-08-11T12:30:00.000Z";
  order = await service.transitionOrder(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "PICKUP", target: "SCHEDULED" },
    details: { kind: "PICKUP_SCHEDULE", pickupAppointment },
  });
  handoff.beforeDelivery?.();
  return service.transitionOrder(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "FULFILLMENT", target: "DELIVERED" },
    details: {
      kind: "PICKUP_COMPLETE",
      pickupAppointment,
      recipientName: "Customer One",
      deliveredAt: handoff.deliveredAt ?? "2026-08-11T12:00:00.000Z",
      deliveryProofReference: `PICKUP-${suffix}`,
    },
  });
}

async function confirmPaidOrder(
  service: ShopOrderService,
  intent: ShopCheckoutSubmissionIntent,
  suffix: string,
) {
  let order = await service.createOrder(customer, intent);
  const bytes = new TextEncoder().encode(`paid-${suffix}`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const authorization = await service.authorizePaymentEvidence(customer, order.reference, {
    idempotencyKey: `evidence:${suffix}`,
    originalFileName: "receipt.pdf",
    contentType: "application/pdf",
    byteSize: bytes.byteLength,
    sha256,
  });
  order = await service.completePaymentEvidence(customer, {
    reference: order.reference,
    authorizationId: authorization.id,
    contentType: authorization.contentType,
    byteSize: authorization.byteSize,
    sha256,
    blobPathname: `shop/payment-evidence/${authorization.orderId}/${authorization.id}.pdf`,
    blobUrl: `https://private.example/${authorization.id}`,
  });
  order = await service.transitionOrder(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "PAYMENT_REVIEW", target: "REVIEW_APPROVED" },
  });
  return service.transitionOrder(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "FUNDS_CONFIRMATION", target: "CONFIRMED" },
    details: {
      kind: "FUNDS_CONFIRMATION",
      transferReference: `TRF-${suffix}`,
      receivingAccountLabel: "JUW Operations · 0123",
      paidAmount: order.total,
      paidCurrency: "NGN",
    },
  });
}

async function rejectsCode(promise: Promise<unknown>, code: ShopOrderError["code"]) {
  await assert.rejects(promise, (error: unknown) => (
    error instanceof ShopOrderError && error.code === code
  ));
}

test("atomically derives prices and fees, deduplicates concurrent checkout, and conserves inventory", async () => {
  const { store, service } = setup();
  const [first, second] = await Promise.all([
    service.createOrder(customer, deliveryIntent()),
    service.createOrder(customer, deliveryIntent()),
  ]);

  assert.equal(first.reference, second.reference);
  assert.equal(first.lines[0].unitPrice, 32_000);
  assert.equal(first.deliveryFee, 2_500);
  assert.equal(first.total, 34_500);
  assert.deepEqual(store.inventorySnapshot()["JUW-001"], {
    availability: "RESERVED",
    onHand: 1,
    reserved: 1,
    sold: 0,
    returned: 0,
    writeOff: 0,
  });
  assert.equal(store.outboxSnapshot().filter((row) => row.dedupeKey.endsWith(":created")).length, 1);

  await rejectsCode(service.createOrder(customer, {
    ...deliveryIntent(),
    fulfillment: { kind: "PICKUP", optionId: "pickup" },
  }), "IDEMPOTENCY_MISMATCH");
});

test("serializes competing customers so a one-off piece is reserved only once", async () => {
  const { store, service } = setup();
  const results = await Promise.allSettled([
    service.createOrder(customer, pickupIntent("checkout:customer-0001")),
    service.createOrder(anotherCustomer, pickupIntent("checkout:customer-0002")),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected && rejected.status === "rejected");
  assert.ok(rejected.reason instanceof ShopOrderError);
  assert.equal(rejected.reason.code, "INVENTORY_UNAVAILABLE");
  const inventory = store.inventorySnapshot()["JUW-001"];
  assert.equal(inventory.onHand + inventory.sold - inventory.returned + inventory.writeOff, 1);
  assert.equal(inventory.reserved, 1);
});

test("enforces customer ownership and records private actor attribution", async () => {
  const { service } = setup();
  const order = await service.createOrder(customer, pickupIntent());
  assert.deepEqual(await service.listCustomerOrders(anotherCustomer), []);
  await rejectsCode(service.getCustomerOrder(anotherCustomer, order.reference), "NOT_FOUND");

  const customerView = await service.getCustomerOrder(customer, order.reference);
  assert.equal(customerView.events[0].actorSubject, undefined);
  assert.deepEqual(customerView.allowedTransitions, []);
  const operatorView = await service.getOperatorOrder(operator, order.reference);
  assert.equal(operatorView.events[0].actorSubject, customer.subject);
  assert.deepEqual(operatorView.allowedTransitions, [
    { dimension: "LIFECYCLE", target: "CANCELLED" },
  ]);
});

test("creates an assisted connected order and pages the operator inbox", async () => {
  const { service } = setup();
  const order = await service.createAssistedOrder(operator, {
    ...pickupIntent("assisted:dm-0001"),
    source: "DM",
    note: "Customer confirmed the piece in a direct message.",
  });
  assert.equal(order.source, "DM");
  assert.equal(order.lifecycleStatus, "ACTIVE");
  assert.equal(order.events[0].actorKind, "OPERATOR");
  const claimed = await service.getCustomerOrder(customer, order.reference);
  assert.equal(claimed.reference, order.reference);
  const page = await service.pageOperatorOrders(operator, {
    page: 1,
    limit: 1,
    search: order.contact.email,
    filter: "ACTIVE",
  });
  assert.deepEqual(page.orders.map((item) => item.reference), [order.reference]);
  assert.equal(page.nextPage, null);
});

test("separates evidence review, funds confirmation, fulfillment, versioning, and final sale", async () => {
  const { store, service } = setup();
  let order = await service.createOrder(customer, deliveryIntent());
  await rejectsCode(service.transitionOrder(operator, order.reference, {
    expectedVersion: 0,
    transition: { dimension: "FULFILLMENT", target: "QUALITY_CHECK" },
  }), "INVALID_TRANSITION");

  const bytes = new TextEncoder().encode("reviewable evidence");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const authorization = await service.authorizePaymentEvidence(customer, order.reference, {
    idempotencyKey: "evidence:local-0001",
    originalFileName: "receipt.pdf",
    contentType: "application/pdf",
    byteSize: bytes.byteLength,
    sha256,
  });
  order = await service.completePaymentEvidence(customer, {
    reference: order.reference,
    authorizationId: authorization.id,
    contentType: authorization.contentType,
    byteSize: authorization.byteSize,
    sha256,
    blobPathname: `shop/payment-evidence/${authorization.orderId}/${authorization.id}.pdf`,
    blobUrl: `https://private.example/${authorization.id}`,
  });
  assert.equal(order.version, 2);
  assert.equal(order.paymentReviewStatus, "EVIDENCE_RECEIVED");

  await rejectsCode(service.transitionOrder(operator, order.reference, {
    expectedVersion: 1,
    transition: { dimension: "PAYMENT_REVIEW", target: "UNDER_REVIEW" },
  }), "VERSION_CONFLICT");
  order = await service.transitionOrder(operator, order.reference, {
    expectedVersion: 2,
    transition: { dimension: "PAYMENT_REVIEW", target: "UNDER_REVIEW" },
  });
  order = await service.transitionOrder(operator, order.reference, {
    expectedVersion: 3,
    transition: { dimension: "PAYMENT_REVIEW", target: "REVIEW_APPROVED" },
  });
  assert.match(order.events.at(-1)?.note ?? "", /does not independently prove bank payment/i);
  assert.equal(order.fundsConfirmationStatus, "UNCONFIRMED");
  assert.equal(order.status, "PAYMENT_REQUIRED");
  assert.ok(order.allowedTransitions.some((transition) => (
    transition.dimension === "FUNDS_CONFIRMATION" && transition.target === "CONFIRMED"
  )));
  await rejectsCode(service.transitionOrder(operator, order.reference, {
    expectedVersion: 4,
    transition: { dimension: "FULFILLMENT", target: "QUALITY_CHECK" },
  }), "INVALID_TRANSITION");
  assert.throws(() => service.transitionOrder(limitedOperator, order.reference, {
    expectedVersion: 4,
    transition: { dimension: "FUNDS_CONFIRMATION", target: "CONFIRMED" },
    details: {
      kind: "FUNDS_CONFIRMATION",
      transferReference: "TRF-20260811-0001",
      receivingAccountLabel: "JUW Operations · 0123",
      paidAmount: order.total,
      paidCurrency: "NGN",
    },
  }), (error: unknown) => error instanceof ShopOrderError && error.code === "FORBIDDEN");
  order = await service.transitionOrder(operator, order.reference, {
    expectedVersion: 4,
    transition: { dimension: "FUNDS_CONFIRMATION", target: "CONFIRMED" },
    details: {
      kind: "FUNDS_CONFIRMATION",
      transferReference: "TRF-20260811-0001",
      receivingAccountLabel: "JUW Operations · 0123",
      paidAmount: order.total,
      paidCurrency: "NGN",
    },
  });
  assert.equal(order.fundsConfirmationStatus, "CONFIRMED");
  assert.equal(order.status, "ORDER_RECEIVED");
  assert.equal(order.allowedTransitions.some((transition) => (
    transition.dimension === "LIFECYCLE" && transition.target === "CANCELLED"
  )), false, "a settled order cannot be cancelled without a refund workflow");
  assert.equal(order.fundsConfirmation?.transferReference, "TRF-20260811-0001");
  assert.match(order.events.at(-1)?.note ?? "", /payment confirmed/i);
  order = await service.transitionOrder(operator, order.reference, {
    expectedVersion: 5,
    transition: { dimension: "FULFILLMENT", target: "QUALITY_CHECK" },
  });
  order = await service.transitionOrder(operator, order.reference, {
    expectedVersion: 6,
    transition: { dimension: "FULFILLMENT", target: "READY_FOR_HANDOFF" },
  });
  assert.ok(order.allowedTransitions.some((transition) => (
    transition.dimension === "FULFILLMENT" && transition.target === "IN_TRANSIT"
  )));
  order = await service.transitionOrder(operator, order.reference, {
    expectedVersion: 7,
    transition: { dimension: "FULFILLMENT", target: "IN_TRANSIT" },
    details: {
      kind: "DELIVERY_DISPATCH",
      carrierName: "Lagos Dispatch",
      trackingReference: "TRACK-0001",
      dispatchReference: "DSP-0001",
      dispatchedAt: "2026-08-11T12:00:00.000Z",
    },
    note: "Transferred to the preview courier.",
  });
  await rejectsCode(service.transitionOrder(operator, order.reference, {
    expectedVersion: 8,
    transition: { dimension: "LIFECYCLE", target: "CANCELLED" },
  }), "INVALID_TRANSITION");
  order = await service.transitionOrder(operator, order.reference, {
    expectedVersion: 8,
    transition: { dimension: "FULFILLMENT", target: "DELIVERED" },
    details: {
      kind: "DELIVERY_COMPLETE",
      recipientName: "Customer One",
      deliveredAt: "2026-08-11T12:00:00.000Z",
      deliveryProofReference: "POD-0001",
    },
  });
  assert.equal(order.lifecycleStatus, "COMPLETED");
  assert.equal(order.fulfillmentStatus, "DELIVERED");
  assert.deepEqual(order.allowedTransitions, [
    { dimension: "FUNDS_CONFIRMATION", target: "CORRECTED" },
  ], "an admin can correct the immutable payment audit after fulfillment");
  assert.equal(order.canRequestReturn, false, "operator projection never advertises customer actions");
  const customerDelivered = await service.getCustomerOrder(customer, order.reference);
  assert.equal(customerDelivered.canRequestReturn, true);
  assert.equal(customerDelivered.fulfillmentFacts.trackingReference, "TRACK-0001");
  const inventory = store.inventorySnapshot()["JUW-001"];
  assert.deepEqual(inventory, {
    availability: "SOLD",
    onHand: 0,
    reserved: 0,
    sold: 1,
    returned: 0,
    writeOff: 0,
  });
  assert.equal(inventory.onHand + inventory.sold - inventory.returned + inventory.writeOff, 1);
  const needsAction = await service.pageOperatorOrders(operator, {
    page: 1,
    limit: 50,
    search: "",
    filter: "NEEDS_ACTION",
  });
  assert.equal(
    needsAction.orders.some((candidate) => candidate.reference === order.reference),
    false,
    "a completed order with correction available is not due work",
  );
});

test("records the amount received and corrects the payment audit without rewriting the original confirmation", async () => {
  const { service, setNow } = setup();
  let order = await settleAndDeliverPickup(service, "payment-correction");
  const confirmedAt = order.fundsConfirmation?.confirmedAt;
  assert.equal(order.fundsConfirmation?.paidAmount, order.total);
  assert.equal(order.fundsConfirmation?.paidCurrency, "NGN");
  assert.ok(order.allowedTransitions.some((transition) => (
    transition.dimension === "FUNDS_CONFIRMATION" && transition.target === "CORRECTED"
  )));

  setNow("2026-08-12T12:00:00.000Z");
  order = await service.transitionOrder(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "FUNDS_CONFIRMATION", target: "CORRECTED" },
    details: {
      kind: "FUNDS_CONFIRMATION",
      transferReference: "TRF-CORRECTED-0001",
      receivingAccountLabel: "JUW Operations · 9876",
      paidAmount: 31_500,
      paidCurrency: "NGN",
    },
    note: "Corrected from the bank statement.",
  });

  assert.equal(order.lifecycleStatus, "COMPLETED");
  assert.equal(order.fundsConfirmation?.confirmedAt, confirmedAt);
  assert.equal(order.fundsConfirmation?.updatedAt, "2026-08-12T12:00:00.000Z");
  assert.equal(order.fundsConfirmation?.paidAmount, 31_500);
  assert.equal(order.fundsConfirmation?.transferReference, "TRF-CORRECTED-0001");
  assert.equal(order.events.at(-1)?.eventType, "FUNDS_CONFIRMATION_CORRECTED");
  assert.match(order.events.at(-1)?.note ?? "", /bank statement/i);

  const customerView = await service.getCustomerOrder(customer, order.reference);
  assert.deepEqual(customerView.allowedTransitions, []);
  assert.equal(customerView.fundsConfirmation?.paidAmount, 31_500);
});

test("keeps paid cancellation reserved until the full refund is recorded", async () => {
  const { store, service } = setup();
  let order = await confirmPaidOrder(service, pickupIntent("checkout:paid-cancel"), "paid-cancel");
  const customerView = await service.getCustomerOrder(customer, order.reference);
  assert.equal(customerView.canRequestPaidCancellation, true);

  order = await service.mutateCustomerOrder(customer, order.reference, {
    expectedVersion: order.version,
    action: "REQUEST_PAID_CANCELLATION",
    reason: "The customer no longer needs the piece.",
  });
  assert.equal(order.cancellationRecovery?.status, "PENDING");
  assert.equal(store.inventorySnapshot()["JUW-001"].availability, "RESERVED");

  await rejectsCode(service.transitionOrder(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "CANCELLATION_REFUND", target: "COMPLETED" },
    details: {
      kind: "CANCELLATION_REFUND",
      refundReference: "RFND-PARTIAL",
      refundAmount: order.total - 1,
      refundCurrency: "NGN",
    },
  }), "INVALID_REQUEST");
  assert.equal(store.inventorySnapshot()["JUW-001"].availability, "RESERVED");

  order = await service.transitionOrder(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "CANCELLATION_REFUND", target: "COMPLETED" },
    details: {
      kind: "CANCELLATION_REFUND",
      refundReference: "RFND-FULL-0001",
      refundAmount: order.total,
      refundCurrency: "NGN",
    },
  });
  assert.equal(order.lifecycleStatus, "CANCELLED");
  assert.equal(order.cancellationRecovery?.status, "COMPLETED");
  assert.equal(store.inventorySnapshot()["JUW-001"].availability, "AVAILABLE");
});

test("keeps payment corrections and paid cancellation refunds in parity", async () => {
  const { service } = setup();
  let order = await confirmPaidOrder(service, pickupIntent("checkout:paid-cancel-correction"), "paid-cancel-correction");
  order = await service.mutateCustomerOrder(customer, order.reference, {
    expectedVersion: order.version,
    action: "REQUEST_PAID_CANCELLATION",
    reason: "The customer no longer needs the piece.",
  });

  order = await service.transitionOrder(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "FUNDS_CONFIRMATION", target: "CORRECTED" },
    details: {
      kind: "FUNDS_CONFIRMATION",
      transferReference: "TRF-CANCEL-CORRECTED",
      receivingAccountLabel: "JUW Operations · 9876",
      paidAmount: order.total + 1_000,
      paidCurrency: "NGN",
    },
    note: "Corrected from the bank statement before refund.",
  });

  await rejectsCode(service.transitionOrder(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "CANCELLATION_REFUND", target: "COMPLETED" },
    details: {
      kind: "CANCELLATION_REFUND",
      refundReference: "RFND-OLD-CAP",
      refundAmount: order.total,
      refundCurrency: "NGN",
    },
  }), "INVALID_REQUEST");

  order = await service.transitionOrder(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "CANCELLATION_REFUND", target: "COMPLETED" },
    details: {
      kind: "CANCELLATION_REFUND",
      refundReference: "RFND-CORRECTED-CAP",
      refundAmount: order.fundsConfirmation!.paidAmount!,
      refundCurrency: "NGN",
    },
  });
  assert.equal(order.lifecycleStatus, "CANCELLED");
  assert.equal(order.cancellationRecovery?.refundAmount, order.fundsConfirmation?.paidAmount);

  await rejectsCode(service.transitionOrder(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "FUNDS_CONFIRMATION", target: "CORRECTED" },
    details: {
      kind: "FUNDS_CONFIRMATION",
      transferReference: "TRF-UNDER-REFUNDED",
      receivingAccountLabel: "JUW Operations · 9876",
      paidAmount: order.fundsConfirmation!.paidAmount! + 1,
      paidCurrency: "NGN",
    },
  }), "INVALID_REQUEST");
});

test("uses the configured return window and resolves one return with an audited refund and conserved inventory", async () => {
  const twoDays = 2 * 24 * 60 * 60 * 1000;
  const { store, service } = setup(new Date("2026-08-11T12:00:00.000Z"), twoDays);
  let order = await settleAndDeliverPickup(service, "return-restock");
  assert.equal(order.returnEligibleUntil, "2026-08-13T12:00:00.000Z");

  order = await service.requestReturn(customer, order.reference, {
    version: 1,
    idempotencyKey: "return:restock-0001",
    reason: "WRONG_SIZE",
    detail: "The tagged size does not fit as expected.",
  });
  const replay = await service.requestReturn(customer, order.reference, {
    version: 1,
    idempotencyKey: "return:restock-0001",
    reason: "WRONG_SIZE",
    detail: "The tagged size does not fit as expected.",
  });
  assert.equal(replay.return?.id, order.return?.id);
  assert.equal(order.return?.status, "REQUESTED");

  order = await service.transitionReturn(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "RETURN", target: "APPROVED" },
  });
  order = await service.transitionReturn(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "RETURN", target: "RECEIVED" },
  });
  order = await service.transitionReturn(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "REFUND", target: "PENDING" },
  });
  assert.throws(() => service.transitionReturn(limitedOperator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "REFUND", target: "COMPLETED" },
    refundReference: "RFND-0001",
    refundAmount: 30_000,
    refundCurrency: "NGN",
  }), (error: unknown) => error instanceof ShopOrderError && error.code === "FORBIDDEN");
  await rejectsCode(service.transitionReturn(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "REFUND", target: "COMPLETED" },
    refundReference: "RFND-TOO-MUCH",
    refundAmount: 32_001,
    refundCurrency: "NGN",
  }), "INVALID_REQUEST");
  order = await service.transitionReturn(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "REFUND", target: "COMPLETED" },
    refundReference: "RFND-0001",
    refundAmount: 30_000,
    refundCurrency: "NGN",
  });
  assert.equal(order.return?.refundAmount, 30_000);
  assert.equal(order.return?.refundCurrency, "NGN");
  assert.equal(order.return?.refundReference, "RFND-0001");

  order = await service.transitionReturn(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "RETURN_RESOLUTION", target: "RESOLVE_ITEMS" },
    lineDispositions: [{ sku: "JUW-001", disposition: "RESTOCK" }],
  });
  assert.equal(order.return?.status, "RESOLVED");
  assert.equal(order.return?.disposition, "RESTOCK");
  assert.deepEqual(store.inventorySnapshot()["JUW-001"], {
    availability: "AVAILABLE",
    onHand: 1,
    reserved: 0,
    sold: 1,
    returned: 1,
    writeOff: 0,
  });
  const inventory = store.inventorySnapshot()["JUW-001"];
  assert.equal(inventory.onHand + inventory.sold - inventory.returned + inventory.writeOff, 1);

  const customerView = await service.getCustomerOrder(customer, order.reference);
  assert.equal(customerView.return?.refundAmount, 30_000);
  assert.equal(customerView.events.at(-1)?.actorSubject, undefined);
});

test("anchors the return window to truthful handoff time, including a late Studio entry", async () => {
  const twoDays = 2 * 24 * 60 * 60 * 1000;
  const { service, setNow } = setup(new Date("2026-08-11T12:00:00.000Z"), twoDays);
  const order = await settleAndDeliverPickup(service, "late-handoff", {
    beforeDelivery: () => setNow("2026-08-14T12:00:00.000Z"),
    pickupAppointment: "2026-08-11T12:30:00.000Z",
    deliveredAt: "2026-08-11T13:00:00.000Z",
  });

  assert.equal(order.fulfillmentFacts.deliveredAt, "2026-08-11T13:00:00.000Z");
  assert.equal(order.returnEligibleUntil, "2026-08-13T13:00:00.000Z");
  const customerView = await service.getCustomerOrder(customer, order.reference);
  assert.equal(customerView.canRequestReturn, false);
});

test("writes off a received return atomically without reopening pickup as in transit", async () => {
  const { store, service } = setup();
  let order = await settleAndDeliverPickup(service, "return-writeoff");
  assert.equal(order.fulfillmentFacts.kind, "PICKUP");
  assert.equal(order.fulfillmentFacts.dispatchedAt, null);
  assert.ok(!order.events.some((event) => event.eventType === "FULFILLMENT_IN_TRANSIT"));

  order = await service.requestReturn(customer, order.reference, {
    version: 1,
    idempotencyKey: "return:writeoff-0001",
    reason: "DAMAGED",
    detail: "The piece was damaged during the customer handoff.",
  });
  for (const target of ["APPROVED", "RECEIVED"] as const) {
    order = await service.transitionReturn(operator, order.reference, {
      expectedVersion: order.version,
      transition: { dimension: "RETURN", target },
    });
  }
  order = await service.transitionReturn(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "REFUND", target: "PENDING" },
  });
  order = await service.transitionReturn(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "REFUND", target: "COMPLETED" },
    refundReference: "RFND-0002",
    refundAmount: order.total,
    refundCurrency: "NGN",
  });
  order = await service.transitionReturn(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "RETURN_RESOLUTION", target: "RESOLVE_ITEMS" },
    lineDispositions: [{ sku: "JUW-001", disposition: "WRITE_OFF" }],
    note: "Inspection confirmed irreversible damage.",
  });
  assert.equal(order.return?.disposition, "WRITE_OFF");
  assert.deepEqual(store.inventorySnapshot()["JUW-001"], {
    availability: "ARCHIVED",
    onHand: 0,
    reserved: 0,
    sold: 1,
    returned: 1,
    writeOff: 1,
  });
});

test("corrects one rejected partial return and resolves each selected line independently", async () => {
  const items = [
    { sku: "JUW-101", slug: "first-piece", name: "First Piece", taggedSize: "S", price: 10_000 },
    { sku: "JUW-102", slug: "second-piece", name: "Second Piece", taggedSize: "M", price: 20_000 },
    { sku: "JUW-103", slug: "third-piece", name: "Third Piece", taggedSize: "L", price: 30_000 },
  ];
  const store = new MemoryShopOrderStore(items);
  const service = new ShopOrderService(store, { now: () => new Date("2026-08-11T12:00:00.000Z") });
  const intent: ShopCheckoutSubmissionIntent = {
    ...pickupIntent("checkout:partial-return"),
    lines: items.map((item) => ({ slug: item.slug, taggedSize: item.taggedSize, quantity: 1 })),
  };
  let order = await confirmPaidOrder(service, intent, "partial-return");
  for (const target of ["QUALITY_CHECK", "READY_FOR_HANDOFF"] as const) {
    order = await service.transitionOrder(operator, order.reference, {
      expectedVersion: order.version,
      transition: { dimension: "FULFILLMENT", target },
    });
  }
  order = await service.transitionOrder(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "PICKUP", target: "SCHEDULED" },
    details: { kind: "PICKUP_SCHEDULE", pickupAppointment: "2026-08-11T12:30:00.000Z" },
  });
  order = await service.transitionOrder(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "FULFILLMENT", target: "DELIVERED" },
    details: {
      kind: "PICKUP_COMPLETE",
      pickupAppointment: "2026-08-11T12:30:00.000Z",
      recipientName: "Customer One",
      deliveredAt: "2026-08-11T12:00:00.000Z",
      deliveryProofReference: "PICKUP-PARTIAL",
    },
  });

  order = await service.requestReturn(customer, order.reference, {
    version: 2,
    idempotencyKey: "return:partial-0001",
    expectedVersion: order.version,
    correction: false,
    reason: "WRONG_SIZE",
    detail: "Only the first piece needs to come back.",
    lineSkus: ["JUW-101"],
  });
  order = await service.transitionReturn(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "RETURN", target: "REJECTED" },
    note: "The selected piece does not match the message.",
  });
  order = await service.requestReturn(customer, order.reference, {
    version: 2,
    idempotencyKey: "return:partial-0002",
    expectedVersion: order.version,
    correction: true,
    reason: "OTHER",
    detail: "The first and second pieces are the ones coming back.",
    lineSkus: ["JUW-101", "JUW-102"],
  });
  assert.equal(order.return?.correctionCount, 1);
  assert.deepEqual(order.return?.items.map((item) => item.sku), ["JUW-101", "JUW-102"]);

  for (const target of ["APPROVED", "RECEIVED"] as const) {
    order = await service.transitionReturn(operator, order.reference, {
      expectedVersion: order.version,
      transition: { dimension: "RETURN", target },
    });
  }
  order = await service.transitionReturn(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "REFUND", target: "PENDING" },
  });
  await rejectsCode(service.transitionReturn(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "REFUND", target: "COMPLETED" },
    refundReference: "RFND-TOO-HIGH",
    refundAmount: 30_001,
    refundCurrency: "NGN",
  }), "INVALID_REQUEST");
  order = await service.transitionReturn(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "REFUND", target: "COMPLETED" },
    refundReference: "RFND-PARTIAL-0001",
    refundAmount: 30_000,
    refundCurrency: "NGN",
  });
  order = await service.transitionReturn(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "RETURN_RESOLUTION", target: "RESOLVE_ITEMS" },
    lineDispositions: [
      { sku: "JUW-101", disposition: "RESTOCK" },
      { sku: "JUW-102", disposition: "WRITE_OFF" },
    ],
  });
  assert.equal(order.return?.disposition, null);
  assert.equal(store.inventorySnapshot()["JUW-101"].availability, "AVAILABLE");
  assert.equal(store.inventorySnapshot()["JUW-102"].availability, "ARCHIVED");
  assert.equal(store.inventorySnapshot()["JUW-103"].availability, "SOLD");
});

test("authorizes only owned, exact MIME/size/SHA evidence and writes through the private Blob contract", async () => {
  const { service } = setup();
  const order = await service.createOrder(customer, pickupIntent());
  const bytes = new TextEncoder().encode("private payment evidence");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const authorization = await service.authorizePaymentEvidence(customer, order.reference, {
    idempotencyKey: "evidence:upload-0001",
    originalFileName: "receipt.pdf",
    contentType: "application/pdf",
    byteSize: bytes.byteLength,
    sha256,
  });
  const uploads: Array<{ pathname: string; contentType: string; byteSize: number }> = [];
  const blobs: PrivatePaymentEvidenceBlobStore = {
    async put(input) {
      uploads.push({
        pathname: input.pathname,
        contentType: input.contentType,
        byteSize: input.body.byteLength,
      });
      return {
        url: `https://private.example/${input.pathname}`,
        pathname: input.pathname,
        contentType: input.contentType,
      };
    },
  };

  await rejectsCode(uploadAuthorizedPaymentEvidence(
    service,
    blobs,
    anotherCustomer,
    order.reference,
    authorization.id,
    new Request("https://app.local/upload", {
      method: "PUT",
      headers: {
        "content-type": "application/pdf",
        "content-length": String(bytes.byteLength),
        "x-content-sha256": sha256,
      },
      body: bytes,
    }),
    new Date("2026-08-11T12:05:00.000Z"),
  ), "NOT_FOUND");
  assert.equal(uploads.length, 0);

  await rejectsCode(uploadAuthorizedPaymentEvidence(
    service,
    blobs,
    customer,
    order.reference,
    authorization.id,
    new Request("https://app.local/upload", {
      method: "PUT",
      headers: {
        "content-type": "image/png",
        "content-length": String(bytes.byteLength),
        "x-content-sha256": sha256,
      },
      body: bytes,
    }),
    new Date("2026-08-11T12:05:00.000Z"),
  ), "EVIDENCE_MISMATCH");
  assert.equal(uploads.length, 0);

  const received = await uploadAuthorizedPaymentEvidence(
    service,
    blobs,
    customer,
    order.reference,
    authorization.id,
    new Request("https://app.local/upload", {
      method: "PUT",
      headers: {
        "content-type": "application/pdf",
        "content-length": String(bytes.byteLength),
        "x-content-sha256": sha256,
      },
      body: bytes,
    }),
    new Date("2026-08-11T12:05:00.000Z"),
  );
  assert.equal(uploads.length, 1);
  assert.doesNotMatch(uploads[0].pathname, /customer|auth:/i);
  assert.equal(received.evidence[0].notice, PAYMENT_EVIDENCE_RECEIVED_NOTICE);
  assert.equal("blobPathname" in received.evidence[0], false);

  const replay = await uploadAuthorizedPaymentEvidence(
    service,
    blobs,
    customer,
    order.reference,
    authorization.id,
    new Request("https://app.local/upload", {
      method: "PUT",
      headers: {
        "content-type": "application/pdf",
        "content-length": String(bytes.byteLength),
        "x-content-sha256": sha256,
      },
      body: bytes,
    }),
    new Date("2026-08-11T12:06:00.000Z"),
  );
  assert.equal(replay.version, received.version);
  assert.equal(uploads.length, 1);
});

test("does not let a stale evidence authorization reopen reviewed or settled funds", async () => {
  const { service } = setup();
  let order = await service.createOrder(customer, pickupIntent("checkout:stale-evidence"));
  const firstBytes = new TextEncoder().encode("first evidence");
  const secondBytes = new TextEncoder().encode("second evidence");
  const firstSha = createHash("sha256").update(firstBytes).digest("hex");
  const secondSha = createHash("sha256").update(secondBytes).digest("hex");
  const first = await service.authorizePaymentEvidence(customer, order.reference, {
    idempotencyKey: "evidence:stale-first",
    originalFileName: "first.pdf",
    contentType: "application/pdf",
    byteSize: firstBytes.byteLength,
    sha256: firstSha,
  });
  const stale = await service.authorizePaymentEvidence(customer, order.reference, {
    idempotencyKey: "evidence:stale-second",
    originalFileName: "second.pdf",
    contentType: "application/pdf",
    byteSize: secondBytes.byteLength,
    sha256: secondSha,
  });
  order = await service.completePaymentEvidence(customer, {
    reference: order.reference,
    authorizationId: first.id,
    contentType: first.contentType,
    byteSize: first.byteSize,
    sha256: first.sha256,
    blobPathname: `shop/payment-evidence/${first.orderId}/${first.id}.pdf`,
    blobUrl: `https://private.example/${first.id}`,
  });
  order = await service.transitionOrder(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "PAYMENT_REVIEW", target: "REVIEW_APPROVED" },
  });
  order = await service.transitionOrder(operator, order.reference, {
    expectedVersion: order.version,
    transition: { dimension: "FUNDS_CONFIRMATION", target: "CONFIRMED" },
    details: {
      kind: "FUNDS_CONFIRMATION",
      transferReference: "TRF-STALE-EVIDENCE",
      receivingAccountLabel: "JUW Operations · 0123",
      paidAmount: order.total,
      paidCurrency: "NGN",
    },
  });

  await rejectsCode(service.completePaymentEvidence(customer, {
    reference: order.reference,
    authorizationId: stale.id,
    contentType: stale.contentType,
    byteSize: stale.byteSize,
    sha256: stale.sha256,
    blobPathname: `shop/payment-evidence/${stale.orderId}/${stale.id}.pdf`,
    blobUrl: `https://private.example/${stale.id}`,
  }), "INVALID_TRANSITION");
  const unchanged = await service.getCustomerOrder(customer, order.reference);
  assert.equal(unchanged.version, order.version);
  assert.equal(unchanged.paymentReviewStatus, "REVIEW_APPROVED");
  assert.equal(unchanged.fundsConfirmationStatus, "CONFIRMED");
});

test("cancellation and due expiry release reservations exactly once", async () => {
  const cancelled = setup();
  const first = await cancelled.service.createOrder(customer, pickupIntent("checkout:cancel-0001"));
  const cancelledOrder = await cancelled.service.transitionOrder(operator, first.reference, {
    expectedVersion: 0,
    transition: { dimension: "LIFECYCLE", target: "CANCELLED" },
    note: "Customer asked to cancel before payment was confirmed.",
  });
  assert.equal(cancelledOrder.lifecycleStatus, "CANCELLED");
  assert.equal(cancelled.store.inventorySnapshot()["JUW-001"].availability, "AVAILABLE");
  await rejectsCode(cancelled.service.transitionOrder(operator, first.reference, {
    expectedVersion: 1,
    transition: { dimension: "LIFECYCLE", target: "CANCELLED" },
  }), "INVALID_TRANSITION");
  await cancelled.service.createOrder(anotherCustomer, pickupIntent("checkout:after-cancel"));

  const expired = setup();
  const expiring = await expired.service.createOrder(customer, pickupIntent("checkout:expire-0001"));
  await rejectsCode(expired.service.transitionOrder(operator, expiring.reference, {
    expectedVersion: 0,
    transition: { dimension: "LIFECYCLE", target: "EXPIRED" },
  }), "INVALID_TRANSITION");
  expired.setNow("2026-08-12T13:00:00.000Z");
  const expiredOrder = await expired.service.transitionOrder(operator, expiring.reference, {
    expectedVersion: 0,
    transition: { dimension: "LIFECYCLE", target: "EXPIRED" },
  });
  assert.equal(expiredOrder.lifecycleStatus, "EXPIRED");
  assert.equal(expired.store.inventorySnapshot()["JUW-001"].availability, "AVAILABLE");
});

test("adapts the managed Neon customer identity without creating a second auth model", () => {
  const session = {
    id: "neon-auth-user-1",
    email: "CUSTOMER@EXAMPLE.COM",
    name: "Customer One",
  } as Parameters<typeof customerActorFromSession>[0];
  assert.deepEqual(customerActorFromSession(session), {
    kind: "CUSTOMER",
    subject: "neon-auth-user-1",
    email: "customer@example.com",
    displayName: "Customer One",
  });
});

test("connected Studio actors are pinned to managed Neon Auth", () => {
  const actorSource = readFileSync(
    join(import.meta.dirname, "../lib/shop/server-order/actors.ts"),
    "utf8",
  );
  assert.match(actorSource, /STUDIO_AI_ENGINE_AUTH_MODE !== "neon-auth"/);
  assert.match(actorSource, /requireStudioOperator/);
  assert.doesNotMatch(actorSource, /better-auth/i);
});

test("durable preview outbox deduplicates and drains with claim ownership", async () => {
  const { store, service } = setup();
  await Promise.all([
    service.createOrder(customer, pickupIntent()),
    service.createOrder(customer, pickupIntent()),
  ]);
  const claimed = await store.claimPreviewOutbox("preview-worker", 20, new Date("2026-08-11T12:01:00.000Z"));
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].attempts, 1);
  await store.markPreviewOutboxDelivered(claimed[0].id, "preview-worker", new Date("2026-08-11T12:02:00.000Z"));
  assert.deepEqual(await store.claimPreviewOutbox("preview-worker", 20, new Date("2026-08-11T12:03:00.000Z")), []);
  assert.deepEqual(store.outboxSnapshot(), [{
    dedupeKey: store.outboxSnapshot()[0].dedupeKey,
    status: "DELIVERED",
    attempts: 1,
  }]);
});

test("HTTP errors expose concrete 401 and 409 contracts without leaking internals", async () => {
  const unauthenticated = await shopRoute(async () => {
    throw new ShopOrderError("UNAUTHENTICATED", "Authentication is required.");
  });
  assert.equal(unauthenticated.status, 401);
  assert.deepEqual(await unauthenticated.json(), {
    ok: false,
    error: { code: "UNAUTHENTICATED", message: "Authentication is required." },
  });

  const conflict = await shopRoute(async () => {
    throw new ShopOrderError("VERSION_CONFLICT", "The order changed.");
  });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, "VERSION_CONFLICT");
});

test("migration and routes pin the executable Neon one-shot contract", () => {
  const root = join(import.meta.dirname, "..");
  const migration = readFileSync(join(root, "drizzle/shop-postgres/0007_material_cyclops.sql"), "utf8");
  const store = readFileSync(join(root, "lib/shop/server-order/postgres-store.ts"), "utf8");
  const blob = readFileSync(join(root, "lib/shop/server-order/payment-evidence.ts"), "utf8");
  for (const functionName of [
    "shop_create_order_v2",
    "shop_transition_order_v2",
    "shop_request_return_v2",
    "shop_transition_return_v2",
    "shop_authorize_payment_evidence_v2",
    "shop_receive_payment_evidence_v2",
    "shop_claim_outbox_v2",
    "shop_complete_outbox_v2",
  ]) {
    assert.match(migration, new RegExp(`CREATE FUNCTION "${functionName}"`));
  }
  for (const functionName of [
    "shop_create_order_v2",
    "shop_authorize_payment_evidence_v2",
    "shop_receive_payment_evidence_v2",
    "shop_claim_outbox_v2",
    "shop_complete_outbox_v2",
    "shop_create_assisted_order_v3",
    "shop_mutate_customer_order_v3",
    "shop_transition_order_v3",
    "shop_schedule_pickup_v3",
    "shop_transition_pre_handoff_recovery_v3",
    "shop_request_return_v3",
    "shop_transition_return_v3",
    "shop_order_document_v3",
  ]) assert.match(store, new RegExp(functionName));
  assert.match(store, /orders\.contact_email as email/);
  assert.doesNotMatch(store, /select email, display_name\s+from shop_customers/);
  assert.match(store, /'paidAmount', \$\{command\.details\.paidAmount\}::integer/);
  assert.match(store, /'target', \$\{target\}::text/);
  assert.match(migration, /CREATE FUNCTION "shop_resolve_return_inventory_v2"/);
  assert.match(migration, /FOR UPDATE OF catalogue, inventory/);
  assert.match(migration, /FOR UPDATE SKIP LOCKED/);
  assert.match(migration, /SHOP_IDEMPOTENCY_MISMATCH/);
  assert.match(migration, /shop_order_document_v2/);
  assert.match(migration, /shop_allowed_transitions_v2/);
  assert.match(migration, /shop_allowed_return_transitions_v2/);
  assert.match(migration, /FUNDS_CONFIRMATION/);
  assert.match(migration, /funds_transfer_reference/);
  assert.match(migration, /tracking_reference/);
  assert.match(migration, /refund_amount/);
  assert.match(migration, /fulfillment_status = 'NOT_STARTED'\s+AND order_record\.funds_confirmation_status = 'UNCONFIRMED'[\s\S]{0,180}'CANCELLED'/);
  assert.match(migration, /SHOP_INVALID_TRANSITION: evidence review has already advanced/);
  assert.match(migration, /p_return_eligible_until <= \(p_details->>'deliveredAt'\)::timestamptz/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "studio_operator_membership"/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS "studio_operator_membership_email_unique"[^;]+lower\("email"\)/);
  assert.doesNotMatch(migration, /INSERT INTO "?studio_operator_membership"?/i);
  assert.doesNotMatch(migration, /interval '7 days'/i);
  assert.match(blob, /putShopBlob\("private"/);
  assert.match(blob, /x-content-sha256/);
  assert.doesNotMatch(blob, /putShopBlob\("public"/);
  assert.match(readFileSync(join(root, "drizzle/shop-postgres/meta/_journal.json"), "utf8"), /0007_material_cyclops/);
  const snapshot = readFileSync(join(root, "drizzle/shop-postgres/meta/0007_snapshot.json"), "utf8");
  assert.ok(snapshot.length > 1_000);
  assert.match(snapshot, /shop_order_returns/);
});
