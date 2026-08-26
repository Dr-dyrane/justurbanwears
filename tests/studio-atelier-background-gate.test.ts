import assert from "node:assert/strict";
import test from "node:test";
import {
  createStudioAtelierBackgroundGate,
  type StudioAtelierPrivateCorrectionDecision,
} from "../lib/server/studio-atelier-background-gate";
import type {
  StudioAtelierCommandResult,
  StudioAtelierEngineFacade,
  StudioAtelierLifecycleState,
  StudioAtelierNextAction,
} from "../lib/server/studio-atelier-engine-facade";
import { StudioEngineError } from "../lib/studio/engine/errors";
import { studioAtelierCandidateVisibility } from "../lib/server/studio-atelier-candidate-visibility";
import { createStudioAtelierLedgerFailureResolver } from "../lib/server/studio-atelier-private-failure-resolver";
import type { AtelierLifecycleEventRow } from "../lib/server/studio-atelier-repository";

const OPERATOR = "operator-background-gate";
const ROOT = "atelier-operation-025-subject-a";
const CORRECTION = `${ROOT}-correction-1`;
const FIX_IDENTITY: StudioAtelierPrivateCorrectionDecision = {
  decision: "FIX_ONE_THING",
  reason: "IDENTITY_DRIFT",
  target: "FACE_TRANSLATION",
};
const FIX_BODY: StudioAtelierPrivateCorrectionDecision = {
  decision: "FIX_ONE_THING",
  reason: "BODY_DRIFT",
  target: "BODY_GEOMETRY",
};

function result(
  state: StudioAtelierLifecycleState,
  operationId = ROOT,
  nextAction: StudioAtelierNextAction = state === "DRAFT"
    ? "GENERATE"
    : state === "SEMANTIC_PASS"
    ? "REVIEW"
    : state === "BLOCKED_USER_DIRECTION"
    ? "USER_DIRECTION_REQUIRED"
    : "REVIEW",
  continuationOperationId?: string,
): StudioAtelierCommandResult {
  return Object.freeze({
    operationId,
    stage: "SUBJECT_A",
    view: "SUBJECT",
    state,
    version: 0,
    candidateVisibility: studioAtelierCandidateVisibility(state),
    nextAction,
    reused: false,
    ...(continuationOperationId ? { continuationOperationId } : {}),
  });
}

function roomResult(
  state: StudioAtelierLifecycleState,
  operationId = ROOT,
  nextAction: StudioAtelierNextAction = state === "BLOCKED_USER_DIRECTION"
    ? "USER_DIRECTION_REQUIRED"
    : "REVIEW",
): StudioAtelierCommandResult {
  return Object.freeze({
    ...result(state, operationId, nextAction),
    stage: "ROOM_FINAL_05",
    view: "05",
  });
}

function semanticFailureEvent(reasonCode: string): AtelierLifecycleEventRow {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    operationId: ROOT,
    sequence: 3,
    eventType: "SEMANTIC_FAIL",
    expectedVersion: 2,
    resultingVersion: 3,
    executionId: "33333333-3333-4333-8333-333333333333",
    artifactId: "44444444-4444-4444-8444-444444444444",
    actorSubject: "system:atelier-semantic-qa",
    payload: {
      reasonCode,
      evidence: {
        aggregateDecision: "FAIL",
        failedChecks: ["semanticGates.identity"],
        evaluationHash: "a".repeat(64),
      },
    },
    previousEventHash: "a".repeat(64),
    eventHash: "b".repeat(64),
    createdAt: new Date("2026-08-26T12:00:00.000Z"),
  } as AtelierLifecycleEventRow;
}

