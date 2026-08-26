import assert from "node:assert/strict";
import test from "node:test";
import {
  executeStudioPaidGeneration,
  StudioPaidGenerationIndeterminateError,
  studioPaidAccountingQuarantineReason,
  studioPaidProviderEvidenceQuarantineReason,
  studioPaidResultRequiresQuarantine,
  type StudioPaidGenerationClaim,
} from "../lib/server/studio-generation-execution";
import {
  decodeStudioGenerationResultEnvelope,
  encodeStudioGenerationResultEnvelope,
  studioGenerationProviderResultsMatch,
  type StudioGenerationProviderResult,
} from "../lib/server/studio-generation-result-store";
import {
  assertStudioGenerationRequestIdentity,
  assertNoConflictingActiveStudioGeneration,
  assertStudioCorrectionDecisionReceipt,
  buildOperatorSafeDecisionReceipt,
  isEligibleStudioIntakeCandidate,
  studioInFlightCommandVersionMatches,
  studioPaidGenerationScopeKey,
  studioIntakeDecisionTransition,
  studioSourceBindingMatches,
  studioIntakeIntentMatches,
  wardrobeCommitIntentMatches,
} from "../lib/server/studio-intake-repository";
import { StudioEngineError } from "../lib/studio/engine/errors";
import { sanitizeStudioProviderEvidence } from "../lib/ai/studio-provider-evidence";
import { assertStudioAnalysisBudget } from "../lib/ai/studio-gateway";

const rawResult: StudioGenerationProviderResult = {
  bytes: Uint8Array.from([0, 1, 2, 253, 254, 255]),
  mimeType: "image/png",
  usage: { inputTokens: 12, outputTokens: 34 },
  costUsd: 0.021,
};

const retainedResult = {
  ...rawResult,
  blobPathname: "studio/intakes/intake/generations/generation/provider-result.v1.json",
  byteSize: rawResult.bytes.byteLength,
  sha256: "2f2c047c0273d5c9f9c342b180a1130540784d8675be235f037be003bb1b213e",
};

function harness(claim: StudioPaidGenerationClaim<{ state: string }>, options: {
  retained?: typeof retainedResult | null;
  retainedSequence?: Array<typeof retainedResult | null>;
  invokeError?: Error;
  persistError?: Error;
  markKind?: "INDETERMINATE" | "RESULT_RECEIVED" | "LOST_CLAIM";
} = {}) {
  const events: string[] = [];
  let invokeCount = 0;
  let indeterminateCount = 0;
  let retainedReadCount = 0;
  return {
    events,
    get invokeCount() { return invokeCount; },
    get indeterminateCount() { return indeterminateCount; },
    run: () => executeStudioPaidGeneration({
      claim: async () => {
        events.push(`claim:${claim.kind}`);
        return claim;
      },
      markInvocationStarted: async () => { events.push("invocation-started"); },
      invoke: async () => {
        invokeCount += 1;
        events.push("invoke");
        if (options.invokeError) throw options.invokeError;
        return rawResult;
      },
      persistResult: async () => {
        events.push("persist-result");
        if (options.persistError) throw options.persistError;
        return retainedResult;
      },
      readRetainedResult: async () => {
        events.push("read-result");
        if (options.retainedSequence) {
          return options.retainedSequence[retainedReadCount++] ?? null;
        }
        return options.retained === undefined ? retainedResult : options.retained;
      },
      checkpointResult: async () => { events.push("checkpoint-result"); },
      markIndeterminate: async () => {
        indeterminateCount += 1;
        events.push("indeterminate");
        const kind = options.markKind ?? "INDETERMINATE";
        return { kind, row: { state: kind } };
      },
      markResultConflictIndeterminate: async () => {
        events.push("result-conflict-indeterminate");
        return true;
      },
    }),
  };
}

test("a fresh paid attempt checkpoints start, retains raw bytes, then checkpoints the result", async () => {
  const subject = harness({ kind: "CLAIMED", executionToken: "token", row: { state: "RUNNING" } });
  const result = await subject.run();
  assert.equal(result.kind, "READY");
  assert.equal(subject.invokeCount, 1);
  assert.deepEqual(subject.events, [
    "claim:CLAIMED",
    "invocation-started",
    "invoke",
    "persist-result",
    "checkpoint-result",
  ]);
});

