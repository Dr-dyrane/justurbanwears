import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const inbox = readFileSync("components/studio/connected-order-inbox.tsx", "utf8");
const detail = readFileSync("components/studio/connected-order-detail.tsx", "utf8");

test("ambiguous order mutation failures reconcile only through exact receipts", () => {
  assert.match(detail, /authoritativeClientFailure = response\.status >= 400 && response\.status < 500/);
  assert.match(detail, /getOrCreateSessionCommandKey/);
  assert.match(detail, /receiptMatches\(body\.receipt, expectedReceipt\)/);
  assert.match(detail, /\?idempotencyKey=\$\{encodeURIComponent\(idempotencyKey\)\}/);
  assert.match(detail, /receiptMatches\(reconciled\.receipt \?\? undefined, expectedReceipt\)/);
  assert.doesNotMatch(detail, /reconciled\.version > order\.version/);
  assert.doesNotMatch(detail, /await onReconcile\(order\.version\)/);
  assert.doesNotMatch(detail, /authoritativeResponseReceived = !response\.ok/);

  assert.match(inbox, /authoritativeClientFailure = response\.status >= 400 && response\.status < 500/);
  assert.match(inbox, /if \(mutationDispatched && !authoritativeClientFailure\) \{[\s\S]*?await loadOrders\(undefined, true\)/);
});

test("order detail refreshes visibly and never polls through a mutation", () => {
  assert.match(detail, /document\.visibilityState !== "visible"[\s\S]*?activeMutationRef\.current !== null/);
  assert.match(detail, /window\.setInterval\(poll, 15_000\)/);
  assert.match(detail, /document\.addEventListener\("visibilitychange", onVisibilityChange\)/);
  assert.match(detail, /if \(state !== "ready" \|\| activeMutationKey !== null\) return/);
  assert.match(detail, /manualRefreshPendingRef\.current \|\| activeMutationRef\.current !== null/);
  assert.match(detail, /current\.version > latestOrder\.version[\s\S]*?\? current[\s\S]*?: latestOrder/);
  assert.ok(
    detail.indexOf("Check for updates") < detail.indexOf('className="studio-transition-action studio-order-timeline"'),
    "the manual refresh control should be visible before the collapsed timeline",
  );
});

test("assisted-order retry state stores only a validated expiring digest and key", () => {
  assert.match(inbox, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(inbox, /SHA256_FINGERPRINT_PATTERN = \/\^\[0-9a-f\]\{64\}\$\//);
  assert.match(inbox, /keys\.length === 3/);
  assert.match(inbox, /\["fingerprint", "idempotencyKey", "expiresAt"\]/);
  assert.match(inbox, /window\.sessionStorage\.setItem\(ASSISTED_ORDER_INTENT_STORAGE_KEY, JSON\.stringify\(intent\)\)/);
  assert.match(inbox, /storedIntent\?\.fingerprint === fingerprint/);
  assert.match(inbox, /clearAssistedOrderIntent\(\)/);
  assert.doesNotMatch(inbox, /sessionStorage\.setItem\([^\n]*(?:contact|command|sourceNote)/);
});

test("order inbox empty states describe the active view and expose View all", () => {
  assert.match(inbox, /title: "No orders need action"/);
  assert.match(inbox, /title: "No matching orders"/);
  assert.match(inbox, /title: "No active orders"/);
  assert.match(inbox, /title: "No returns"/);
  assert.match(inbox, /title: "No completed orders"/);
  assert.match(inbox, /title: "No cancelled orders"/);
  assert.match(inbox, />View all<\/button>/);
  assert.match(inbox, /setActiveSearch\(""\); setFilter\("ALL"\)/);
});

test("quiet order failures stay visible and ambiguous creation reports only proven recovery", () => {
  assert.match(inbox, /state === "ready" && error/);
  assert.match(inbox, /Existing orders are shown, but they may be out of date\./);
  assert.match(inbox, /findRecoveredAssistedOrder\(reconciledOrders, recoverySignature\)/);
  assert.match(inbox, /if \(recovered\) \{[\s\S]*?acceptCreatedOrder\(recovered\)/);
  assert.match(inbox, /Order outcome not confirmed/);
  assert.doesNotMatch(inbox, /Order not created[^\n]*Try again to safely reuse/);
});
