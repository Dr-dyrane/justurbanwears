import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  intakeRecoveryStep,
  studioDecisionNoteSha256,
  studioDecisionReceiptMatches,
  type IntakeSnapshot,
} from "../components/studio/garment-intake/engine-client";

const root = process.cwd();
const sheet = readFileSync(`${root}/components/studio/garment-intake/garment-intake-sheet.tsx`, "utf8");
const client = readFileSync(`${root}/components/studio/garment-intake/engine-client.ts`, "utf8");
const workbench = readFileSync(`${root}/components/studio/wardrobe-workbench.tsx`, "utf8");
const css = readFileSync(`${root}/app/foundation.css`, "utf8");
const adaptiveCss = readFileSync(`${root}/app/studio-adaptive-workspace.css`, "utf8");

test("garment intake is one progressive mounted sheet with no select controls", () => {
  for (const step of ["start", "source", "build", "confirm", "edit", "receipt"]) {
    assert.match(sheet, new RegExp(`"${step}"`));
  }
  assert.match(sheet, /Camera/);
  assert.match(sheet, /Photos/);
  assert.match(sheet, /Describe/);
  assert.match(sheet, /Keep/);
  assert.match(sheet, /<dt>Description<\/dt>/);
  assert.match(sheet, /<span>Description<\/span><textarea maxLength=\{2000\} required/);
  assert.match(sheet, /facts\.description\?\.trim\(\)/);
  assert.match(sheet, /description: String\(value\?\.description \?\? ""\)\.trim\(\)/);
  assert.match(client, /description\?: string/);
  assert.match(sheet, /Try again/);
  assert.match(sheet, /Expand garment preview/);
  assert.match(sheet, /Private · not for sale/);
  assert.match(sheet, /studio-receipt-preview/);
  assert.match(sheet, /window\.addEventListener\("keydown", closePreview, \{ capture: true \}\)/);
  assert.match(sheet, /event\.key === "Tab"/);
  assert.match(sheet, /aria-modal="true"/);
  assert.doesNotMatch(sheet, /<select/);
  assert.doesNotMatch(sheet, /Continue Genesis|Continue in Atelier|Not now/);
  assert.match(sheet, /Add the remaining product photos, then review the Shop preview/);
  assert.doesNotMatch(sheet, /studio\.createGarment/);
  assert.match(workbench, /<GarmentIntakeSheet/);
  assert.doesNotMatch(workbench, /function GarmentIntakeDialog/);
});

