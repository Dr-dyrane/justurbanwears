import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  STUDIO_GPT_IMAGE_2_ADAPTER,
  STUDIO_GPT_IMAGE_2_ADAPTER_VERSION,
  STUDIO_GPT_IMAGE_2_COST_CAP_USD,
  STUDIO_GPT_IMAGE_2_MODEL,
  STUDIO_GPT_IMAGE_2_POLICY_REVISION,
} from "../lib/ai/studio-image-policy";
import {
  createStudioAtelierProductionRuntime,
  inspectStudioAtelierProductionReadiness,
  isStudioAtelierStageDispatchReady,
  STUDIO_ATELIER_LEDGER_MIGRATION_INDEX,
  STUDIO_ATELIER_LEDGER_SCHEMA_VERSION,
  STUDIO_ATELIER_PRIVATE_AUTHORITY_ASSET_COUNT,
  STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256,
  STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION,
  studioAtelierProductionScopeForStage,
  type StudioAtelierApprovedRoomReadiness,
  type StudioAtelierProductionPorts,
  type StudioAtelierQualificationReadiness,
  type StudioAtelierProductionReadinessEvidence,
} from "../lib/server/studio-atelier-production-runtime";
import { LULU_V4_AUTHORITY_REVISION } from "../lib/server/studio-lulu-v4-authority";
import type { AtelierStage } from "../lib/studio/atelier/contracts";
import {
  STUDIO_ATELIER_G004_CALIBRATION_ASSET_COUNT,
  STUDIO_ATELIER_G004_CALIBRATION_MANIFEST_SHA256,
  STUDIO_ATELIER_G004_CALIBRATION_REVISION,
  STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT,
} from "../lib/studio/atelier/g004-calibration";
import { StudioEngineError } from "../lib/studio/engine/errors";
import {
  STUDIO_ATELIER_SEMANTIC_QA_SCHEMA_VERSION,
  STUDIO_ATELIER_SEMANTIC_RUBRIC_VERSION,
  STUDIO_ATELIER_SEMANTIC_THRESHOLD_VERSION,
  STUDIO_ATELIER_TECHNICAL_QA_SCHEMA_VERSION,
  STUDIO_ATELIER_TECHNICAL_RUBRIC_VERSION,
  STUDIO_ATELIER_TECHNICAL_THRESHOLD_VERSION,
} from "../lib/studio/atelier/quality-contracts";
import {
  STUDIO_ATELIER_QUALIFICATION_CASE_IDS,
  STUDIO_ATELIER_QUALIFICATION_RECEIPT_SCHEMA_VERSION,
  deriveStudioAtelierQualificationReceiptSha256,
  isStudioAtelierQualificationReadiness,
} from "../lib/server/studio-atelier-qualified-evaluator";

const VERIFIED_AT = "2026-08-26T20:00:00.000Z";
const BLOCKED_ROOM = Object.freeze({
  status: "BLOCKED",
  reason: "APPROVED_ROOM_CANVAS_MISMATCH",
} as const satisfies StudioAtelierApprovedRoomReadiness);

