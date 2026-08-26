import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  garmentSetCommandSchema,
  garmentSetSlotKeys,
} from "../lib/studio/engine/garment-set-contracts";

const service = readFileSync(new URL("../lib/studio/engine/garment-set-service.ts", import.meta.url), "utf8");
const surface = readFileSync(new URL("../components/studio/garment-set-builder.tsx", import.meta.url), "utf8");
const repository = readFileSync(new URL("../lib/server/studio-intake-repository.ts", import.meta.url), "utf8");
const taskSheet = readFileSync(new URL("../components/studio/atoms/studio-task-sheet.tsx", import.meta.url), "utf8");

const commandBase = {
  expectedRevision: "a".repeat(24),
  idempotencyKey: "genesis:test:revision:command",
};

test("Genesis uses the canonical front-set order and typed commands", () => {
  assert.deepEqual(garmentSetSlotKeys, [
    "GARMENT_FRONT",
    "GARMENT_BACK",
    "MANNEQUIN_FRONT",
    "FABRIC_DETAIL",
    "LULU_TRY_ON",
  ]);
  assert.equal(garmentSetCommandSchema.safeParse({
    ...commandBase,
    command: "ADVANCE_CURRENT",
    costConfirmed: true,
  }).success, true);
  assert.equal(garmentSetCommandSchema.safeParse({
    ...commandBase,
    command: "FIX_CURRENT",
    correction: "Preserve the original neckline.",
  }).success, true);
  assert.equal(garmentSetCommandSchema.safeParse({
    ...commandBase,
    command: "ADVANCE_CURRENT",
    costConfirmed: false,
  }).success, false);
});

test("the server advances one durable current view instead of fanning out", () => {
  assert.match(service, /currentSlot\(slots/);
  assert.match(service, /expectedRevision !== workspace\.revision/);
  assert.match(service, /advanceCurrent\(wardrobeItemId, operator, currentSlot, commandJob\.id\)/);
  assert.match(service, /createMediaCompletion/);
  assert.match(service, /generateWearCandidate/);
  assert.match(service, /approvedLulu\(wear\.models\)/);
  assert.doesNotMatch(service, /model\.name\.trim\(\)\.toLowerCase\(\) === "lulu"/);
  assert.match(service, /garment-genesis-command-v1/);
  assert.match(service, /command\.parameters\.idempotencyKey !== input\.idempotencyKey/);
  assert.match(service, /claimGenerationCommand\(commandJob\.id\)/);
  assert.match(repository, /inArray\(studioGenerations\.state, \["PENDING", "FAILED"\]\)/);
  assert.doesNotMatch(service, /Promise\.allSettled\(tasks\)/);
  assert.doesNotMatch(service, /EDITORIAL_LULU/);
});

test("Wear calls bind the Genesis command and exact correction receipt", () => {
  assert.equal((service.match(/\n\s+requestId,\n\s+operation: /g) ?? []).length, 2);
  assert.match(service, /fixCurrent\(wardrobeItemId, operator, currentSlot, input\.correction, commandJob\.id\)/);
  assert.match(service, /const decisionWorkspace = await decideWearCandidate/);
  assert.match(service, /generation\.id === slot\.jobId/);
  assert.match(service, /decisionReceipt\.generationId !== slot\.jobId/);
  assert.match(service, /decisionReceipt\.decision !== "EDIT"/);
  assert.match(service, /correctionGenerationId: correctionReceipt\.generationId/);
  assert.match(service, /decisionReceiptId: correctionReceipt\.receiptId/);
  assert.match(service, /generationId: decisionReceipt\.generationId/);
  assert.match(service, /receiptId: decisionReceipt\.receiptId/);
  assert.doesNotMatch(service, /requiresReconciliation/);

  const mediaStart = service.indexOf('if (slot.key === "GARMENT_BACK" || slot.key === "FABRIC_DETAIL")');
  const mannequinStart = service.indexOf('if (slot.key === "MANNEQUIN_FRONT")', mediaStart);
  const mediaBranch = service.slice(mediaStart, mannequinStart);
  assert.doesNotMatch(mediaBranch, /requestId|correctionGenerationId|decisionReceiptId/);
});

test("one mounted Genesis sheet owns progress, review, correction and receipt", () => {
  assert.match(surface, /Opening saved work/);
  assert.match(surface, /Fix one thing/);
  assert.match(surface, /KEEP_CURRENT/);
  assert.match(surface, /REJECT_CURRENT/);
  assert.match(surface, /FIX_CURRENT/);
  assert.match(surface, /workspace\.receipt/);
  assert.match(surface, /pendingCommand === "ADVANCE_CURRENT"/);
  assert.match(surface, /pendingCommand === "KEEP_CURRENT"/);
  assert.match(surface, /pendingCommand === "FIX_CURRENT"/);
  assert.match(surface, /pendingCommand === "REJECT_CURRENT"/);
  assert.match(surface, /Preparing/);
  assert.match(surface, /Your accepted work stays in place/);
  assert.match(surface, /Nothing changed/);
  assert.match(surface, /Could not confirm/);
  assert.match(surface, /commandReceipt/);
  assert.match(surface, /requestEpochRef/);
  assert.match(surface, /activeWardrobeItemRef\.current !== wardrobeItemId/);
  assert.match(surface, /refreshed\.revision !== commandRevision/);
  assert.match(surface, /requestEpoch !== requestEpochRef\.current/);
  assert.match(surface, /className="studio-spin"/);
  assert.doesNotMatch(surface, /className="spin"/);
  assert.match(surface, /WardrobeMotion.*variant="success"/s);
  assert.match(surface, /window\.setTimeout\(\(\) => void poll\(\), 2_500\)/);
  assert.match(surface, /setWorkspace\(null\)/);
  assert.match(surface, /progress=\{workspace \? workspace\.progress\.percent : undefined\}/);
  assert.match(surface, /View sequence/);
  assert.match(surface, /Presentation only · compare with the real garment/);
  assert.match(surface, /await load\(true, requestEpoch\)/);
  assert.match(surface, /workspace\?\.nextAction === "BLOCKED"/);
  assert.match(surface, /\/studio\/models/);
  assert.doesNotMatch(surface, /Build missing views/);
  assert.match(taskSheet, /busy\?: boolean/);
  assert.match(taskSheet, /aria-busy=\{busy \|\| undefined\}/);
  assert.match(taskSheet, /disabled=\{busy\}/);
});