test("Wardrobe keeps Add garment visible and never replaces the next seller task with Genesis", () => {
  assert.match(workbench, /className="studio-wardrobe-add-trigger"/);
  assert.doesNotMatch(workbench, /nextGarment \? \(\s*<button className="studio-wardrobe-add-trigger"/);
  assert.match(workbench, /workspace\.nextAction\.kind !== "CAPTURE"/);
  assert.doesNotMatch(workbench, /Build missing views|Continue Genesis/);
});

test("publication state fails closed and recovers from an ambiguous publish response", () => {
  assert.match(workbench, /garment\.dynamicPublication\?\.state === "PUBLISHED"/);
  assert.match(workbench, /const authoritativePublicationState = lifecycleWorkspace\?\.state \?\? garment\.dynamicPublication\?\.state/);
  assert.match(workbench, /const publicationCommandRef = useRef\(false\)/);
  assert.match(workbench, /if \([^\n]*publicationCommandRef\.current\) return/);
  assert.match(workbench, /const recovered = await readPublicationReview\(\)\.catch\(\(\) => null\)/);
  assert.match(workbench, /recovered\?\.state === "PUBLISHED"/);
});

test("garment intake keeps one visual stage, one control surface, and stable photo inputs", () => {
  const workspaceStart = sheet.indexOf("<StudioAdaptiveWorkspace active={open}");
  const workspaceEnd = sheet.indexOf("</StudioAdaptiveWorkspace>", workspaceStart);
  assert.notEqual(workspaceStart, -1);
  assert.notEqual(workspaceEnd, -1);
  assert.equal(sheet.match(/<StudioAdaptiveWorkspace/g)?.length, 1);
  assert.equal(sheet.match(/aria-label="Take garment photo"/g)?.length, 1);
  assert.equal(sheet.match(/aria-label="Choose garment photo"/g)?.length, 1);
  assert.ok(sheet.indexOf('aria-label="Take garment photo"') < workspaceStart);
  assert.ok(sheet.indexOf('aria-label="Choose garment photo"') < workspaceStart);
  assert.match(sheet, /event\.currentTarget\.value = ""/);
  assert.equal(sheet.match(/tabIndex=\{-1\} type="file"/g)?.length, 2);
  assert.match(sheet, /function clearPreview\(\)[\s\S]*URL\.revokeObjectURL\(previewUrlRef\.current\)/);
  assert.match(sheet, /const nextPreview = URL\.createObjectURL\(nextFile\)[\s\S]*previewUrlRef\.current = nextPreview/);
  assert.match(sheet, /useEffect\(\(\) => \(\) => \{[\s\S]*URL\.revokeObjectURL\(previewUrlRef\.current\)/);
  assert.doesNotMatch(sheet, /useMemo\(\(\) => file \? URL\.createObjectURL/);
  assert.match(sheet, /className=\{`juw-intake-v2-stage is-\$\{step\}`\}/);
  assert.doesNotMatch(sheet, /<div aria-label=\{`\$\{stageCopy\.title\}/);
  assert.match(sheet.slice(workspaceStart, workspaceEnd), /juw-intake-v2-actions/);
  assert.match(sheet, /event\.preventDefault\(\)[\s\S]*requestCloseAndThen\(\(\) => assignDocumentNavigation\(destination\)\)/);
  assert.match(sheet, /function finishCommittedDismiss\(\)[\s\S]*assignDocumentNavigation\(destination\)/);
  assert.match(sheet, /garmentSaved && !explicitCommittedNavigationRef\.current/);
  assert.match(sheet, /className="button button-primary" data-studio-workspace-primary="true"[\s\S]*>Open garment<\/StudioLink>/);
  assert.match(sheet, /href="\/studio\/wardrobe\?collection=private"[\s\S]*>Back to Wardrobe<\/StudioLink>/);
  assert.match(sheet, /step === "reconcile"[\s\S]*onClick=\{requestClose\}/);
  assert.doesNotMatch(sheet, /studio-source-preview|studio-build-visual|studio-confirm-hero|studio-receipt-visual/);

  assert.match(adaptiveCss, /\.studio-garment-task-sheet\.is-adaptive-host[\s\S]*?max-width: calc\(100vw - 16px\)/);
  assert.match(adaptiveCss, /\.studio-garment-task-sheet\.is-adaptive-host \.studio-task-sheet-body[\s\S]*?overflow: hidden/);
  assert.match(adaptiveCss, /\.juw-intake-v2-content[\s\S]*?min-height: 100%/);
  assert.match(adaptiveCss, /\.juw-intake-v2-actions[\s\S]*?position: sticky/);
});

test("every host uses the truthful progressive intake surface", () => {
  assert.match(workbench, /<GarmentIntakeSheet/);
  assert.doesNotMatch(workbench, /engineEnabled/);
  assert.doesNotMatch(workbench, /LocalGarmentIntakeDialog/);
  assert.match(sheet, /isExplicitlyUnavailable/);
  assert.match(sheet, /ENGINE_DISABLED/);
  assert.match(sheet, /ENGINE_UNAVAILABLE/);
  assert.match(sheet, /studio-engine-error/);
});

test("client keeps providers and private Blob paths behind same-origin engine routes", () => {
  assert.match(client, /\/api\/studio\/intakes/);
  assert.match(client, /credentials: "same-origin"/);
  assert.match(client, /cache: "no-store"/);
  assert.match(client, /AbortSignal\.timeout\(STUDIO_CLIENT_REQUEST_TIMEOUT_MS\)/);
  assert.doesNotMatch(client, /VERCEL_|BLOB_|provider|modelId|blob\.vercel-storage/);
  assert.match(client, /assets\/\$\{intake\.candidate\.assetId\}/);
  assert.match(client, /generationId: requireCandidateGenerationId\(intake\)/);
  assert.match(client, /correctionGenerationId: correctionAuthority\?\.generationId/);
  assert.match(client, /decisionReceiptId: correctionAuthority\?\.decisionReceiptId/);
});

test("garment intake commands are single-flight and creation reuses one reload-stable intent", () => {
  assert.match(sheet, /const commandInFlightRef = useRef\(false\)/);
  assert.match(sheet, /if \(commandInFlightRef\.current\) return false/);
  assert.match(sheet, /if \(!claimCommand\(\)\) return/);
  assert.match(sheet, /if \(intake\?\.reconciliation \|\| !canKeep \|\| !claimCommand\(\)\) return/);
  assert.match(sheet, /if \(!intake \|\| !reviewedGenerationId \|\| intake\.reconciliation \|\| retryUsed \|\| !claimCommand\(\)\) return/);
  assert.match(sheet, /window\.sessionStorage\.getItem\(intakeIntentStorageKey\)/);
  assert.match(sheet, /window\.sessionStorage\.setItem\(intakeIntentStorageKey, JSON\.stringify\(value\)\)/);
  assert.match(sheet, /intakeIntentFingerprint\(sourceMode!, description\)/);
  assert.match(sheet, /markIntakeIntentDispatched\(\)/);
  assert.match(sheet, /client\.createIntake\(sourceMode!, description\.trim\(\) \|\| undefined, idempotencyKey\)/);
  assert.match(sheet, /finishDismiss\(\{ preserveIntent: true \}\)/);
  assert.match(client, /description\?: string, idempotencyKey\?: string/);
  assert.match(client, /idempotencyKey: idempotencyKey \?\? key\(\)/);
});

test("paid follow-up requires the exact generation, decision, and normalized note receipt", async () => {
  const emptyNoteSha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const correctionSha256 = await studioDecisionNoteSha256("correction");
  assert.equal(await studioDecisionNoteSha256(), emptyNoteSha256);
  assert.equal(await studioDecisionNoteSha256("  correction  "), correctionSha256);

  const receipt = {
    receiptId: "receipt-1",
    generationId: "generation-1",
    decision: "RETRY" as const,
    noteSha256: correctionSha256,
    decidedAt: "2026-08-26T00:00:00.000Z",
  };
  assert.equal(studioDecisionReceiptMatches({
    receipt,
    generationId: "generation-1",
    decision: "RETRY",
    noteSha256: correctionSha256,
  }), true);
  assert.equal(studioDecisionReceiptMatches({
    receipt,
    generationId: "generation-2",
    decision: "RETRY",
    noteSha256: correctionSha256,
  }), false);
  assert.equal(studioDecisionReceiptMatches({
    receipt,
    generationId: "generation-1",
    decision: "EDIT",
    noteSha256: correctionSha256,
  }), false);
  assert.equal(studioDecisionReceiptMatches({
    receipt,
    generationId: "generation-1",
    decision: "RETRY",
    noteSha256: emptyNoteSha256,
  }), false);

  const retryStart = sheet.indexOf("async function retry()");
  const retryEnd = sheet.length;
  assert.notEqual(retryStart, -1);
  assert.notEqual(retryEnd, -1);
  const retry = sheet.slice(retryStart, retryEnd);
  assert.match(retry, /studioDecisionReceiptMatches/);
  assert.match(retry, /const correction = "Keep the garment truth\. Improve the clean product-front view\.";\s*const decisionNote = correction/);
  assert.ok(retry.indexOf("studioDecisionReceiptMatches") < retry.indexOf("await performBuild"));
  assert.match(retry, /generationId: reviewedGenerationId,\s*decisionReceiptId: decision\.intake\.decisionReceipt!\.receiptId/);
  assert.match(retry, /generationId: reviewedGenerationId,\s*decisionReceiptId: reconciled\.intake\.decisionReceipt!\.receiptId/);
});

test("intake recovery projects only the current state, never rejected history", () => {
  const base: IntakeSnapshot = {
    id: "intake-1",
    kind: "GARMENT",
    sourceMode: "UPLOAD",
    state: "REVIEW",
    version: 2,
    assets: [],
  };
  assert.equal(intakeRecoveryStep({ ...base, state: "ANALYZING" }), "build");
  assert.equal(intakeRecoveryStep({ ...base, state: "GENERATING" }), "build");
  assert.equal(intakeRecoveryStep({
    ...base,
    state: "DECISION",
    candidate: { assetId: "asset-1", generationId: "generation-1", status: "COMPLETE" },
  }), "confirm");
  assert.equal(intakeRecoveryStep({
    ...base,
    state: "REVIEW",
    candidate: { assetId: "asset-old", generationId: "generation-old", status: "REJECTED" },
  }), "source");
  assert.equal(intakeRecoveryStep({
    ...base,
    state: "FAILED",
    reconciliation: {
      state: "INDETERMINATE",
      retryAllowed: false,
      message: "Administrator reconciliation required.",
    },
  }), "reconcile");
  assert.equal(intakeRecoveryStep({ ...base, state: "COMMITTED", wardrobeItemId: "wardrobe-1" }), "receipt");
});

test("ambiguous intake mutations reconcile by read without automatic generation", () => {
  assert.match(sheet, /async function reconcileIntake\(intakeId: string\)/);
  assert.match(sheet, /await client\.getIntake\(intakeId\)/);
  assert.match(sheet, /setIntake\(decided\.intake\)/);
  assert.match(sheet, /reconciled\.intake\.candidate\?\.status === "APPROVED"/);
  assert.match(sheet, /committedReconciliation = await reconcileIntake/);
  const reconciliation = sheet.slice(
    sheet.indexOf("async function reconcileIntake"),
    sheet.indexOf("function resumeIntake"),
  );
  assert.doesNotMatch(reconciliation, /generateGarment|analyzeIntake|createIntake/);
});

test("active intake polling reconnects with bounded backoff and stays read-only", () => {
  const pollStart = sheet.indexOf("const poll = async () =>");
  const pollEnd = sheet.indexOf("}, [client, open, pollingIntakeId, pollingIntakeState]);", pollStart);
  assert.notEqual(pollStart, -1);
  assert.notEqual(pollEnd, -1);
  const poll = sheet.slice(pollStart, pollEnd);
  assert.match(poll, /await getIntake\(intakeId\)/);
  assert.match(poll, /Connection interrupted\. Studio is still working; reconnecting…/);
  assert.match(poll, /Math\.min\(14_400/);
  assert.doesNotMatch(poll, /generateGarment|createIntake|analyzeIntake/);
  assert.doesNotMatch(sheet, /busy=\{working\}/);
  assert.match(sheet, /onBack=\{!working &&/);
  assert.match(sheet, /Building…/);
  assert.match(sheet, /Keeping…/);
  assert.match(sheet, /Trying again…/);
  assert.match(sheet, /No new paid attempt will start\./);
  assert.match(sheet, /if \(intake\?\.reconciliation \|\|/);
});

test("intake discovery fails closed before offering a fresh paid workflow", () => {
  assert.match(sheet, /setRecoveryStatus\("error"\)/);
  assert.match(sheet, /We couldn&apos;t check unfinished work\./);
  assert.match(sheet, /!client\.listActiveIntakes \|\| recoveryStatus === "ready"/);
  assert.match(sheet, /setRecoveryReload\(\(value\) => value \+ 1\)/);
});

test("new sheet material follows the scoped liquid-glass and accessibility contract", () => {
  assert.match(css, /\.studio-intake-sheet \{[\s\S]*?blur\(4px\)/);
  assert.match(css, /background: rgba\(249, 247, 243, 0\.6\)/);
  assert.match(css, /html\[data-theme="dark"\] \.studio-intake-sheet \{ background: rgba\(28, 24, 22, 0\.6\)/);
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /\.studio-receipt-visual/);
  assert.match(css, /\.studio-receipt-state \.studio-lifecycle-draft \{ color: var\(--studio-ink\); \}/);
  assert.match(css, /\.studio-receipt-preview::before/);
});