function fabricatedQualification(): StudioAtelierQualificationReadiness {
  const placeholder = "0".repeat(64);
  const provisional = {
    schemaVersion: STUDIO_ATELIER_QUALIFICATION_RECEIPT_SCHEMA_VERSION,
    status: "PASS",
    suiteVersion: STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION,
    adapterId: STUDIO_GPT_IMAGE_2_ADAPTER,
    adapterVersion: STUDIO_GPT_IMAGE_2_ADAPTER_VERSION,
    provider: "openai",
    model: STUDIO_GPT_IMAGE_2_MODEL,
    policyRevision: STUDIO_GPT_IMAGE_2_POLICY_REVISION,
    technicalContract: Object.freeze({
      schemaVersion: STUDIO_ATELIER_TECHNICAL_QA_SCHEMA_VERSION,
      rubricVersion: STUDIO_ATELIER_TECHNICAL_RUBRIC_VERSION,
      thresholdVersion: STUDIO_ATELIER_TECHNICAL_THRESHOLD_VERSION,
    }),
    semanticContract: Object.freeze({
      schemaVersion: STUDIO_ATELIER_SEMANTIC_QA_SCHEMA_VERSION,
      rubricVersion: STUDIO_ATELIER_SEMANTIC_RUBRIC_VERSION,
      thresholdVersion: STUDIO_ATELIER_SEMANTIC_THRESHOLD_VERSION,
    }),
    g004Calibration: Object.freeze({
      revision: STUDIO_ATELIER_G004_CALIBRATION_REVISION,
      manifestSha256: STUDIO_ATELIER_G004_CALIBRATION_MANIFEST_SHA256,
      readbackReceiptSha256:
        STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT.receiptSha256,
    }),
    qualificationReceiptSha256: placeholder,
    independentReviewReceiptSha256: "d".repeat(64),
    caseEvidence: Object.freeze(STUDIO_ATELIER_QUALIFICATION_CASE_IDS.map(
      (caseId, index) => Object.freeze({
        caseId,
        evidenceSha256: String(index + 1).repeat(64),
      }),
    )),
    technicalEvaluator: Object.freeze({
      id: "juw.technical.evaluator",
      version: "v1",
      policyRevision: "juw.technical.policy.v1",
      qualificationSuiteVersion: STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION,
      qualificationReceiptSha256: placeholder,
    }),
    semanticEvaluator: Object.freeze({
      id: "juw.semantic.evaluator",
      version: "v1",
      policyRevision: "juw.semantic.policy.v1",
      qualificationSuiteVersion: STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION,
      qualificationReceiptSha256: placeholder,
    }),
    passedAt: VERIFIED_AT,
  } as const satisfies StudioAtelierQualificationReadiness;
  const receipt = deriveStudioAtelierQualificationReceiptSha256(provisional);
  return Object.freeze({
    ...provisional,
    qualificationReceiptSha256: receipt,
    technicalEvaluator: Object.freeze({
      ...provisional.technicalEvaluator,
      qualificationReceiptSha256: receipt,
    }),
    semanticEvaluator: Object.freeze({
      ...provisional.semanticEvaluator,
      qualificationReceiptSha256: receipt,
    }),
  });
}

function validRoom(): StudioAtelierApprovedRoomReadiness {
  return Object.freeze({
    status: "VERIFIED_PRIVATE_READBACK",
    assetId: "juw.atelier.empty-plate.v2",
    sha256: "a".repeat(64),
    mimeType: "image/png",
    width: 1024,
    height: 1536,
    authorityRevision: "LULU_V4_2026-08-26.8",
    manifestSha256: "b".repeat(64),
    verifiedAt: VERIFIED_AT,
  });
}

function readiness(
  approvedRoom: StudioAtelierApprovedRoomReadiness = BLOCKED_ROOM,
): StudioAtelierProductionReadinessEvidence {
  return Object.freeze({
    database: Object.freeze({
      status: "VERIFIED",
      ledgerSchemaVersion: STUDIO_ATELIER_LEDGER_SCHEMA_VERSION,
      migrationIndex: STUDIO_ATELIER_LEDGER_MIGRATION_INDEX,
      tables: Object.freeze([
        "studio_atelier_operations",
        "studio_atelier_executions",
        "studio_atelier_artifacts",
        "studio_atelier_operation_projections",
        "studio_atelier_events",
      ]),
      verifiedAt: VERIFIED_AT,
    }),
    privateStore: Object.freeze({
      status: "VERIFIED_PRIVATE_READ_WRITE",
      contentAddressed: true,
      immutableCreate: true,
      readbackVerified: true,
      verifiedAt: VERIFIED_AT,
    }),
    aiPolicy: Object.freeze({
      status: "VERIFIED",
      gatewayCredentialAvailable: true,
      adapterId: STUDIO_GPT_IMAGE_2_ADAPTER,
      adapterVersion: STUDIO_GPT_IMAGE_2_ADAPTER_VERSION,
      policyRevision: STUDIO_GPT_IMAGE_2_POLICY_REVISION,
      provider: "openai",
      model: STUDIO_GPT_IMAGE_2_MODEL,
      onlyProviders: Object.freeze(["openai"]),
      fallbackModels: Object.freeze([]),
      maxRetries: 0,
      costCapUsd: STUDIO_GPT_IMAGE_2_COST_CAP_USD,
      verifiedAt: VERIFIED_AT,
    }),
    privateAuthority: Object.freeze({
      status: "VERIFIED_PRIVATE_READBACK",
      authorityRevision: LULU_V4_AUTHORITY_REVISION,
      manifestSha256: STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256,
      assetCount: STUDIO_ATELIER_PRIVATE_AUTHORITY_ASSET_COUNT,
      verifiedAt: VERIFIED_AT,
    }),
    g004Calibration: Object.freeze({
      status: "VERIFIED_PUBLIC_DERIVATIVE_READBACK",
      calibrationRevision: STUDIO_ATELIER_G004_CALIBRATION_REVISION,
      manifestSha256: STUDIO_ATELIER_G004_CALIBRATION_MANIFEST_SHA256,
      readbackReceiptSha256: STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT.receiptSha256,
      assetCount: STUDIO_ATELIER_G004_CALIBRATION_ASSET_COUNT,
      canonicalOriginalsStatus: "UNAVAILABLE",
      derivativeDecision: "VERSION_LOCK_PUBLIC_SHOP_DERIVATIVES",
      verifiedAt: VERIFIED_AT,
    }),
    qualification: fabricatedQualification(),
    approvedRoom,
  });
}