test("joined and terminal claims never invoke or mutate provider state", async () => {
  for (const kind of ["JOINED", "INDETERMINATE", "TERMINAL"] as const) {
    const subject = harness({ kind, row: { state: kind } });
    const result = await subject.run();
    assert.equal(result.kind, kind);
    assert.equal(subject.invokeCount, 0);
    assert.deepEqual(subject.events, [`claim:${kind}`]);
  }
});

test("an expired attempt with a retained result resumes locally without another paid call", async () => {
  for (const kind of ["RESUME", "RECONCILE"] as const) {
    const subject = harness({ kind, executionToken: "same-attempt", row: { state: "RUNNING" } });
    const result = await subject.run();
    assert.equal(result.kind, "READY");
    assert.equal(subject.invokeCount, 0);
    assert.deepEqual(subject.events, [`claim:${kind}`, "read-result", "checkpoint-result"]);
  }
});

test("an invoked attempt with no recoverable result becomes indeterminate without spending again", async () => {
  const subject = harness(
    { kind: "RECONCILE", executionToken: "uncertain", row: { state: "RUNNING" } },
    { retained: null },
  );
  const result = await subject.run();
  assert.equal(result.kind, "INDETERMINATE");
  assert.equal(subject.invokeCount, 0);
  assert.equal(subject.indeterminateCount, 1);
  assert.deepEqual(subject.events, ["claim:RECONCILE", "read-result", "indeterminate"]);
});

test("a provider error after the invocation fence is terminally indeterminate", async () => {
  const subject = harness(
    { kind: "CLAIMED", executionToken: "uncertain", row: { state: "RUNNING" } },
    { invokeError: new Error("lost response") },
  );
  await assert.rejects(subject.run(), StudioPaidGenerationIndeterminateError);
  assert.equal(subject.invokeCount, 1);
  assert.equal(subject.indeterminateCount, 1);
  assert.deepEqual(subject.events, [
    "claim:CLAIMED",
    "invocation-started",
    "invoke",
    "indeterminate",
  ]);
});

test("a concurrent result checkpoint wins over an indeterminate CAS and resumes locally", async () => {
  const subject = harness(
    { kind: "RECONCILE", executionToken: "rotated-owner", row: { state: "RUNNING" } },
    { retainedSequence: [null, retainedResult], markKind: "RESULT_RECEIVED" },
  );
  const result = await subject.run();
  assert.equal(result.kind, "READY");
  assert.equal(subject.invokeCount, 0);
  assert.deepEqual(subject.events, [
    "claim:RECONCILE",
    "read-result",
    "indeterminate",
    "read-result",
  ]);
});

test("a conflicting retained provider result is quarantined instead of substituted", async () => {
  const conflicting = {
    ...retainedResult,
    bytes: Uint8Array.from([9, 9, 9]),
    byteSize: 3,
    costUsd: 0.001,
  };
  const subject = harness(
    { kind: "CLAIMED", executionToken: "result-owner", row: { state: "RUNNING" } },
    {
      persistError: new Error("immutable result collision"),
      retained: conflicting,
      markKind: "RESULT_RECEIVED",
    },
  );

  await assert.rejects(subject.run(), StudioPaidGenerationIndeterminateError);
  assert.equal(subject.invokeCount, 1);
  assert.deepEqual(subject.events, [
    "claim:CLAIMED",
    "invocation-started",
    "invoke",
    "persist-result",
    "read-result",
    "indeterminate",
    "read-result",
    "result-conflict-indeterminate",
  ]);
});

test("losing an execution lease joins the current owner instead of mutating its state", async () => {
  const subject = harness(
    { kind: "RECONCILE", executionToken: "stale-owner", row: { state: "RUNNING" } },
    { retained: null, markKind: "LOST_CLAIM" },
  );
  const result = await subject.run();
  assert.equal(result.kind, "JOINED");
  assert.equal(subject.invokeCount, 0);
  assert.deepEqual(subject.events, [
    "claim:RECONCILE",
    "read-result",
    "indeterminate",
    "read-result",
  ]);
});

