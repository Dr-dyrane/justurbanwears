import assert from "node:assert/strict";
import test from "node:test";
import { shopProducts } from "../lib/shop/catalog";
import {
  migrateStoredShopStateV2,
  parseStoredShopState,
} from "../lib/shop/db/browser-local-repository";
import type {
  ShopCheckoutRequest,
  ShopProduct,
} from "../lib/shop/domain/entities";
import {
  createEmptyCommerceSnapshot,
  createInitialCommerceState,
} from "../lib/shop/domain/state";
import { commerceReducer } from "../lib/shop/machines/commerce-machine";
import { resolveOrderLineMedia } from "../lib/shop/commerce";
import { createCommerceService } from "../lib/shop/services/commerce-service";

const product = shopProducts[0];

function createService(products: ShopProduct[] = [product]) {
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
    now: () => new Date("2026-08-10T12:00:00.000Z"),
    createReference: () => "JUW-20260810-CHECK1",
  });
}

function snapshot(slugs: string[] = [product.slug]) {
  return {
    ...createEmptyCommerceSnapshot(),
    bag: slugs.map((slug) => ({
      slug,
      size: slug === product.slug ? product.taggedSize : "Unknown",
    })),
  };
}

const contact = {
  name: "  Lulu   Dyrane ",
  email: " LULU@example.com ",
  phone: " +234 800 000 0000 ",
};

const deliveryRequest: ShopCheckoutRequest = {
  contact,
  fulfillment: {
    kind: "DELIVERY",
    optionId: "lagos",
    address: {
      street: " 12 Coral Road ",
      area: " Victoria Island ",
      state: " Lagos ",
      country: "Nigeria",
    },
  },
};

test("creates a truthful local checkout with immutable product and fulfillment snapshots", () => {
  const result = createService().createCheckout(snapshot(), deliveryRequest);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.order.status, "PAYMENT_REQUIRED");
  assert.equal(result.order.transmission, "LOCAL_ONLY");
  assert.deepEqual(result.order.contact, {
    name: "Lulu Dyrane",
    email: "lulu@example.com",
    phone: "+234 800 000 0000",
  });
  assert.deepEqual(result.order.fulfillment, {
    kind: "DELIVERY",
    optionId: "lagos",
    address: {
      street: "12 Coral Road",
      area: "Victoria Island",
      state: "Lagos",
      country: "Nigeria",
    },
  });
  assert.deepEqual(result.order.lines[0], {
    snapshot: "PRODUCT",
    slug: product.slug,
    sku: product.sku,
    name: product.name,
    taggedSize: product.taggedSize,
    unitPrice: product.price,
    quantity: 1,
    imageSrc: product.media?.[0]?.src,
    imageAlt: product.media?.[0]?.alt,
  });
});

test("keeps checkout snapshot media stable when the live wardrobe image changes", () => {
  const result = createService().createCheckout(snapshot(), deliveryRequest);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const line = result.order.lines[0];
  const changedProduct = {
    ...product,
    media: (product.media ?? []).map((frame, index) => index === 0
      ? { ...frame, src: "/shop/products/changed/current-frame.webp" }
      : frame),
  };
  const media = resolveOrderLineMedia(line, changedProduct);
  assert.equal(media.kind, "SNAPSHOT");
  if (media.kind === "SNAPSHOT" && line.snapshot === "PRODUCT") {
    assert.equal(media.src, line.imageSrc);
    assert.notEqual(media.src, changedProduct.media[0]?.src);
  }
});

test("pickup needs no delivery address while a delivery address remains required", () => {
  const service = createService();
  const pickup = service.createCheckout(snapshot(), {
    contact,
    fulfillment: { kind: "PICKUP", optionId: "pickup" },
  });
  assert.equal(pickup.ok, true);

  const invalidDelivery = service.createCheckout(snapshot(), {
    fulfillment: {
      kind: "DELIVERY",
      optionId: "lagos",
      address: {
        street: "  ",
        area: "Victoria Island",
        state: "Lagos",
        country: "Nigeria",
      },
    },
    contact,
  });
  assert.deepEqual(invalidDelivery, { ok: false, reason: "INVALID_CHECKOUT" });
});

