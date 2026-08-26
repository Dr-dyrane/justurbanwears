import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  assessStudioAtelierSemanticQuality,
  assessStudioAtelierTechnicalQuality,
  studioAtelierEvaluatorDescriptorSchema,
  type StudioAtelierEvaluatorDescriptor,
  type StudioAtelierSemanticQualityEvidence,
  type StudioAtelierTechnicalQualityEvidence,
} from "../lib/studio/atelier/quality-contracts";
import {
  STUDIO_ATELIER_G004_CALIBRATION_MANIFEST,
  STUDIO_ATELIER_G004_CALIBRATION_MANIFEST_SHA256,
  STUDIO_ATELIER_G004_CALIBRATION_REVISION,
  STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT,
  studioAtelierG004CalibrationTargetForStage,
} from "../lib/studio/atelier/g004-calibration";
import type { AtelierStage } from "../lib/studio/atelier/contracts";
import {
  createStudioAtelierLedgerFailureResolver,
} from "../lib/server/studio-atelier-private-failure-resolver";
import type { AtelierLifecycleEventRow } from "../lib/server/studio-atelier-repository";

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const TECHNICAL_EVALUATOR = Object.freeze({
  id: "closed-technical-evaluator",
  version: "v1",
  policyRevision: "closed-technical-policy-v1",
  qualificationSuiteVersion: "closed-qa-qualification-v1",
  qualificationReceiptSha256: digest("closed technical evaluator qualification"),
}) satisfies StudioAtelierEvaluatorDescriptor;

const SEMANTIC_EVALUATOR = Object.freeze({
  id: "closed-semantic-evaluator",
  version: "v1",
  policyRevision: "closed-semantic-policy-v1",
  qualificationSuiteVersion: "closed-qa-qualification-v1",
  qualificationReceiptSha256: digest("closed semantic evaluator qualification"),
}) satisfies StudioAtelierEvaluatorDescriptor;

const NORMALIZED_ARTIFACT = Object.freeze({
  sha256: digest("normalized-review-artifact"),
  kind: "NORMALIZED",
  mimeType: "image/jpeg",
  byteSize: 1234,
  width: 1024,
  height: 1536,
} as const);

function comparedG004(stage: AtelierStage, candidateArtifactSha256: string) {
  const target = studioAtelierG004CalibrationTargetForStage(stage);
  assert.ok(target);
  return {
    calibrationRevision: STUDIO_ATELIER_G004_CALIBRATION_REVISION,
    manifestSha256: STUDIO_ATELIER_G004_CALIBRATION_MANIFEST_SHA256,
    readbackReceiptSha256: STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT.receiptSha256,
    canonicalOriginalsStatus: "UNAVAILABLE" as const,
    derivativeDecision: "VERSION_LOCK_PUBLIC_SHOP_DERIVATIVES" as const,
    role: "POSITIVE_EVALUATION_TARGET" as const,
    candidateArtifactSha256,
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
    axisDecisions: target.positiveTargetAxes.map((axis) => ({
      axis,
      decision: "PASS" as const,
    })),
    prohibitedTransferDecisions:
      STUDIO_ATELIER_G004_CALIBRATION_MANIFEST.prohibitedTransferScopes.map((scope) => ({
        scope,
        decision: "PASS" as const,
      })),
    directAuthorityPrecedenceConfirmed: true as const,
  };
}

function notEvaluatedG004(candidateArtifactSha256: string) {
  return {
    calibrationRevision: STUDIO_ATELIER_G004_CALIBRATION_REVISION,
    manifestSha256: STUDIO_ATELIER_G004_CALIBRATION_MANIFEST_SHA256,
    readbackReceiptSha256: STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT.receiptSha256,
    canonicalOriginalsStatus: "UNAVAILABLE" as const,
    derivativeDecision: "VERSION_LOCK_PUBLIC_SHOP_DERIVATIVES" as const,
    role: "POSITIVE_EVALUATION_TARGET" as const,
    candidateArtifactSha256,
    disposition: "NOT_EVALUATED" as const,
    reason: "ORDERED_GATE_NOT_REACHED" as const,
  };
}

function notApplicableG004(candidateArtifactSha256: string) {
  return {
    calibrationRevision: STUDIO_ATELIER_G004_CALIBRATION_REVISION,
    manifestSha256: STUDIO_ATELIER_G004_CALIBRATION_MANIFEST_SHA256,
    canonicalOriginalsStatus: "UNAVAILABLE" as const,
    derivativeDecision: "VERSION_LOCK_PUBLIC_SHOP_DERIVATIVES" as const,
    role: "POSITIVE_EVALUATION_TARGET" as const,
    candidateArtifactSha256,
    disposition: "NOT_APPLICABLE" as const,
    reason: "GARMENT_ONLY_STAGE" as const,
    readback: "NOT_REQUIRED" as const,
  };
}

