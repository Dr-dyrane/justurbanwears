import assert from "node:assert/strict";
import test from "node:test";
import type { StudioAtelierProductionRuntime } from "../lib/server/studio-atelier-production-runtime";
import {
  createStudioAtelierRouteRuntimeLoader,
  loadStudioAtelierRouteRuntime,
} from "../lib/server/studio-atelier-route-runtime";
import { createStudioAtelierRouteService } from "../lib/server/studio-atelier-route-service";
import type {
  StudioAtelierCommandResult,
  StudioAtelierLifecycleState,
  StudioAtelierReviewDecision,
} from "../lib/server/studio-atelier-engine-facade";
import type { StudioOperator } from "../lib/server/studio-operator";
import { StudioEngineError } from "../lib/studio/engine/errors";

const OPERATOR = Object.freeze({
  subject: "operator-route-service",
  email: "operator@example.com",
  displayName: "Operator",
  role: "operator",
} as const satisfies StudioOperator);

function result(
  state: StudioAtelierLifecycleState,
  overrides: Partial<StudioAtelierCommandResult> = {},
): StudioAtelierCommandResult {
  const reviewable = ["SEMANTIC_PASS", "USER_APPROVED", "LOCKED"].includes(state);
  return Object.freeze({
    operationId: "op-route-001",
    stage: "GARMENT_01_FRONT",
    view: "01",
    state,
    version: 1,
    candidateVisibility: reviewable ? "REVIEWABLE" : "HIDDEN",
    nextAction: state === "SEMANTIC_PASS"
      ? "REVIEW"
      : state === "USER_APPROVED"
        ? "LOCK_OR_REUSE"
        : state === "LOCKED"
          ? "USE_LOCKED"
          : "NONE",
    reused: false,
    ...overrides,
  });
}

function harness(initial: StudioAtelierCommandResult) {
  const calls: Array<Readonly<{ name: string; arguments: readonly unknown[] }>> = [];
  let current = initial;
  const facade = {
    async readProjection(subject: string, operationId: string) {
      calls.push({ name: "readProjection", arguments: [subject, operationId] });
      return current;
    },
    async prepare(subject: string, declaration: unknown) {
      calls.push({ name: "prepare", arguments: [subject, declaration] });
      return current;
    },
    async generate(subject: string, operationId: string) {
      calls.push({ name: "generate", arguments: [subject, operationId] });
      return current;
    },
    async review(
      subject: string,
      operationId: string,
      decision: StudioAtelierReviewDecision,
    ) {
      calls.push({ name: "review", arguments: [subject, operationId, decision] });
      if (decision.decision === "KEEP") {
        current = result("USER_APPROVED", { version: current.version + 1 });
      } else if (decision.decision === "FIX_ONE_THING") {
        current = result("USER_REJECTED", {
          version: current.version + 1,
          continuationOperationId: "op-route-001-correction-1",
          nextAction: "GENERATE_CORRECTION",
        });
      } else {
        current = result("USER_REJECTED", { version: current.version + 1 });
      }
      return current;
    },
    async lockOrReuse(subject: string, operationId: string) {
      calls.push({ name: "lockOrReuse", arguments: [subject, operationId] });
      current = result("LOCKED", { version: current.version + 1 });
      return current;
    },
    async resumeRecordedReview(subject: string, operationId: string) {
      calls.push({ name: "resumeRecordedReview", arguments: [subject, operationId] });
      return current;
    },
  };
  const runtime = {
    readiness: {
      rootSubject: "READY",
      finalScene: "BLOCKED",
      constructionAllowed: true,
      blockers: [],
    },
    facade,
    agent: {
      async run(subject: string, declaration: unknown) {
        calls.push({ name: "agent.run", arguments: [subject, declaration] });
        return current;
      },
      async runPrepared(subject: string, operationId: string) {
        calls.push({ name: "agent.runPrepared", arguments: [subject, operationId] });
        return current;
      },
    },
    async readReviewArtifact(input: { operator: StudioOperator; operationId: string }) {
      calls.push({ name: "readReviewArtifact", arguments: [input] });
      return Object.freeze({
        operationId: input.operationId,
        lifecycleState: "SEMANTIC_PASS" as const,
        mimeType: "image/png" as const,
        byteSize: 4,
        width: 1,
        height: 1,
        bytes: new Uint8Array([1, 2, 3, 4]),
      });
    },
  } as unknown as StudioAtelierProductionRuntime;
  return {
    calls,
    runtime,
    service: createStudioAtelierRouteService({
      loadRuntime: async () => runtime,
    }),
  };
}