test("rejects the whole checkout when any bag line is missing or changed", () => {
  const result = createService().createCheckout(
    snapshot([product.slug, "missing-piece"]),
    deliveryRequest,
  );
  assert.deepEqual(result, { ok: false, reason: "BAG_CHANGED" });
});

test("migrates v2 orders into explicit legacy payment-required records", () => {
  const migrated = migrateStoredShopStateV2(JSON.stringify({
    version: 2,
    data: {
      ...createEmptyCommerceSnapshot(),
      orders: [{
        id: "JUW-20260809-LEGACY",
        itemSlugs: [product.slug],
        subtotal: product.price,
        deliveryFee: 0,
        total: product.price,
        deliveryLabel: "Studio pickup",
        deliveryEstimate: "Next working day",
        placedAt: "2026-08-09T10:00:00.000Z",
        status: "ORDER_RECEIVED",
      }],
    },
  }));
  assert.equal(migrated?.orders[0]?.status, "PAYMENT_REQUIRED");
  assert.equal(migrated?.orders[0]?.transmission, "LOCAL_ONLY");
  assert.deepEqual(migrated?.orders[0]?.lines, [{
    snapshot: "LEGACY",
    slug: product.slug,
    quantity: 1,
  }]);
  assert.equal(migrated?.orders[0]?.contact, null);
});

test("drops a tampered v3 checkout whose totals no longer reconcile", () => {
  const result = createService().createCheckout(snapshot(), deliveryRequest);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const parsed = parseStoredShopState(JSON.stringify({
    version: 3,
    data: {
      ...createEmptyCommerceSnapshot(),
      orders: [{ ...result.order, total: result.order.total + 1 }],
    },
  }));
  assert.deepEqual(parsed?.orders, []);
});

test("migrates legacy SKU snapshots in saved local orders", () => {
  const result = createService().createCheckout(snapshot(), deliveryRequest);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const legacyOrder = {
    ...result.order,
    lines: result.order.lines.map((line) => ({ ...line, sku: "DYN-081" })),
  };
  const parsed = parseStoredShopState(JSON.stringify({
    version: 3,
    data: { ...createEmptyCommerceSnapshot(), orders: [legacyOrder] },
  }));

  const line = parsed?.orders[0]?.lines[0];
  assert.equal(line?.snapshot, "PRODUCT");
  if (!line || line.snapshot !== "PRODUCT") return;
  assert.equal(line.sku, "JUW-001");
  assert.doesNotMatch(JSON.stringify(parsed), /DYN-081/);
});

test("rejects forged submitted statuses and mixed legacy/product lines from browser storage", () => {
  const result = createService().createCheckout(snapshot(), deliveryRequest);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const envelope = (order: unknown) => JSON.stringify({
    version: 3,
    data: { ...createEmptyCommerceSnapshot(), orders: [order] },
  });

  const forged = parseStoredShopState(envelope({
    ...result.order,
    status: "DELIVERED",
    transmission: "SUBMITTED",
  }));
  assert.deepEqual(forged?.orders, []);

  const mixed = parseStoredShopState(envelope({
    ...result.order,
    lines: [
      ...result.order.lines,
      { snapshot: "LEGACY", slug: "archived-piece", quantity: 1 },
    ],
  }));
  assert.deepEqual(mixed?.orders, []);
});

test("keeps the in-memory checkout history at the same 25-record storage boundary", () => {
  const result = createService().createCheckout(snapshot(), deliveryRequest);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const existing = Array.from({ length: 25 }, (_, index) => ({
    ...result.order,
    id: `JUW-20260809-${String(index).padStart(2, "0")}`,
  }));
  const current = {
    ...createInitialCommerceState([product]),
    bag: [{ slug: product.slug, size: product.taggedSize }],
    cart: "ready" as const,
    checkout: "saving" as const,
    orders: existing,
  };
  const next = commerceReducer(current, {
    type: "CHECKOUT_SAVE_SUCCEEDED",
    order: result.order,
  });
  assert.equal(next.orders.length, 25);
  assert.equal(next.orders[0].id, result.order.id);
  assert.equal(next.orders.some((order) => order.id === existing[24].id), false);
  assert.deepEqual(next.bag, []);
});