test("an expired pre-invocation takeover rotates the token so only the new owner can invoke", async () => {
  let currentToken = "owner-a";
  let releaseStaleMark!: () => void;
  const staleMarkBlocked = new Promise<void>((resolve) => { releaseStaleMark = resolve; });
  let staleMarkEntered!: () => void;
  const staleMarkStarted = new Promise<void>((resolve) => { staleMarkEntered = resolve; });
  let invokeCount = 0;
  const callbacks = (claim: StudioPaidGenerationClaim<{ state: string }>) => ({
    claim: async () => claim,
    markInvocationStarted: async (executionToken: string) => {
      if (executionToken === "owner-a") {
        staleMarkEntered();
        await staleMarkBlocked;
      }
      if (executionToken !== currentToken) throw new Error("stale execution token");
    },
    invoke: async () => {
      invokeCount += 1;
      return rawResult;
    },
    persistResult: async () => retainedResult,
    readRetainedResult: async () => retainedResult,
    checkpointResult: async (executionToken: string) => {
      if (executionToken !== currentToken) throw new Error("stale checkpoint token");
    },
    markIndeterminate: async () => ({ kind: "INDETERMINATE" as const, row: { state: "INDETERMINATE" } }),
    markResultConflictIndeterminate: async () => true,
  });

  const staleWorker = executeStudioPaidGeneration(callbacks({
    kind: "CLAIMED",
    executionToken: "owner-a",
    row: { state: "RUNNING" },
  }));
  await staleMarkStarted;
  currentToken = "owner-b";
  const recoveryWorker = executeStudioPaidGeneration(callbacks({
    kind: "CLAIMED",
    executionToken: "owner-b",
    row: { state: "RUNNING" },
  }));
  releaseStaleMark();

  await assert.rejects(staleWorker, /stale execution token/);
  assert.equal((await recoveryWorker).kind, "READY");
  assert.equal(invokeCount, 1);
});

test("an invocation-started expired lease reconciles without a second provider invocation", async () => {
  const subject = harness(
    { kind: "RECONCILE", executionToken: "invoked-owner", row: { state: "RUNNING" } },
    { retained: null },
  );
  const result = await subject.run();
  assert.equal(result.kind, "INDETERMINATE");
  assert.equal(subject.invokeCount, 0);
});

test("missing and over-cap accounting quarantine one retained result and never invoke again", async () => {
  for (const costUsd of [null, 0.026]) {
    let state: "PENDING" | "RUNNING" | "INDETERMINATE" = "PENDING";
    let invokeCount = 0;
    const run = async () => executeStudioPaidGeneration<{ state: string }>({
      claim: async () => {
        if (state === "INDETERMINATE") return { kind: "INDETERMINATE" as const, row: { state } };
        state = "RUNNING";
        return { kind: "CLAIMED" as const, executionToken: "one-owner", row: { state } };
      },
      markInvocationStarted: async () => undefined,
      invoke: async () => {
        invokeCount += 1;
        return { ...rawResult, costUsd };
      },
      persistResult: async (result) => ({ ...retainedResult, ...result, costUsd }),
      readRetainedResult: async () => ({ ...retainedResult, costUsd }),
      checkpointResult: async () => undefined,
      markIndeterminate: async () => {
        state = "INDETERMINATE";
        return { kind: "INDETERMINATE" as const, row: { state } };
      },
      markResultConflictIndeterminate: async () => {
        state = "INDETERMINATE";
        return true;
      },
    });
    const first = await run();
    assert.equal(first.kind, "READY");
    assert.equal(studioPaidResultRequiresQuarantine(first.kind === "READY" ? first.result.costUsd : 0, 0.025), true);
    state = "INDETERMINATE";
    assert.equal((await run()).kind, "INDETERMINATE");
    assert.equal(invokeCount, 1);
  }
});

test("accounting quarantine classifies invalid policy and negative provider cost deterministically", () => {
  assert.throws(() => assertStudioAnalysisBudget(Number.NaN), StudioEngineError);
  assert.throws(() => assertStudioAnalysisBudget(-0.01), StudioEngineError);
  assert.doesNotThrow(() => assertStudioAnalysisBudget(0));
  assert.equal(studioPaidAccountingQuarantineReason(0.01, Number.NaN), "ACCOUNTING_POLICY_INVALID");
  assert.equal(studioPaidAccountingQuarantineReason(-0.01, 0.10), "ACCOUNTING_UNVERIFIED");
  assert.equal(studioPaidAccountingQuarantineReason(null, 0.10), "ACCOUNTING_UNVERIFIED");
  assert.equal(studioPaidAccountingQuarantineReason(0.11, 0.10), "COST_POLICY_EXCEEDED");
  assert.equal(studioPaidAccountingQuarantineReason(0.10, 0.10), null);
});

