import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createStudioAtelierRouteProductionDeclarationService,
  createStudioAtelierRouteProductionRuntimeComposer,
  deriveStudioAtelierRouteGarmentTruthSourceHash,
} from "../lib/server/studio-atelier-route-production-composition";
import {
  createStudioAtelierProductionDeclarationService,
} from "../lib/server/studio-atelier-production-declarations";
import type {
  StudioAtelierProductionPorts,
  StudioAtelierProductionRuntime,
} from "../lib/server/studio-atelier-production-runtime";
import type { StudioAtelierProductionReadinessProbeReport } from "../lib/server/studio-atelier-production-readiness";
import type { StudioAtelierQualifiedEvaluatorBundle } from "../lib/server/studio-atelier-qualified-evaluator";
import {
  createStudioAtelierStageDeclarationFactory,
  type StudioAtelierPersistedWardrobeTruth,
} from "../lib/server/studio-atelier-stage-declaration-factory";
import {
  parentLockSchema,
  type ParentLock,
} from "../lib/studio/atelier/contracts";
import { StudioEngineError } from "../lib/studio/engine/errors";

const OPERATOR = "operator-route-composition";
const ITEM = "00000000-0000-4000-8000-000000009701";
const INTAKE = "00000000-0000-4000-8000-000000009702";
const SOURCE = "00000000-0000-4000-8000-000000009703";
const FRONT = "00000000-0000-4000-8000-000000009704";

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function persistedTruth(): StudioAtelierPersistedWardrobeTruth {
  const facts = Object.freeze({
    title: "Black seam-detail dress",
    category: "Dress" as const,
    colour: "Black",
    sizeLabel: "UK 12",
    condition: "Excellent",
    price: 4200,
  });
  return Object.freeze({
    operatorSubject: OPERATOR,
    wardrobeItemId: ITEM,
    intakeId: INTAKE,
    intakeOperatorSubject: OPERATOR,
    intakeKind: "GARMENT",
    intakeState: "COMMITTED",
    sourceMode: "UPLOAD",
    sourceAssetId: SOURCE,
    sourceSha256: digest("source"),
    wardrobeState: "READY",
    wardrobeQuantity: 1,
    wardrobeVersion: 7,
    approvedAssetId: FRONT,
    wardrobeFacts: facts,
    intakeFacts: facts,
    source: Object.freeze({
      id: SOURCE,
      intakeId: INTAKE,
      role: "SOURCE",
      sha256: digest("source"),
      mimeType: "image/jpeg",
      byteSize: 1_000,
      width: 1024,
      height: 1536,
      privacy: "PRIVATE",
    }),
    approvedFront: Object.freeze({
      id: FRONT,
      intakeId: INTAKE,
      role: "GARMENT_FRONT",
      sha256: digest("front"),
      mimeType: "image/png",
      byteSize: 2_000,
      width: 1024,
      height: 1536,
      privacy: "PRIVATE",
    }),
  });
}

function acceptedSubjectParent(): ParentLock {
  return parentLockSchema.parse({
    role: "ACCEPTED_SUBJECT_LOCK",
    assetId: "atelier/locked/subject-b",
    sha256: digest("subject-b"),
    garmentId: `wardrobe:${ITEM}`,
    sourceStage: "SUBJECT_B",
    sourceView: "SUBJECT",
    lockedLayer: "IDENTITY",
    privacyClass: "PRIVATE_IDENTITY",
    reviewState: "LOCKED",
  });
}

function fashionNovaCheck() {
  return Object.freeze({
    operationId: "wardrobe-advisory-009701",
    publisher: "Fashion Nova",
    officialUrl: "https://www.fashionnova.com/collections/dresses",
    resolvedOfficialUrl: "https://www.fashionnova.com/collections/dresses",
    pageTitle: "Dresses",
    accessedOn: "2026-08-27",
    matchedGarmentFacts: Object.freeze(["Black dress"]),
    decision: "KEEP" as const,
    selectedStylingDirection: "Keep restrained black heels and minimal gold accessories.",
    authority: "ADVISORY_STYLING_ONLY" as const,
    passedAsImageReference: false as const,
  });
}

function verifiedProbeReport(): StudioAtelierProductionReadinessProbeReport {
  const evidence = Object.freeze({
    database: Object.freeze({ kind: "database" }),
    privateStore: Object.freeze({ kind: "private-store" }),
    aiPolicy: Object.freeze({ kind: "ai-policy" }),
    privateAuthority: Object.freeze({ kind: "private-authority" }),
    g004Calibration: Object.freeze({ kind: "g004" }),
    approvedRoom: Object.freeze({ kind: "room" }),
  }) as unknown as StudioAtelierProductionReadinessProbeReport["evidence"];
  return Object.freeze({
    schemaVersion: "juw.studio-atelier-production-readiness.v1",
    prequalificationStatus: "VERIFIED",
    qualificationStatus: "NOT_VERIFIED",
    productionStatus: "BLOCKED",
    readyForQualification: true,
    constructionAllowed: false,
    evidence,
    blockers: Object.freeze([Object.freeze({
      code: "QUALIFICATION_NOT_PASSED",
      scope: "ALL",
      dependency: "qualification",
      message: "The canonical closed evaluator qualification bundle is not installed.",
    })]),
  });
}

