import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const shell = readFileSync(`${root}/components/studio/app-shell.tsx`, "utf8");
const settings = readFileSync(`${root}/components/studio/settings/studio-settings-center.tsx`, "utf8");
const wardrobe = readFileSync(`${root}/components/studio/wardrobe-workbench.tsx`, "utf8");
const operator = readFileSync(`${root}/lib/server/studio-operator.ts`, "utf8");
const taskSheet = readFileSync(`${root}/components/studio/atoms/studio-task-sheet.tsx`, "utf8");
const avatarRoute = readFileSync(`${root}/app/api/studio/profile/avatar/route.ts`, "utf8");

test("Studio exposes one global profile and settings centre", () => {
  assert.match(shell, /StudioSettingsCenter operator=\{operator\}/);
  assert.match(settings, /Profile & settings/);
  assert.match(settings, /ThemeSettings/);
  assert.match(settings, /PwaInstallControl/);
  assert.match(settings, /authClient\.signOut\(\)/);
  assert.match(settings, /assignDocumentNavigation\("\/auth\/sign-in\?returnTo=\/studio"\)/);
  assert.match(settings, /AI intake/);
  assert.match(settings, /Preferences stay on this device/);
  assert.match(settings, />Appearance<\/h3>/);
  assert.match(settings, />Workspace<\/h3>/);
  assert.match(settings, />Help<\/h3>/);
  assert.doesNotMatch(settings, /Choose the light|Data & access|Keep the steps close/);
  assert.match(operator, /role: membership\.role/);
});

test("Studio uses the one approved Lulu face for both profile surfaces", () => {
  assert.match(settings, /const LULU_PROFILE_AVATAR_SRC = "\/api\/studio\/profile\/avatar"/);
  assert.equal(settings.match(/<LuluProfileAvatar/g)?.length, 2);
  assert.doesNotMatch(settings, /avatarInitial|<b>\{initial\}<\/b>|>L<\/b>/);
  assert.match(settings, /fetchPriority=\{online \? "high" : "auto"\}/);
  assert.match(settings, /loading=\{online \? "eager" : "lazy"\}/);
  assert.match(settings, /onError=\{\(event\) => \{ event\.currentTarget\.hidden = true; \}\}/);
  assert.doesNotMatch(settings, /blob\.vercel-storage\.com|studio\/model-authorities|\/lulu\.png|<UserRound/);
  assert.match(avatarRoute, /await requireStudioOperator\(\)/);
  assert.match(avatarRoute, /resolveLuluV4AuthorityAssets\(\[LULU_PROFILE_AVATAR_ASSET_ID\]\)/);
  assert.match(avatarRoute, /"lulu\.face\.v4\.front\.lock\.v1"/);
  assert.match(avatarRoute, /"cache-control": "private, no-store, max-age=0"/);
  assert.match(avatarRoute, /"cross-origin-resource-policy": "same-origin"/);
  assert.doesNotMatch(avatarRoute, /pathname|blobUrl|downloadUrl/);
});

test("settings stays focused after Home absorbs attention state", () => {
  assert.doesNotMatch(settings, /setShowUpdateCount|Show update count/);
  assert.doesNotMatch(shell, /StudioNotificationCenter/);
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