function ports(calls: string[] = []): StudioAtelierProductionPorts {
  const unused = async () => {
    calls.push("called");
    throw new Error("A construction-only test must not invoke a production port.");
  };
  return {
    resolveFileVerification: unused,
    resolveTrustedTruth: unused,
    resolveExecutionContext: unused,
    prepareCorrection: unused,
    resolveLockedRoom: unused,
  } as unknown as StudioAtelierProductionPorts;
}

test("readiness reports every missing server dependency without echoing secrets", () => {
  const report = inspectStudioAtelierProductionReadiness({
    ports: {},
    readiness: {
      aiPolicy: { credential: "secret-provider-key" },
    } as never,
  });

  assert.equal(report.rootSubject, "BLOCKED");
  assert.equal(report.finalScene, "BLOCKED");
  assert.equal(report.constructionAllowed, false);
  assert.equal(
    report.blockers.filter((blocker) => blocker.code === "MISSING_TYPED_PORT").length,
    5,
  );
  assert.ok(report.blockers.some((blocker) => blocker.code === "DATABASE_NOT_VERIFIED"));
  assert.ok(report.blockers.some((blocker) => blocker.code === "ROOM_READINESS_UNDECLARED"));
  assert.doesNotMatch(JSON.stringify(report), /secret-provider-key|credential/i);
});

test("a declared room mismatch leaves 01-04 and subject ready but final scenes blocked", () => {
  const report = inspectStudioAtelierProductionReadiness({
    ports: ports(),
    readiness: readiness(),
  });

  assert.equal(report.rootSubject, "READY");
  assert.equal(report.finalScene, "BLOCKED");
  assert.equal(report.constructionAllowed, true);
  assert.deepEqual(report.blockers.map((blocker) => blocker.code), [
    "FINAL_SCENE_ROOM_NOT_READY",
  ]);
  for (const stage of [
    "GARMENT_01_FRONT",
    "GARMENT_02_BACK",
    "GARMENT_03_MANNEQUIN",
    "GARMENT_04_DETAIL",
    "SUBJECT_A",
    "SUBJECT_B",
  ] as const satisfies readonly AtelierStage[]) {
    assert.equal(isStudioAtelierStageDispatchReady(report, stage), true);
  }
  for (const stage of [
    "ROOM_FINAL_05",
    "SIBLING_06",
    "SIBLING_07_CORE",
    "SIBLING_07_RECOVERY",
  ] as const satisfies readonly AtelierStage[]) {
    assert.equal(isStudioAtelierStageDispatchReady(report, stage), false);
  }
});

test("a claimed room cannot clear final readiness outside the exact authority revision", () => {
  const mismatchedRevision = inspectStudioAtelierProductionReadiness({
    ports: ports(),
    readiness: readiness(validRoom()),
  });
  assert.equal(mismatchedRevision.rootSubject, "READY");
  assert.equal(mismatchedRevision.finalScene, "BLOCKED");
  assert.deepEqual(mismatchedRevision.blockers.map((blocker) => blocker.code), [
    "APPROVED_ROOM_INVALID",
  ]);

  const oldAuthority = {
    ...validRoom(),
    authorityRevision: LULU_V4_AUTHORITY_REVISION,
    manifestSha256: STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256,
  } as StudioAtelierApprovedRoomReadiness;
  const rejected = inspectStudioAtelierProductionReadiness({
    ports: ports(),
    readiness: readiness(oldAuthority),
  });
  assert.equal(rejected.rootSubject, "READY");
  assert.equal(rejected.finalScene, "BLOCKED");
  assert.deepEqual(rejected.blockers.map((blocker) => blocker.code), [
    "APPROVED_ROOM_INVALID",
  ]);
});

