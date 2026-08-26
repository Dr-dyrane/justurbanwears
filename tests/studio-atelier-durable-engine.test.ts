import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createDurableStudioAtelierEnginePorts as createDurableStudioAtelierEnginePortsImplementation,
  type StudioAtelierSemanticQualityEvidence,
  type StudioAtelierTechnicalQualityEvidence,
} from "../lib/server/studio-atelier-durable-engine";
import type {
  AtelierArtifactRow,
  AtelierExecutionRow,
  AtelierLifecycleEventRow,
  AtelierOperationProjectionRow,
  AtelierOperationRow,
} from "../lib/server/studio-atelier-repository";
import {
  createStudioAtelierEngineFacade,
  type StudioAtelierEnginePorts,
} from "../lib/server/studio-atelier-engine-facade";
import {
  ATELIER_STAGE_LAYER_POLICIES,
  atelierOperationSchema,
  directGarmentEvidenceReceiptSchema,
  type AtelierLayer,
  type AtelierOperation,
} from "../lib/studio/atelier/contracts";
import {
  TRUSTED_ATELIER_TRUTH_BUNDLE_VERSION,
  type CompiledAtelierOperationWithReceiptsV1,
} from "../lib/studio/atelier/declaration-compiler";
import {
  STUDIO_ATELIER_G004_CALIBRATION_MANIFEST,
  STUDIO_ATELIER_G004_CALIBRATION_REVISION,
  STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT,
} from "../lib/studio/atelier/g004-calibration";
import { StudioEngineError } from "../lib/studio/engine/errors";
import {
  STUDIO_ATELIER_MULTI_ERA_BASELINE_REVISION,
  STUDIO_ATELIER_SEMANTIC_QA_SCHEMA_VERSION,
  STUDIO_ATELIER_SEMANTIC_RUBRIC_VERSION,
  studioAtelierSemanticQualityEvidenceSchema,
  type StudioAtelierEvaluatorDescriptor,
} from "../lib/studio/atelier/quality-contracts";

const OPERATOR = "operator-durable-engine-test";
const OPERATION_ID = "00000000-0000-4000-8000-000000000401";
const CORRECTION_ID = "00000000-0000-4000-8000-000000000402";
const EXECUTION_ID = "00000000-0000-4000-8000-000000000403";
const ARTIFACT_ID = "00000000-0000-4000-8000-000000000404";

function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

const TECHNICAL_EVALUATOR = Object.freeze({
  id: "test-technical-evaluator",
  version: "v1",
  policyRevision: "test-technical-policy-v1",
  qualificationSuiteVersion: "test-qa-qualification-v1",
  qualificationReceiptSha256: digest("test technical evaluator qualification"),
}) satisfies StudioAtelierEvaluatorDescriptor;

const SEMANTIC_EVALUATOR = Object.freeze({
  id: "test-semantic-evaluator",
  version: "v1",
  policyRevision: "test-semantic-policy-v1",
  qualificationSuiteVersion: "test-qa-qualification-v1",
  qualificationReceiptSha256: digest("test semantic evaluator qualification"),
}) satisfies StudioAtelierEvaluatorDescriptor;

type DurableEngineTestInput = Omit<
  Parameters<typeof createDurableStudioAtelierEnginePortsImplementation>[0],
  "technicalEvaluator" | "semanticEvaluator"
>;

function createDurableStudioAtelierEnginePorts(input: DurableEngineTestInput) {
  return createDurableStudioAtelierEnginePortsImplementation({
    ...input,
    technicalEvaluator: TECHNICAL_EVALUATOR,
    semanticEvaluator: SEMANTIC_EVALUATOR,
  });
}

function subjectOperation(correctionOf?: string): AtelierOperation {
  const parents = [{
    role: "GARMENT_FRONT_LOCK" as const,
    sourceStage: "GARMENT_01_FRONT" as const,
    sourceView: "01" as const,
  }, {
    role: "GARMENT_BACK_LOCK" as const,
    sourceStage: "GARMENT_02_BACK" as const,
    sourceView: "02" as const,
  }, {
    role: "MANNEQUIN_FRONT_LOCK" as const,
    sourceStage: "GARMENT_03_MANNEQUIN" as const,
    sourceView: "03" as const,
  }, {
    role: "FABRIC_DETAIL_LOCK" as const,
    sourceStage: "GARMENT_04_DETAIL" as const,
    sourceView: "04" as const,
  }].map((parent) => ({
    ...parent,
    assetId: `garment/engine-test/${parent.sourceView}-lock`,
    sha256: digest(`garment-${parent.sourceView}-lock`),
    garmentId: "engine-test",
    reviewState: "LOCKED" as const,
    lockedLayer: "GARMENT" as const,
    privacyClass: "PRIVATE_OPERATOR" as const,
  }));
  const authorities = [{
    role: "REAL_FACE_OPERATION_BOARD" as const,
    assetId: "authority/real-face-board",
    sha256: digest("real-face-board"),
    garmentId: null,
    sourceStage: null,
    reviewState: "LOCKED" as const,
    provenanceClass: "REAL_DIRECT" as const,
    required: true as const,
    permittedScope: ["IDENTITY", "HAIR"] as AtelierLayer[],
    dominance: 100,
    privacyClass: "PRIVATE_IDENTITY" as const,
  }, {
    role: "BODY_FRONT_CANON" as const,
    assetId: "authority/body-front",
    sha256: digest("body-front"),
    garmentId: null,
    sourceStage: null,
    reviewState: "LOCKED" as const,
    provenanceClass: "APPROVED_CANON" as const,
    required: true as const,
    permittedScope: ["BODY"] as AtelierLayer[],
    dominance: 100,
    privacyClass: "PRIVATE_IDENTITY" as const,
  }, {
    role: "REAL_LULU_ANGLE_CONTACT" as const,
    assetId: "authority/angle-contact",
    sha256: digest("angle-contact"),
    garmentId: null,
    sourceStage: null,
    reviewState: "LOCKED" as const,
    provenanceClass: "REAL_DIRECT" as const,
    required: true as const,
    permittedScope: ["BODY"] as AtelierLayer[],
    dominance: 100,
    privacyClass: "PRIVATE_IDENTITY" as const,
  }, {
    role: "V4_TRANSLATION_LOCK" as const,
    assetId: "authority/v4-translation",
    sha256: digest("v4-translation"),
    garmentId: null,
    sourceStage: null,
    reviewState: "LOCKED" as const,
    provenanceClass: "APPROVED_CANON" as const,
    required: true as const,
    permittedScope: ["IDENTITY", "BODY", "HAIR"] as AtelierLayer[],
    dominance: 100,
    privacyClass: "PRIVATE_IDENTITY" as const,
  }];
  const hair = authorities.find((authority) => authority.role === "V4_TRANSLATION_LOCK");
  assert.ok(hair);
  const immutableSet = [
    ...parents.map((parent) => ({
      layer: "GARMENT" as const,
      assetId: parent.assetId,
      sha256: parent.sha256,
    })),
    ...ATELIER_STAGE_LAYER_POLICIES.SUBJECT_A.requiredImmutableLayers
      .filter((layer) => layer !== "GARMENT")
      .map((layer) => ({
        layer,
        assetId: hair.assetId,
        sha256: hair.sha256,
      })),
  ];
  return atelierOperationSchema.parse({
    contractVersion: "juw.atelier-operation.v1",
    workflowRevision: "durable-engine-test-v1",
    garmentId: "engine-test",
    stage: "SUBJECT_A",
    view: "SUBJECT",
    parentLocks: parents,
    authorityStack: authorities,
    changeSet: [{
      mutableLayer: correctionOf ? "IDENTITY" : "COMPOSITION",
      region: correctionOf ? "face translation" : "whole declared subject",
      intendedDelta: correctionOf
        ? "Correct only the authorized identity failure."
        : "Create one coherent subject candidate.",
    }],
    immutableSet,
    garmentFacts: ["Test garment construction is locked."],
    unknownFacts: ["Unseen construction remains unknown."],
    prohibitedInferences: ["Do not invent unseen construction."],
    sceneSpec: { background: "neutral" },
    cameraSpec: { family: "catalogue" },
    poseSpec: { view: "subject" },
    stylingSpec: { source: "server-owned" },
    renderQualityContract: {
      photographicRealism: "one coherent natural catalogue photograph",
      skinTexture: "natural texture",
      garmentTexture: "source-supported material response",
      lightingIntegration: "one plausible light field",
      opticsPerspective: "level natural catalogue perspective",
      artifactRejection: ["no cutout halo"],
    },
    outputContract: {
      imageCount: 1,
      layout: "SINGLE_CLEAN_FULL_IMAGE",
      fullBody: true,
      renderedText: false,
      labels: false,
      targetView: "SUBJECT",
      canvas: { width: 1024, height: 1536 },
      mode: "GENERATIVE_FULL_FRAME",
      generatedArtifact: {
        kind: "FULL_FRAME",
        format: "JPEG",
        alpha: "OPAQUE",
        background: "NEUTRAL_STAGE",
      },
      deterministicComposite: null,
      finalFormat: "JPEG",
    },
    failureGates: ["identity drift"],
    correctionOf,
    correctionBudget: correctionOf ? 0 : 1,
  });
}