test("route composition checks canonical qualification before readiness or production ports", async () => {
  const calls: string[] = [];
  const compose = createStudioAtelierRouteProductionRuntimeComposer({
    resolveQualifiedEvaluatorBundle() {
      calls.push("resolve-qualification");
      return null;
    },
    verifyQualifiedEvaluatorBundle(value) {
      calls.push("verify-qualification");
      return value;
    },
    async probeReadiness() {
      calls.push("probe-readiness");
      return verifiedProbeReport();
    },
    createPorts() {
      calls.push("create-ports");
      return {} as StudioAtelierProductionPorts;
    },
    async createRuntime() {
      calls.push("create-runtime");
      return {} as StudioAtelierProductionRuntime;
    },
  });

  await assert.rejects(
    compose(),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "ENGINE_DISABLED"
      && /QUALIFICATION_NOT_PASSED/.test(error.recovery),
  );
  assert.deepEqual(calls, ["resolve-qualification", "verify-qualification"]);
});

test("route composition admits only the exact server prequalification shape", async () => {
  const qualification = {} as StudioAtelierQualifiedEvaluatorBundle;
  const calls: string[] = [];
  const compose = createStudioAtelierRouteProductionRuntimeComposer({
    resolveQualifiedEvaluatorBundle: () => qualification,
    verifyQualifiedEvaluatorBundle: () => qualification,
    async probeReadiness() {
      calls.push("probe-readiness");
      return {
        ...verifiedProbeReport(),
        blockers: Object.freeze([]),
      };
    },
    createPorts() {
      calls.push("create-ports");
      return {} as StudioAtelierProductionPorts;
    },
    async createRuntime() {
      calls.push("create-runtime");
      return {} as StudioAtelierProductionRuntime;
    },
  });

  await assert.rejects(
    compose(),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "ENGINE_DISABLED"
      && /No paid work was started/.test(error.recovery),
  );
  assert.deepEqual(calls, ["probe-readiness"]);
});

test("verified composition passes declarations and ports but never a caller qualification", async () => {
  const qualification = {} as StudioAtelierQualifiedEvaluatorBundle;
  const ports = {} as StudioAtelierProductionPorts;
  const runtime = {} as StudioAtelierProductionRuntime;
  const calls: string[] = [];
  let runtimeInput: Parameters<
    Parameters<typeof createStudioAtelierRouteProductionRuntimeComposer>[0]["createRuntime"]
  >[0] | null = null;
  const compose = createStudioAtelierRouteProductionRuntimeComposer({
    resolveQualifiedEvaluatorBundle() {
      calls.push("resolve-qualification");
      return qualification;
    },
    verifyQualifiedEvaluatorBundle(value) {
      calls.push("verify-qualification");
      return value;
    },
    async probeReadiness() {
      calls.push("probe-readiness");
      return verifiedProbeReport();
    },
    createPorts() {
      calls.push("create-ports");
      return ports;
    },
    async createRuntime(input) {
      calls.push("create-runtime");
      runtimeInput = input;
      return runtime;
    },
  });

  assert.equal(await compose(), runtime);
  assert.deepEqual(calls, [
    "resolve-qualification",
    "verify-qualification",
    "probe-readiness",
    "create-ports",
    "create-runtime",
  ]);
  assert.equal(runtimeInput?.ports, ports);
  assert.deepEqual(Object.keys(runtimeInput?.readiness ?? {}).sort(), [
    "aiPolicy",
    "approvedRoom",
    "database",
    "privateAuthority",
    "privateStore",
  ]);
  assert.equal("qualification" in (runtimeInput?.readiness ?? {}), false);
  assert.equal("g004Calibration" in (runtimeInput?.readiness ?? {}), false);
});

test("final-05 advisory lookup binds the exact verified source receipt and truth hash", async () => {
  const lookups: unknown[] = [];
  const service = createStudioAtelierRouteProductionDeclarationService({
    createStageDeclarationFactory: createStudioAtelierStageDeclarationFactory,
    createProductionDeclarationService: createStudioAtelierProductionDeclarationService,
    readWardrobeTruth: async () => persistedTruth(),
    readLockedParents: async ({ stage }) =>
      stage === "ROOM_FINAL_05"
        ? Object.freeze([acceptedSubjectParent()])
        : Object.freeze([]),
    resolveFashionNovaCheck: async (input) => {
      lookups.push(input);
      return fashionNovaCheck();
    },
  });

  const result = await service.derive({
    operatorSubject: OPERATOR,
    wardrobeItemId: ITEM,
    stage: "ROOM_FINAL_05",
  });
  assert.equal(result.declaration.stylingIntent.mode, "FASHION_NOVA_ADVISORY");
  assert.equal(lookups.length, 1);
  assert.deepEqual(lookups[0], {
    operatorSubject: OPERATOR,
    wardrobeItemId: ITEM,
    wardrobeVersion: 7,
    sourceBindingSha256: result.sourceBinding.bindingSha256,
    garmentTruthRevision: `wardrobe-truth:${ITEM}:v7`,
    garmentTruthSourceHash:
      deriveStudioAtelierRouteGarmentTruthSourceHash(result.sourceBinding),
  });
});

test("missing exact advisory evidence blocks final-05 declaration without fallback", async () => {
  const service = createStudioAtelierRouteProductionDeclarationService({
    createStageDeclarationFactory: createStudioAtelierStageDeclarationFactory,
    createProductionDeclarationService: createStudioAtelierProductionDeclarationService,
    readWardrobeTruth: async () => persistedTruth(),
    readLockedParents: async ({ stage }) =>
      stage === "ROOM_FINAL_05"
        ? Object.freeze([acceptedSubjectParent()])
        : Object.freeze([]),
    resolveFashionNovaCheck: async () => null,
  });

  await assert.rejects(
    service.derive({
      operatorSubject: OPERATOR,
      wardrobeItemId: ITEM,
      stage: "ROOM_FINAL_05",
    }),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "ENGINE_UNAVAILABLE"
      && /advisory/.test(error.message),
  );
});
