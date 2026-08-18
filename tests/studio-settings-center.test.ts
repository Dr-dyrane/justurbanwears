import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const shell = readFileSync(`${root}/components/studio/app-shell.tsx`, "utf8");
const settings = readFileSync(`${root}/components/studio/settings/studio-settings-center.tsx`, "utf8");
const notifications = readFileSync(`${root}/components/studio/notifications/studio-notification-center.tsx`, "utf8");
const wardrobe = readFileSync(`${root}/components/studio/wardrobe-workbench.tsx`, "utf8");
const operator = readFileSync(`${root}/lib/server/studio-operator.ts`, "utf8");
const taskSheet = readFileSync(`${root}/components/studio/atoms/studio-task-sheet.tsx`, "utf8");

test("Studio exposes one global profile and settings centre", () => {
  assert.match(shell, /StudioSettingsCenter operator=\{operator\}/);
  assert.match(settings, /Profile & settings/);
  assert.match(settings, /ThemeSettings/);
  assert.match(settings, /PwaInstallControl/);
  assert.match(settings, /authClient\.signOut\(\)/);
  assert.match(settings, /AI intake/);
  assert.match(settings, /Preferences stay on this device/);
  assert.match(operator, /role: membership\.role/);
});

test("the persisted attention preference changes the update badge", () => {
  assert.match(settings, /setShowUpdateCount/);
  assert.match(notifications, /unresolvedCount && showUpdateCount/);
});

test("settings links directly to the visual guide", () => {
  assert.match(settings, /wardrobe\?guide=1/);
  assert.match(wardrobe, /searchParams\.get\("guide"\) !== "1"/);
  assert.match(wardrobe, /url\.searchParams\.delete\("guide"\)/);
});

test("navbar sheets share one guarded state-first dismissal path", () => {
  assert.match(taskSheet, /createPortal/);
  assert.match(taskSheet, /document\.body/);
  assert.match(taskSheet, /useHistoryBackedDialog/);
  assert.match(taskSheet, /useDocumentScrollLock/);
  assert.match(taskSheet, /const acceptDismiss = useCallback/);
  assert.match(taskSheet, /dialog\.addEventListener\("click", closeFromBackdrop\)/);
  assert.match(taskSheet, /onCancel=\{\(event\) => \{[\s\S]*requestClose\(\)/);
  assert.match(taskSheet, /onClick=\{requestClose\}/);
  assert.match(taskSheet, /onClose=\{restoreFocus\}/);
  assert.match(taskSheet, /data-studio-sheet-safety="guarded"/);
  assert.doesNotMatch(taskSheet, /dismissedRef/);
});
