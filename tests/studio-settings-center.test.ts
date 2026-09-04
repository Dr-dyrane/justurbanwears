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
const consentRepository = readFileSync(`${root}/lib/server/studio-atelier-consent-repository.ts`, "utf8");

test("Studio exposes one global profile and settings centre", () => {
  assert.match(shell, /StudioSettingsCenter operator=\{operator\}/);
  assert.match(settings, /Profile & settings/);
  assert.match(settings, /ThemeSettings/);
  assert.match(settings, /PwaInstallControl/);
  assert.match(settings, /authClient\.signOut\(\)/);
  assert.match(settings, /assignDocumentNavigation\("\/auth\/sign-in\?returnTo=\/studio"\)/);
  assert.match(settings, />Appearance<\/h3>/);
  assert.match(settings, />Identity &amp; privacy<\/h3>/);
  assert.match(settings, />Studio tools<\/h3>/);
  assert.match(settings, />Help<\/h3>/);
  assert.match(settings, /href="\/studio\/models"/);
  assert.match(settings, /href="\/studio\/stocktake"/);
  assert.match(settings, /href="\/shop"/);
  assert.match(settings, /Models &amp; identity/);
  assert.match(settings, /Private Atelier use/);
  assert.match(settings, /Stock count/);
  assert.match(settings, /View live Shop/);
  assert.match(settings, /readyModels/);
  assert.match(settings, /studioHeldPieces/);
  assert.match(settings, /liveListings/);
  assert.match(settings, /summary\.available\.value/);
  assert.match(settings, /\$\{availableShopPieces\} available now/);
  assert.match(settings, /intakeDrafts/);
  assert.match(settings, /consentSummary/);
  assert.match(settings, /Not authorized yet/);
  assert.match(settings, /This is a safeguard, not a service outage/);
  assert.doesNotMatch(settings, /Lulu, body canon and styling|Control likeness and provider access|Check pieces against physical stock|See the customer-facing store|Five visual steps/);
  assert.doesNotMatch(settings, /AI intake|Private server drafts|Connected Studio record|workspaceAvailable/);
  assert.doesNotMatch(settings, /Choose the light|Data & access|Keep the steps close/);
  assert.doesNotMatch(settings, /Authorization unavailable|authorization is unavailable|Live state unavailable/);
  assert.match(operator, /return projectStudioOperator\(/);
  assert.match(operator, /membership,/);
});

test("Studio uses the one approved Lulu face for both profile surfaces", () => {
  assert.match(settings, /const LULU_PROFILE_AVATAR_SRC = "\/api\/studio\/profile\/avatar"/);
  assert.equal(settings.match(/<LuluProfileAvatar/g)?.length, 2);
  assert.doesNotMatch(settings, /avatarInitial|<b>\{initial\}<\/b>|>L<\/b>/);
  assert.match(settings, /fetchPriority=\{menuTrigger \? "high" : "auto"\}/);
  assert.match(settings, /loading=\{menuTrigger \? "eager" : "lazy"\}/);
  assert.doesNotMatch(settings, /online|<i\s*\/>/);
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
  assert.match(settings, /href="\/studio\/models"/);
  assert.match(settings, /wardrobe\?guide=1/);
  assert.match(wardrobe, /searchParams\.get\("guide"\) !== "1"/);
  assert.match(wardrobe, /url\.searchParams\.delete\("guide"\)/);
});

test("Atelier authorization loads on demand and exposes a recoverable failure", () => {
  assert.match(settings, /if \(open && operator\) void loadConsent\(\)/);
  assert.match(settings, /if \(!consent && !consentLoading\) void loadConsent\(\)/);
  assert.match(settings, /Authorization status needs a refresh/);
  assert.match(settings, />Try again<\/button>/);
});

test("Atelier authorization queries avoid PostgreSQL's reserved GRANT keyword", () => {
  assert.match(consentRepository, /studio_atelier_consent_grants consent_grant/);
  assert.doesNotMatch(consentRepository, /studio_atelier_consent_grants grant\b/);
  assert.match(consentRepository, /studio-atelier-authority-constants/);
  assert.doesNotMatch(consentRepository, /studio-atelier-production-runtime/);
});

test("navbar sheets share one guarded state-first dismissal path", () => {
  assert.match(taskSheet, /createPortal/);
  assert.match(taskSheet, /document\.body/);
  assert.match(taskSheet, /useHistoryBackedDialog/);
  assert.match(taskSheet, /useDocumentScrollLock/);
  assert.match(taskSheet, /const acceptDismiss = useCallback/);
  assert.match(taskSheet, /dialog\.addEventListener\("click", closeFromBackdrop\)/);
  assert.match(taskSheet, /onCancel=\{\(event\) => \{[\s\S]*requestGuardedClose\(\)/);
  assert.match(taskSheet, /onClick=\{requestGuardedClose\}/);
  assert.match(taskSheet, /onClose=\{restoreFocus\}/);
  assert.match(taskSheet, /data-studio-sheet-safety="guarded"/);
  assert.doesNotMatch(taskSheet, /dismissedRef/);
});
