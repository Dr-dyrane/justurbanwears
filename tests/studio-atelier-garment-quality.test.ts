import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  assessStudioAtelierSemanticQuality,
  assessStudioAtelierTechnicalQuality,
  type StudioAtelierEvaluatorDescriptor,
  type StudioAtelierSemanticQualityEvidence,
  type StudioAtelierTechnicalQualityEvidence,
} from "../lib/studio/atelier/quality-contracts";
import {
  STUDIO_ATELIER_G004_CALIBRATION_MANIFEST_SHA256,
  STUDIO_ATELIER_G004_CALIBRATION_REVISION,
} from "../lib/studio/atelier/g004-calibration";

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const TECHNICAL_EVALUATOR = Object.freeze({
  id: "closed-garment-technical-evaluator",
  version: "v1",
  policyRevision: "closed-garment-technical-policy-v1",
  qualificationSuiteVersion: "closed-garment-qualification-v1",
  qualificationReceiptSha256: digest("closed garment technical qualification"),
}) satisfies StudioAtelierEvaluatorDescriptor;

const SEMANTIC_EVALUATOR = Object.freeze({
  id: "closed-garment-semantic-evaluator",
  version: "v1",
  policyRevision: "closed-garment-semantic-policy-v1",
  qualificationSuiteVersion: "closed-garment-qualification-v1",
  qualificationReceiptSha256: digest("closed garment semantic qualification"),
}) satisfies StudioAtelierEvaluatorDescriptor;

const ARTIFACT = Object.freeze({
  sha256: digest("garment-review-artifact"),
  kind: "NORMALIZED",
  mimeType: "image/jpeg",
  byteSize: 2_048,
  width: 1_024,
  height: 1_536,
} as const);

