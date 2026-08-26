import assert from "node:assert/strict";
import test from "node:test";
import {
  createStudioAtelierLedgerFailureResolver,
} from "../lib/server/studio-atelier-private-failure-resolver";
import type { AtelierLifecycleEventRow } from "../lib/server/studio-atelier-repository";

const OPERATOR = "operator-private-failure";
const OPERATION_ID = "11111111-1111-4111-8111-111111111111";
const HASH = "a".repeat(64);

function event(
  eventType: "TECHNICAL_FAIL" | "SEMANTIC_FAIL",
  reasonCode: string,
  evidence: Record<string, unknown> = {
    aggregateDecision: "FAIL",
    failedChecks: ["semanticGates.identity"],
    evaluationHash: HASH,
  },
): AtelierLifecycleEventRow {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    operationId: OPERATION_ID,
    sequence: 3,
    eventType,
    expectedVersion: 2,
    resultingVersion: 3,
    executionId: "33333333-3333-4333-8333-333333333333",
    artifactId: "44444444-4444-4444-8444-444444444444",
    actorSubject: eventType === "TECHNICAL_FAIL"
      ? "system:atelier-technical-qa"
      : "system:atelier-semantic-qa",
    payload: { reasonCode, evidence },
    previousEventHash: HASH,
    eventHash: "b".repeat(64),
    createdAt: new Date("2026-08-26T12:00:00.000Z"),
  } as AtelierLifecycleEventRow;
}

function input(
  state: "TECHNICAL_FAIL" | "SEMANTIC_FAIL",
  stage: "SUBJECT_A" | "ROOM_FINAL_05" = "SUBJECT_A",
) {
  return {
    operatorSubject: OPERATOR,
    operationId: OPERATION_ID,
    stage,
    view: stage === "ROOM_FINAL_05" ? "05" as const : "SUBJECT" as const,
    state,
    correction: false,
  };
}

test("the persisted first ordered semantic failure derives one bounded correction", async () => {
  const calls: Array<Record<string, string>> = [];
  const resolve = createStudioAtelierLedgerFailureResolver({
    listEvents: async (scope) => {
      calls.push(scope);
      return [
        event("SEMANTIC_FAIL", "SEMANTIC_IDENTITY_FAILED"),
      ];
    },
  });

  assert.deepEqual(await resolve(input("SEMANTIC_FAIL")), {
    decision: "FIX_ONE_THING",
    reason: "IDENTITY_DRIFT",
    target: "FACE_TRANSLATION",
  });
  assert.deepEqual(calls, [{
    operatorSubject: OPERATOR,
    operationId: OPERATION_ID,
  }]);
});

test("technical output-contract failure maps to one output-only correction", async () => {
  const resolve = createStudioAtelierLedgerFailureResolver({
    listEvents: async () => [
      event("TECHNICAL_FAIL", "TECHNICAL_OUTPUT_CONTRACT_FAILED", {
        aggregateDecision: "FAIL",
        failedChecks: ["outputContract"],
        evaluationHash: HASH,
      }),
    ],
  });
  assert.deepEqual(await resolve(input("TECHNICAL_FAIL")), {
    decision: "FIX_ONE_THING",
    reason: "WRONG_STAGE_VIEW",
    target: "OUTPUT_GEOMETRY",
  });
});

test("ROOM_FINAL_05 rejects every mapped correction outside its mutable stage contract", async (t) => {
  const incompatibleReasons = [
    "SEMANTIC_IDENTITY_FAILED",
    "SEMANTIC_CONNECTED_BODY_GEOMETRY_FAILED",
    "SEMANTIC_GARMENT_TRUTH_FAILED",
    "SEMANTIC_GARMENT_TEXTURE_FAILED",
    "SEMANTIC_HAIR_FAILED",
    "SEMANTIC_ATELIER_BRAND_FAILED",
    "SEMANTIC_VIEW_GRAMMAR_FAILED",
    "SEMANTIC_LIGHTING_INTEGRATION_FAILED",
    "SEMANTIC_OPTICS_PERSPECTIVE_FAILED",
    "SEMANTIC_FULL_FRAME_FORMAT_FAILED",
  ] as const;

  for (const reasonCode of incompatibleReasons) {
    await t.test(reasonCode, async () => {
      const resolve = createStudioAtelierLedgerFailureResolver({
        listEvents: async () => [event("SEMANTIC_FAIL", reasonCode)],
      });
      assert.equal(
        await resolve(input("SEMANTIC_FAIL", "ROOM_FINAL_05")),
        null,
      );
    });
  }
});

test("a failure event of the wrong QA phase cannot authorize a correction", async () => {
  const resolve = createStudioAtelierLedgerFailureResolver({
    listEvents: async () => [event("TECHNICAL_FAIL", "TECHNICAL_OUTPUT_CONTRACT_FAILED")],
  });
  assert.equal(await resolve(input("SEMANTIC_FAIL")), null);
});

test("unmapped integrity/provenance failures remain unclassified and zero-spend", async () => {
  const resolve = createStudioAtelierLedgerFailureResolver({
    listEvents: async () => [
      event("SEMANTIC_FAIL", "SEMANTIC_PRIVACY_PROVENANCE_FAILED"),
    ],
  });
  assert.equal(await resolve(input("SEMANTIC_FAIL")), null);
});

test("authority and lineage failures hard-block private correction", async (t) => {
  const zeroSpendReasonCodes = [
    "SEMANTIC_DIRECT_GARMENT_AUTHORITY_FAILED",
    "SEMANTIC_CURRENT_GARMENT_LINEAGE_FAILED",
    "SEMANTIC_REAL_IDENTITY_AUTHORITY_FAILED",
    "SEMANTIC_REAL_BODY_AUTHORITY_FAILED",
    "SEMANTIC_LOCKED_ROOM_AUTHORITY_FAILED",
    "SEMANTIC_MULTI_ERA_BASELINE_FAILED",
  ] as const;

  for (const reasonCode of zeroSpendReasonCodes) {
    await t.test(reasonCode, async () => {
      const resolve = createStudioAtelierLedgerFailureResolver({
        listEvents: async () => [event("SEMANTIC_FAIL", reasonCode)],
      });

      assert.equal(await resolve(input("SEMANTIC_FAIL")), null);
    });
  }
});

test("malformed or non-failing evidence cannot authorize a correction", async () => {
  const invalidEvidence = [
    {},
    { aggregateDecision: "PASS", failedChecks: [], evaluationHash: HASH },
    { aggregateDecision: "FAIL", failedChecks: [], evaluationHash: HASH },
    { aggregateDecision: "FAIL", failedChecks: ["identity"], evaluationHash: "bad" },
  ];
  for (const evidence of invalidEvidence) {
    const resolve = createStudioAtelierLedgerFailureResolver({
      listEvents: async () => [
        event("SEMANTIC_FAIL", "SEMANTIC_IDENTITY_FAILED", evidence),
      ],
    });
    assert.equal(await resolve(input("SEMANTIC_FAIL")), null);
  }
});