function mockEngine(input: {
  prepared?: StudioAtelierCommandResult;
  generated: Array<StudioAtelierCommandResult | Error>;
  reviewed?: StudioAtelierCommandResult[];
  resumed?: StudioAtelierCommandResult[];
  delayGenerate?: () => Promise<void>;
}) {
  const calls = {
    prepare: 0,
    read: [] as string[],
    generate: [] as string[],
    review: [] as Array<{ operationId: string; decision: unknown }>,
    resumeReview: [] as string[],
    lock: 0,
  };
  const generated = [...input.generated];
  const reviewed = [...(input.reviewed ?? [])];
  const resumed = [...(input.resumed ?? [])];
  const engine: StudioAtelierEngineFacade = {
    async readProjection(_operatorSubject, operationId) {
      calls.read.push(operationId);
      return input.prepared ?? result("DRAFT");
    },
    async prepare() {
      calls.prepare += 1;
      return input.prepared ?? result("DRAFT");
    },
    async generate(_operatorSubject, operationId) {
      calls.generate.push(operationId);
      await input.delayGenerate?.();
      const next = generated.shift();
      if (!next) throw new Error("Unexpected generate call.");
      if (next instanceof Error) throw next;
      return next;
    },
    async review(_operatorSubject, operationId, decision) {
      calls.review.push({ operationId, decision });
      const next = reviewed.shift();
      if (!next) throw new Error("Unexpected review call.");
      return next;
    },
    async lockOrReuse() {
      calls.lock += 1;
      throw new Error("The background gate must never lock for the user.");
    },
    async resumeRecordedReview(_operatorSubject, operationId) {
      calls.resumeReview.push(operationId);
      const next = resumed.shift();
      if (!next) throw new Error("Unexpected recorded-review resume.");
      return next;
    },
  };
  return { engine, calls };
}

test("a first-pass candidate stays server-only until semantic pass", async () => {
  const harness = mockEngine({ generated: [result("SEMANTIC_PASS")] });
  let classifierCalls = 0;
  const gate = createStudioAtelierBackgroundGate({
    engine: harness.engine,
    resolvePrivateFailure: () => {
      classifierCalls += 1;
      return FIX_IDENTITY;
    },
  });

  const passed = await gate.run(OPERATOR, { stage: "SUBJECT_A" });
  assert.equal(passed.state, "SEMANTIC_PASS");
  assert.deepEqual(harness.calls.generate, [ROOT]);
  assert.equal(classifierCalls, 0);
  assert.equal(harness.calls.review.length, 0);
  assert.equal(harness.calls.lock, 0);
  assert.equal("artifactUrl" in passed, false);
  assert.equal("outputUrl" in passed, false);
});

test("one private failure creates one idempotent correction and rechecks it", async () => {
  const harness = mockEngine({
    generated: [
      result("SEMANTIC_FAIL"),
      result("SEMANTIC_PASS", CORRECTION),
    ],
    reviewed: [
      result("SEMANTIC_FAIL", ROOT, "GENERATE_CORRECTION", CORRECTION),
    ],
  });
  const gate = createStudioAtelierBackgroundGate({
    engine: harness.engine,
    resolvePrivateFailure: createStudioAtelierLedgerFailureResolver({
      listEvents: async () => [semanticFailureEvent("SEMANTIC_IDENTITY_FAILED")],
    }),
  });

  const passed = await gate.run(OPERATOR, { stage: "SUBJECT_A" });
  assert.equal(passed.state, "SEMANTIC_PASS");
  assert.equal(passed.operationId, CORRECTION);
  assert.deepEqual(harness.calls.generate, [ROOT, CORRECTION]);
  assert.deepEqual(harness.calls.review, [{ operationId: ROOT, decision: FIX_IDENTITY }]);
  assert.equal(harness.calls.lock, 0);
});

test("ROOM_FINAL_05 identity failure blocks before correction authorization or continuation spend", async () => {
  const harness = mockEngine({
    generated: [roomResult("SEMANTIC_FAIL")],
    reviewed: [roomResult("BLOCKED_USER_DIRECTION")],
  });
  const gate = createStudioAtelierBackgroundGate({
    engine: harness.engine,
    resolvePrivateFailure: createStudioAtelierLedgerFailureResolver({
      listEvents: async () => [semanticFailureEvent("SEMANTIC_IDENTITY_FAILED")],
    }),
  });

  const blocked = await gate.run(OPERATOR, { stage: "ROOM_FINAL_05" });
  assert.equal(blocked.state, "BLOCKED_USER_DIRECTION");
  assert.equal(blocked.continuationOperationId, undefined);
  assert.deepEqual(harness.calls.generate, [ROOT]);
  assert.deepEqual(harness.calls.review, [{
    operationId: ROOT,
    decision: {
      decision: "REJECT",
      reason: "PRIVATE_QA_UNCLASSIFIED",
    },
  }]);
  assert.equal(harness.calls.lock, 0);
});