test("the private result envelope round-trips exact bytes and accounting and rejects tampering", () => {
  const providerEvidence = sanitizeStudioProviderEvidence({
    requestedModel: "openai/gpt-image-2",
    requestedProvider: "openai",
    durationMs: 42.4,
    result: {
      responses: [{
        modelId: "openai/gpt-image-2-2026-08-26",
        headers: {
          "x-ai-gateway-generation-id": "gen_safe-1",
          "x-request-id": "req_safe-1",
          authorization: "secret",
        },
      }],
      providerMetadata: { gateway: { provider: "openai", privatePrompt: "secret" } },
      warnings: [{ type: "provider-warning", message: "data:image/png;base64,secret" }],
    },
  });
  const envelope = encodeStudioGenerationResultEnvelope({ ...rawResult, providerEvidence });
  const decoded = decodeStudioGenerationResultEnvelope(envelope);
  assert.deepEqual(decoded.bytes, rawResult.bytes);
  assert.equal(decoded.mimeType, rawResult.mimeType);
  assert.deepEqual(decoded.usage, rawResult.usage);
  assert.equal(decoded.costUsd, rawResult.costUsd);
  assert.deepEqual(decoded.providerEvidence, providerEvidence);
  assert.deepEqual(decoded.providerEvidence?.servedModels, ["openai/gpt-image-2-2026-08-26"]);
  assert.equal(decoded.providerEvidence?.servedProvider, "openai");
  assert.equal(decoded.providerEvidence?.gatewayGenerationId, "gen_safe-1");
  assert.equal(decoded.providerEvidence?.requestId, "req_safe-1");
  assert.equal(decoded.providerEvidence?.warnings[0]?.message, null);
  assert.doesNotMatch(new TextDecoder().decode(envelope), /authorization|privatePrompt|data:image|base64,secret/);

  const tampered = JSON.parse(new TextDecoder().decode(envelope)) as { payloadBase64: string };
  tampered.payloadBase64 = Buffer.from("different bytes").toString("base64");
  assert.throws(() => decodeStudioGenerationResultEnvelope(
    new TextEncoder().encode(JSON.stringify(tampered)),
  ));
});

test("provider evidence never invents a served model when Gateway omits it", () => {
  const evidence = sanitizeStudioProviderEvidence({
    requestedModel: "openai/gpt-image-2",
    requestedProvider: "openai",
    result: { providerMetadata: { gateway: {} } },
  });
  assert.equal(evidence.requestedModel, "openai/gpt-image-2");
  assert.deepEqual(evidence.servedModels, []);
  assert.equal(evidence.servedProvider, null);
  assert.equal(evidence.gatewayGenerationId, null);
  assert.equal(evidence.requestId, null);
  assert.equal(studioPaidProviderEvidenceQuarantineReason({
    ...rawResult,
    providerEvidence: evidence,
  }, "openai/gpt-image-2"), "SERVED_MODEL_MISSING");
});

test("provider evidence quarantines warnings and served-model mismatches", () => {
  const base = sanitizeStudioProviderEvidence({
    requestedModel: "openai/gpt-image-2",
    requestedProvider: "openai",
    result: { responses: [{ modelId: "openai/gpt-image-2", headers: {} }] },
  });
  assert.equal(studioPaidProviderEvidenceQuarantineReason({
    ...rawResult,
    providerEvidence: base,
  }, "openai/gpt-image-2"), null);
  assert.equal(studioPaidProviderEvidenceQuarantineReason({
    ...rawResult,
    providerEvidence: { ...base, servedModels: ["other/model"] },
  }, "openai/gpt-image-2"), "SERVED_MODEL_MISMATCH");
  assert.equal(studioPaidProviderEvidenceQuarantineReason({
    ...rawResult,
    providerEvidence: { ...base, warnings: [{ type: "provider-warning", setting: null, message: null }] },
  }, "openai/gpt-image-2"), "PROVIDER_WARNING");
  assert.equal(studioPaidProviderEvidenceQuarantineReason({
    ...rawResult,
    providerEvidence: { ...base, servedProvider: "other-provider" },
  }, "openai/gpt-image-2", "openai"), "SERVED_PROVIDER_MISMATCH");
});