function garmentFrontOperation(): AtelierOperation {
  const outputSha256 = digest("garment-direct-evidence");
  const receipt = directGarmentEvidenceReceiptSchema.parse({
    schemaVersion: "juw.direct-garment-evidence-receipt.v1",
    sourceManifest: {
      revision: "engine-test-source-manifest-v1",
      sha256: digest("engine-test-source-manifest"),
      attestationId: "engine-test-source-manifest-attestation-v1",
      verificationStatus: "VERIFIED",
    },
    recipeVersion: "direct-garment-evidence-pack-v1",
    compilerVersion: "direct-garment-evidence-pack-compiler-v1",
    constituents: ["a", "b", "c"].map((suffix) => ({
      assetId: `garment/engine-test/source-${suffix}`,
      sha256: digest(`garment-engine-test-source-${suffix}`),
      mimeType: "image/jpeg",
      byteSize: 1_000 + suffix.codePointAt(0)!,
      width: 600 + suffix.codePointAt(0)!,
      height: 900 + suffix.codePointAt(0)!,
    })),
    output: {
      assetId: "garment/engine-test/direct-evidence",
      sha256: outputSha256,
      mimeType: "image/png",
      byteSize: 12_345,
      width: 1536,
      height: 1536,
    },
  });
  const directEvidence = {
    role: "DIRECT_GARMENT_EVIDENCE" as const,
    assetId: "garment/engine-test/direct-evidence",
    sha256: outputSha256,
    garmentId: "engine-test",
    sourceStage: null,
    reviewState: "LOCKED" as const,
    provenanceClass: "GARMENT_DIRECT" as const,
    required: true as const,
    permittedScope: ["GARMENT"] as AtelierLayer[],
    dominance: 100,
    privacyClass: "PRIVATE_OPERATOR" as const,
  };
  return atelierOperationSchema.parse({
    contractVersion: "juw.atelier-operation.v1",
    workflowRevision: "durable-engine-test-v1",
    garmentId: "engine-test",
    stage: "GARMENT_01_FRONT",
    view: "01",
    parentLocks: [],
    authorityStack: [directEvidence],
    changeSet: [{
      mutableLayer: "COMPOSITION",
      region: "garment presentation",
      intendedDelta: "Present the direct garment front without changing its construction.",
    }],
    immutableSet: [{
      layer: "GARMENT",
      assetId: directEvidence.assetId,
      sha256: directEvidence.sha256,
    }],
    garmentFacts: ["Test garment front construction is direct evidence."],
    unknownFacts: ["Unseen construction remains unknown."],
    prohibitedInferences: ["Do not invent unseen construction."],
    sceneSpec: { background: "neutral product stage" },
    cameraSpec: { family: "catalogue", orientation: "front" },
    poseSpec: { view: "01", subject: "garment only" },
    stylingSpec: { source: "none" },
    renderQualityContract: {
      photographicRealism: "one coherent natural garment photograph",
      skinTexture: "not applicable to garment-only media",
      garmentTexture: "source-supported material response",
      lightingIntegration: "one plausible product light field",
      opticsPerspective: "level natural catalogue perspective",
      artifactRejection: ["no invented construction"],
    },
    outputContract: {
      imageCount: 1,
      layout: "SINGLE_CLEAN_FULL_IMAGE",
      fullBody: true,
      renderedText: false,
      labels: false,
      targetView: "01",
      canvas: { width: 1024, height: 1536 },
      mode: "GENERATIVE_GARMENT_MEDIA",
      generatedArtifact: {
        kind: "GARMENT_VIEW",
        format: "JPEG",
        alpha: "OPAQUE",
        background: "NEUTRAL_PRODUCT_STAGE",
      },
      deterministicComposite: null,
      finalFormat: "JPEG",
    },
    failureGates: ["garment construction drift"],
    correctionBudget: 1,
    directGarmentEvidence: receipt,
  });
}

function compiled(operation: AtelierOperation): CompiledAtelierOperationWithReceiptsV1 {
  const directGarmentEvidence = operation.directGarmentEvidence;
  return {
    operation,
    declarationReceipt: {
      sourceHash: digest("declaration-source"),
      schemaVersion: "juw.studio-atelier-declaration.v1",
      validatorRevision: "juw-studio-atelier-declaration-validator-v1",
      fileVerification: {
        status: "PASS",
        receiptHash: digest("verification-receipt"),
        verifiedAssetCount: 5,
        verifiedAt: "2026-08-26T12:00:00.000Z",
        manifestHash: digest("authority-manifest"),
        ...(directGarmentEvidence ? { directGarmentEvidence } : {}),
      },
    },
    truthReceipt: {
      bundleVersion: TRUSTED_ATELIER_TRUTH_BUNDLE_VERSION,
      stateFileHash: digest("state-file"),
      manifestRevision: "authority-test-v1",
      manifestHash: digest("authority-manifest"),
      garmentTruthRevision: "garment-test-v1",
      garmentTruthSourceHash: digest("garment-truth"),
      ...(directGarmentEvidence ? { directGarmentEvidence } : {}),
    },
  };
}

