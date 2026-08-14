import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { authSignInPath } from "../lib/auth/return-to";
import { shopProducts } from "../lib/shop/catalog";
import {
  createConnectedCheckoutIntent,
  mapConnectedOrderFailure,
  retainUncommittedBagLines,
} from "../lib/shop/connected-order-client";
import { createInitialCommerceState } from "../lib/shop/domain/state";
import { commerceReducer } from "../lib/shop/machines/commerce-machine";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFileSync(new URL(path, root), "utf8");

test("keeps bag lines until the authoritative response commits exact slugs", () => {
  const first = shopProducts[0];
  const second = shopProducts[1];
  const bag = [
    { slug: first.slug, size: first.taggedSize },
    { slug: second.slug, size: second.taggedSize },
  ];
  const state = { ...createInitialCommerceState([first, second]), bag, cart: "ready" as const };

  assert.deepEqual(retainUncommittedBagLines(bag, []), bag);
  const committed = commerceReducer(state, {
    type: "CONNECTED_ORDER_COMMITTED",
    committedSlugs: [first.slug],
  });
  assert.deepEqual(committed.bag, [{ slug: second.slug, size: second.taggedSize }]);
  assert.equal(committed.orders.length, 0, "server orders must not become device-local order truth");
});

test("checkout intent accepts runtime catalogue rows without trusting browser prices", () => {
  const dynamicProduct = {
    ...shopProducts[0],
    slug: "studio-published-runtime-piece",
    sku: "JUW-DYNAMIC-01",
    name: "Studio Published Runtime Piece",
    price: 87_500,
  };
  const intent = createConnectedCheckoutIntent(
    [{ slug: dynamicProduct.slug, size: dynamicProduct.taggedSize }],
    [dynamicProduct],
    {
      contact: { name: "Test Customer", email: "customer@example.com", phone: "+2348000000000" },
      fulfillment: { kind: "PICKUP", optionId: "pickup" },
    },
    "checkout:11111111-1111-4111-8111-111111111111",
  );
  assert.ok(intent);
  assert.equal(intent.lines[0]?.slug, dynamicProduct.slug);
  assert.doesNotMatch(JSON.stringify(intent), /87500|subtotal|total|price|status|customerId|blob/iu);
});

test("managed-auth return paths preserve the exact nested destination", () => {
  assert.equal(
    authSignInPath("/shop/checkout?resume=1"),
    "/auth/sign-in?returnTo=%2Fshop%2Fcheckout%3Fresume%3D1",
  );
  assert.equal(
    authSignInPath("/shop/orders/JUW-20260814-ABCDEF"),
    "/auth/sign-in?returnTo=%2Fshop%2Forders%2FJUW-20260814-ABCDEF",
  );
  assert.equal(mapConnectedOrderFailure(401, "UNAUTHENTICATED").kind, "AUTH_REQUIRED");
  assert.equal(mapConnectedOrderFailure(409, "VERSION_CONFLICT").kind, "VERSION_CONFLICT");
  const proxy = source("proxy.ts");
  const studioLayout = source("app/(studio)/layout.tsx");
  assert.match(proxy, /request\.nextUrl\.pathname/);
  assert.match(proxy, /request\.nextUrl\.search/);
  assert.match(proxy, /matcher: \["\/studio\/:path\*"\]/);
  assert.match(studioLayout, /authSignInPath\(returnTo\)/);
});

test("checkout preserves a recovery draft and clears the bag only after server acceptance", () => {
  const checkout = source("components/shop/shop-checkout.tsx");
  const post = checkout.indexOf('fetch("/api/shop/orders"');
  const commit = checkout.indexOf("await commitConnectedOrder(committedSlugs)");
  assert.ok(post >= 0 && commit > post);
  assert.match(checkout, /sessionStorage\.setItem\(DRAFT_STORAGE_KEY/);
  assert.match(checkout, /authSignInPath\("\/shop\/checkout\?resume=1"\)/);
  assert.match(checkout, /Adding a piece does not reserve it/);
  assert.doesNotMatch(checkout, /saveCheckout|Continue on WhatsApp|createWhatsAppOrderUrl/);
});

test("customer list, receipt, tracking, evidence, and return surfaces use shared server truth", () => {
  const list = source("components/shop/shop-orders.tsx");
  const detail = source("components/shop/order-status.tsx");
  const evidence = source("components/shop/payment-evidence-upload.tsx");
  const returns = source("components/shop/return-request.tsx");

  assert.match(list, /fetch\("\/api\/shop\/orders"/);
  assert.doesNotMatch(list, /orders \} = useShop|Saved checkouts/);
  assert.match(detail, /Payment confirmed\./);
  assert.match(detail, /Tracking reference/);
  assert.match(detail, /Studio pickup/);
  assert.match(detail, /Collected\./);
  assert.match(detail, /<ReturnRequest order=\{order\}/);
  assert.match(evidence, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(evidence, /Selected: \{selectedFile\.name\}/);
  assert.match(evidence, /This does not prove bank payment/);
  assert.match(returns, /role="dialog"/);
  assert.match(returns, /refundAmount/);
  assert.match(returns, /one return request/);
});

test("Studio posts structured facts, role-gates finance UX, and covers return resolution", () => {
  const detail = source("components/studio/connected-order-detail.tsx");
  const route = source("app/api/studio/orders/[reference]/payment-evidence/[evidenceId]/route.ts");

  assert.match(detail, /expectedVersion: order\.version/);
  assert.match(detail, /kind: "FUNDS_CONFIRMATION"/);
  assert.match(detail, /kind: "DELIVERY_DISPATCH"/);
  assert.match(detail, /kind: "DELIVERY_COMPLETE"/);
  assert.match(detail, /kind: "PICKUP_COMPLETE"/);
  assert.match(detail, /refundAmount: transition\.dimension/);
  assert.match(detail, /refundCurrency: transition\.dimension/);
  assert.match(detail, /operatorRole !== "admin"/);
  assert.match(detail, /Delivery-fee policy is not assumed/);
  assert.match(detail, /RETURN_RESOLUTION/);
  assert.match(detail, /onVersionConflict/);
  assert.match(detail, /Pickup is recorded as collected, never in transit/);
  assert.match(route, /requireOperatorActor/);
  assert.match(route, /getShopBlob\("private", evidence\.blobPathname/);
  assert.doesNotMatch(route, /blobUrl|downloadUrl/);
});

test("route shells and account expose authoritative orders without relabelling local drafts", () => {
  const shopShell = source("components/shop/shop-shell.tsx");
  const studioShell = source("components/studio/app-shell.tsx");
  const account = source("components/shop/shop-account.tsx");

  assert.match(shopShell, /href: "\/shop\/orders", label: "Orders"/);
  assert.match(studioShell, /href: "\/studio\/orders", label: "Connected orders"/);
  assert.match(account, /Your orders/);
  assert.match(account, /server-backed orders/);
  assert.doesNotMatch(account, /orders\.length|Checkout drafts/);
});