test("a second failure records the exhausted correction and never spends a third time", async () => {
  const harness = mockEngine({
    generated: [
      result("SEMANTIC_FAIL"),
      result("SEMANTIC_FAIL", CORRECTION),
    ],
    reviewed: [
      result("SEMANTIC_FAIL", ROOT, "GENERATE_CORRECTION", CORRECTION),
      result("BLOCKED_USER_DIRECTION", CORRECTION),
    ],
  });
  const decisions = [FIX_IDENTITY, FIX_BODY];
  const gate = createStudioAtelierBackgroundGate({
    engine: harness.engine,
    resolvePrivateFailure: () => decisions.shift() ?? null,
  });

  const blocked = await gate.run(OPERATOR, { stage: "SUBJECT_A" });
  assert.equal(blocked.state, "BLOCKED_USER_DIRECTION");
  assert.deepEqual(harness.calls.generate, [ROOT, CORRECTION]);
  assert.deepEqual(harness.calls.review, [
    { operationId: ROOT, decision: FIX_IDENTITY },
    { operationId: CORRECTION, decision: FIX_BODY },
  ]);
  assert.equal(harness.calls.lock, 0);
});

test("an unclassified second failure is durably blocked without a third spend", async () => {
  const harness = mockEngine({
    generated: [
      result("SEMANTIC_FAIL"),
      result("SEMANTIC_FAIL", CORRECTION),
    ],
    reviewed: [
      result("SEMANTIC_FAIL", ROOT, "GENERATE_CORRECTION", CORRECTION),
      result("BLOCKED_USER_DIRECTION", CORRECTION),
    ],
  });
  let classifications = 0;
  const gate = createStudioAtelierBackgroundGate({
    engine: harness.engine,
    resolvePrivateFailure: () => {
      classifications += 1;
      return classifications === 1 ? FIX_IDENTITY : null;
    },
  });

  const blocked = await gate.run(OPERATOR, { stage: "SUBJECT_A" });
  assert.equal(blocked.state, "BLOCKED_USER_DIRECTION");
  assert.deepEqual(harness.calls.generate, [ROOT, CORRECTION]);
  assert.deepEqual(harness.calls.review, [
    { operationId: ROOT, decision: FIX_IDENTITY },
    {
      operationId: CORRECTION,
      decision: {
        decision: "REJECT",
        reason: "PRIVATE_QA_UNCLASSIFIED",
      },
    },
  ]);
  assert.equal(harness.calls.lock, 0);
});

test("an unclassified private failure is durably blocked without another provider call", async () => {
  const harness = mockEngine({
    generated: [result("TECHNICAL_FAIL")],
    reviewed: [result("BLOCKED_USER_DIRECTION")],
  });
  const gate = createStudioAtelierBackgroundGate({
    engine: harness.engine,
    resolvePrivateFailure: () => null,
  });

  const blocked = await gate.run(OPERATOR, { stage: "SUBJECT_A" });
  assert.equal(blocked.state, "BLOCKED_USER_DIRECTION");
  assert.deepEqual(harness.calls.generate, [ROOT]);
  assert.deepEqual(harness.calls.review, [{
    operationId: ROOT,
    decision: {
      decision: "REJECT",
      reason: "PRIVATE_QA_UNCLASSIFIED",
    },
  }]);
  assert.equal(harness.calls.lock, 0);
});

test("a private classifier outage is durably blocked without another provider call", async () => {
  const harness = mockEngine({
    generated: [result("SEMANTIC_FAIL")],
    reviewed: [result("BLOCKED_USER_DIRECTION")],
  });
  const gate = createStudioAtelierBackgroundGate({
    engine: harness.engine,
    resolvePrivateFailure: () => {
      throw new Error("classifier unavailable");
    },
  });

  const blocked = await gate.run(OPERATOR, { stage: "SUBJECT_A" });
  assert.equal(blocked.state, "BLOCKED_USER_DIRECTION");
  assert.deepEqual(harness.calls.generate, [ROOT]);
  assert.equal(harness.calls.review.length, 1);
});