function operationRow(input: {
  id?: string;
  operation?: AtelierOperation;
  semanticHash?: string;
  correctionOrdinal?: number;
  correctionOfSemanticHash?: string | null;
} = {}): AtelierOperationRow {
  const operation = input.operation ?? subjectOperation();
  return {
    id: input.id ?? OPERATION_ID,
    operatorSubject: OPERATOR,
    operationKey: "durable-engine-operation-key",
    garmentId: operation.garmentId,
    view: operation.view,
    stage: operation.stage,
    contractVersion: operation.contractVersion,
    workflowRevision: operation.workflowRevision,
    semanticHash: input.semanticHash ?? digest("semantic-operation"),
    rootSemanticHash: digest("semantic-operation"),
    correctionOfSemanticHash: input.correctionOfSemanticHash ?? null,
    correctionOrdinal: input.correctionOrdinal ?? 0,
    canonicalOperation: operation,
  } as unknown as AtelierOperationRow;
}

function projection(
  state: AtelierOperationProjectionRow["state"],
  input: Partial<AtelierOperationProjectionRow> = {},
): AtelierOperationProjectionRow {
  return {
    operationId: OPERATION_ID,
    version: 0,
    state,
    technicalDecision: null,
    semanticDecision: null,
    userDecision: null,
    correctionAuthorized: false,
    materializedExecutionId: null,
    materializedArtifactId: null,
    materializedArtifactSha256: null,
    lockedArtifactId: null,
    lockedAssetId: null,
    lockedArtifactSha256: null,
    lockedParentDescriptor: null,
    supersededByOperationId: null,
    blockedReason: null,
    lastEventHash: null,
    ...input,
  } as AtelierOperationProjectionRow;
}

function executionRow(): AtelierExecutionRow {
  return {
    id: EXECUTION_ID,
    operationId: OPERATION_ID,
    state: "COMPLETE",
  } as unknown as AtelierExecutionRow;
}

function artifactRow(bytes: Uint8Array): AtelierArtifactRow {
  return {
    id: ARTIFACT_ID,
    executionId: EXECUTION_ID,
    ordinal: 0,
    kind: "NORMALIZED",
    role: "ATELIER_NORMALIZED_OUTPUT",
    state: "STORED",
    blobPathname: "private/normalized.jpg",
    blobUrl: "https://private.example/normalized.jpg",
    mimeType: "image/jpeg",
    byteSize: bytes.byteLength,
    width: 1024,
    height: 1536,
    sha256: digest(bytes),
  } as unknown as AtelierArtifactRow;
}

function eventRow(input: {
  eventType: string;
  sequence: number;
  evidence?: Record<string, unknown>;
}): AtelierLifecycleEventRow {
  return {
    id: `event-${input.sequence}`,
    operationId: OPERATION_ID,
    sequence: input.sequence,
    eventType: input.eventType,
    payload: { evidence: input.evidence ?? {} },
  } as unknown as AtelierLifecycleEventRow;
}

const unusedServerPort = async () => ({
  status: "PASS" as const,
  verifiedAssetCount: 1,
  verifiedAt: "2026-08-26T12:00:00.000Z",
  manifestHash: digest("manifest"),
});

const unusedTruthPort = async () => {
  throw new Error("truth resolution is not exercised by direct durable-port tests");
};

const unusedMaterializer = async () => ({ reused: true });

const verifiedG004Calibration = Object.freeze({
  receipt: STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT,
  assets: Object.freeze(STUDIO_ATELIER_G004_CALIBRATION_MANIFEST.assets.map((asset) =>
    Object.freeze({
      binding: Object.freeze({
        id: asset.id,
        view: asset.view,
        mimeType: asset.mimeType,
        byteSize: asset.byteSize,
        width: asset.width,
        height: asset.height,
        sha256: asset.sha256,
        pixelSha256: asset.pixelSha256,
        positiveTargetAxes: Object.freeze([...asset.positiveTargetAxes]),
      }),
      bytes: new Uint8Array(readFileSync(
        new URL(`../public${asset.sourcePath}`, import.meta.url),
      )),
    })
  )),
});

const unusedG004CalibrationResolver = async () => verifiedG004Calibration;

function g004ComparedEvidence(artifactSha256: string) {
  const target = STUDIO_ATELIER_G004_CALIBRATION_MANIFEST.assets[0]!;
  return {
    calibrationRevision: STUDIO_ATELIER_G004_CALIBRATION_REVISION,
    manifestSha256: STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT.manifestSha256,
    canonicalOriginalsStatus: "UNAVAILABLE" as const,
    derivativeDecision: "VERSION_LOCK_PUBLIC_SHOP_DERIVATIVES" as const,
    role: "POSITIVE_EVALUATION_TARGET" as const,
    candidateArtifactSha256: artifactSha256,
    readbackReceiptSha256: STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT.receiptSha256,
    disposition: "COMPARED" as const,
    target: {
      id: target.id,
      view: target.view,
      mimeType: target.mimeType,
      byteSize: target.byteSize,
      width: target.width,
      height: target.height,
      sha256: target.sha256,
      pixelSha256: target.pixelSha256,
    },
    pixelAccess: "EXACT_CANDIDATE_AND_DECODED_TARGET" as const,
    axisDecisions: target.positiveTargetAxes.map((axis) => ({ axis, decision: "PASS" as const })),
    prohibitedTransferDecisions:
      STUDIO_ATELIER_G004_CALIBRATION_MANIFEST.prohibitedTransferScopes.map((scope) => ({
        scope,
        decision: "PASS" as const,
      })),
    directAuthorityPrecedenceConfirmed: true as const,
  };
}

function g004NotApplicableEvidence(artifactSha256: string) {
  return {
    calibrationRevision: STUDIO_ATELIER_G004_CALIBRATION_REVISION,
    manifestSha256: STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT.manifestSha256,
    canonicalOriginalsStatus: "UNAVAILABLE" as const,
    derivativeDecision: "VERSION_LOCK_PUBLIC_SHOP_DERIVATIVES" as const,
    role: "POSITIVE_EVALUATION_TARGET" as const,
    candidateArtifactSha256: artifactSha256,
    disposition: "NOT_APPLICABLE" as const,
    reason: "GARMENT_ONLY_STAGE" as const,
    readback: "NOT_REQUIRED" as const,
  };
}

