import assert from "node:assert/strict";
import test from "node:test";
import { shopProducts } from "../lib/shop/catalog";
import type {
  ShopCheckoutRequest,
  ShopCheckoutSubmissionIntent,
  ShopSubmittedOrder,
} from "../lib/shop/domain/entities";
import {
  createEmptyCommerceSnapshot,
  createInitialCommerceState,
} from "../lib/shop/domain/state";
import { commerceReducer } from "../lib/shop/machines/commerce-machine";
import { createCommerceService } from "../lib/shop/services/commerce-service";
import type { AuthenticatedCheckoutCommandPort } from "../lib/shop/services/contracts";

const product = shopProducts[0];
const request: ShopCheckoutRequest = {
  contact: {
    name: "Lulu Dyrane",
    email: "lulu@example.com",
    phone: "+234 800 000 0000",
  },
  fulfillment: {
    kind: "PICKUP",
    optionId: "pickup",
  },
};

function createService(checkoutCommand?: AuthenticatedCheckoutCommandPort) {
  const products = [product];
  return createCommerceService({
    repository: {
      read: async () => createEmptyCommerceSnapshot(),
      write: async () => undefined,
      subscribe: () => () => undefined,
    },
    catalog: {
      hydrate: async () => products,
      list: () => products,
      getProduct: (slug) => products.find((candidate) => candidate.slug === slug),
      subscribe: () => () => undefined,
    },
    checkoutCommand,
    now: () => new Date("2026-08-10T12:00:00.000Z"),
    createReference: () => "JUW-20260810-LOCAL1",
  });
}

function createLocalOrder(service = createService()) {
  const result = service.createCheckout({
    ...createEmptyCommerceSnapshot(),
    bag: [{ slug: product.slug, size: product.taggedSize }],
  }, request);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Expected a local checkout.");
  return result.order;
}

test("keeps the mounted checkout local when no authenticated command capability exists", async () => {
  const service = createService();
  const localOrder = createLocalOrder(service);

  assert.equal(localOrder.transmission, "LOCAL_ONLY");
  assert.equal(localOrder.status, "PAYMENT_REQUIRED");
  assert.deepEqual(await service.submitCheckout(localOrder), {
    ok: false,
    reason: "UNAVAILABLE",
  });
});

test("never calls an unauthenticated checkout command port", async () => {
  let calls = 0;
  const service = createService({
    isAuthenticated: () => false,
    async submit() {
      calls += 1;
      return { ok: false, reason: "REJECTED" };
    },
  });

  assert.deepEqual(await service.submitCheckout(createLocalOrder(service)), {
    ok: false,
    reason: "UNAUTHENTICATED",
  });
  assert.equal(calls, 0);
});

test("submits only intent and deduplicates concurrent authenticated commands", async () => {
  let calls = 0;
  let captured: ShopCheckoutSubmissionIntent | undefined;
  const localOrder = createLocalOrder();
  const authoritative: ShopSubmittedOrder = {
    ...localOrder,
    id: "JUW-SERVER-0001",
    status: "ORDER_RECEIVED",
    transmission: "SUBMITTED",
  };
  const checkoutCommand: AuthenticatedCheckoutCommandPort = {
    isAuthenticated: () => true,
    async submit(intent) {
      calls += 1;
      captured = intent;
      await Promise.resolve();
      return { ok: true, order: authoritative };
    },
  };
  const service = createService(checkoutCommand);

  const [first, second] = await Promise.all([
    service.submitCheckout(localOrder),
    service.submitCheckout(localOrder),
  ]);

  assert.equal(calls, 1);
  assert.deepEqual(first, { ok: true, order: authoritative });
  assert.deepEqual(second, first);
  assert.ok(captured);
  assert.deepEqual(captured, {
    version: 1,
    idempotencyKey: `checkout:${localOrder.id}`,
    lines: [{ slug: product.slug, taggedSize: product.taggedSize, quantity: 1 }],
    contact: localOrder.contact,
    fulfillment: localOrder.fulfillment,
  });

  const serialized = JSON.stringify(captured);
  assert.doesNotMatch(
    serialized,
    /unitPrice|subtotal|deliveryFee|total|status|transmission|customerId|authSubject|private|studio/iu,
  );
  assert.doesNotMatch(serialized, /JUW-013|DYN-093|teal-draped-mini-set/iu);
});

test("only replaces a matching local checkout with an authoritative submitted order", () => {
  const localOrder = createLocalOrder();
  const state = {
    ...createInitialCommerceState([product]),
    orders: [localOrder],
  };
  const submitted: ShopSubmittedOrder = {
    ...localOrder,
    id: "JUW-SERVER-0002",
    status: "ORDER_RECEIVED",
    transmission: "SUBMITTED",
  };

  const next = commerceReducer(state, {
    type: "CHECKOUT_SUBMISSION_SUCCEEDED",
    localOrderId: localOrder.id,
    order: submitted,
  });
  assert.deepEqual(next.orders, [submitted]);
  assert.equal(next.persistenceRevision, state.persistenceRevision + 1);

  const mismatched: ShopSubmittedOrder = {
    ...submitted,
    lines: [{
      snapshot: "PRODUCT",
      slug: "another-piece",
      sku: "JUW-999",
      name: "Another piece",
      taggedSize: "M",
      unitPrice: 1,
      quantity: 1,
    }],
  };
  assert.equal(commerceReducer(state, {
    type: "CHECKOUT_SUBMISSION_SUCCEEDED",
    localOrderId: localOrder.id,
    order: mismatched,
  }), state);

  const forgedLocal = {
    ...submitted,
    transmission: "LOCAL_ONLY",
  } as unknown as ShopSubmittedOrder;
  assert.equal(commerceReducer(state, {
    type: "CHECKOUT_SUBMISSION_SUCCEEDED",
    localOrderId: localOrder.id,
    order: forgedLocal,
  }), state);
});
