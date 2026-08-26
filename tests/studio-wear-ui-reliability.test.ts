import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const sheet = await readFile(
  new URL("../components/studio/garment-intake/wear-sheet.tsx", import.meta.url),
  "utf8",
);
const client = await readFile(
  new URL("../components/studio/garment-intake/wear-client.ts", import.meta.url),
  "utf8",
);
const helperStart = sheet.indexOf("const WEAR_POLL_BASE_MS");
const helperEnd = sheet.indexOf("export function WearSheet");
assert.ok(helperStart >= 0 && helperEnd > helperStart);
const helperJavaScript = ts.transpileModule(sheet.slice(helperStart, helperEnd), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helpers = await import(`data:text/javascript;base64,${Buffer.from(helperJavaScript).toString("base64")}`) as {
  createWearRequestId(): string;
  runWearSingleFlight<T>(guard: { current: boolean }, command: () => Promise<T>): Promise<T | undefined>;
  wearPollDelay(failureCount: number): number;
};
const { createWearRequestId, runWearSingleFlight, wearPollDelay } = helpers;

test("Wear command gate rejects overlapping commands and releases after settlement", async () => {
  const guard = { current: false };
  let releaseFirst!: () => void;
  const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let starts = 0;

  const first = runWearSingleFlight(guard, async () => {
    starts += 1;
    await firstBlocked;
    return "first";
  });

  assert.equal(guard.current, true);
  assert.equal(await runWearSingleFlight(guard, async () => {
    starts += 1;
    return "overlap";
  }), undefined);
  assert.equal(starts, 1);

  releaseFirst();
  assert.equal(await first, "first");
  assert.equal(guard.current, false);
  assert.equal(await runWearSingleFlight(guard, async () => {
    starts += 1;
    return "next";
  }), "next");
  assert.equal(starts, 2);
});

test("Wear polling uses bounded exponential backoff", () => {
  assert.deepEqual(
    [-1, 0, 1, 2, 3, 4, 20].map(wearPollDelay),
    [1_600, 1_600, 1_600, 3_200, 6_400, 8_000, 8_000],
  );
});

test("Wear creates a UUID command identity before dispatch", () => {
  assert.match(createWearRequestId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
  assert.match(client, /requestId: string/u);
  assert.match(client, /generationId: string/u);
  assert.match(sheet, /writeWearRequestId\(wardrobeItemId, requestId\)/u);
  assert.match(sheet, /requestId,\s*operation: nextOperation/u);
  assert.match(sheet, /item\.id === result\.generationId && item\.requestId === requestId/u);
});

test("Wear mutations share the gate and expose pending feedback", () => {
  assert.match(sheet, /const commandInFlightRef = useRef\(false\)/u);
  assert.match(sheet, /withCommandLock\("GENERATE", \(\) => runUnlocked/u);
  assert.match(sheet, /withCommandLock\(pendingDecision/u);
  assert.match(sheet, /withCommandLock\("DECIDE_EDIT"/u);
  assert.match(sheet, /withCommandLock\("ADD_MODEL"/u);
  assert.match(sheet, /withCommandLock\("RETRY"/u);
  assert.match(sheet, /busy=\{commandBusy && step !== "working"\}/u);
  assert.match(sheet, /aria-busy="true" aria-live="polite"/u);
  assert.ok((sheet.match(/disabled=\{commandBusy/gu) ?? []).length >= 6);
  assert.match(sheet, /Fix one thing/u);
  assert.doesNotMatch(sheet, /decide\("EDIT"\)/u);
  assert.match(sheet, /decideWear\(wardrobeItemId, selected\.id, "EDIT", correction\)/u);
  assert.ok(sheet.indexOf('decideWear(wardrobeItemId, selected.id, "EDIT", correction)') < sheet.indexOf("await runUnlocked(selected.operation"));
  assert.doesNotMatch(sheet, /type="button">Edit<\/button>/u);
});

test("Wear only spends after an exact decision receipt", () => {
  assert.match(client, /decisionReceipt: StudioDecisionReceipt \| null/u);
  assert.match(client, /correctionGenerationId\?: string/u);
  assert.match(client, /decisionReceiptId\?: string/u);
  assert.match(sheet, /studioDecisionNoteSha256/u);
  assert.ok((sheet.match(/studioDecisionReceiptMatches\(/gu) ?? []).length >= 6);
  assert.match(sheet, /correctionGenerationId: correctionAuthority\?\.generationId/u);
  assert.match(sheet, /decisionReceiptId: correctionAuthority\?\.decisionReceiptId/u);

  const correctionStart = sheet.indexOf("async function applyCorrection()");
  const correctionEnd = sheet.indexOf("async function addModel()", correctionStart);
  const correction = sheet.slice(correctionStart, correctionEnd);
  assert.match(correction, /generationId: selected\.id,\s*decision: "EDIT",\s*noteSha256: expectedNoteSha256/u);
  assert.ok(correction.indexOf("studioDecisionReceiptMatches") < correction.indexOf("await runUnlocked"));
  assert.match(correction, /decisionReceiptId: correctionReceipt!\.receiptId/u);

  const retryStart = sheet.indexOf("async function retry()");
  const retryEnd = sheet.indexOf("function finishDismiss", retryStart);
  const retry = sheet.slice(retryStart, retryEnd);
  assert.match(retry, /generationId: selected\.id,\s*decision: "RETRY",\s*noteSha256: expectedNoteSha256/u);
  assert.ok(retry.indexOf("studioDecisionReceiptMatches") < retry.indexOf("await runUnlocked"));
  assert.match(retry, /decisionReceiptId: decided!\.decisionReceipt!\.receiptId/u);
  assert.match(retry, /decisionReceiptId: reconciled!\.decisionReceipt!\.receiptId/u);
});

test("Wear resumes read-only polling after connection failures without paid auto-retry", () => {
  const pollStart = sheet.indexOf("useEffect(() => {\n    const selectedGenerationId = selected?.id;");
  const pollEnd = sheet.indexOf("useEffect(() => {", pollStart + 1);
  assert.notEqual(pollStart, -1);
  assert.notEqual(pollEnd, -1);
  const pollingEffect = sheet.slice(pollStart, pollEnd);

  assert.match(pollingEffect, /schedulePoll\(wearPollDelay\(consecutiveFailures\)\)/u);
  assert.match(pollingEffect, /setConnectionMessage\(WEAR_CONNECTION_MESSAGE\)/u);
  assert.match(pollingEffect, /generation\.requestId === trackedRequestId/u);
  assert.doesNotMatch(pollingEffect, /generations\.at\(-1\)/u);
  assert.doesNotMatch(pollingEffect, /generateWear|decideWear|addWearModel/u);
  assert.match(sheet, /no new generation was started/u);
  assert.equal((sheet.match(/\bgenerateWear\(/gu) ?? []).length, 1);
  assert.match(sheet, /Studio may continue processing the private view/u);
});

test("Wear hydrates before actions and expanded review contains keyboard focus", () => {
  assert.match(sheet, /const \[hydrated, setHydrated\] = useState\(false\)/u);
  assert.match(sheet, /!hydrated \? \(/u);
  assert.match(sheet, /Opening saved work\./u);
  assert.match(sheet, /event\.key === "Escape"/u);
  assert.match(sheet, /event\.key === "Tab"/u);
  assert.match(sheet, /window\.addEventListener\("keydown", containExpandedPreviewFocus, \{ capture: true \}\)/u);
  assert.match(sheet, /expandPreviewRef\.current\?\.focus/u);
});

test("Wear blocks indeterminate paid results behind administrator reconciliation", () => {
  assert.match(sheet, /generation\.state === "INDETERMINATE"/u);
  assert.match(sheet, /generation\.requiresReconciliation/u);
  assert.match(sheet, /scopedReconciliation/u);
  assert.match(sheet, /No new paid attempt will start\./u);
  assert.match(sheet, /step === "reconcile" \? \(/u);
  assert.match(sheet, /Other view/u);
});

test("Wear requests time out into reconciliation instead of hanging indefinitely", () => {
  assert.match(client, /AbortSignal\.timeout\(STUDIO_CLIENT_REQUEST_TIMEOUT_MS\)/u);
  assert.match(client, /throw new StudioEngineError\(0, "NETWORK_UNAVAILABLE"/u);
});

test("Wear blocks actions when hydration fails and leaves terminal failures", () => {
  assert.match(sheet, /setHydrationError\(nextError\)/u);
  assert.match(sheet, /Try connection/u);
  assert.match(sheet, /Choose another view/u);
  assert.match(sheet, /cancelCorrectionDraft/u);
  assert.match(sheet, /cancelModelDraft/u);
  assert.match(sheet, /decideWear\(wardrobeItemId, selected\.id, decision\)/u);
});