function technicalEvidence(): StudioAtelierTechnicalQualityEvidence {
  return {
    schemaVersion: "juw.atelier-technical-qa.v1",
    rubricVersion: "juw.atelier-technical-rubric.v1",
    thresholdVersion: "juw.atelier-technical-thresholds.v1",
    evaluatedAt: "2026-08-26T12:00:00.000Z",
    evaluator: TECHNICAL_EVALUATOR,
    artifact: { ...NORMALIZED_ARTIFACT },
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

function semanticEvidence(): StudioAtelierSemanticQualityEvidence {
  return {
    schemaVersion: "juw.atelier-semantic-qa.v2",
    rubricVersion: "juw.atelier-semantic-rubric.v2",
    thresholdVersion: "juw.atelier-semantic-thresholds.v1",
    evaluatedAt: "2026-08-26T12:00:01.000Z",
    evaluator: SEMANTIC_EVALUATOR,
    artifactSha256: NORMALIZED_ARTIFACT.sha256,
    stage: "ROOM_FINAL_05",
    multiEraBaseline: {
      revision: "g001-g024-g004-pixel-bound-v2",
      anchors: ["G001", "G004", "G005", "G009", "G023", "G024"],
      directRealAuthorityOutranksGenerated: true,
      g004PositiveTarget: comparedG004("ROOM_FINAL_05", NORMALIZED_ARTIFACT.sha256),
    },
    authorityReview: {
      directGarmentEvidence: "PASS",
      realIdentityEvidence: "PASS",
      realBodyAngleEvidence: "PASS",
      generatedControlsSubordinate: "PASS",
      currentGarmentLineage: "PASS",
      lockedRoomAuthority: "PASS",
      inferredRearQuarantine: "NOT_APPLICABLE",
      multiEraDriftBaseline: "PASS",
    },
    semanticGates: {
      garmentTruth: "PASS",
      identity: "PASS",
      connectedBodyGeometry: "PASS",
      hair: "PASS",
      atelierAndBrandIcon: "PASS",
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

test("closed evaluator descriptors reject URL, filesystem and Blob locator syntax", () => {
  for (const id of [
    "https://evaluator.example/v1",
    "c:/private/evaluator",
    "/private/evaluator",
    "blob:private-evaluator",
    "qualified/../evaluator",
    "qualified\\private\\evaluator",
  ]) {
    assert.equal(studioAtelierEvaluatorDescriptorSchema.safeParse({
      ...TECHNICAL_EVALUATOR,
      id,
    }).success, false, id);
  }
});

test("closed QA binds every field of the exact qualified evaluator descriptor", () => {
  const mismatches = [
    { ...TECHNICAL_EVALUATOR, id: "other-technical-evaluator" },
    { ...TECHNICAL_EVALUATOR, version: "v2" },
    { ...TECHNICAL_EVALUATOR, policyRevision: "closed-technical-policy-v2" },
    { ...TECHNICAL_EVALUATOR, qualificationSuiteVersion: "closed-qa-qualification-v2" },
    {
      ...TECHNICAL_EVALUATOR,
      qualificationReceiptSha256: digest("other technical evaluator qualification"),
    },
  ] satisfies StudioAtelierEvaluatorDescriptor[];

  for (const evaluator of mismatches) {
    assert.equal(assessStudioAtelierTechnicalQuality({
      value: technicalEvidence(),
      operationStage: "SUBJECT_A",
      outputMode: "GENERATIVE_FULL_FRAME",
      artifact: NORMALIZED_ARTIFACT,
      evaluator,
    }), null);
  }
});

test("closed technical QA binds the exact review artifact and derives its verdict", () => {
  const result = assessStudioAtelierTechnicalQuality({
    value: technicalEvidence(),
    operationStage: "SUBJECT_A",
    outputMode: "GENERATIVE_FULL_FRAME",
    artifact: NORMALIZED_ARTIFACT,
    evaluator: TECHNICAL_EVALUATOR,
  });
  assert.equal(result?.decision, "PASS");
  assert.match(String(result?.evidence.evaluationHash), /^[a-f0-9]{64}$/);
  assert.deepEqual(result?.evidence.failedChecks, []);

  assert.equal(assessStudioAtelierTechnicalQuality({
    value: { decision: "PASS", evidence: {} },
    operationStage: "SUBJECT_A",
    outputMode: "GENERATIVE_FULL_FRAME",
    artifact: NORMALIZED_ARTIFACT,
    evaluator: TECHNICAL_EVALUATOR,
  }), null);
});

test("transparent QA can review only the exact COMPOSITE with a gated source alpha", () => {
  const evidence = technicalEvidence();
  evidence.artifact = {
    ...evidence.artifact,
    sha256: digest("composite-review-artifact"),
    kind: "COMPOSITE",
    mimeType: "image/png",
  };
  const composite = { ...evidence.artifact };
  assert.equal(assessStudioAtelierTechnicalQuality({
    value: evidence,
    operationStage: "ROOM_FINAL_05",
    outputMode: "TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE",
    artifact: composite,
    evaluator: TECHNICAL_EVALUATOR,
  }), null);

  evidence.checks.sourceLayerAlpha = "PASS";
  assert.equal(assessStudioAtelierTechnicalQuality({
    value: evidence,
    operationStage: "ROOM_FINAL_05",
    outputMode: "TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE",
    artifact: composite,
    evaluator: TECHNICAL_EVALUATOR,
  })?.decision, "PASS");
});

test("semantic QA requires the multi-era baseline and derives any failed gate", () => {
  const evidence = semanticEvidence();
  evidence.renderQualityReview.lightingIntegration = "FAIL";
  const failed = assessStudioAtelierSemanticQuality({
    value: evidence,
    operationStage: "ROOM_FINAL_05",
    artifactSha256: NORMALIZED_ARTIFACT.sha256,
    g004Calibration: STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT,
    evaluator: SEMANTIC_EVALUATOR,
  });
  assert.equal(failed?.decision, "FAIL");
  assert.equal(failed?.reasonCode, "SEMANTIC_LIGHTING_INTEGRATION_FAILED");
  assert.deepEqual(failed?.evidence.failedChecks, [
    "renderQualityReview.lightingIntegration",
  ]);

  const missingBaseline = { ...semanticEvidence() } as Record<string, unknown>;
  delete missingBaseline.multiEraBaseline;
  assert.equal(assessStudioAtelierSemanticQuality({
    value: missingBaseline,
    operationStage: "ROOM_FINAL_05",
    artifactSha256: NORMALIZED_ARTIFACT.sha256,
    g004Calibration: STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT,
    evaluator: SEMANTIC_EVALUATOR,
  }), null);
});

test("G004 comparison binds exact readback, target pixels, role and scoped axes", () => {
  assert.equal(assessStudioAtelierSemanticQuality({
    value: semanticEvidence(),
    operationStage: "ROOM_FINAL_05",
    artifactSha256: NORMALIZED_ARTIFACT.sha256,
    g004Calibration: null,
    evaluator: SEMANTIC_EVALUATOR,
  }), null);

  const substituted = semanticEvidence();
  if (substituted.multiEraBaseline.g004PositiveTarget.disposition !== "COMPARED") {
    assert.fail("expected compared G004 evidence");
  }
  substituted.multiEraBaseline.g004PositiveTarget.target.pixelSha256 = digest("substituted");
  assert.equal(assessStudioAtelierSemanticQuality({
    value: substituted,
    operationStage: "ROOM_FINAL_05",
    artifactSha256: NORMALIZED_ARTIFACT.sha256,
    g004Calibration: STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT,
    evaluator: SEMANTIC_EVALUATOR,
  }), null);

  const incompleteAxes = semanticEvidence();
  if (incompleteAxes.multiEraBaseline.g004PositiveTarget.disposition !== "COMPARED") {
    assert.fail("expected compared G004 evidence");
  }
  incompleteAxes.multiEraBaseline.g004PositiveTarget.axisDecisions.pop();
  assert.equal(assessStudioAtelierSemanticQuality({
    value: incompleteAxes,
    operationStage: "ROOM_FINAL_05",
    artifactSha256: NORMALIZED_ARTIFACT.sha256,
    g004Calibration: STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT,
    evaluator: SEMANTIC_EVALUATOR,
  }), null);
});

test("a real G004 positive-target mismatch fails the final integration gate", () => {
  const evidence = semanticEvidence();
  if (evidence.multiEraBaseline.g004PositiveTarget.disposition !== "COMPARED") {
    assert.fail("expected compared G004 evidence");
  }
  evidence.multiEraBaseline.g004PositiveTarget.axisDecisions[0]!.decision = "FAIL";
  evidence.authorityReview.multiEraDriftBaseline = "FAIL";
  evidence.semanticGates.viewGrammar = "FAIL";

  const failed = assessStudioAtelierSemanticQuality({
    value: evidence,
    operationStage: "ROOM_FINAL_05",
    artifactSha256: NORMALIZED_ARTIFACT.sha256,
    g004Calibration: STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT,
    evaluator: SEMANTIC_EVALUATOR,
  });
  assert.equal(failed?.decision, "FAIL");
  assert.equal(failed?.reasonCode, "SEMANTIC_MULTI_ERA_BASELINE_FAILED");
  assert.deepEqual(failed?.evidence.failedChecks, [
    "authorityReview.multiEraDriftBaseline",
    "semanticGates.viewGrammar",
  ]);
});

test("G004 axis or prohibited-transfer drift persists as a zero-spend failure", async (t) => {
  const variants = [
    {
      name: "positive-target axis drift",
      fail: (evidence: StudioAtelierSemanticQualityEvidence) => {
        const comparison = evidence.multiEraBaseline.g004PositiveTarget;
        if (comparison.disposition !== "COMPARED") {
          assert.fail("expected compared G004 evidence");
        }
        comparison.axisDecisions[0]!.decision = "FAIL";
      },
    },
    {
      name: "prohibited style or truth transfer",
      fail: (evidence: StudioAtelierSemanticQualityEvidence) => {
        const comparison = evidence.multiEraBaseline.g004PositiveTarget;
        if (comparison.disposition !== "COMPARED") {
          assert.fail("expected compared G004 evidence");
        }
        comparison.prohibitedTransferDecisions[0]!.decision = "FAIL";
      },
    },
  ] as const;

  for (const variant of variants) {
    await t.test(variant.name, async () => {
      const evidence = semanticEvidence();
      evidence.stage = "SUBJECT_A";
      evidence.multiEraBaseline.g004PositiveTarget = comparedG004(
        "SUBJECT_A",
        NORMALIZED_ARTIFACT.sha256,
      );
      evidence.authorityReview.lockedRoomAuthority = "NOT_APPLICABLE";
      evidence.semanticGates.atelierAndBrandIcon = "NOT_APPLICABLE";
      evidence.authorityReview.multiEraDriftBaseline = "FAIL";
      evidence.semanticGates.viewGrammar = "FAIL";
      variant.fail(evidence);

      const assessment = assessStudioAtelierSemanticQuality({
        value: evidence,
        operationStage: "SUBJECT_A",
        artifactSha256: NORMALIZED_ARTIFACT.sha256,
        g004Calibration: STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT,
        evaluator: SEMANTIC_EVALUATOR,
      });
      assert.equal(assessment?.decision, "FAIL");
      assert.equal(
        assessment?.reasonCode,
        "SEMANTIC_MULTI_ERA_BASELINE_FAILED",
      );

      const operationId = "11111111-1111-4111-8111-111111111111";
      const event = {
        id: "22222222-2222-4222-8222-222222222222",
        operationId,
        sequence: 3,
        eventType: "SEMANTIC_FAIL",
        expectedVersion: 2,
        resultingVersion: 3,
        executionId: "33333333-3333-4333-8333-333333333333",
        artifactId: "44444444-4444-4444-8444-444444444444",
        actorSubject: "system:atelier-semantic-qa",
        payload: {
          reasonCode: assessment?.reasonCode,
          evidence: assessment?.evidence,
        },
        previousEventHash: "a".repeat(64),
        eventHash: "b".repeat(64),
        createdAt: new Date("2026-08-26T12:00:02.000Z"),
      } as AtelierLifecycleEventRow;
      const resolve = createStudioAtelierLedgerFailureResolver({
        listEvents: async () => [event],
      });

      assert.equal(await resolve({
        operatorSubject: "operator-g004-chain",
        operationId,
        stage: "SUBJECT_A",
        view: "SUBJECT",
        state: "SEMANTIC_FAIL",
        correction: false,
      }), null);
    });
  }
});

test("semantic QA stops durably at face before body, room, or final integration", () => {
  const evidence = semanticEvidence();
  evidence.semanticGates.identity = "FAIL";
  evidence.authorityReview.realBodyAngleEvidence = "NOT_EVALUATED";
  evidence.semanticGates.connectedBodyGeometry = "NOT_EVALUATED";
  evidence.authorityReview.lockedRoomAuthority = "NOT_EVALUATED";
  evidence.semanticGates.atelierAndBrandIcon = "NOT_EVALUATED";
  evidence.authorityReview.multiEraDriftBaseline = "NOT_EVALUATED";
  evidence.authorityReview.inferredRearQuarantine = "NOT_APPLICABLE";
  evidence.semanticGates.viewGrammar = "NOT_EVALUATED";
  evidence.semanticGates.parentLineage = "NOT_EVALUATED";
  evidence.semanticGates.fullFrameFormat = "NOT_EVALUATED";
  evidence.semanticGates.privacyAndProvenance = "NOT_EVALUATED";
  evidence.renderQualityReview.photographicRealism = "NOT_EVALUATED";
  evidence.renderQualityReview.lightingIntegration = "NOT_EVALUATED";
  evidence.renderQualityReview.opticsPerspective = "NOT_EVALUATED";
  evidence.renderQualityReview.artifactRejection = "NOT_EVALUATED";
  evidence.multiEraBaseline.g004PositiveTarget = notEvaluatedG004(
    NORMALIZED_ARTIFACT.sha256,
  );

  const failed = assessStudioAtelierSemanticQuality({
    value: evidence,
    operationStage: "ROOM_FINAL_05",
    artifactSha256: NORMALIZED_ARTIFACT.sha256,
    g004Calibration: STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT,
    evaluator: SEMANTIC_EVALUATOR,
  });
  assert.equal(failed?.decision, "FAIL");
  assert.equal(failed?.reasonCode, "SEMANTIC_IDENTITY_FAILED");
  assert.deepEqual(failed?.evidence.failedChecks, ["semanticGates.identity"]);
  assert.deepEqual(failed?.evidence.orderedGateSequence, [
    { gate: "GARMENT", decision: "PASS" },
    { gate: "FACE", decision: "FAIL" },
    { gate: "BODY", decision: "NOT_EVALUATED" },
    { gate: "ROOM", decision: "NOT_EVALUATED" },
    { gate: "FINAL_INTEGRATION", decision: "NOT_EVALUATED" },
  ]);
});

test("a garment-stage failure preserves excluded gates as not applicable", () => {
  const evidence = semanticEvidence();
  evidence.stage = "GARMENT_01_FRONT";
  evidence.authorityReview.directGarmentEvidence = "FAIL";

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
  evidence.semanticGates.viewGrammar = "NOT_EVALUATED";
  evidence.semanticGates.parentLineage = "NOT_EVALUATED";
  evidence.semanticGates.fullFrameFormat = "NOT_EVALUATED";
  evidence.semanticGates.privacyAndProvenance = "NOT_EVALUATED";
  evidence.renderQualityReview.photographicRealism = "NOT_EVALUATED";
  evidence.renderQualityReview.lightingIntegration = "NOT_EVALUATED";
  evidence.renderQualityReview.opticsPerspective = "NOT_EVALUATED";
  evidence.renderQualityReview.artifactRejection = "NOT_EVALUATED";
  evidence.multiEraBaseline.g004PositiveTarget = notApplicableG004(
    NORMALIZED_ARTIFACT.sha256,
  );

  const failed = assessStudioAtelierSemanticQuality({
    value: evidence,
    operationStage: "GARMENT_01_FRONT",
    artifactSha256: NORMALIZED_ARTIFACT.sha256,
    g004Calibration: null,
    evaluator: SEMANTIC_EVALUATOR,
  });
  assert.equal(failed?.decision, "FAIL");
  assert.equal(failed?.reasonCode, "SEMANTIC_DIRECT_GARMENT_AUTHORITY_FAILED");
  assert.deepEqual(failed?.evidence.orderedGateSequence, [
    { gate: "GARMENT", decision: "FAIL" },
    { gate: "FACE", decision: "NOT_APPLICABLE" },
    { gate: "BODY", decision: "NOT_APPLICABLE" },
    { gate: "ROOM", decision: "NOT_APPLICABLE" },
    { gate: "FINAL_INTEGRATION", decision: "NOT_EVALUATED" },
  ]);
});

test("semantic QA rejects an evaluator that claims a body result after face failed", () => {
  const evidence = semanticEvidence();
  evidence.semanticGates.identity = "FAIL";
  assert.equal(assessStudioAtelierSemanticQuality({
    value: evidence,
    operationStage: "ROOM_FINAL_05",
    artifactSha256: NORMALIZED_ARTIFACT.sha256,
    g004Calibration: STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT,
    evaluator: SEMANTIC_EVALUATOR,
  }), null);
});