function technicalEvidence(
  artifact: AtelierArtifactRow,
): StudioAtelierTechnicalQualityEvidence {
  return {
    schemaVersion: "juw.atelier-technical-qa.v1",
    rubricVersion: "juw.atelier-technical-rubric.v1",
    thresholdVersion: "juw.atelier-technical-thresholds.v1",
    evaluatedAt: "2026-08-26T12:00:00.000Z",
    evaluator: TECHNICAL_EVALUATOR,
    artifact: {
      sha256: artifact.sha256,
      kind: "NORMALIZED",
      mimeType: "image/jpeg",
      byteSize: artifact.byteSize,
      width: artifact.width!,
      height: artifact.height!,
    },
    checks: {
      decodableImage: "PASS",
      exactByteHash: "PASS",
      singleCleanImage: "PASS",
      outputContract: "PASS",
      colourSpace: "PASS",
      canonicalNormalization: "PASS",
      noRenderedText: "PASS",
      noWatermark: "PASS",
      sourceLayerAlpha: "NOT_APPLICABLE",
    },
  };
}

function semanticEvidence(
  artifact: AtelierArtifactRow,
): StudioAtelierSemanticQualityEvidence {
  return {
    schemaVersion: STUDIO_ATELIER_SEMANTIC_QA_SCHEMA_VERSION,
    rubricVersion: STUDIO_ATELIER_SEMANTIC_RUBRIC_VERSION,
    thresholdVersion: "juw.atelier-semantic-thresholds.v1",
    evaluatedAt: "2026-08-26T12:00:01.000Z",
    evaluator: SEMANTIC_EVALUATOR,
    artifactSha256: artifact.sha256,
    stage: "SUBJECT_A",
    multiEraBaseline: {
      revision: STUDIO_ATELIER_MULTI_ERA_BASELINE_REVISION,
      anchors: ["G001", "G004", "G005", "G009", "G023", "G024"],
      directRealAuthorityOutranksGenerated: true,
      g004PositiveTarget: g004ComparedEvidence(artifact.sha256),
    },
    authorityReview: {
      directGarmentEvidence: "PASS",
      realIdentityEvidence: "PASS",
      realBodyAngleEvidence: "PASS",
      generatedControlsSubordinate: "PASS",
      currentGarmentLineage: "PASS",
      lockedRoomAuthority: "NOT_APPLICABLE",
      inferredRearQuarantine: "NOT_APPLICABLE",
      multiEraDriftBaseline: "PASS",
    },
    semanticGates: {
      garmentTruth: "PASS",
      identity: "PASS",
      connectedBodyGeometry: "PASS",
      hair: "PASS",
      atelierAndBrandIcon: "NOT_APPLICABLE",
      viewGrammar: "PASS",
      parentLineage: "PASS",
      fullFrameFormat: "PASS",
      privacyAndProvenance: "PASS",
    },
    renderQualityReview: {
      photographicRealism: "PASS",
      skinTexture: "PASS",
      garmentTexture: "PASS",
      lightingIntegration: "PASS",
      opticsPerspective: "PASS",
      artifactRejection: "PASS",
    },
  };
}

function garmentFrontSemanticEvidence(
  artifact: AtelierArtifactRow,
): StudioAtelierSemanticQualityEvidence {
  return {
    schemaVersion: STUDIO_ATELIER_SEMANTIC_QA_SCHEMA_VERSION,
    rubricVersion: STUDIO_ATELIER_SEMANTIC_RUBRIC_VERSION,
    thresholdVersion: "juw.atelier-semantic-thresholds.v1",
    evaluatedAt: "2026-08-26T12:00:01.000Z",
    evaluator: SEMANTIC_EVALUATOR,
    artifactSha256: artifact.sha256,
    stage: "GARMENT_01_FRONT",
    multiEraBaseline: {
      revision: STUDIO_ATELIER_MULTI_ERA_BASELINE_REVISION,
      anchors: ["G001", "G004", "G005", "G009", "G023", "G024"],
      directRealAuthorityOutranksGenerated: true,
      g004PositiveTarget: g004NotApplicableEvidence(artifact.sha256),
    },
    authorityReview: {
      directGarmentEvidence: "PASS",
      realIdentityEvidence: "NOT_APPLICABLE",
      realBodyAngleEvidence: "NOT_APPLICABLE",
      generatedControlsSubordinate: "NOT_APPLICABLE",
      currentGarmentLineage: "PASS",
      lockedRoomAuthority: "NOT_APPLICABLE",
      inferredRearQuarantine: "NOT_APPLICABLE",
      multiEraDriftBaseline: "PASS",
    },
    semanticGates: {
      garmentTruth: "PASS",
      identity: "NOT_APPLICABLE",
      connectedBodyGeometry: "NOT_APPLICABLE",
      hair: "NOT_APPLICABLE",
      atelierAndBrandIcon: "NOT_APPLICABLE",
      viewGrammar: "PASS",
      parentLineage: "PASS",
      fullFrameFormat: "PASS",
      privacyAndProvenance: "PASS",
    },
    renderQualityReview: {
      photographicRealism: "PASS",
      skinTexture: "NOT_APPLICABLE",
      garmentTexture: "PASS",
      lightingIntegration: "PASS",
      opticsPerspective: "PASS",
      artifactRejection: "PASS",
    },
  };
}

const unusedTechnicalQualityEvaluator = async () => technicalEvidence(
  artifactRow(new TextEncoder().encode("unused")),
);
const unusedSemanticQualityEvaluator = async () => semanticEvidence(
  artifactRow(new TextEncoder().encode("unused")),
);

const unusedCorrectionPreparer = async () => ({ operationId: CORRECTION_ID });

const unusedRoomResolver = async () => {
  throw new Error("room resolution is not exercised by these opaque-subject tests");
};

const unusedLock = async () => projection("LOCKED");

test("durable prepare returns one stable operation and marks repeat preparation as reused", async () => {
  const operation = subjectOperation();
  const row = operationRow({ operation });
  let stored: AtelierOperationRow | null = null;
  let currentProjection = projection("DRAFT");
  let creates = 0;
  const ports = createDurableStudioAtelierEnginePorts({
    resolveFileVerification: unusedServerPort,
    resolveTrustedTruth: unusedTruthPort,
    resolveG004Calibration: unusedG004CalibrationResolver,
    materializeOnce: unusedMaterializer,
    evaluateTechnicalQuality: unusedTechnicalQualityEvaluator,
    evaluateSemanticQuality: unusedSemanticQualityEvaluator,
    prepareCorrection: unusedCorrectionPreparer,
    resolveLockedRoom: unusedRoomResolver,
    overrides: {
      getOperationByKey: async () => stored,
      createOperation: async (input) => {
        creates += 1;
        assert.equal(input.semanticHash, digest("semantic-operation"));
        assert.deepEqual(input.canonicalOperation, operation);
        stored ??= row;
        return stored;
      },
      getOperation: async () => stored,
      getProjection: async () => currentProjection,
      getCorrectionOperation: async () => null,
      listEvents: async () => [],
      lockApprovedOnce: unusedLock,
    },
  });
  const command: Parameters<StudioAtelierEnginePorts["prepareCompiledOperation"]>[0] = {
    operatorSubject: OPERATOR,
    operationKey: "durable-engine-operation-key",
    semanticHash: digest("semantic-operation"),
    compiled: compiled(operation),
  };

  const first = await ports.prepareCompiledOperation(command);
  currentProjection = { ...currentProjection, version: first.snapshot.version };
  const repeated = await ports.prepareCompiledOperation(command);
  assert.equal(first.snapshot.operationId, OPERATION_ID);
  assert.equal(repeated.snapshot.operationId, OPERATION_ID);
  assert.equal(first.created, true);
  assert.equal(repeated.created, false);
  assert.equal(creates, 2, "the repository idempotency path may be re-entered without duplicating the row");
});