test("an indeterminate provider result cannot trigger an automatic reinvocation", async () => {
  const providerError = new StudioEngineError(
    "ENGINE_UNAVAILABLE",
    503,
    "The provider outcome is indeterminate.",
    "Reconcile the durable provider result before continuing.",
  );
  const harness = mockEngine({ generated: [providerError] });
  const gate = createStudioAtelierBackgroundGate({
    engine: harness.engine,
    resolvePrivateFailure: () => FIX_IDENTITY,
  });

  await assert.rejects(
    () => gate.run(OPERATOR, { stage: "SUBJECT_A" }),
    (error: unknown) => error === providerError,
  );
  assert.deepEqual(harness.calls.generate, [ROOT]);
  assert.equal(harness.calls.review.length, 0);
  assert.equal(harness.calls.lock, 0);
});

test("a correction must have a distinct semantic operation identity", async () => {
  const harness = mockEngine({
    generated: [result("SEMANTIC_FAIL")],
    reviewed: [result("SEMANTIC_FAIL", ROOT, "GENERATE_CORRECTION", ROOT)],
  });
  const gate = createStudioAtelierBackgroundGate({
    engine: harness.engine,
    resolvePrivateFailure: () => FIX_IDENTITY,
  });

  await assert.rejects(
    () => gate.run(OPERATOR, { stage: "SUBJECT_A" }),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "ENGINE_UNAVAILABLE"
      && /distinct semantic correction/i.test(error.message),
  );
  assert.deepEqual(harness.calls.generate, [ROOT]);
  assert.equal(harness.calls.review.length, 1);
});

test("reload resumes an already-authorized correction without another failure decision", async () => {
  const harness = mockEngine({
    prepared: result("SEMANTIC_FAIL", ROOT, "GENERATE_CORRECTION", CORRECTION),
    generated: [result("SEMANTIC_PASS", CORRECTION)],
  });
  let classifierCalls = 0;
  const gate = createStudioAtelierBackgroundGate({
    engine: harness.engine,
    resolvePrivateFailure: () => {
      classifierCalls += 1;
      return FIX_IDENTITY;
    },
  });

  const passed = await gate.run(OPERATOR, { stage: "SUBJECT_A" });
  assert.equal(passed.state, "SEMANTIC_PASS");
  assert.deepEqual(harness.calls.generate, [CORRECTION]);
  assert.equal(classifierCalls, 0);
  assert.equal(harness.calls.review.length, 0);
});

test("runPrepared starts from the read-only projection without preparing again", async () => {
  const harness = mockEngine({ generated: [result("SEMANTIC_PASS")] });
  const gate = createStudioAtelierBackgroundGate({
    engine: harness.engine,
    resolvePrivateFailure: () => FIX_IDENTITY,
  });

  const passed = await gate.runPrepared(OPERATOR, ROOT);

  assert.equal(passed.state, "SEMANTIC_PASS");
  assert.deepEqual(harness.calls.read, [ROOT]);
  assert.equal(harness.calls.prepare, 0);
  assert.deepEqual(harness.calls.generate, [ROOT]);
  assert.equal(harness.calls.review.length, 0);
});

test("runPrepared reuses an existing semantic pass without generation", async () => {
  const harness = mockEngine({
    prepared: result("SEMANTIC_PASS"),
    generated: [],
  });
  const gate = createStudioAtelierBackgroundGate({
    engine: harness.engine,
    resolvePrivateFailure: () => FIX_IDENTITY,
  });

  const passed = await gate.runPrepared(OPERATOR, ROOT);

  assert.equal(passed.state, "SEMANTIC_PASS");
  assert.equal(passed.candidateVisibility, "REVIEWABLE");
  assert.deepEqual(harness.calls.read, [ROOT]);
  assert.equal(harness.calls.prepare, 0);
  assert.deepEqual(harness.calls.generate, []);
  assert.equal("artifactUrl" in passed, false);
});

