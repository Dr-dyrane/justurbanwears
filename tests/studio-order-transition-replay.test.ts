import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MemoryShopOrderStore } from "../lib/shop/server-order/memory-store";
import { ShopOrderService } from "../lib/shop/server-order/service";
import {
  ShopOrderError,
  type ShopCustomerActor,
  type ShopOperatorActor,
} from "../lib/shop/server-order/types";

const customer: ShopCustomerActor = {
  kind: "CUSTOMER",
  subject: "auth:receipt-customer",
  email: "receipt-customer@example.com",
};
const operator: ShopOperatorActor = {
  kind: "OPERATOR",
  subject: "auth:receipt-admin",
  displayName: "Receipt Admin",
  role: "admin",
  workspaceId: "juw-studio",
  workspaceSubject: "workspace:juw-studio",
};
const secondOperator: ShopOperatorActor = {
  ...operator,
  subject: "auth:second-admin",
  displayName: "Second Admin",
};
const catalogue = [{
  sku: "JUW-RECEIPT-001",
  slug: "receipt-test-piece",
  name: "Receipt Test Piece",
  taggedSize: "M",
  price: 32_000,
}] as const;

async function orderReadyForReview() {
  const now = new Date("2026-09-03T12:00:00.000Z");
  const store = new MemoryShopOrderStore(catalogue, () => now);
  const service = new ShopOrderService(store, { now: () => now });
  let order = await service.createOrder(customer, {
    version: 1,
    idempotencyKey: "checkout:receipt-test",
    lines: [{ slug: "receipt-test-piece", taggedSize: "M", quantity: 1 }],
    contact: {
      name: "Receipt Customer",
      email: "receipt-customer@example.com",
      phone: "+234 800 000 0000",
    },
    fulfillment: { kind: "PICKUP", optionId: "pickup" },
  });
  const bytes = new TextEncoder().encode("receipt evidence");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const authorization = await service.authorizePaymentEvidence(customer, order.reference, {
    idempotencyKey: "evidence:receipt-test",
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
  return { order, service };
}

test("operator transitions replay one exact receipt without another write", async () => {
  const { order, service } = await orderReadyForReview();
  const body = {
    expectedVersion: order.version,
    idempotencyKey: "studio-order:receipt-replay",
    transition: { dimension: "PAYMENT_REVIEW", target: "UNDER_REVIEW" } as const,
  };
  const first = await service.transitionOrderWithReceipt(operator, order.reference, body);
  const second = await service.transitionOrderWithReceipt(operator, order.reference, body);

  assert.equal(first.receipt.receiptId, second.receipt.receiptId);
  assert.equal(first.receipt.resultingVersion, order.version + 1);
  assert.equal(second.order.version, first.order.version);
  assert.equal(
    second.order.events.filter((event) => event.metadata?.studioCommandIdempotencyKey === body.idempotencyKey).length,
    1,
  );
});

test("reused key with different payload fails and two admins cannot both win a stale revision", async () => {
  const firstSetup = await orderReadyForReview();
  const body = {
    expectedVersion: firstSetup.order.version,
    idempotencyKey: "studio-order:receipt-mismatch",
    transition: { dimension: "PAYMENT_REVIEW", target: "UNDER_REVIEW" } as const,
  };
  await firstSetup.service.transitionOrderWithReceipt(operator, firstSetup.order.reference, body);
  await assert.rejects(
    firstSetup.service.transitionOrderWithReceipt(operator, firstSetup.order.reference, { ...body, note: "Different payload" }),
    (error: unknown) => error instanceof ShopOrderError && error.code === "IDEMPOTENCY_MISMATCH",
  );

  const secondSetup = await orderReadyForReview();
  const outcomes = await Promise.allSettled([
    secondSetup.service.transitionOrderWithReceipt(operator, secondSetup.order.reference, {
      ...body,
      expectedVersion: secondSetup.order.version,
      idempotencyKey: "studio-order:first-admin",
    }),
    secondSetup.service.transitionOrderWithReceipt(secondOperator, secondSetup.order.reference, {
      ...body,
      expectedVersion: secondSetup.order.version,
      idempotencyKey: "studio-order:second-admin",
    }),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  const rejected = outcomes.find((outcome) => outcome.status === "rejected");
  assert.ok(rejected?.status === "rejected");
  assert.ok(rejected.reason instanceof ShopOrderError);
  assert.equal(rejected.reason.code, "VERSION_CONFLICT");
});

test("routes, SQL wrappers, and client expose exact receipt reconciliation", () => {
  const orderRoute = readFileSync("app/api/studio/orders/[reference]/transitions/route.ts", "utf8");
  const returnRoute = readFileSync("app/api/studio/orders/[reference]/returns/transitions/route.ts", "utf8");
  const migration = readFileSync("drizzle/shop-postgres/0026_order_transition_replay_receipts.sql", "utf8");
  const client = readFileSync("components/studio/connected-order-detail.tsx", "utf8");

  for (const route of [orderRoute, returnRoute]) {
    assert.match(route, /export async function GET/);
    assert.match(route, /getOperatorTransitionResult/);
    assert.match(route, /transition(?:Order|Return)WithReceipt/);
  }
  assert.match(migration, /shop_transition_order_command_v4/);
  assert.match(migration, /shop_transition_return_command_v4/);
  assert.match(migration, /SHOP_IDEMPOTENCY_MISMATCH/);
  assert.match(client, /getOrCreateSessionCommandKey/);
  assert.match(client, /receiptMatches/);
  assert.doesNotMatch(client, /reconciled\.version > order\.version/);
});
