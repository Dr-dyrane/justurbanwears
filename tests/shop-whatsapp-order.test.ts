import assert from "node:assert/strict";
import test from "node:test";
import {
  createWhatsAppOrderMessage,
  createWhatsAppOrderUrl,
  normalizeWhatsAppOrderNumber,
  type WhatsAppOrderSummary,
} from "../lib/shop/whatsapp-order.ts";

const summary: WhatsAppOrderSummary = {
  reference: "JUW-20260810-WA0001",
  contact: {
    name: " Ada  Okafor ",
    email: "ada@example.com",
    phone: "+234 801 234 5678",
  },
  fulfillment: {
    kind: "DELIVERY",
    label: "Lagos delivery",
    estimate: "1–3 working days",
    address: {
      street: "12 Coral Road",
      area: "Victoria Island",
      state: "Lagos",
      country: "Nigeria",
    },
  },
  lines: [{
    name: "Blush Scoop Mini Dress",
    sku: "JUW-DR-001",
    taggedSize: "UK 10",
    unitPrice: 48000,
    quantity: 1,
  }],
  subtotal: 48000,
  deliveryFee: 5000,
  total: 53000,
};

test("normalizes an international WhatsApp order number", () => {
  assert.equal(normalizeWhatsAppOrderNumber("+234 801-234-5678"), "2348012345678");
  assert.equal(normalizeWhatsAppOrderNumber(""), null);
  assert.equal(normalizeWhatsAppOrderNumber("08012345678"), null);
  assert.equal(normalizeWhatsAppOrderNumber("2348012345678 ext 9"), null);
});

test("builds a detailed shopper-reviewed WhatsApp order message", () => {
  const message = createWhatsAppOrderMessage(summary);
  assert.match(message, /Order reference: JUW-20260810-WA0001/);
  assert.match(message, /Blush Scoop Mini Dress \(JUW-DR-001\), size UK 10/);
  assert.match(message, /Total: ₦53,000/);
  assert.match(message, /Address: 12 Coral Road, Victoria Island, Lagos, Nigeria/);
  assert.match(message, /Name: Ada Okafor/);
});

test("creates a wa.me URL only when a valid number is configured", () => {
  const url = createWhatsAppOrderUrl("+234 801 234 5678", summary);
  assert.ok(url);
  const parsed = new URL(url);
  assert.equal(parsed.origin, "https://wa.me");
  assert.equal(parsed.pathname, "/2348012345678");
  assert.equal(parsed.searchParams.get("text"), createWhatsAppOrderMessage(summary));
  assert.equal(createWhatsAppOrderUrl(undefined, summary), null);
});

test("describes studio pickup without inventing a delivery address", () => {
  const message = createWhatsAppOrderMessage({
    ...summary,
    fulfillment: {
      kind: "PICKUP",
      label: "Studio pickup",
      estimate: "Collection by appointment",
    },
    deliveryFee: 0,
    total: summary.subtotal,
  });
  assert.match(message, /Handoff: Studio pickup/);
  assert.match(message, /Estimate: Collection by appointment/);
  assert.doesNotMatch(message, /Address:/);
  assert.match(message, /Delivery fee: ₦0/);
});
