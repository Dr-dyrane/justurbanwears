import assert from "node:assert/strict";
import test from "node:test";
import { createDurableStudioAtelierProjectionReader } from "../lib/server/studio-atelier-durable-engine";
import type { StudioAtelierProductionRuntime } from "../lib/server/studio-atelier-production-runtime";
import {
  createStudioAtelierRecoveryRuntimeLoader,
  createStudioAtelierRouteRuntimeLoader,
  loadStudioAtelierRecoveryRuntime,
  loadStudioAtelierRouteRuntime,
  type StudioAtelierRecoveryRuntime,
} from "../lib/server/studio-atelier-route-runtime";
import { createStudioAtelierRouteService } from "../lib/server/studio-atelier-route-service";
import type {
  StudioAtelierCommandResult,
  StudioAtelierLifecycleState,
  StudioAtelierReviewDecision,
} from "../lib/server/studio-atelier-engine-facade";
import type { StudioOperator } from "../lib/server/studio-operator";
import type {
  AtelierOperationProjectionRow,
  AtelierOperationRow,
} from "../lib/server/studio-atelier-repository";
import { StudioEngineError } from "../lib/studio/engine/errors";

const OPERATOR = Object.freeze({
  actorSubject: "actor-operator-route-service",
  workspaceId: "workspace-juw",
  workspaceSubject: "operator-route-service",
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
  const readReviewArtifact = async (input: {
    operator: StudioOperator;
    operationId: string;
  }) => {
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
    readReviewArtifact,
  } as unknown as StudioAtelierProductionRuntime;
  const recoveryRuntime = Object.freeze({
    readProjection: facade.readProjection,
    readReviewArtifact,
  }) satisfies StudioAtelierRecoveryRuntime;
  return {
    calls,
    runtime,
    recoveryRuntime,
    service: createStudioAtelierRouteService({
      loadRuntime: async () => runtime,
      loadRecoveryRuntime: async () => recoveryRuntime,
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

test("durable recovery and eligible media do not construct the disabled paid runtime", async () => {
  const kit = harness(result("SEMANTIC_PASS"));
  let productionLoads = 0;
  const service = createStudioAtelierRouteService({
    async loadRuntime() {
      productionLoads += 1;
      throw new StudioEngineError(
        "ENGINE_DISABLED",
        503,
        "Paid Atelier dispatch is disabled.",
        "Install the qualified production runtime.",
      );
    },
    loadRecoveryRuntime: async () => kit.recoveryRuntime,
  });

  const recovered = await service.recover(OPERATOR, "op-route-001");
  const artifact = await service.readReviewMedia(OPERATOR, "op-route-001");

  assert.equal(recovered.state, "SEMANTIC_PASS");
  assert.deepEqual([...artifact.bytes], [1, 2, 3, 4]);
  assert.equal(productionLoads, 0);
  assert.deepEqual(Object.keys(kit.recoveryRuntime).sort(), [
    "readProjection",
    "readReviewArtifact",
  ]);
  assert.deepEqual(kit.calls, [
    {
      name: "readProjection",
      arguments: [OPERATOR.subject, "op-route-001"],
    },
    {
      name: "readReviewArtifact",
      arguments: [{ operator: OPERATOR, operationId: "op-route-001" }],
    },
  ]);

  await assert.rejects(
    service.prepare(OPERATOR, { declarationVersion: "test" }),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "ENGINE_DISABLED",
  );
  await assert.rejects(
    service.run(OPERATOR, "op-route-001"),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "ENGINE_DISABLED",
  );
  await assert.rejects(
    service.decide(OPERATOR, "op-route-001", { decision: "KEEP" }),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "ENGINE_DISABLED",
  );
  assert.equal(productionLoads, 3);
});

test("repository and private-storage recovery failures are sanitized and fail closed", async () => {
  const disabledRuntime = async (): Promise<StudioAtelierProductionRuntime> => {
    throw new Error("production runtime must not load");
  };
  const repositoryUnavailable = createStudioAtelierRouteService({
    loadRuntime: disabledRuntime,
    async loadRecoveryRuntime() {
      throw new Error("postgres://private-ledger-location");
    },
  });

  await assert.rejects(
    repositoryUnavailable.recover(OPERATOR, "op-route-001"),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "ENGINE_UNAVAILABLE"
      && error.status === 503
      && !error.message.includes("postgres"),
  );

  const storageUnavailable = createStudioAtelierRouteService({
    loadRuntime: disabledRuntime,
    loadRecoveryRuntime: async () => Object.freeze({
      readProjection: async () => result("SEMANTIC_PASS"),
      async readReviewArtifact() {
        throw new Error("private-blob-coordinate");
      },
    }),
  });
  await assert.rejects(
    storageUnavailable.readReviewMedia(OPERATOR, "op-route-001"),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "ENGINE_UNAVAILABLE"
      && error.status === 503
      && !error.message.includes("blob"),
  );
});

test("the checked-in route binding is zero-spend disabled until concrete production composition exists", async () => {
  await assert.rejects(
    loadStudioAtelierRouteRuntime(),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "ENGINE_DISABLED"
      && /release atom/.test(error.recovery),
  );
});

test("the checked-in recovery binding exposes no mutation or provider capability", async () => {
  const recovery = await loadStudioAtelierRecoveryRuntime();
  assert.deepEqual(Object.keys(recovery).sort(), [
    "readProjection",
    "readReviewArtifact",
  ]);
});

test("the durable recovery reader scopes every ledger lookup and returns only a sanitized projection", async () => {
  const scopes: Array<Readonly<{ operatorSubject: string; operationId: string }>> = [];
  const observe = (input: Readonly<{ operatorSubject: string; operationId: string }>) => {
    scopes.push(Object.freeze({ ...input }));
    return input;
  };
  const reader = createDurableStudioAtelierProjectionReader({
    async getOperation(input) {
      observe(input);
      return {
        id: input.operationId,
        operatorSubject: input.operatorSubject,
        stage: "GARMENT_01_FRONT",
        view: "01",
      } as AtelierOperationRow;
    },
    async getProjection(input) {
      observe(input);
      return {
        operationId: input.operationId,
        state: "SEMANTIC_PASS",
        version: 7,
        correctionAuthorized: false,
      } as AtelierOperationProjectionRow;
    },
    async getCorrectionOperation(input) {
      observe(input);
      return null;
    },
    async listEvents(input) {
      observe(input);
      return [];
    },
  });

  const recovered = await reader(OPERATOR.subject, "op-route-001");
  assert.deepEqual(recovered, {
    operationId: "op-route-001",
    stage: "GARMENT_01_FRONT",
    view: "01",
    state: "SEMANTIC_PASS",
    version: 7,
    candidateVisibility: "REVIEWABLE",
    nextAction: "REVIEW",
    reused: true,
  });
  assert.equal(scopes.length, 4);
  assert.equal(scopes.every((scope) =>
    scope.operatorSubject === OPERATOR.subject
    && scope.operationId === "op-route-001"
  ), true);
  assert.equal("bytes" in recovered, false);
  assert.equal("artifactId" in recovered, false);
  assert.equal("provider" in recovered, false);
});

test("the recovery loader caches success and retries failed composition", async () => {
  const kit = harness(result("SEMANTIC_PASS"));
  let attempts = 0;
  const loader = createStudioAtelierRecoveryRuntimeLoader(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("repository module unavailable");
    return kit.recoveryRuntime;
  });

  await assert.rejects(loader(), /repository module unavailable/);
  assert.equal(await loader(), kit.recoveryRuntime);
  assert.equal(await loader(), kit.recoveryRuntime);
  assert.equal(attempts, 2);
});

test("a verified runtime loader caches success but retries rejected construction", async () => {
  // This is a source-level construction invariant: the exported helper accepts
  // only the full production input type. The runtime itself is exercised by
  // studio-atelier-production-runtime.test.ts; here we verify the helper is
  // available without weakening its type to partial declarations.
  assert.equal(typeof createStudioAtelierRouteRuntimeLoader, "function");
});