test("retained provider-result equality binds exact bytes, MIME and accounting", () => {
  assert.equal(studioGenerationProviderResultsMatch({
    ...rawResult,
    costUsd: -0,
  }, {
    ...rawResult,
    costUsd: 0,
  }), true);
  assert.equal(studioGenerationProviderResultsMatch(rawResult, {
    ...rawResult,
    usage: { outputTokens: 34, inputTokens: 12 },
  }), true);
  assert.equal(studioGenerationProviderResultsMatch(rawResult, {
    ...rawResult,
    costUsd: 0.02,
  }), false);
  assert.equal(studioGenerationProviderResultsMatch(rawResult, {
    ...rawResult,
    usage: { inputTokens: 12, outputTokens: 35 },
  }), false);
  assert.equal(studioGenerationProviderResultsMatch(rawResult, {
    ...rawResult,
    bytes: Uint8Array.from([0, 1, 2]),
  }), false);
});

test("an intake idempotency key reuses only the same normalized request intent", () => {
  const existing = {
    kind: "GARMENT" as const,
    sourceMode: "DESCRIBE" as const,
    description: "  coral wrap dress  ",
  };
  assert.equal(studioIntakeIntentMatches(existing, {
    kind: "GARMENT",
    sourceMode: "DESCRIBE",
    description: "coral wrap dress",
  }), true);
  assert.equal(studioIntakeIntentMatches(existing, {
    kind: "GARMENT",
    sourceMode: "UPLOAD",
    description: "coral wrap dress",
  }), false);
  assert.equal(studioIntakeIntentMatches(existing, {
    kind: "GARMENT",
    sourceMode: "DESCRIBE",
    description: "black wrap dress",
  }), false);
});

test("rejected and non-garment generations cannot become the current intake candidate", () => {
  const base = { operation: "GARMENT_FRONT", outputAssetId: "asset" };
  assert.equal(isEligibleStudioIntakeCandidate({ ...base, state: "COMPLETE" }), true);
  assert.equal(isEligibleStudioIntakeCandidate({ ...base, state: "APPROVED" }), true);
  assert.equal(isEligibleStudioIntakeCandidate({ ...base, state: "REJECTED" }), false);
  assert.equal(isEligibleStudioIntakeCandidate({ ...base, operation: "MODEL_TRY_ON", state: "COMPLETE" }), false);
  assert.equal(isEligibleStudioIntakeCandidate({ ...base, outputAssetId: null, state: "COMPLETE" }), false);
});

test("a reused Wear request ID rejects a mismatched semantic fingerprint", () => {
  assert.doesNotThrow(() => assertStudioGenerationRequestIdentity(
    { fingerprint: "a".repeat(64) },
    "a".repeat(64),
  ));
  assert.throws(
    () => assertStudioGenerationRequestIdentity({ fingerprint: "a".repeat(64) }, "b".repeat(64)),
    (error: unknown) => error instanceof StudioEngineError
      && error.status === 409
      && error.code === "INVALID_REQUEST",
  );
});

test("a competing active paid intent joins only the same fingerprint", () => {
  const active = { fingerprint: "a".repeat(64) };
  assert.doesNotThrow(() => assertNoConflictingActiveStudioGeneration(active, "a".repeat(64)));
  assert.throws(
    () => assertNoConflictingActiveStudioGeneration(active, "b".repeat(64)),
    (error: unknown) => error instanceof StudioEngineError
      && error.status === 409
      && error.code === "INVALID_TRANSITION",
  );
});

test("durable paid scope excludes request IDs but separates Wear authority sub-scopes", () => {
  const base = {
    intakeId: "11111111-1111-4111-8111-111111111111",
    operation: "MODEL_TRY_ON",
  };
  const first = studioPaidGenerationScopeKey({
    ...base,
    parameters: { requestId: "request-a", attempt: 1, modelProfileId: "model-a" },
  });
  const replay = studioPaidGenerationScopeKey({
    ...base,
    parameters: { requestId: "request-b", attempt: 1, modelProfileId: "model-a" },
  });
  const otherModel = studioPaidGenerationScopeKey({
    ...base,
    parameters: { requestId: "request-c", attempt: 1, modelProfileId: "model-b" },
  });
  assert.equal(first, replay);
  assert.notEqual(first, otherModel);
  assert.notEqual(first, studioPaidGenerationScopeKey({
    ...base,
    parameters: { requestId: "request-a", attempt: 2, modelProfileId: "model-a" },
  }));
});