test("quality-event evidence cannot masquerade as a human review decision", async () => {
  const ports = createDurableStudioAtelierEnginePorts({
    resolveFileVerification: unusedServerPort,
    resolveTrustedTruth: unusedTruthPort,
    resolveG004Calibration: unusedG004CalibrationResolver,
    materializeOnce: unusedMaterializer,
    evaluateTechnicalQuality: unusedTechnicalQualityEvaluator,
    evaluateSemanticQuality: unusedSemanticQualityEvaluator,
    prepareCorrection: unusedCorrectionPreparer,
    resolveLockedRoom: unusedRoomResolver,
    overrides: {
      getOperation: async () => operationRow(),
      getProjection: async () => projection("MATERIALIZED"),
      getCorrectionOperation: async () => null,
      listEvents: async () => [eventRow({
        eventType: "TECHNICAL_PASS",
        sequence: 1,
        evidence: { reviewDecision: { decision: "REJECT", reason: "FORGED_QA_REVIEW" } },
      })],
      lockApprovedOnce: unusedLock,
    },
  });
  const snapshot = await ports.readProjection({
    operatorSubject: OPERATOR,
    operationId: OPERATION_ID,
  });
  assert.equal(snapshot?.reviewDecision, null);
});

test("missing G004 pixels block a subject operation before materialization or spend", async () => {
  let calibrationCalls = 0;
  let materializerCalls = 0;
  const ports = createDurableStudioAtelierEnginePorts({
    resolveFileVerification: unusedServerPort,
    resolveTrustedTruth: unusedTruthPort,
    resolveG004Calibration: async () => {
      calibrationCalls += 1;
      throw new Error("missing calibration pixels");
    },
    materializeOnce: async () => {
      materializerCalls += 1;
      return { reused: false };
    },
    evaluateTechnicalQuality: unusedTechnicalQualityEvaluator,
    evaluateSemanticQuality: unusedSemanticQualityEvaluator,
    prepareCorrection: unusedCorrectionPreparer,
    resolveLockedRoom: unusedRoomResolver,
    overrides: {
      getOperation: async () => operationRow(),
      lockApprovedOnce: unusedLock,
    },
  });

  await assert.rejects(
    ports.materializeOnce({ operatorSubject: OPERATOR, operationId: OPERATION_ID }),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "ENGINE_UNAVAILABLE"
      && /pre-spend readback/i.test(error.message),
  );
  assert.equal(calibrationCalls, 1);
  assert.equal(materializerCalls, 0);
});

test("a forged G004 receipt with substituted bytes blocks before materialization", async () => {
  let materializerCalls = 0;
  const forgedCalibration = {
    ...verifiedG004Calibration,
    assets: verifiedG004Calibration.assets.map((asset, index) => ({
      ...asset,
      bytes: index === 0 ? new Uint8Array([1]) : asset.bytes,
    })),
  };
  const ports = createDurableStudioAtelierEnginePorts({
    resolveFileVerification: unusedServerPort,
    resolveTrustedTruth: unusedTruthPort,
    resolveG004Calibration: async () => forgedCalibration,
    materializeOnce: async () => {
      materializerCalls += 1;
      return { reused: false };
    },
    evaluateTechnicalQuality: unusedTechnicalQualityEvaluator,
    evaluateSemanticQuality: unusedSemanticQualityEvaluator,
    prepareCorrection: unusedCorrectionPreparer,
    resolveLockedRoom: unusedRoomResolver,
    overrides: {
      getOperation: async () => operationRow(),
      lockApprovedOnce: unusedLock,
    },
  });

  await assert.rejects(
    ports.materializeOnce({ operatorSubject: OPERATOR, operationId: OPERATION_ID }),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "ENGINE_UNAVAILABLE"
      && /pre-spend readback/i.test(error.message),
  );
  assert.equal(materializerCalls, 0);
});

