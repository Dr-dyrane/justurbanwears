import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const decision = readFileSync(`${root}/components/studio/atoms/studio-decision-sheet.tsx`, "utf8");
const taskSheet = readFileSync(`${root}/components/studio/atoms/studio-task-sheet.tsx`, "utf8");
const feedback = readFileSync(`${root}/components/studio/atoms/studio-feedback.tsx`, "utf8");
const lifecycle = readFileSync(`${root}/components/studio/garment-lifecycle-panel.tsx`, "utf8");
const localIntake = readFileSync(`${root}/components/studio/garment-intake/local-garment-intake-dialog.tsx`, "utf8");
const wardrobe = readFileSync(`${root}/components/studio/wardrobe-workbench.tsx`, "utf8");
const arrange = readFileSync(`${root}/components/studio/navigation/studio-service-list.tsx`, "utf8");
const order = readFileSync(`${root}/hooks/studio/use-studio-service-order.ts`, "utf8");
const css = readFileSync(`${root}/app/studio-stack-navigation.css`, "utf8");

test("consequential Studio actions share review, confirmation, progress and receipt", () => {
  assert.match(decision, /"review" \| "loading" \| "success" \| "error"/);
  assert.match(decision, /After confirmation/);
  assert.match(decision, /await onConfirm\(\)/);
  assert.match(decision, /state="loading"/);
  assert.match(decision, /state="success"/);
  assert.match(decision, /state="error"/);
  assert.match(decision, /Try again/);
  assert.match(decision, /onClick=\{requestClose\}/);
  assert.match(decision, /if \(phase === "loading"\) return false/);
  assert.match(decision, /onDismiss\(\);[\s\S]*return true/);
  assert.match(taskSheet, /typeof footer === "function" \? footer\(requestClose\) : footer/);
  assert.match(taskSheet, /returnFocus\?\.isConnected/);
  assert.match(taskSheet, /fallbackFocus\?\.isConnected/);
  assert.match(lifecycle, /fallbackFocus=\{panelRef\.current\}/);
  assert.match(css, /Consequential changes use one visible decision tree/);
  assert.match(css, /@media \(min-width: 761px\)[\s\S]*?\.studio-decision-sheet\.studio-decision-sheet \{[\s\S]*?margin: auto;[\s\S]*?max-width: 520px/);
});

test("garment public and destructive changes never use a native browser confirm", () => {
  assert.doesNotMatch(lifecycle, /window\.confirm/);
  for (const action of ["PUBLISH_REVISION", "DISCARD_REVISION", "UNPUBLISH", "REPUBLISH", "ARCHIVE"]) {
    assert.match(lifecycle, new RegExp(`requestDecision\\(\\"${action}\\"`));
  }
  assert.match(lifecycle, /<StudioDecisionSheet/);
  assert.match(lifecycle, /getOrCreateSessionCommandKey\(\{/);
  assert.match(lifecycle, /idempotencyKey: publicationKeyRef\.current/);
});

test("simulator garment and listing mutations use the shared decision receipt grammar", () => {
  assert.doesNotMatch(localIntake, /window\.confirm/);
  assert.match(localIntake, /setPendingGarment\(\{/);
  assert.match(localIntake, /async function confirmCreate\(\)/);
  assert.match(localIntake, /createInFlightRef\.current/);
  assert.match(localIntake, /const created = createGarment\(pendingGarment\)/);
  assert.match(localIntake, /created\.sku !== pendingGarment\.sku\.trim\(\)\.toUpperCase\(\)/);
  assert.match(localIntake, /<StudioDecisionSheet[\s\S]*confirmLabel="Create garment"/);
  assert.match(localIntake, /className="studio-decision-diff"/);

  assert.doesNotMatch(wardrobe, /window\.confirm/);
  assert.match(wardrobe, /kind: "CONFIRM_READY" \| "PUBLISH"/);
  assert.match(wardrobe, /kind: "SAVE"; update: ListingUpdateInput/);
  assert.match(wardrobe, /decisionInFlightRef\.current/);
  assert.equal((wardrobe.match(/studio\.updateListing\(/gu) ?? []).length, 1);
  assert.equal((wardrobe.match(/studio\.confirmListingReady\(/gu) ?? []).length, 1);
  assert.equal((wardrobe.match(/studio\.publishListing\(/gu) ?? []).length, 1);
  assert.match(wardrobe, /workspace\.nextAction\.kind === "PUBLISH"[\s\S]*openDetails\(\)/);
  assert.match(wardrobe, /<StudioDecisionSheet[\s\S]*onConfirm=\{confirmDecision\}/);
  assert.match(wardrobe, /className="studio-decision-diff"/);
  assert.match(wardrobe, /The Shop preview is no longer ready/);
  assert.match(wardrobe, /The listing was not published/);
  assert.doesNotMatch(wardrobe, /onClick=\{\(\) => studio\.(?:confirmListingReady|publishListing)/);
});

test("reversible Home preferences apply immediately and expose Undo", () => {
  assert.match(order, /setServiceOrder/);
  assert.match(order, /return current/);
  assert.match(arrange, /<StudioFeedback/);
  assert.match(arrange, />Undo<\/button>/);
  assert.match(arrange, /studio-arrange-reset/);
});

test("branded feedback motion covers pending, success and error states", () => {
  assert.match(feedback, /state === "loading" \?/);
  assert.match(feedback, /state === "success" \?/);
  assert.match(feedback, /state === "error" \?/);
  assert.match(feedback, /variant="loader"/);
  assert.match(feedback, /variant="success"/);
  assert.match(feedback, /variant="empty"/);
  assert.match(feedback, /\r?\n\s+loop\r?\n/);
});
