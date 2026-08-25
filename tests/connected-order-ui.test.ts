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
  assert.match(checkout, /Your piece is reserved when you place the order/);
  assert.doesNotMatch(checkout, /saveCheckout|Continue on WhatsApp|createWhatsAppOrderUrl/);
});

test("customer list, receipt, tracking, evidence, and return surfaces use shared server truth", () => {
  const listPage = source("app/shop/orders/page.tsx");
  const detailPage = source("app/shop/orders/[id]/page.tsx");
  const list = source("components/shop/shop-orders.tsx");
  const detail = source("components/shop/order-status.tsx");
  const evidence = source("components/shop/payment-evidence-upload.tsx");
  const returns = source("components/shop/return-request.tsx");

  assert.match(listPage, /getShopCustomerSession/);
  assert.match(listPage, /listCustomerOrders/);
  assert.match(listPage, /<ShopOrders[^>]*initialOrders=\{orders\}/);
  assert.match(detailPage, /getCustomerOrder/);
  assert.match(detailPage, /initialOrder=\{initialOrder\}/);
  assert.match(detailPage, /initialState=\{initialState\}/);
  assert.match(detailPage, /error instanceof ShopOrderError && error\.code === "NOT_FOUND"/);
  assert.match(list, /initialOrders: readonly ShopServerOrder\[\]/);
  assert.doesNotMatch(list, /Opening your orders|useEffect/);
  assert.match(list, /submitSearch[\s\S]*void load\(1, false\)/);
  assert.match(list, /Load more/);
  assert.doesNotMatch(list, /orders \} = useShop|Saved checkouts/);
  assert.match(detail, /initialOrder: ShopServerOrder \| null/);
  assert.doesNotMatch(detail, /Opening your order/);
  assert.match(detail, /Showing the last confirmed order state/);
  assert.match(detail, /response\.status === 404[\s\S]*setOrder\(null\)/);
  assert.match(detail, /Payment confirmed\./);
  assert.match(detail, /Tracking reference/);
  assert.match(detail, /Studio pickup/);
  assert.match(detail, /Collected\./);
  assert.match(detail, /<ReturnRequest[\s\S]*?order=\{order\}/);
  assert.match(evidence, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(evidence, /Selected: \{selectedFile\.name\}/);
  assert.match(evidence, /Receipt sent\. Lulu will check it and confirm your payment/);
  assert.match(returns, /<ShopSheet/);
  assert.match(returns, /useHistoryBackedDialog/);
  assert.match(returns, /useSheetDismissGesture/);
  assert.match(returns, /useDocumentScrollLock/);
  assert.match(returns, /aria-modal="true"/);
  assert.match(returns, /if \(pendingRef\.current\) return false/);
  assert.match(returns, /focusResultRef\.current = true/);
  assert.match(returns, /resultRef\.current\?\.focus/);
  assert.match(returns, /shop-return-reasons/);
  assert.match(returns, /type="radio"/);
  assert.doesNotMatch(returns, /<select|<option/);
  assert.match(returns, /orderStateLabel\(order\.return\.status\)/);
  assert.match(returns, /reasonLabel/);
  assert.match(returns, /refundAmount/);
  assert.match(returns, /Choose the pieces to return/);
  assert.match(returns, /correctingRejectedReturn/);
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
  assert.match(detail, /Exact refund amount \(NGN\)/);
  assert.match(detail, /Selected pieces cap/);
  assert.match(detail, /RETURN_RESOLUTION/);
  assert.match(detail, /onVersionConflict/);
  assert.match(detail, /Prepare for collection/);
  assert.match(route, /requireOperatorActor/);
  assert.match(route, /getShopBlob\("private", evidence\.blobPathname/);
  assert.doesNotMatch(route, /blobUrl|downloadUrl/);
});

test("route shells and account expose authoritative orders without relabelling local drafts", () => {
  const shopShell = source("components/shop/shop-shell.tsx");
  const shopMobileAction = source("components/shop/shop-mobile-action-context.tsx");
  const studioShell = source("components/studio/app-shell.tsx");
  const studioServices = source("lib/studio/service-registry.ts");
  const account = source("components/shop/shop-account.tsx");
  const ordersPage = source("app/shop/orders/page.tsx");
  const orderPage = source("app/shop/orders/[id]/page.tsx");

  assert.match(shopShell, /href: "\/shop\/orders", label: "Orders"/);
  assert.match(shopShell, /useRegisteredShopMobileAction/);
  assert.match(shopShell, /registeredMobileAction \?\? routeAction/);
  assert.match(shopShell, /ShopMobileActionProvider/);
  assert.match(shopMobileAction, /useShopMobileAction/);
  assert.match(ordersPage, /title: "Your orders"/);
  assert.match(orderPage, /title: "Order status"/);
  assert.doesNotMatch(`${ordersPage}\n${orderPage}`, /Checkout drafts|checkout draft/i);
  assert.match(studioShell, /studioStackFallback/);
  assert.match(studioServices, /key: "orders",[\s\S]*?href: "\/studio\/orders"/);
  assert.match(account, /Your orders/);
  assert.match(account, /Sign in to open your orders/);
  assert.doesNotMatch(account, /orders\.length|Checkout drafts/);
});

test("commerce surfaces use customer language and expose the exact next Studio action", () => {
  const inbox = source("components/studio/connected-order-inbox.tsx");
  const detail = source("components/studio/connected-order-detail.tsx");
  const mobileAction = source("components/studio/mobile-action-context.tsx");
  const presentation = source("lib/shop/order-presentation.ts");
  const customerStatus = source("components/shop/order-status.tsx");
  const customerUpload = source("components/shop/payment-evidence-upload.tsx");
  const visibleCommerce = [inbox, detail, customerStatus, customerUpload].join("\n");

  assert.match(inbox, /aria-label="Next Orders action"/);
  assert.match(inbox, /state === "error" \? "Orders —"/);
  assert.match(inbox, /studio-piece-next/);
  assert.doesNotMatch(inbox, /useStudioMobileAction/);
  assert.match(inbox, /#studio-order-next-action/);
  assert.ok(inbox.indexOf("studio-piece-next") < inbox.indexOf("studio-connected-order-list"));
  assert.ok(inbox.indexOf("studio-connected-order-list") < inbox.indexOf('title="Customer order"'));
  assert.match(inbox, /<StudioTaskSheet[\s\S]*?onSubmit=\{createAssistedOrder\}[\s\S]*?title="Customer order"/);
  assert.match(inbox, /<details className="studio-stack-filter">[\s\S]*?<summary>Find orders/);
  assert.match(detail, /id=\{isNextAction \? "studio-order-next-action"/);
  assert.match(detail, /open=\{isNextAction \|\| undefined\}/);
  assert.match(mobileAction, /StudioMobileActionProvider/);
  assert.match(presentation, /studioOrderNextActionLabel/);
  assert.match(presentation, /"Check receipt"/);
  assert.match(presentation, /"Review receipt"/);
  assert.match(presentation, /"Review return"/);
  assert.match(presentation, /FULFILLMENT_QUALITY_CHECK[\s\S]*The piece was checked/);
  assert.match(presentation, /FULFILLMENT_READY_FOR_HANDOFF[\s\S]*Ready for pickup/);
  assert.match(presentation, /PAYMENT_EVIDENCE_RECEIVED[\s\S]*Receipt sent\. Lulu will check it/);
  assert.match(presentation, /PAYMENT_UNDER_REVIEW[\s\S]*Lulu is checking the receipt/);
  assert.match(presentation, /PAYMENT_REVIEW_APPROVED[\s\S]*Receipt checked/);
  assert.match(presentation, /REFUND_COMPLETED[\s\S]*Refund sent/);
  assert.match(presentation, /fulfillmentStatus === "DELIVERED"[\s\S]*"Collected"/);
  assert.match(customerStatus, /Receipt checked\. Payment confirmed\./);
  assert.match(detail, /orderEventLabel\(event, order\.fulfillment\.kind\)/);
  assert.match(customerStatus, /orderEventLabel\(event, order\.fulfillment\.kind\)/);
  assert.doesNotMatch(visibleCommerce, /Connected orders|settled funds|Evidence review|payment evidence|Fulfilment|Neon is authoritative|server-backed|server accepts|Inspect the artifact|Immutable record/);
});