test("runPrepared repairs a stored FIX review checkpoint without exposing or resending its decision", async () => {
  const harness = mockEngine({
    prepared: result("USER_REJECTED", ROOT, "RESUME_RECORDED_REVIEW"),
    generated: [result("SEMANTIC_PASS", CORRECTION)],
    resumed: [result("USER_REJECTED", ROOT, "GENERATE_CORRECTION", CORRECTION)],
  });
  let classifierCalls = 0;
  const gate = createStudioAtelierBackgroundGate({
    engine: harness.engine,
    resolvePrivateFailure: () => {
      classifierCalls += 1;
      return FIX_BODY;
    },
  });

  const passed = await gate.runPrepared(OPERATOR, ROOT);

  assert.equal(passed.state, "SEMANTIC_PASS");
  assert.equal(passed.operationId, CORRECTION);
  assert.deepEqual(harness.calls.resumeReview, [ROOT]);
  assert.deepEqual(harness.calls.generate, [CORRECTION]);
  assert.equal(harness.calls.review.length, 0);
  assert.equal(classifierCalls, 0);
  assert.equal("reviewDecision" in passed, false);
});

test("runPrepared cannot spend beyond a prepared correction failure", async () => {
  const harness = mockEngine({
    prepared: result("SEMANTIC_FAIL", CORRECTION),
    generated: [],
    reviewed: [result("BLOCKED_USER_DIRECTION", CORRECTION)],
  });
  const gate = createStudioAtelierBackgroundGate({
    engine: harness.engine,
    resolvePrivateFailure: () => FIX_BODY,
  });

  const blocked = await gate.runPrepared(OPERATOR, CORRECTION);

  assert.equal(blocked.state, "BLOCKED_USER_DIRECTION");
  assert.deepEqual(harness.calls.read, [CORRECTION]);
  assert.equal(harness.calls.prepare, 0);
  assert.deepEqual(harness.calls.generate, []);
  assert.deepEqual(harness.calls.review, [{
    operationId: CORRECTION,
    decision: FIX_BODY,
  }]);
});

test("concurrent background runs join after durable prepare", async () => {
  let release!: () => void;
  const pause = new Promise<void>((resolve) => { release = resolve; });
  const harness = mockEngine({
    generated: [result("SEMANTIC_PASS")],
    delayGenerate: () => pause,
  });
  const gate = createStudioAtelierBackgroundGate({
    engine: harness.engine,
    resolvePrivateFailure: () => FIX_IDENTITY,
  });

  const first = gate.run(OPERATOR, { stage: "SUBJECT_A" });
  const second = gate.run(OPERATOR, { stage: "SUBJECT_A" });
  await new Promise((resolve) => setImmediate(resolve));
  release();
  const [left, right] = await Promise.all([first, second]);
  assert.equal(left.state, "SEMANTIC_PASS");
  assert.equal(right.state, "SEMANTIC_PASS");
  assert.deepEqual(harness.calls.generate, [ROOT]);
  assert.equal(harness.calls.prepare, 2);
});

test("concurrent runPrepared calls join one facade generation", async () => {
  let release!: () => void;
  const pause = new Promise<void>((resolve) => { release = resolve; });
  const harness = mockEngine({
    generated: [result("SEMANTIC_PASS")],
    delayGenerate: () => pause,
  });
  const gate = createStudioAtelierBackgroundGate({
    engine: harness.engine,
    resolvePrivateFailure: () => FIX_IDENTITY,
  });

  const first = gate.runPrepared(OPERATOR, ROOT);
  const second = gate.runPrepared(OPERATOR, ROOT);
  await new Promise((resolve) => setImmediate(resolve));
  release();
  const [left, right] = await Promise.all([first, second]);

  assert.equal(left.state, "SEMANTIC_PASS");
  assert.equal(right.state, "SEMANTIC_PASS");
  assert.deepEqual(harness.calls.read, [ROOT, ROOT]);
  assert.deepEqual(harness.calls.generate, [ROOT]);
  assert.equal(harness.calls.prepare, 0);
});