test("decision receipts bind the exact generation, decision, and normalized note", () => {
  const decidedAt = new Date("2026-08-26T12:00:00.000Z");
  const first = buildOperatorSafeDecisionReceipt({
    generationId: "11111111-1111-4111-8111-111111111111",
    decision: "EDIT",
    note: "  fix the collar  ",
    decidedAt,
  });
  const replay = buildOperatorSafeDecisionReceipt({
    generationId: first.generationId,
    decision: "EDIT",
    note: "fix the collar",
    decidedAt,
  });
  const reject = buildOperatorSafeDecisionReceipt({
    generationId: first.generationId,
    decision: "REJECT",
    note: "fix the collar",
    decidedAt,
  });
  assert.equal(first.receiptId, replay.receiptId);
  assert.equal(first.noteSha256, replay.noteSha256);
  assert.notEqual(first.receiptId, reject.receiptId);
  assert.doesNotThrow(() => assertStudioCorrectionDecisionReceipt({
    expectedGenerationId: first.generationId,
    expectedReceiptId: first.receiptId,
    expectedCorrection: " fix the collar ",
    generationId: first.generationId,
    receipt: first,
  }));
  assert.throws(() => assertStudioCorrectionDecisionReceipt({
    expectedGenerationId: first.generationId,
    expectedReceiptId: reject.receiptId,
    expectedCorrection: "fix the collar",
    generationId: first.generationId,
    receipt: first,
  }), StudioEngineError);
  assert.throws(() => assertStudioCorrectionDecisionReceipt({
    expectedGenerationId: first.generationId,
    expectedReceiptId: first.receiptId,
    expectedCorrection: "change the silhouette",
    generationId: first.generationId,
    receipt: first,
  }), StudioEngineError);
});

test("in-flight revision replay accepts only the current revision or exact prior command", () => {
  assert.equal(studioInFlightCommandVersionMatches({
    currentVersion: 4,
    expectedVersion: 4,
    exactCommandExists: false,
  }), true);
  assert.equal(studioInFlightCommandVersionMatches({
    currentVersion: 4,
    expectedVersion: 3,
    exactCommandExists: true,
  }), true);
  assert.equal(studioInFlightCommandVersionMatches({
    currentVersion: 4,
    expectedVersion: 3,
    exactCommandExists: false,
  }), false);
  assert.equal(studioInFlightCommandVersionMatches({
    currentVersion: 4,
    expectedVersion: 2,
    exactCommandExists: true,
  }), false);
});

test("the normal intake Try again decision atomically maps COMPLETE to REJECTED and REVIEW", () => {
  assert.deepEqual(studioIntakeDecisionTransition({
    generation: { state: "COMPLETE", finalDecision: null, outputAssetId: "asset-a" },
    decision: "RETRY",
  }), {
    expectedGenerationState: "COMPLETE",
    generationState: "REJECTED",
    expectedIntakeState: "DECISION",
    intakeState: "REVIEW",
  });
});

test("immutable source binding accepts an exact replay and rejects conflicting bytes", () => {
  const intake = { sourceAssetId: "source-a", sourceSha256: "a".repeat(64) };
  assert.equal(studioSourceBindingMatches(intake, { id: "source-a", sha256: "a".repeat(64) }), true);
  assert.equal(studioSourceBindingMatches(intake, { id: "source-b", sha256: "b".repeat(64) }), false);
});

test("commit replay equality prevents concurrent facts from splitting intake and wardrobe", () => {
  const facts = {
    title: "Coral shirt",
    category: "Shirt" as const,
    colour: "Coral",
    sizeLabel: "Size on request",
    condition: "Excellent · real-worn wardrobe piece",
    price: 24_500,
  };
  const item = {
    intakeId: "intake-a",
    ...facts,
    approvedAssetId: "asset-a",
  };
  assert.equal(wardrobeCommitIntentMatches(item, {
    intakeId: "intake-a",
    facts,
    approvedAssetId: "asset-a",
  }), true);
  assert.equal(wardrobeCommitIntentMatches(item, {
    intakeId: "intake-a",
    facts: { ...facts, price: 25_000 },
    approvedAssetId: "asset-a",
  }), false);
});