function createQualityHarness(input: {
  technical: StudioAtelierTechnicalQualityEvidence;
  semantic: StudioAtelierSemanticQualityEvidence;
  operation?: AtelierOperation;
  resolveG004Calibration?: typeof unusedG004CalibrationResolver;
  mutateG004TargetDuringEvaluation?: boolean;
}) {
  const parsedSemantic = studioAtelierSemanticQualityEvidenceSchema.safeParse(input.semantic);
  assert.equal(
    parsedSemantic.success,
    true,
    parsedSemantic.success ? undefined : JSON.stringify(parsedSemantic.error.issues),
  );
  const bytes = new TextEncoder().encode("server-owned normalized quality target");
  const artifact = artifactRow(bytes);
  const operation = operationRow({ operation: input.operation });
  let current = projection("MATERIALIZED", {
    version: 1,
    materializedExecutionId: EXECUTION_ID,
    materializedArtifactId: ARTIFACT_ID,
    materializedArtifactSha256: artifact.sha256,
  });
  const eventTypes: string[] = [];
  const eventEvidence: Record<string, unknown>[] = [];
  let technicalCalls = 0;
  let semanticCalls = 0;
  const ports = createDurableStudioAtelierEnginePorts({
    resolveFileVerification: unusedServerPort,
    resolveTrustedTruth: unusedTruthPort,
    resolveG004Calibration:
      input.resolveG004Calibration ?? unusedG004CalibrationResolver,
    materializeOnce: unusedMaterializer,
    evaluateTechnicalQuality: async (context) => {
      technicalCalls += 1;
      assert.equal(context.operation.id, OPERATION_ID);
      assert.deepEqual(context.artifactBytes, bytes);
      return input.technical;
    },
    evaluateSemanticQuality: async (context) => {
      semanticCalls += 1;
      assert.deepEqual(context.artifactBytes, bytes);
      if (input.semantic.stage.startsWith("GARMENT_")) {
        assert.equal(context.g004Calibration, null);
      } else {
        assert.equal(
          context.g004Calibration?.receipt.receiptSha256,
          STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT.receiptSha256,
        );
        assert.equal(context.g004Calibration?.target.binding.view, "05");
        assert.deepEqual(
          context.g004Calibration?.target.bytes,
          verifiedG004Calibration.assets[0]!.bytes,
        );
        assert.equal("assets" in context.g004Calibration!, false);
      }
      if (input.mutateG004TargetDuringEvaluation && context.g004Calibration) {
        context.g004Calibration.target.bytes[0] =
          context.g004Calibration.target.bytes[0]! ^ 0xff;
      }
      return input.semantic;
    },
    prepareCorrection: unusedCorrectionPreparer,
    resolveLockedRoom: unusedRoomResolver,
    overrides: {
      getOperation: async () => operation,
      getProjection: async () => current,
      getCorrectionOperation: async () => null,
      getExecution: async () => executionRow(),
      listArtifacts: async () => [artifact],
      listEvents: async () => [],
      readArtifact: async () => bytes,
      recordLifecycleEvent: async (command) => {
        eventTypes.push(command.eventType);
        eventEvidence.push(command.evidence ?? {});
        assert.equal(command.expectedVersion, current.version);
        assert.equal(command.executionId, EXECUTION_ID);
        assert.equal(command.artifactId, ARTIFACT_ID);
        if (command.eventType === "TECHNICAL_PASS") {
          current = {
            ...current,
            state: "TECHNICAL_PASS",
            technicalDecision: "PASS",
            version: current.version + 1,
          };
        } else if (command.eventType === "TECHNICAL_FAIL") {
          current = {
            ...current,
            state: "TECHNICAL_FAIL",
            technicalDecision: "FAIL",
            blockedReason: command.reasonCode ?? null,
            version: current.version + 1,
          };
        } else if (command.eventType === "SEMANTIC_PASS") {
          current = {
            ...current,
            state: "SEMANTIC_PASS",
            semanticDecision: "PASS",
            version: current.version + 1,
          };
        } else if (command.eventType === "SEMANTIC_FAIL") {
          current = {
            ...current,
            state: "SEMANTIC_FAIL",
            semanticDecision: "FAIL",
            blockedReason: command.reasonCode ?? null,
            version: current.version + 1,
          };
        } else {
          throw new Error(`unexpected QA event ${command.eventType}`);
        }
        return {
          projection: current,
          event: eventRow({
            eventType: command.eventType,
            sequence: current.version,
            evidence: command.evidence,
          }),
        };
      },
      lockApprovedOnce: unusedLock,
    },
  });
  return {
    ports,
    state: () => current,
    calls: () => ({ technicalCalls, semanticCalls, eventTypes }),
    evidence: () => eventEvidence,
  };
}

test("quality advancement records technical then semantic gates from server-owned bytes", async () => {
  const fixtureArtifact = artifactRow(
    new TextEncoder().encode("server-owned normalized quality target"),
  );
  const passing = createQualityHarness({
    technical: technicalEvidence(fixtureArtifact),
    semantic: semanticEvidence(fixtureArtifact),
  });
  const passed = await passing.ports.advanceQualityOnce({
    operatorSubject: OPERATOR,
    operationId: OPERATION_ID,
  });
  assert.equal(passed.state, "SEMANTIC_PASS");
  assert.deepEqual(passing.calls(), {
    technicalCalls: 1,
    semanticCalls: 1,
    eventTypes: ["TECHNICAL_PASS", "SEMANTIC_PASS"],
  });

  const failingTechnical = technicalEvidence(fixtureArtifact);
  failingTechnical.checks.outputContract = "FAIL";
  const failing = createQualityHarness({
    technical: failingTechnical,
    semantic: semanticEvidence(fixtureArtifact),
  });
  const failed = await failing.ports.advanceQualityOnce({
    operatorSubject: OPERATOR,
    operationId: OPERATION_ID,
  });
  assert.equal(failed.state, "TECHNICAL_FAIL");
  assert.deepEqual(failing.calls(), {
    technicalCalls: 1,
    semanticCalls: 0,
    eventTypes: ["TECHNICAL_FAIL"],
  });
  assert.equal(failing.state().blockedReason, "TECHNICAL_OUTPUT_CONTRACT_FAILED");
});

test("calibration disappearance after materialization stops at TECHNICAL_PASS", async () => {
  const fixtureArtifact = artifactRow(
    new TextEncoder().encode("server-owned normalized quality target"),
  );
  const harness = createQualityHarness({
    technical: technicalEvidence(fixtureArtifact),
    semantic: semanticEvidence(fixtureArtifact),
    resolveG004Calibration: async () => {
      throw new Error("calibration disappeared");
    },
  });

  await assert.rejects(
    harness.ports.advanceQualityOnce({ operatorSubject: OPERATOR, operationId: OPERATION_ID }),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "ENGINE_UNAVAILABLE"
      && /semantic-QA readback/i.test(error.message),
  );
  assert.equal(harness.state().state, "TECHNICAL_PASS");
  assert.deepEqual(harness.calls(), {
    technicalCalls: 1,
    semanticCalls: 0,
    eventTypes: ["TECHNICAL_PASS"],
  });
});

test("a semantic evaluator cannot mutate the stage-scoped G004 target", async () => {
  const fixtureArtifact = artifactRow(
    new TextEncoder().encode("server-owned normalized quality target"),
  );
  const harness = createQualityHarness({
    technical: technicalEvidence(fixtureArtifact),
    semantic: semanticEvidence(fixtureArtifact),
    mutateG004TargetDuringEvaluation: true,
  });

  await assert.rejects(
    harness.ports.advanceQualityOnce({ operatorSubject: OPERATOR, operationId: OPERATION_ID }),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "ENGINE_UNAVAILABLE"
      && /changed during semantic evaluation/i.test(error.message),
  );
  assert.equal(harness.state().state, "TECHNICAL_PASS");
  assert.deepEqual(harness.calls(), {
    technicalCalls: 1,
    semanticCalls: 1,
    eventTypes: ["TECHNICAL_PASS"],
  });
});

test("independent garment 01 advances through the durable technical and ordered semantic QA lifecycle", async () => {
  const fixtureArtifact = artifactRow(
    new TextEncoder().encode("server-owned normalized quality target"),
  );
  const harness = createQualityHarness({
    operation: garmentFrontOperation(),
    technical: technicalEvidence(fixtureArtifact),
    semantic: garmentFrontSemanticEvidence(fixtureArtifact),
  });

  const passed = await harness.ports.advanceQualityOnce({
    operatorSubject: OPERATOR,
    operationId: OPERATION_ID,
  });

  assert.equal(passed.state, "SEMANTIC_PASS");
  assert.deepEqual(harness.calls(), {
    technicalCalls: 1,
    semanticCalls: 1,
    eventTypes: ["TECHNICAL_PASS", "SEMANTIC_PASS"],
  });
  assert.doesNotMatch(
    JSON.stringify(harness.evidence()[1]),
    /blobPathname|sourcePath|"bytes"/,
  );
  assert.deepEqual(harness.evidence()[1]?.orderedGateSequence, [
    { gate: "GARMENT", decision: "PASS" },
    { gate: "FACE", decision: "NOT_APPLICABLE" },
    { gate: "BODY", decision: "NOT_APPLICABLE" },
    { gate: "ROOM", decision: "NOT_APPLICABLE" },
    { gate: "FINAL_INTEGRATION", decision: "PASS" },
  ]);
});

