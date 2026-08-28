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
  STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE,
  STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE_REVISION,
} from "../lib/ai/studio-gpt-image-2-subject-layer";
import {
  createStudioAtelierProductionRuntime,
  inspectStudioAtelierProductionReadiness,
  isStudioAtelierStageDispatchReady,
  STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_CREATED_AT,
  STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_INDEX,
  STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_SHA256,
  STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_TAG,
  STUDIO_ATELIER_LEDGER_MIGRATION_CREATED_AT,
  STUDIO_ATELIER_LEDGER_MIGRATION_INDEX,
  STUDIO_ATELIER_LEDGER_MIGRATION_SHA256,
  STUDIO_ATELIER_LEDGER_MIGRATION_TAG,
  STUDIO_ATELIER_LEDGER_SCHEMA_VERSION,
  STUDIO_ATELIER_PRIVATE_AUTHORITY_ASSET_COUNT,
  STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256,
  STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION,
  STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_CREATED_AT,
  STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_INDEX,
  STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_SHA256,
  STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_TAG,
  studioAtelierProductionScopeForStage,
  type StudioAtelierApprovedRoomReadiness,
  type StudioAtelierProductionPorts,
  type StudioAtelierQualificationReadiness,
  type StudioAtelierProductionReadinessEvidence,
} from "../lib/server/studio-atelier-production-runtime";
import { LULU_V4_AUTHORITY_REVISION } from "../lib/server/studio-lulu-v4-authority";
import type { AtelierStage } from "../lib/studio/atelier/contracts";
import {
  STUDIO_ATELIER_ROOM_CANVAS_POLICY_REVISION,
  STUDIO_ATELIER_SUPPORTED_ROOM_CANVAS_PROFILES,
} from "../lib/studio/atelier/canvas-policy";
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
  STUDIO_ATELIER_NATIVE_ROOM_QUALIFICATION_STAGES,
  STUDIO_ATELIER_QUALIFICATION_RECEIPT_SCHEMA_VERSION,
  deriveStudioAtelierQualificationReceiptSha256,
  isStudioAtelierQualificationReadiness,
} from "../lib/server/studio-atelier-qualified-evaluator";
import { STUDIO_ATELIER_SUBJECT_COMPOSITE_REVISION } from "../lib/server/studio-atelier-subject-compositor";

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
    transparentCompositeQualification: Object.freeze({
      transparentSubjectProfileId:
        STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE.profileId,
      transparentSubjectProfileRevision:
        STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE_REVISION,
      providerCanvas: Object.freeze({
        width: STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE.width,
        height: STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE.height,
      }),
      canvasPolicyRevision: STUDIO_ATELIER_ROOM_CANVAS_POLICY_REVISION,
      compositorRevision: STUDIO_ATELIER_SUBJECT_COMPOSITE_REVISION,
      roomProfileCases: Object.freeze(STUDIO_ATELIER_SUPPORTED_ROOM_CANVAS_PROFILES.map(
        (profile, profileIndex) => Object.freeze({
          profileId: profile.profileId,
          roomCanvas: profile.roomCanvas,
          subjectWindow: profile.subjectWindow,
          transparentGuardPixels: profile.transparentGuardPixels,
          stageEvidence: Object.freeze(STUDIO_ATELIER_NATIVE_ROOM_QUALIFICATION_STAGES.map(
            (stage, stageIndex) => Object.freeze({
              stage,
              evidenceSha256: String(profileIndex * 4 + stageIndex + 1).repeat(64),
            }),
          )),
        }),
      )),
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

function currentNativeRoom(): StudioAtelierApprovedRoomReadiness {
  return Object.freeze({
    status: "VERIFIED_PRIVATE_READBACK",
    assetId: "juw.atelier.empty-plate.v1",
    sha256: "c".repeat(64),
    mimeType: "image/png",
    width: 1024,
    height: 1280,
    authorityRevision: LULU_V4_AUTHORITY_REVISION,
    manifestSha256: STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256,
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
      migrationTag: STUDIO_ATELIER_LEDGER_MIGRATION_TAG,
      migrationCreatedAt: STUDIO_ATELIER_LEDGER_MIGRATION_CREATED_AT,
      migrationSha256: STUDIO_ATELIER_LEDGER_MIGRATION_SHA256,
      transactionalAuthorityMigrationIndex:
        STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_INDEX,
      transactionalAuthorityMigrationTag:
        STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_TAG,
      transactionalAuthorityMigrationCreatedAt:
        STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_CREATED_AT,
      transactionalAuthorityMigrationSha256:
        STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_SHA256,
      externalAuthorityMigrationIndex:
        STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_INDEX,
      externalAuthorityMigrationTag:
        STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_TAG,
      externalAuthorityMigrationCreatedAt:
        STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_CREATED_AT,
      externalAuthorityMigrationSha256:
        STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_SHA256,
      tables: Object.freeze([
        "studio_atelier_adult_verification_receipts",
        "studio_atelier_operations",
        "studio_atelier_executions",
        "studio_atelier_artifacts",
        "studio_atelier_consent_events",
        "studio_atelier_consent_grants",
        "studio_atelier_consent_projections",
        "studio_atelier_operation_projections",
        "studio_atelier_events",
        "studio_atelier_styling_advisories",
        "studio_engine_work_ownership",
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

test("pre-ownership database evidence cannot certify production readiness", () => {
  const current = readiness();
  const report = inspectStudioAtelierProductionReadiness({
    ports: ports(),
    readiness: {
      ...current,
      database: {
        ...current.database,
        migrationIndex: 16,
        migrationTag: "0016_studio_atelier_ledger",
        migrationCreatedAt: 1_787_770_588_520,
        migrationSha256:
          "259430e33aedd9aabe7b74599e9b45b0ef16953599cfc95efb317f5077902b51",
        tables: current.database.tables.filter(
          (table) => table !== "studio_engine_work_ownership",
        ),
      },
    } as never,
  });

  assert.equal(report.rootSubject, "BLOCKED");
  assert.equal(report.finalScene, "BLOCKED");
  assert.ok(report.blockers.some((blocker) => blocker.code === "DATABASE_NOT_VERIFIED"));
});

test("pre-external-authority database evidence cannot certify production readiness", () => {
  const current = readiness();
  const report = inspectStudioAtelierProductionReadiness({
    ports: ports(),
    readiness: {
      ...current,
      database: {
        ...current.database,
        externalAuthorityMigrationIndex: 18,
        externalAuthorityMigrationTag: "0018_studio_transactional_authority",
        externalAuthorityMigrationCreatedAt:
          STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_CREATED_AT,
        externalAuthorityMigrationSha256:
          STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_SHA256,
        tables: current.database.tables.filter(
          (table) => ![
            "studio_atelier_adult_verification_receipts",
            "studio_atelier_consent_events",
            "studio_atelier_consent_grants",
            "studio_atelier_consent_projections",
            "studio_atelier_styling_advisories",
          ].includes(table),
        ),
      },
    } as never,
  });

  assert.equal(report.rootSubject, "BLOCKED");
  assert.equal(report.finalScene, "BLOCKED");
  assert.ok(report.blockers.some((blocker) => blocker.code === "DATABASE_NOT_VERIFIED"));
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

test("room readiness requires the exact authority revision and a qualified native profile", () => {
  const mismatchedRevision = inspectStudioAtelierProductionReadiness({
    ports: ports(),
    readiness: readiness(validRoom()),
  });
  assert.equal(mismatchedRevision.rootSubject, "READY");
  assert.equal(mismatchedRevision.finalScene, "BLOCKED");
  assert.deepEqual(mismatchedRevision.blockers.map((blocker) => blocker.code), [
    "APPROVED_ROOM_INVALID",
  ]);

  const accepted = inspectStudioAtelierProductionReadiness({
    ports: ports(),
    readiness: readiness(currentNativeRoom()),
  });
  assert.equal(accepted.rootSubject, "READY");
  assert.equal(accepted.finalScene, "READY");
  assert.deepEqual(accepted.blockers, []);

  const unsupported = inspectStudioAtelierProductionReadiness({
    ports: ports(),
    readiness: readiness({ ...currentNativeRoom(), height: 1279 } as never),
  });
  assert.equal(unsupported.rootSubject, "READY");
  assert.equal(unsupported.finalScene, "BLOCKED");
  assert.deepEqual(unsupported.blockers.map((blocker) => blocker.code), [
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
  assert.equal(isStudioAtelierQualificationReadiness({
    ...receipt,
    transparentCompositeQualification: {
      ...receipt.transparentCompositeQualification,
      canvasPolicyRevision: "juw.atelier-native-room-canvas.v0",
    },
  }), false);
  assert.equal(isStudioAtelierQualificationReadiness({
    ...receipt,
    transparentCompositeQualification: {
      ...receipt.transparentCompositeQualification,
      roomProfileCases: receipt.transparentCompositeQualification.roomProfileCases.map(
        (profile, profileIndex) => profileIndex === 1
          ? {
              ...profile,
              stageEvidence: profile.stageEvidence.map((evidence, stageIndex) =>
                stageIndex === 2
                  ? { ...evidence, evidenceSha256: "f".repeat(64) }
                  : evidence
              ),
            }
          : profile,
      ),
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

test("Vercel packages Virtual Atelier runtime docs while excluding non-runtime inputs", () => {
  const lines = readFileSync(new URL("../.vercelignore", import.meta.url), "utf8")
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  const excludedDocRules = [
    "/docs/adr/",
    "/docs/architecture/",
    "/docs/data/",
    "/docs/evidence/",
    "/docs/experience/",
    "/docs/identity/",
    "/docs/operations/",
    "/docs/order-flows/",
    "/docs/performance/",
    "/docs/screenshots/",
    "/docs/shop-portal/",
  ];
  const excludedNonRuntimeRules = [
    "/drizzle/",
    "/scripts/shop-db/",
    "/tests/",
    "/storage/",
  ];

  assert.deepEqual(
    lines.filter((line) => /^!?\/?docs\//.test(line)),
    excludedDocRules,
  );
  assert.ok(excludedNonRuntimeRules.every((rule) => lines.includes(rule)));
  assert.equal(
    lines.some((line) => /^!?\/?docs\/virtual-atelier(?:\/|$)/.test(line)),
    false,
  );
  assert.equal(
    lines.some((line) => line.startsWith("!") && excludedNonRuntimeRules.some(
      (rule) => line.slice(1).startsWith(rule),
    )),
    false,
  );
});