function technicalEvidence(): StudioAtelierTechnicalQualityEvidence {
  return {
    schemaVersion: "juw.atelier-technical-qa.v1",
    rubricVersion: "juw.atelier-technical-rubric.v1",
    thresholdVersion: "juw.atelier-technical-thresholds.v1",
    evaluatedAt: "2026-08-26T12:00:00.000Z",
    evaluator: TECHNICAL_EVALUATOR,
    artifact: { ...ARTIFACT },
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
  stage: "GARMENT_01_FRONT" | "GARMENT_02_BACK" | "GARMENT_03_MANNEQUIN" | "GARMENT_04_DETAIL",
): StudioAtelierSemanticQualityEvidence {
  return {
    schemaVersion: "juw.atelier-semantic-qa.v2",
    rubricVersion: "juw.atelier-semantic-rubric.v2",
    thresholdVersion: "juw.atelier-semantic-thresholds.v1",
    evaluatedAt: "2026-08-26T12:00:01.000Z",
    evaluator: SEMANTIC_EVALUATOR,
    artifactSha256: ARTIFACT.sha256,
    stage,
    multiEraBaseline: {
      revision: "g001-g024-g004-pixel-bound-v2",
      anchors: ["G001", "G004", "G005", "G009", "G023", "G024"],
      directRealAuthorityOutranksGenerated: true,
      g004PositiveTarget: {
        calibrationRevision: STUDIO_ATELIER_G004_CALIBRATION_REVISION,
        manifestSha256: STUDIO_ATELIER_G004_CALIBRATION_MANIFEST_SHA256,
        canonicalOriginalsStatus: "UNAVAILABLE",
        derivativeDecision: "VERSION_LOCK_PUBLIC_SHOP_DERIVATIVES",
        role: "POSITIVE_EVALUATION_TARGET",
        candidateArtifactSha256: ARTIFACT.sha256,
        disposition: "NOT_APPLICABLE",
        reason: "GARMENT_ONLY_STAGE",
        readback: "NOT_REQUIRED",
      },
    },
    authorityReview: {
      directGarmentEvidence: "PASS",
      realIdentityEvidence: "NOT_APPLICABLE",
      realBodyAngleEvidence: "NOT_APPLICABLE",
      generatedControlsSubordinate: "NOT_APPLICABLE",
      currentGarmentLineage: "PASS",
      lockedRoomAuthority: "NOT_APPLICABLE",
      inferredRearQuarantine: stage === "GARMENT_02_BACK" ? "PASS" : "NOT_APPLICABLE",
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

test("garment media technical QA accepts only normalized opaque JPEG review bytes", () => {
  assert.equal(assessStudioAtelierTechnicalQuality({
    value: technicalEvidence(),
    operationStage: "GARMENT_01_FRONT",
    outputMode: "GENERATIVE_GARMENT_MEDIA",
    artifact: ARTIFACT,
    evaluator: TECHNICAL_EVALUATOR,
  })?.decision, "PASS");
});

test("01-04 mark face, body and room NOT_APPLICABLE without faking a pass", () => {
  for (const stage of [
    "GARMENT_01_FRONT",
    "GARMENT_02_BACK",
    "GARMENT_03_MANNEQUIN",
    "GARMENT_04_DETAIL",
  ] as const) {
    const result = assessStudioAtelierSemanticQuality({
      value: semanticEvidence(stage),
      operationStage: stage,
      artifactSha256: ARTIFACT.sha256,
      g004Calibration: null,
      evaluator: SEMANTIC_EVALUATOR,
    });
    assert.equal(result?.decision, "PASS");
    assert.deepEqual(result?.evidence.orderedGateSequence, [
      { gate: "GARMENT", decision: "PASS" },
      { gate: "FACE", decision: "NOT_APPLICABLE" },
      { gate: "BODY", decision: "NOT_APPLICABLE" },
      { gate: "ROOM", decision: "NOT_APPLICABLE" },
      { gate: "FINAL_INTEGRATION", decision: "PASS" },
    ]);

    const fakeFacePass = semanticEvidence(stage);
    fakeFacePass.semanticGates.identity = "PASS";
    assert.equal(assessStudioAtelierSemanticQuality({
      value: fakeFacePass,
      operationStage: stage,
      artifactSha256: ARTIFACT.sha256,
      g004Calibration: null,
      evaluator: SEMANTIC_EVALUATOR,
    }), null);
  }
});

test("a garment failure keeps excluded gates not applicable and stops later applicable checks", () => {
  const evidence = semanticEvidence("GARMENT_02_BACK");
  evidence.semanticGates.garmentTruth = "FAIL";
  evidence.authorityReview.realIdentityEvidence = "NOT_APPLICABLE";
  evidence.authorityReview.generatedControlsSubordinate = "NOT_APPLICABLE";
  evidence.semanticGates.identity = "NOT_APPLICABLE";
  evidence.semanticGates.hair = "NOT_APPLICABLE";
  evidence.renderQualityReview.skinTexture = "NOT_APPLICABLE";
  evidence.authorityReview.realBodyAngleEvidence = "NOT_APPLICABLE";
  evidence.semanticGates.connectedBodyGeometry = "NOT_APPLICABLE";
  evidence.authorityReview.lockedRoomAuthority = "NOT_APPLICABLE";
  evidence.semanticGates.atelierAndBrandIcon = "NOT_APPLICABLE";
  evidence.authorityReview.multiEraDriftBaseline = "NOT_EVALUATED";
  evidence.authorityReview.inferredRearQuarantine = "NOT_EVALUATED";
  evidence.semanticGates.viewGrammar = "NOT_EVALUATED";
  evidence.semanticGates.parentLineage = "NOT_EVALUATED";
  evidence.semanticGates.fullFrameFormat = "NOT_EVALUATED";
  evidence.semanticGates.privacyAndProvenance = "NOT_EVALUATED";
  evidence.renderQualityReview.photographicRealism = "NOT_EVALUATED";
  evidence.renderQualityReview.lightingIntegration = "NOT_EVALUATED";
  evidence.renderQualityReview.opticsPerspective = "NOT_EVALUATED";
  evidence.renderQualityReview.artifactRejection = "NOT_EVALUATED";

  const result = assessStudioAtelierSemanticQuality({
    value: evidence,
    operationStage: "GARMENT_02_BACK",
    artifactSha256: ARTIFACT.sha256,
    g004Calibration: null,
    evaluator: SEMANTIC_EVALUATOR,
  });
  assert.equal(result?.decision, "FAIL");
  assert.deepEqual(result?.evidence.orderedGateSequence, [
    { gate: "GARMENT", decision: "FAIL" },
    { gate: "FACE", decision: "NOT_APPLICABLE" },
    { gate: "BODY", decision: "NOT_APPLICABLE" },
    { gate: "ROOM", decision: "NOT_APPLICABLE" },
    { gate: "FINAL_INTEGRATION", decision: "NOT_EVALUATED" },
  ]);
});
