import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const experience = await readFile(new URL("../app/experience-system.css", import.meta.url), "utf8");
const historyHook = await readFile(new URL("../hooks/use-history-backed-dialog.ts", import.meta.url), "utf8");
const taskSheet = await readFile(new URL("../components/studio/atoms/studio-task-sheet.tsx", import.meta.url), "utf8");
const localIntake = await readFile(new URL("../components/studio/garment-intake/local-garment-intake-dialog.tsx", import.meta.url), "utf8");
const garmentIntake = await readFile(new URL("../components/studio/garment-intake/garment-intake-sheet.tsx", import.meta.url), "utf8");
const wearSheet = await readFile(new URL("../components/studio/garment-intake/wear-sheet.tsx", import.meta.url), "utf8");

test("history-backed dialogs may reject Back without losing the task", () => {
  assert.match(historyHook, /onDismiss\(\): boolean \| void/);
  assert.match(historyHook, /const accepted = dismissRef\.current\(\)/);
  assert.match(historyHook, /accepted === false[\s\S]*history\.pushState/);
  assert.match(historyHook, /markerRef\.current/);
  assert.match(historyHook, /if \(isOpen\) return;[\s\S]*history\.back\(\)/);
});

test("Studio task sheets route every dismissal through one guarded decision", () => {
  assert.match(taskSheet, /useHistoryBackedDialog/);
  assert.match(taskSheet, /useDocumentScrollLock/);
  assert.match(taskSheet, /data-experience-layer="sheet"/);
  assert.match(taskSheet, /data-studio-sheet-safety="guarded"/);
  assert.match(taskSheet, /onCancel=\{\(event\) => \{[\s\S]*requestClose\(\)/);
  assert.match(taskSheet, /addEventListener\("click", closeFromBackdrop\)/);
  assert.match(taskSheet, /onClick=\{requestClose\}/);
  assert.match(taskSheet, /onClose=\{restoreFocus\}/);
  assert.doesNotMatch(taskSheet, /useSheetDismissGesture|data-sheet-gesture/);
});

test("the local garment form protects dirty input from Back, Escape, backdrop, and close", () => {
  assert.match(localIntake, /useHistoryBackedDialog/);
  assert.match(localIntake, /useDocumentScrollLock/);
  assert.match(localIntake, /data-studio-sheet-safety="dirty-form"/);
  assert.match(localIntake, /setDirty\(true\)/);
  assert.match(localIntake, /Discard this garment draft/);
  assert.match(localIntake, /onCancel=\{\(event\) => \{[\s\S]*requestClose\(\)/);
  assert.match(localIntake, /addEventListener\("click", closeFromBackdrop\)/);
  assert.match(localIntake, /onClick=\{requestClose\}/);
  assert.match(localIntake, /committedRef\.current = true;[\s\S]*requestClose\(\)/);
  assert.doesNotMatch(localIntake, /useSheetDismissGesture|data-sheet-gesture/);
});

test("garment intake keeps nested previews and active work before closing", () => {
  assert.match(garmentIntake, /function requestDismiss\(\)/);
  assert.match(garmentIntake, /receiptPreviewOpen[\s\S]*setReceiptPreviewOpen\(false\)[\s\S]*return false/);
  assert.match(garmentIntake, /working \|\| step === "build"/);
  assert.match(garmentIntake, /Discard this garment intake/);
  assert.match(garmentIntake, /Boolean\(wardrobeItemId\) \|\| step === "wear" \|\| step === "receipt"/);
  assert.match(garmentIntake, /onDismiss=\{requestDismiss\}/);
  assert.equal((garmentIntake.match(/onClick=\{finishDismiss\}/g) ?? []).length, 1);
});

test("Wear closes previews first and protects only genuinely unsaved work", () => {
  assert.match(wearSheet, /function requestDismiss\(\)/);
  assert.match(wearSheet, /if \(expanded\)[\s\S]*setExpanded\(false\)[\s\S]*return false/);
  assert.match(wearSheet, /step === "working"[\s\S]*Studio may continue processing/);
  assert.match(wearSheet, /hasModelDraft/);
  assert.match(wearSheet, /hasCorrectionDraft/);
  assert.match(wearSheet, /Discard these unsaved Wear changes/);
  assert.match(wearSheet, /onDismiss=\{requestDismiss\}/);
  assert.match(wearSheet, /onClick=\{finishDismiss\}/);
});

test("Studio sheets use the resolve tempo rather than Shop drag theatre", () => {
  assert.match(experience, /data-studio-sheet-safety/);
  assert.match(experience, /--juw-sheet-motion: var\(--juw-motion-resolve\)/);
  assert.match(experience, /scroll-behavior: auto/);
});