test("policy fallback or a changed model blocks runtime construction", () => {
  const candidate = readiness();
  const report = inspectStudioAtelierProductionReadiness({
    ports: ports(),
    readiness: {
      ...candidate,
      aiPolicy: {
        ...candidate.aiPolicy,
        model: "openai/gpt-image-1.5",
        fallbackModels: ["bfl/flux"],
      },
    } as never,
  });
  assert.equal(report.rootSubject, "BLOCKED");
  assert.ok(report.blockers.some((blocker) => blocker.code === "AI_POLICY_NOT_VERIFIED"));
});

test("a nominal G004 label cannot replace exact derivative readback readiness", () => {
  const candidate = readiness();
  const report = inspectStudioAtelierProductionReadiness({
    ports: ports(),
    readiness: {
      ...candidate,
      g004Calibration: {
        ...candidate.g004Calibration,
        manifestSha256: "0".repeat(64),
      },
    },
  });
  assert.equal(report.rootSubject, "BLOCKED");
  assert.equal(report.finalScene, "BLOCKED");
  assert.ok(report.blockers.some(
    (blocker) => blocker.code === "G004_CALIBRATION_NOT_VERIFIED",
  ));
});

test("the qualification receipt hash binds every case and evaluator descriptor", () => {
  const receipt = fabricatedQualification();
  assert.equal(isStudioAtelierQualificationReadiness(receipt), true);
  assert.equal(isStudioAtelierQualificationReadiness({
    ...receipt,
    caseEvidence: receipt.caseEvidence.map((evidence, index) => index === 0
      ? { ...evidence, evidenceSha256: "f".repeat(64) }
      : evidence),
  }), false);
  assert.equal(isStudioAtelierQualificationReadiness({
    ...receipt,
    semanticEvaluator: {
      ...receipt.semanticEvaluator,
      policyRevision: "juw.semantic.policy.v2",
    },
  }), false);
});

test("construction fails closed before invoking any port when qualification is absent", async () => {
  const calls: string[] = [];
  const candidate = readiness();
  const invalid = {
    ...candidate,
    qualification: undefined,
  } as unknown as StudioAtelierProductionReadinessEvidence;

  await assert.rejects(
    createStudioAtelierProductionRuntime({ ports: ports(calls), readiness: invalid }),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "ENGINE_DISABLED"
      && /QUALIFICATION_NOT_PASSED/.test(error.recovery),
  );
  assert.deepEqual(calls, []);
});

test("a fabricated qualification and evaluator functions cannot compose production", async () => {
  const calls: string[] = [];
  const declared = readiness();
  const declarations = {
    database: declared.database,
    privateStore: declared.privateStore,
    aiPolicy: declared.aiPolicy,
    privateAuthority: declared.privateAuthority,
    qualification: declared.qualification,
    approvedRoom: declared.approvedRoom,
  };
  const forgedPorts = {
    ...ports(calls),
    evaluateTechnicalQuality: async () => {
      calls.push("forged-technical-evaluator");
      throw new Error("must not run");
    },
    evaluateSemanticQuality: async () => {
      calls.push("forged-semantic-evaluator");
      throw new Error("must not run");
    },
  } as unknown as StudioAtelierProductionPorts;

  await assert.rejects(
    createStudioAtelierProductionRuntime({
      ports: forgedPorts,
      readiness: declarations,
    }),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "ENGINE_DISABLED"
      && /QUALIFICATION_NOT_PASSED/.test(error.recovery),
  );
  assert.deepEqual(calls, []);
});

test("stage scoping is semantic and never garment-number based", () => {
  assert.equal(studioAtelierProductionScopeForStage("GARMENT_01_FRONT"), "ROOT_SUBJECT");
  assert.equal(studioAtelierProductionScopeForStage("SUBJECT_B"), "ROOT_SUBJECT");
  assert.equal(studioAtelierProductionScopeForStage("ROOM_FINAL_05"), "FINAL_SCENE");
  assert.equal(studioAtelierProductionScopeForStage("SIBLING_07_RECOVERY"), "FINAL_SCENE");
});

test("Vercel packages only the two runtime G004 authority manifests from docs", () => {
  const lines = readFileSync(new URL("../.vercelignore", import.meta.url), "utf8")
    .replaceAll("\r\n", "\n")
    .split("\n");
  const requiredRules = [
    "/docs/**",
    "!/docs/virtual-atelier/",
    "!/docs/virtual-atelier/g004-positive-target-calibration.v1.json",
    "!/docs/virtual-atelier/g004-provider-visual-denial.v1.json",
  ];
  const positions = requiredRules.map((rule) => lines.indexOf(rule));

  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
  assert.equal(lines.includes("/docs/"), false);
  assert.deepEqual(
    lines.filter((line) => line.startsWith("!/docs/")),
    requiredRules.slice(1),
  );
});