test("invalid evaluator evidence fails closed without advancing the ledger", async () => {
  const fixtureArtifact = artifactRow(
    new TextEncoder().encode("server-owned normalized quality target"),
  );
  const invalid = createQualityHarness({
    technical: { source: "open evidence is forbidden" } as unknown as StudioAtelierTechnicalQualityEvidence,
    semantic: semanticEvidence(fixtureArtifact),
  });
  await assert.rejects(
    invalid.ports.advanceQualityOnce({ operatorSubject: OPERATOR, operationId: OPERATION_ID }),
    (error: unknown) => error instanceof StudioEngineError && error.code === "ENGINE_UNAVAILABLE",
  );
  assert.deepEqual(invalid.calls(), {
    technicalCalls: 1,
    semanticCalls: 0,
    eventTypes: [],
  });
  assert.equal(invalid.state().state, "MATERIALIZED");
});

test("a structurally valid forged technical evaluator descriptor cannot persist or advance", async () => {
  const fixtureArtifact = artifactRow(
    new TextEncoder().encode("server-owned normalized quality target"),
  );
  const forged = technicalEvidence(fixtureArtifact);
  forged.evaluator = {
    ...TECHNICAL_EVALUATOR,
    qualificationReceiptSha256: digest("forged technical evaluator qualification"),
  };
  const harness = createQualityHarness({
    technical: forged,
    semantic: semanticEvidence(fixtureArtifact),
  });

  await assert.rejects(
    harness.ports.advanceQualityOnce({
      operatorSubject: OPERATOR,
      operationId: OPERATION_ID,
    }),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "ENGINE_UNAVAILABLE",
  );
  assert.deepEqual(harness.calls(), {
    technicalCalls: 1,
    semanticCalls: 0,
    eventTypes: [],
  });
  assert.deepEqual(harness.evidence(), []);
  assert.equal(harness.state().state, "MATERIALIZED");
});

test("a structurally valid forged semantic evaluator descriptor cannot enter the ledger", async () => {
  const fixtureArtifact = artifactRow(
    new TextEncoder().encode("server-owned normalized quality target"),
  );
  const forgedReceipt = digest("forged semantic evaluator qualification");
  const forged = semanticEvidence(fixtureArtifact);
  forged.evaluator = {
    ...SEMANTIC_EVALUATOR,
    qualificationReceiptSha256: forgedReceipt,
  };
  const harness = createQualityHarness({
    technical: technicalEvidence(fixtureArtifact),
    semantic: forged,
  });

  await assert.rejects(
    harness.ports.advanceQualityOnce({
      operatorSubject: OPERATOR,
      operationId: OPERATION_ID,
    }),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "ENGINE_UNAVAILABLE",
  );
  assert.deepEqual(harness.calls(), {
    technicalCalls: 1,
    semanticCalls: 1,
    eventTypes: ["TECHNICAL_PASS"],
  });
  assert.equal(harness.evidence().length, 1);
  assert.equal(JSON.stringify(harness.evidence()).includes(forgedReceipt), false);
  assert.equal(harness.state().state, "TECHNICAL_PASS");
});

for (const terminalState of ["FAILED", "QUARANTINED", "INDETERMINATE"] as const) {
  test(`${terminalState} execution atomically blocks DRAFT and never advertises GENERATE again`, async () => {
    let current = projection("DRAFT", { version: 4 });
    let materializerCalls = 0;
    const lifecycleCommands: Array<Record<string, unknown>> = [];
    const terminalExecution = {
      ...executionRow(),
      state: terminalState,
      errorCode: `${terminalState}_TEST`,
      providerInvocationStartedAt: new Date("2026-08-26T12:00:00.000Z"),
    } as AtelierExecutionRow;
    const ports = createDurableStudioAtelierEnginePorts({
      resolveFileVerification: unusedServerPort,
      resolveTrustedTruth: unusedTruthPort,
      resolveG004Calibration: unusedG004CalibrationResolver,
      materializeOnce: async () => {
        materializerCalls += 1;
        if (terminalState === "INDETERMINATE") {
          throw new Error("simulated post-dispatch terminalization");
        }
        return { reused: false };
      },
      evaluateTechnicalQuality: unusedTechnicalQualityEvaluator,
      evaluateSemanticQuality: unusedSemanticQualityEvaluator,
      prepareCorrection: unusedCorrectionPreparer,
      resolveLockedRoom: unusedRoomResolver,
      overrides: {
        getOperation: async () => operationRow(),
        getProjection: async () => current,
        getCorrectionOperation: async () => null,
        getLatestExecution: async () => terminalExecution,
        listEvents: async () => [],
        recordLifecycleEvent: async (command) => {
          lifecycleCommands.push(command as unknown as Record<string, unknown>);
          assert.equal(command.eventType, "BLOCKED_USER_DIRECTION");
          assert.equal(command.expectedVersion, current.version);
          assert.equal(command.actorSubject, "system:atelier-execution");
          assert.equal(command.executionId, EXECUTION_ID);
          assert.equal(
            command.reasonCode,
            `EXECUTION_${terminalState}:${terminalState}_TEST`,
          );
          current = {
            ...current,
            version: current.version + 1,
            state: "BLOCKED_USER_DIRECTION",
            blockedReason: command.reasonCode ?? null,
          };
          return {
            projection: current,
            event: eventRow({
              eventType: command.eventType,
              sequence: current.version,
              evidence: command.evidence,
            }),
          };
        },
        lockApprovedOnce: unusedLock,
      },
    });
    const facade = createStudioAtelierEngineFacade(ports);

    const first = await facade.generate(OPERATOR, OPERATION_ID);
    const repeated = await facade.generate(OPERATOR, OPERATION_ID);

    assert.equal(first.state, "BLOCKED_USER_DIRECTION");
    assert.equal(first.nextAction, "USER_DIRECTION_REQUIRED");
    assert.equal(first.reused, false);
    assert.equal(repeated.state, "BLOCKED_USER_DIRECTION");
    assert.equal(repeated.nextAction, "USER_DIRECTION_REQUIRED");
    assert.equal(repeated.reused, true);
    assert.equal(materializerCalls, 1);
    assert.equal(lifecycleCommands.length, 1);
    assert.equal(
      current.blockedReason,
      `EXECUTION_${terminalState}:${terminalState}_TEST`,
    );
  });
}