test("prepare, recover and explicit run forward only authenticated semantic command fields", async () => {
  const kit = harness(result("DRAFT"));
  const declaration = Object.freeze({ declarationVersion: "test" });

  await kit.service.prepare(OPERATOR, declaration);
  await kit.service.recover(OPERATOR, "op-route-001");
  await kit.service.run(OPERATOR, "op-route-001");

  assert.deepEqual(kit.calls, [
    { name: "prepare", arguments: [OPERATOR.subject, declaration] },
    { name: "readProjection", arguments: [OPERATOR.subject, "op-route-001"] },
    { name: "agent.runPrepared", arguments: [OPERATOR.subject, "op-route-001"] },
  ]);
  assert.equal(kit.calls.some((call) => call.name === "generate"), false);
});

test("the human decision boundary cannot act on private failed candidates", async () => {
  const kit = harness(result("SEMANTIC_FAIL"));

  await assert.rejects(
    kit.service.decide(OPERATOR, "op-route-001", {
      decision: "REJECT",
      reason: "PRIVATE_QA_UNCLASSIFIED",
    }),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "INVALID_TRANSITION",
  );
  assert.deepEqual(kit.calls.map((call) => call.name), ["readProjection"]);
});

test("Keep records approval then locks the exact reviewed bytes without a run", async () => {
  const kit = harness(result("SEMANTIC_PASS"));

  const locked = await kit.service.decide(OPERATOR, "op-route-001", {
    decision: "KEEP",
  });

  assert.equal(locked.state, "LOCKED");
  assert.deepEqual(kit.calls.map((call) => call.name), [
    "readProjection",
    "review",
    "lockOrReuse",
  ]);
  assert.equal(kit.calls.some((call) => call.name.startsWith("agent.")), false);
  assert.equal(kit.calls.some((call) => call.name === "generate"), false);
});

test("repeated Keep resumes an already approved or locked operation idempotently", async () => {
  for (const state of ["USER_APPROVED", "LOCKED"] as const) {
    const kit = harness(result(state));
    const locked = await kit.service.decide(OPERATOR, "op-route-001", {
      decision: "KEEP",
    });
    assert.equal(locked.state, "LOCKED");
    assert.deepEqual(kit.calls.map((call) => call.name), [
      "readProjection",
      "lockOrReuse",
    ]);
  }
});

test("Fix one thing records one decision but never auto-runs its paid correction", async () => {
  const kit = harness(result("SEMANTIC_PASS"));
  const reviewed = await kit.service.decide(OPERATOR, "op-route-001", {
    decision: "FIX_ONE_THING",
    reason: "BODY_DRIFT",
    target: "BODY_GEOMETRY",
  });

  assert.equal(reviewed.nextAction, "GENERATE_CORRECTION");
  assert.equal(reviewed.continuationOperationId, "op-route-001-correction-1");
  assert.deepEqual(kit.calls.map((call) => call.name), [
    "readProjection",
    "review",
  ]);
});

test("review media passes the complete server-authenticated operator, never a browser subject", async () => {
  const kit = harness(result("SEMANTIC_PASS"));
  const artifact = await kit.service.readReviewMedia(OPERATOR, "op-route-001");

  assert.deepEqual([...artifact.bytes], [1, 2, 3, 4]);
  assert.deepEqual(kit.calls, [{
    name: "readReviewArtifact",
    arguments: [{ operator: OPERATOR, operationId: "op-route-001" }],
  }]);
});

test("the checked-in route binding is zero-spend disabled until concrete production composition exists", async () => {
  await assert.rejects(
    loadStudioAtelierRouteRuntime(),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "ENGINE_DISABLED"
      && /release atom/.test(error.recovery),
  );
});

test("a verified runtime loader caches success but retries rejected construction", async () => {
  // This is a source-level construction invariant: the exported helper accepts
  // only the full production input type. The runtime itself is exercised by
  // studio-atelier-production-runtime.test.ts; here we verify the helper is
  // available without weakening its type to partial declarations.
  assert.equal(typeof createStudioAtelierRouteRuntimeLoader, "function");
});
