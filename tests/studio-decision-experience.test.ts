import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const decision = readFileSync(`${root}/components/studio/atoms/studio-decision-sheet.tsx`, "utf8");
const taskSheet = readFileSync(`${root}/components/studio/atoms/studio-task-sheet.tsx`, "utf8");
const feedback = readFileSync(`${root}/components/studio/atoms/studio-feedback.tsx`, "utf8");
const lifecycle = readFileSync(`${root}/components/studio/garment-lifecycle-panel.tsx`, "utf8");
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
  assert.match(taskSheet, /typeof footer === "function" \? footer\(requestClose\) : footer/);
  assert.match(taskSheet, /returnFocus\?\.isConnected/);
  assert.match(taskSheet, /fallbackFocus\?\.isConnected/);
  assert.match(lifecycle, /fallbackFocus=\{panelRef\.current\}/);
  assert.match(css, /Consequential changes use one visible decision tree/);
});

test("garment public and destructive changes never use a native browser confirm", () => {
  assert.doesNotMatch(lifecycle, /window\.confirm/);
  for (const action of ["PUBLISH_REVISION", "DISCARD_REVISION", "UNPUBLISH", "REPUBLISH", "ARCHIVE"]) {
    assert.match(lifecycle, new RegExp(`requestDecision\\(\\"${action}\\"`));
  }
  assert.match(lifecycle, /<StudioDecisionSheet/);
  assert.match(lifecycle, /idempotencyKey: publicationKeyRef\.current/);
});

test("reversible Home preferences apply immediately and expose Undo", () => {
  assert.match(order, /setServiceOrder/);
  assert.match(order, /return current/);
  assert.match(arrange, /<StudioFeedback/);
  assert.match(arrange, />Undo<\/button>/);
  assert.match(arrange, /studio-arrange-reset/);
});

test("branded feedback motion covers pending, success and error states", () => {
  assert.match(feedback, /state === "loading" \|\| state === "success" \|\| state === "error"/);
  assert.match(feedback, /state === "success" \? "success" : "empty"/);
  assert.match(feedback, /loop=\{state === "loading"\}/);
});