function createReviewHarness(input: {
  operation: AtelierOperationRow;
  initialProjection: AtelierOperationProjectionRow;
  prepareCorrectionFailures?: number;
}) {
  let current = input.initialProjection;
  let correction: AtelierOperationRow | null = null;
  let prepareCorrectionCalls = 0;
  const events: AtelierLifecycleEventRow[] = [];
  const ports = createDurableStudioAtelierEnginePorts({
    resolveFileVerification: unusedServerPort,
    resolveTrustedTruth: unusedTruthPort,
    resolveG004Calibration: unusedG004CalibrationResolver,
    materializeOnce: unusedMaterializer,
    evaluateTechnicalQuality: unusedTechnicalQualityEvaluator,
    evaluateSemanticQuality: unusedSemanticQualityEvaluator,
    prepareCorrection: async ({ sourceOperationId, decision }) => {
      prepareCorrectionCalls += 1;
      assert.equal(sourceOperationId, OPERATION_ID);
      assert.equal(decision.decision, "FIX_ONE_THING");
      if (prepareCorrectionCalls <= (input.prepareCorrectionFailures ?? 0)) {
        throw new Error("simulated crash after correction authorization");
      }
      const correctionOperation = subjectOperation(input.operation.semanticHash);
      correction = operationRow({
        id: CORRECTION_ID,
        operation: correctionOperation,
        semanticHash: digest("correction-semantic"),
        correctionOrdinal: 1,
        correctionOfSemanticHash: input.operation.semanticHash,
      });
      return { operationId: CORRECTION_ID };
    },
    resolveLockedRoom: unusedRoomResolver,
    overrides: {
      getOperation: async ({ operationId }) =>
        operationId === CORRECTION_ID ? correction : input.operation,
      getProjection: async () => current,
      getCorrectionOperation: async () => correction,
      listEvents: async () => events,
      recordLifecycleEvent: async (command) => {
        assert.equal(command.expectedVersion, current.version);
        if (command.eventType === "USER_REJECTED") {
          current = {
            ...current,
            state: "USER_REJECTED",
            userDecision: "REJECTED",
            version: current.version + 1,
          };
        } else if (command.eventType === "CORRECTION_AUTHORIZED") {
          assert.equal(current.correctionAuthorized, false);
          current = {
            ...current,
            correctionAuthorized: true,
            version: current.version + 1,
          };
        } else if (command.eventType === "BLOCKED_USER_DIRECTION") {
          current = {
            ...current,
            state: "BLOCKED_USER_DIRECTION",
            blockedReason: command.reasonCode ?? null,
            version: current.version + 1,
          };
        } else {
          throw new Error(`unexpected review event ${command.eventType}`);
        }
        const event = eventRow({
          eventType: command.eventType,
          sequence: current.version,
          evidence: command.evidence,
        });
        events.push(event);
        return { projection: current, event };
      },
      lockApprovedOnce: unusedLock,
    },
  });
  return {
    ports,
    events,
    state: () => current,
    prepareCorrectionCalls: () => prepareCorrectionCalls,
  };
}

const boundedFix = {
  decision: "FIX_ONE_THING" as const,
  reason: "IDENTITY_DRIFT" as const,
  target: "FACE_TRANSLATION" as const,
};

test("one bounded correction authorization is durable and repeated review reuses it", async () => {
  const source = operationRow();
  const harness = createReviewHarness({
    operation: source,
    initialProjection: projection("SEMANTIC_PASS", {
      version: 7,
      semanticDecision: "PASS",
      materializedExecutionId: EXECUTION_ID,
      materializedArtifactId: ARTIFACT_ID,
      materializedArtifactSha256: digest("artifact"),
    }),
  });
  const command = {
    operatorSubject: OPERATOR,
    operationId: OPERATION_ID,
    decision: boundedFix,
  };

  const first = await harness.ports.recordReviewOnce(command);
  const repeated = await harness.ports.recordReviewOnce(command);
  assert.equal(first.state, "USER_REJECTED");
  assert.equal(first.correctionAuthorized, true);
  assert.equal(first.correctionOperationId, CORRECTION_ID);
  assert.deepEqual(repeated, first);
  assert.deepEqual(harness.events.map((event) => event.eventType), [
    "USER_REJECTED",
    "CORRECTION_AUTHORIZED",
  ]);
  assert.equal(harness.prepareCorrectionCalls(), 1);
});

test("durable bounded correction resumes after authorization/preparation crash", async () => {
  const source = operationRow();
  const harness = createReviewHarness({
    operation: source,
    initialProjection: projection("SEMANTIC_PASS", {
      version: 7,
      semanticDecision: "PASS",
      materializedExecutionId: EXECUTION_ID,
      materializedArtifactId: ARTIFACT_ID,
      materializedArtifactSha256: digest("artifact"),
    }),
    prepareCorrectionFailures: 1,
  });
  const command = {
    operatorSubject: OPERATOR,
    operationId: OPERATION_ID,
    decision: boundedFix,
  };

  await assert.rejects(
    () => harness.ports.recordReviewOnce(command),
    /simulated crash after correction authorization/,
  );
  assert.equal(harness.state().state, "USER_REJECTED");
  assert.equal(harness.state().correctionAuthorized, true);

  const resumed = await harness.ports.recordReviewOnce(command);
  assert.equal(resumed.correctionOperationId, CORRECTION_ID);
  assert.deepEqual(harness.events.map((event) => event.eventType), [
    "USER_REJECTED",
    "CORRECTION_AUTHORIZED",
  ]);
  assert.equal(harness.prepareCorrectionCalls(), 2);
});

test("a correction cannot authorize another correction and blocks for user direction", async () => {
  const sourceSemanticHash = digest("source-semantic");
  const correctionOperation = subjectOperation(sourceSemanticHash);
  const correction = operationRow({
    operation: correctionOperation,
    semanticHash: digest("correction-semantic"),
    correctionOrdinal: 1,
    correctionOfSemanticHash: sourceSemanticHash,
  });
  const harness = createReviewHarness({
    operation: correction,
    initialProjection: projection("SEMANTIC_PASS", {
      version: 3,
      semanticDecision: "PASS",
      materializedExecutionId: EXECUTION_ID,
      materializedArtifactId: ARTIFACT_ID,
      materializedArtifactSha256: digest("corrected-artifact"),
    }),
  });

  const result = await harness.ports.recordReviewOnce({
    operatorSubject: OPERATOR,
    operationId: OPERATION_ID,
    decision: boundedFix,
  });
  assert.equal(result.state, "BLOCKED_USER_DIRECTION");
  assert.equal(result.correctionAuthorized, false);
  assert.equal(result.correctionOperationId, null);
  assert.equal(harness.state().blockedReason, "CORRECTION_BUDGET_EXHAUSTED");
  assert.deepEqual(harness.events.map((event) => event.eventType), [
    "USER_REJECTED",
    "BLOCKED_USER_DIRECTION",
  ]);
  assert.equal(harness.prepareCorrectionCalls(), 0);
});
