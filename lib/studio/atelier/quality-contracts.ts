import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalStringify } from "./canonical";
import {
  atelierStageSchema,
  sha256Schema,
  type AtelierOperation,
  type AtelierStage,
} from "./contracts";
import {
  STUDIO_ATELIER_G004_CALIBRATION_MANIFEST,
  STUDIO_ATELIER_G004_CALIBRATION_REVISION,
  STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT,
  studioAtelierG004CalibrationTargetForStage,
  studioAtelierG004PositiveTargetAxisSchema,
  studioAtelierG004ProhibitedTransferScopeSchema,
  type StudioAtelierG004ReadbackReceipt,
} from "./g004-calibration";

export const STUDIO_ATELIER_TECHNICAL_QA_SCHEMA_VERSION =
  "juw.atelier-technical-qa.v1" as const;
export const STUDIO_ATELIER_TECHNICAL_RUBRIC_VERSION =
  "juw.atelier-technical-rubric.v1" as const;
export const STUDIO_ATELIER_TECHNICAL_THRESHOLD_VERSION =
  "juw.atelier-technical-thresholds.v1" as const;
export const STUDIO_ATELIER_SEMANTIC_QA_SCHEMA_VERSION =
  "juw.atelier-semantic-qa.v2" as const;
export const STUDIO_ATELIER_SEMANTIC_RUBRIC_VERSION =
  "juw.atelier-semantic-rubric.v2" as const;
export const STUDIO_ATELIER_SEMANTIC_THRESHOLD_VERSION =
  "juw.atelier-semantic-thresholds.v1" as const;
export const STUDIO_ATELIER_MULTI_ERA_BASELINE_REVISION =
  "g001-g024-g004-pixel-bound-v2" as const;

const safeComponentPattern = /^[a-zA-Z0-9._:/-]+$/;
const safeEvaluatorTokenPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const passFailSchema = z.enum(["PASS", "FAIL"]);
const applicablePassFailSchema = z.enum(["PASS", "FAIL", "NOT_APPLICABLE"]);
const orderedSemanticCheckSchema = z.enum(["PASS", "FAIL", "NOT_EVALUATED"]);
const orderedApplicableSemanticCheckSchema = z.enum([
  "PASS",
  "FAIL",
  "NOT_APPLICABLE",
  "NOT_EVALUATED",
]);
const canonicalInstantSchema = z.string().refine((value) => {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}, "Use one canonical UTC ISO timestamp with milliseconds.");

export const studioAtelierEvaluatorDescriptorSchema = z.object({
  id: z.string().min(1).max(120).regex(safeEvaluatorTokenPattern),
  version: z.string().min(1).max(120).regex(safeEvaluatorTokenPattern),
  policyRevision: z.string().min(1).max(120).regex(safeEvaluatorTokenPattern),
  qualificationSuiteVersion: z.string().min(1).max(120)
    .regex(safeEvaluatorTokenPattern),
  qualificationReceiptSha256: sha256Schema,
}).strict();

export type StudioAtelierEvaluatorDescriptor = z.infer<
  typeof studioAtelierEvaluatorDescriptorSchema
>;

export const studioAtelierReviewArtifactSchema = z.object({
  sha256: sha256Schema,
  kind: z.enum(["NORMALIZED", "COMPOSITE"]),
  mimeType: z.enum(["image/jpeg", "image/png"]),
  byteSize: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
}).strict();

export type StudioAtelierReviewArtifact = z.infer<
  typeof studioAtelierReviewArtifactSchema
>;

export const studioAtelierTechnicalQualityEvidenceSchema = z.object({
  schemaVersion: z.literal(STUDIO_ATELIER_TECHNICAL_QA_SCHEMA_VERSION),
  rubricVersion: z.literal(STUDIO_ATELIER_TECHNICAL_RUBRIC_VERSION),
  thresholdVersion: z.literal(STUDIO_ATELIER_TECHNICAL_THRESHOLD_VERSION),
  evaluatedAt: canonicalInstantSchema,
  evaluator: studioAtelierEvaluatorDescriptorSchema,
  artifact: studioAtelierReviewArtifactSchema,
  checks: z.object({
    decodableImage: passFailSchema,
    exactByteHash: passFailSchema,
    singleCleanImage: passFailSchema,
    outputContract: passFailSchema,
    colourSpace: passFailSchema,
    canonicalNormalization: passFailSchema,
    noRenderedText: passFailSchema,
    noWatermark: passFailSchema,
    sourceLayerAlpha: applicablePassFailSchema,
  }).strict(),
}).strict();

export type StudioAtelierTechnicalQualityEvidence = z.infer<
  typeof studioAtelierTechnicalQualityEvidenceSchema
>;

const MULTI_ERA_ANCHORS = [
  "G001",
  "G004",
  "G005",
  "G009",
  "G023",
  "G024",
] as const;

const g004ComparisonBase = z.object({
  calibrationRevision: z.literal(STUDIO_ATELIER_G004_CALIBRATION_REVISION),
  manifestSha256: sha256Schema,
  canonicalOriginalsStatus: z.literal("UNAVAILABLE"),
  derivativeDecision: z.literal("VERSION_LOCK_PUBLIC_SHOP_DERIVATIVES"),
  role: z.literal("POSITIVE_EVALUATION_TARGET"),
  candidateArtifactSha256: sha256Schema,
});

const g004ApplicableComparisonBase = g004ComparisonBase.extend({
  readbackReceiptSha256: sha256Schema,
});

const g004ComparedEvidenceSchema = g004ApplicableComparisonBase.extend({
  disposition: z.literal("COMPARED"),
  target: z.object({
    id: z.string().trim().min(1).max(200).regex(safeComponentPattern),
    view: z.enum(["05", "06", "07"]),
    mimeType: z.literal("image/webp"),
    byteSize: z.number().int().positive(),
    width: z.literal(1120),
    height: z.literal(1400),
    sha256: sha256Schema,
    pixelSha256: sha256Schema,
  }).strict(),
  pixelAccess: z.literal("EXACT_CANDIDATE_AND_DECODED_TARGET"),
  axisDecisions: z.array(z.object({
    axis: studioAtelierG004PositiveTargetAxisSchema,
    decision: passFailSchema,
  }).strict()).min(1),
  prohibitedTransferDecisions: z.array(z.object({
    scope: studioAtelierG004ProhibitedTransferScopeSchema,
    decision: passFailSchema,
  }).strict()).min(1),
  directAuthorityPrecedenceConfirmed: z.literal(true),
}).strict();

const g004PositiveTargetEvidenceSchema = z.discriminatedUnion("disposition", [
  g004ComparedEvidenceSchema,
  g004ApplicableComparisonBase.extend({
    disposition: z.literal("NOT_EVALUATED"),
    reason: z.literal("ORDERED_GATE_NOT_REACHED"),
  }).strict(),
  g004ComparisonBase.extend({
    disposition: z.literal("NOT_APPLICABLE"),
    reason: z.literal("GARMENT_ONLY_STAGE"),
    readback: z.literal("NOT_REQUIRED"),
  }).strict(),
]);

export const studioAtelierSemanticQualityEvidenceSchema = z.object({
  schemaVersion: z.literal(STUDIO_ATELIER_SEMANTIC_QA_SCHEMA_VERSION),
  rubricVersion: z.literal(STUDIO_ATELIER_SEMANTIC_RUBRIC_VERSION),
  thresholdVersion: z.literal(STUDIO_ATELIER_SEMANTIC_THRESHOLD_VERSION),
  evaluatedAt: canonicalInstantSchema,
  evaluator: studioAtelierEvaluatorDescriptorSchema,
  artifactSha256: sha256Schema,
  stage: atelierStageSchema,
  multiEraBaseline: z.object({
    revision: z.literal(STUDIO_ATELIER_MULTI_ERA_BASELINE_REVISION),
    anchors: z.tuple([
      z.literal(MULTI_ERA_ANCHORS[0]),
      z.literal(MULTI_ERA_ANCHORS[1]),
      z.literal(MULTI_ERA_ANCHORS[2]),
      z.literal(MULTI_ERA_ANCHORS[3]),
      z.literal(MULTI_ERA_ANCHORS[4]),
      z.literal(MULTI_ERA_ANCHORS[5]),
    ]),
    directRealAuthorityOutranksGenerated: z.literal(true),
    g004PositiveTarget: g004PositiveTargetEvidenceSchema,
  }).strict(),
  authorityReview: z.object({
    directGarmentEvidence: orderedSemanticCheckSchema,
    realIdentityEvidence: orderedApplicableSemanticCheckSchema,
    realBodyAngleEvidence: orderedApplicableSemanticCheckSchema,
    generatedControlsSubordinate: orderedApplicableSemanticCheckSchema,
    currentGarmentLineage: orderedSemanticCheckSchema,
    lockedRoomAuthority: orderedApplicableSemanticCheckSchema,
    inferredRearQuarantine: orderedApplicableSemanticCheckSchema,
    multiEraDriftBaseline: orderedSemanticCheckSchema,
  }).strict(),
  semanticGates: z.object({
    garmentTruth: orderedSemanticCheckSchema,
    identity: orderedApplicableSemanticCheckSchema,
    connectedBodyGeometry: orderedApplicableSemanticCheckSchema,
    hair: orderedApplicableSemanticCheckSchema,
    atelierAndBrandIcon: orderedApplicableSemanticCheckSchema,
    viewGrammar: orderedSemanticCheckSchema,
    parentLineage: orderedSemanticCheckSchema,
    fullFrameFormat: orderedSemanticCheckSchema,
    privacyAndProvenance: orderedSemanticCheckSchema,
  }).strict(),
  renderQualityReview: z.object({
    photographicRealism: orderedSemanticCheckSchema,
    skinTexture: orderedApplicableSemanticCheckSchema,
    garmentTexture: orderedSemanticCheckSchema,
    lightingIntegration: orderedSemanticCheckSchema,
    opticsPerspective: orderedSemanticCheckSchema,
    artifactRejection: orderedSemanticCheckSchema,
  }).strict(),
}).strict();

export type StudioAtelierSemanticQualityEvidence = z.infer<
  typeof studioAtelierSemanticQualityEvidenceSchema
>;

export type StudioAtelierQualityAssessment = Readonly<{
  decision: "PASS" | "FAIL";
  reasonCode?: string;
  evidence: Record<string, unknown>;
}>;

type ExpectedReviewArtifact = Readonly<{
  sha256: string;
  kind: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
}>;

function evaluationHash(value: unknown): string {
  return createHash("sha256").update(canonicalStringify(value)).digest("hex");
}

function recordedEvidence(
  evidence: object,
  decision: "PASS" | "FAIL",
  failedChecks: readonly string[],
): Record<string, unknown> {
  const body = {
    ...evidence,
    aggregateDecision: decision,
    failedChecks: [...failedChecks],
  };
  return Object.freeze({
    ...body,
    evaluationHash: evaluationHash(body),
  });
}

function sameReviewArtifact(
  actual: StudioAtelierReviewArtifact,
  expected: ExpectedReviewArtifact,
): boolean {
  return actual.sha256 === expected.sha256
    && actual.kind === expected.kind
    && actual.mimeType === expected.mimeType
    && actual.byteSize === expected.byteSize
    && actual.width === expected.width
    && actual.height === expected.height;
}

function sameEvaluatorDescriptor(
  actual: StudioAtelierEvaluatorDescriptor,
  expected: StudioAtelierEvaluatorDescriptor,
): boolean {
  return canonicalStringify(actual) === canonicalStringify(expected);
}

const technicalFailureCodes = Object.freeze({
  decodableImage: "TECHNICAL_IMAGE_DECODE_FAILED",
  exactByteHash: "TECHNICAL_BYTE_HASH_FAILED",
  singleCleanImage: "TECHNICAL_SINGLE_IMAGE_FAILED",
  outputContract: "TECHNICAL_OUTPUT_CONTRACT_FAILED",
  colourSpace: "TECHNICAL_COLOUR_SPACE_FAILED",
  canonicalNormalization: "TECHNICAL_NORMALIZATION_FAILED",
  noRenderedText: "TECHNICAL_RENDERED_TEXT_FAILED",
  noWatermark: "TECHNICAL_WATERMARK_FAILED",
  sourceLayerAlpha: "TECHNICAL_SOURCE_ALPHA_FAILED",
} as const);

export function assessStudioAtelierTechnicalQuality(input: {
  value: unknown;
  operationStage: AtelierStage;
  outputMode: AtelierOperation["outputContract"]["mode"];
  artifact: ExpectedReviewArtifact;
  evaluator: StudioAtelierEvaluatorDescriptor;
}): StudioAtelierQualityAssessment | null {
  const parsed = studioAtelierTechnicalQualityEvidenceSchema.safeParse(input.value);
  if (
    !parsed.success
    || !sameReviewArtifact(parsed.data.artifact, input.artifact)
    || !sameEvaluatorDescriptor(parsed.data.evaluator, input.evaluator)
  ) {
    return null;
  }
  const expectsComposite = input.outputMode
    === "TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE";
  if (
    (expectsComposite && (
      parsed.data.artifact.kind !== "COMPOSITE"
      || parsed.data.artifact.mimeType !== "image/png"
      || parsed.data.checks.sourceLayerAlpha === "NOT_APPLICABLE"
    ))
    || (!expectsComposite && (
      parsed.data.artifact.kind !== "NORMALIZED"
      || parsed.data.artifact.mimeType !== "image/jpeg"
      || parsed.data.checks.sourceLayerAlpha !== "NOT_APPLICABLE"
    ))
  ) {
    return null;
  }
  const failedChecks = Object.entries(parsed.data.checks)
    .filter(([, value]) => value === "FAIL")
    .map(([key]) => key);
  const decision = failedChecks.length === 0 ? "PASS" as const : "FAIL" as const;
  const firstFailure = failedChecks[0] as keyof typeof technicalFailureCodes | undefined;
  return Object.freeze({
    decision,
    ...(firstFailure ? { reasonCode: technicalFailureCodes[firstFailure] } : {}),
    evidence: recordedEvidence(parsed.data, decision, failedChecks),
  });
}

const semanticFailureCodes = Object.freeze({
  "authorityReview.directGarmentEvidence": "SEMANTIC_DIRECT_GARMENT_AUTHORITY_FAILED",
  "authorityReview.realIdentityEvidence": "SEMANTIC_REAL_IDENTITY_AUTHORITY_FAILED",
  "authorityReview.realBodyAngleEvidence": "SEMANTIC_REAL_BODY_AUTHORITY_FAILED",
  "authorityReview.generatedControlsSubordinate": "SEMANTIC_AUTHORITY_PRECEDENCE_FAILED",
  "authorityReview.currentGarmentLineage": "SEMANTIC_CURRENT_GARMENT_LINEAGE_FAILED",
  "authorityReview.lockedRoomAuthority": "SEMANTIC_LOCKED_ROOM_AUTHORITY_FAILED",
  "authorityReview.inferredRearQuarantine": "SEMANTIC_REAR_INFERENCE_QUARANTINE_FAILED",
  "authorityReview.multiEraDriftBaseline": "SEMANTIC_MULTI_ERA_BASELINE_FAILED",
  "semanticGates.garmentTruth": "SEMANTIC_GARMENT_TRUTH_FAILED",
  "semanticGates.identity": "SEMANTIC_IDENTITY_FAILED",
  "semanticGates.connectedBodyGeometry": "SEMANTIC_CONNECTED_BODY_GEOMETRY_FAILED",
  "semanticGates.hair": "SEMANTIC_HAIR_FAILED",
  "semanticGates.atelierAndBrandIcon": "SEMANTIC_ATELIER_BRAND_FAILED",
  "semanticGates.viewGrammar": "SEMANTIC_VIEW_GRAMMAR_FAILED",
  "semanticGates.parentLineage": "SEMANTIC_PARENT_LINEAGE_FAILED",
  "semanticGates.fullFrameFormat": "SEMANTIC_FULL_FRAME_FORMAT_FAILED",
  "semanticGates.privacyAndProvenance": "SEMANTIC_PRIVACY_PROVENANCE_FAILED",
  "renderQualityReview.photographicRealism": "SEMANTIC_PHOTOGRAPHIC_REALISM_FAILED",
  "renderQualityReview.skinTexture": "SEMANTIC_SKIN_TEXTURE_FAILED",
  "renderQualityReview.garmentTexture": "SEMANTIC_GARMENT_TEXTURE_FAILED",
  "renderQualityReview.lightingIntegration": "SEMANTIC_LIGHTING_INTEGRATION_FAILED",
  "renderQualityReview.opticsPerspective": "SEMANTIC_OPTICS_PERSPECTIVE_FAILED",
  "renderQualityReview.artifactRejection": "SEMANTIC_ARTIFACT_REJECTION_FAILED",
} as const);

export const STUDIO_ATELIER_ORDERED_SEMANTIC_GATES = Object.freeze([
  "GARMENT",
  "FACE",
  "BODY",
  "ROOM",
  "FINAL_INTEGRATION",
] as const);

export type StudioAtelierOrderedSemanticGate =
  typeof STUDIO_ATELIER_ORDERED_SEMANTIC_GATES[number];

type SemanticCheckPath = keyof typeof semanticFailureCodes;
type SemanticGateDecision = "PASS" | "FAIL" | "NOT_APPLICABLE" | "NOT_EVALUATED";

const SEMANTIC_GATE_CHECKS = Object.freeze({
  GARMENT: Object.freeze([
    "authorityReview.directGarmentEvidence",
    "authorityReview.currentGarmentLineage",
    "semanticGates.garmentTruth",
    "renderQualityReview.garmentTexture",
  ] as const),
  FACE: Object.freeze([
    "authorityReview.realIdentityEvidence",
    "authorityReview.generatedControlsSubordinate",
    "semanticGates.identity",
    "semanticGates.hair",
    "renderQualityReview.skinTexture",
  ] as const),
  BODY: Object.freeze([
    "authorityReview.realBodyAngleEvidence",
    "semanticGates.connectedBodyGeometry",
  ] as const),
  ROOM: Object.freeze([
    "authorityReview.lockedRoomAuthority",
    "semanticGates.atelierAndBrandIcon",
  ] as const),
  FINAL_INTEGRATION: Object.freeze([
    "authorityReview.multiEraDriftBaseline",
    "authorityReview.inferredRearQuarantine",
    "semanticGates.viewGrammar",
    "semanticGates.parentLineage",
    "semanticGates.fullFrameFormat",
    "semanticGates.privacyAndProvenance",
    "renderQualityReview.photographicRealism",
    "renderQualityReview.lightingIntegration",
    "renderQualityReview.opticsPerspective",
    "renderQualityReview.artifactRejection",
  ] as const),
} as const satisfies Record<StudioAtelierOrderedSemanticGate, readonly SemanticCheckPath[]>);

function semanticCheck(
  evidence: StudioAtelierSemanticQualityEvidence,
  path: SemanticCheckPath,
): SemanticGateDecision {
  const [group, field] = path.split(".") as [
    "authorityReview" | "semanticGates" | "renderQualityReview",
    string,
  ];
  return (evidence[group] as Record<string, SemanticGateDecision>)[field]!;
}

function expectedNotApplicable(
  evidence: StudioAtelierSemanticQualityEvidence,
  path: SemanticCheckPath,
): boolean {
  const garmentStage = evidence.stage === "GARMENT_01_FRONT"
    || evidence.stage === "GARMENT_02_BACK"
    || evidence.stage === "GARMENT_03_MANNEQUIN"
    || evidence.stage === "GARMENT_04_DETAIL";
  const subjectStage = evidence.stage === "SUBJECT_A" || evidence.stage === "SUBJECT_B";
  const rearStage = evidence.stage === "SIBLING_07_CORE"
    || evidence.stage === "SIBLING_07_RECOVERY";
  const garmentFaceBodyRoomChecks = new Set<SemanticCheckPath>([
    ...SEMANTIC_GATE_CHECKS.FACE,
    ...SEMANTIC_GATE_CHECKS.BODY,
    ...SEMANTIC_GATE_CHECKS.ROOM,
  ]);
  return (garmentStage && garmentFaceBodyRoomChecks.has(path))
    || (subjectStage && (
    path === "authorityReview.lockedRoomAuthority"
    || path === "semanticGates.atelierAndBrandIcon"
  )) || (!rearStage
    && evidence.stage !== "GARMENT_02_BACK"
    && path === "authorityReview.inferredRearQuarantine");
}

function orderedSemanticGateReview(
  evidence: StudioAtelierSemanticQualityEvidence,
): Readonly<{
  valid: boolean;
  failedChecks: readonly SemanticCheckPath[];
  sequence: readonly Readonly<{
    gate: StudioAtelierOrderedSemanticGate;
    decision: SemanticGateDecision;
  }>[];
}> {
  let stopped = false;
  const failedChecks: SemanticCheckPath[] = [];
  const sequence: Array<Readonly<{
    gate: StudioAtelierOrderedSemanticGate;
    decision: SemanticGateDecision;
  }>> = [];

  for (const gate of STUDIO_ATELIER_ORDERED_SEMANTIC_GATES) {
    const paths = SEMANTIC_GATE_CHECKS[gate];
    const values = paths.map((path) => ({
      path,
      value: semanticCheck(evidence, path),
      notApplicable: expectedNotApplicable(evidence, path),
    }));

    if (stopped) {
      if (values.some(({ value, notApplicable }) => (
        notApplicable
          ? value !== "NOT_APPLICABLE"
          : value !== "NOT_EVALUATED"
      ))) {
        return { valid: false, failedChecks: [], sequence: [] };
      }
      sequence.push(Object.freeze({
        gate,
        decision: values.every(({ notApplicable }) => notApplicable)
          ? "NOT_APPLICABLE"
          : "NOT_EVALUATED",
      }));
      continue;
    }

    if (values.some(({ value, notApplicable }) => (
      value === "NOT_EVALUATED"
      || (notApplicable && value !== "NOT_APPLICABLE")
      || (!notApplicable && value === "NOT_APPLICABLE")
    ))) {
      return { valid: false, failedChecks: [], sequence: [] };
    }

    const gateFailures = values
      .filter(({ value }) => value === "FAIL")
      .map(({ path }) => path);
    if (gateFailures.length > 0) {
      failedChecks.push(...gateFailures);
      sequence.push(Object.freeze({ gate, decision: "FAIL" }));
      stopped = true;
    } else {
      sequence.push(Object.freeze({
        gate,
        decision: values.every(({ value }) => value === "NOT_APPLICABLE")
          ? "NOT_APPLICABLE"
          : "PASS",
      }));
    }
  }

  return Object.freeze({
    valid: true,
    failedChecks: Object.freeze(failedChecks),
    sequence: Object.freeze(sequence),
  });
}

function exactSequence(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function g004PositiveTargetFailed(
  evidence: StudioAtelierSemanticQualityEvidence,
): boolean {
  const comparison = evidence.multiEraBaseline.g004PositiveTarget;
  return comparison.disposition === "COMPARED"
    && (
      comparison.axisDecisions.some(({ decision }) => decision === "FAIL")
      || comparison.prohibitedTransferDecisions.some(
        ({ decision }) => decision === "FAIL",
      )
    );
}

function validG004PositiveTargetEvidence(input: Readonly<{
  evidence: StudioAtelierSemanticQualityEvidence;
  operationStage: AtelierStage;
  artifactSha256: string;
  calibration: StudioAtelierG004ReadbackReceipt | null;
}>): boolean {
  const evidence = input.evidence.multiEraBaseline.g004PositiveTarget;
  const target = studioAtelierG004CalibrationTargetForStage(input.operationStage);
  if (
    evidence.manifestSha256
      !== STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT.manifestSha256
    || evidence.candidateArtifactSha256 !== input.artifactSha256
  ) {
    return false;
  }

  if (!target) {
    return input.calibration === null
      && evidence.disposition === "NOT_APPLICABLE"
      && evidence.reason === "GARMENT_ONLY_STAGE"
      && evidence.readback === "NOT_REQUIRED";
  }

  if (
    !input.calibration
    || canonicalStringify(input.calibration)
      !== canonicalStringify(STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT)
    || !("readbackReceiptSha256" in evidence)
    || evidence.readbackReceiptSha256 !== input.calibration.receiptSha256
  ) {
    return false;
  }

  const baselineDecision = input.evidence.authorityReview.multiEraDriftBaseline;
  if (baselineDecision === "NOT_EVALUATED") {
    return evidence.disposition === "NOT_EVALUATED"
      && evidence.reason === "ORDERED_GATE_NOT_REACHED";
  }
  if (evidence.disposition !== "COMPARED") return false;

  const exactTarget = evidence.target.id === target.id
    && evidence.target.view === target.view
    && evidence.target.mimeType === target.mimeType
    && evidence.target.byteSize === target.byteSize
    && evidence.target.width === target.width
    && evidence.target.height === target.height
    && evidence.target.sha256 === target.sha256
    && evidence.target.pixelSha256 === target.pixelSha256;
  const exactAxes = exactSequence(
    evidence.axisDecisions.map(({ axis }) => axis),
    target.positiveTargetAxes,
  );
  const exactExclusions = exactSequence(
    evidence.prohibitedTransferDecisions.map(({ scope }) => scope),
    STUDIO_ATELIER_G004_CALIBRATION_MANIFEST.prohibitedTransferScopes,
  );
  if (!exactTarget || !exactAxes || !exactExclusions) return false;

  const g004Failed = g004PositiveTargetFailed(input.evidence);
  return !g004Failed || baselineDecision === "FAIL";
}

export function assessStudioAtelierSemanticQuality(input: {
  value: unknown;
  operationStage: AtelierStage;
  artifactSha256: string;
  g004Calibration: StudioAtelierG004ReadbackReceipt | null;
  evaluator: StudioAtelierEvaluatorDescriptor;
}): StudioAtelierQualityAssessment | null {
  const parsed = studioAtelierSemanticQualityEvidenceSchema.safeParse(input.value);
  if (
    !parsed.success
    || parsed.data.stage !== input.operationStage
    || parsed.data.artifactSha256 !== input.artifactSha256
    || !sameEvaluatorDescriptor(parsed.data.evaluator, input.evaluator)
    || !validG004PositiveTargetEvidence({
      evidence: parsed.data,
      operationStage: input.operationStage,
      artifactSha256: input.artifactSha256,
      calibration: input.g004Calibration,
    })
  ) {
    return null;
  }
  const orderedReview = orderedSemanticGateReview(parsed.data);
  if (!orderedReview.valid) return null;
  const failedChecks = [...orderedReview.failedChecks];
  const decision = failedChecks.length === 0 ? "PASS" as const : "FAIL" as const;
  const firstFailure = (
    g004PositiveTargetFailed(parsed.data)
      ? "authorityReview.multiEraDriftBaseline"
      : failedChecks.find((check) => check !== "authorityReview.multiEraDriftBaseline")
        ?? failedChecks[0]
  ) as keyof typeof semanticFailureCodes | undefined;
  if (firstFailure && !semanticFailureCodes[firstFailure]) return null;
  return Object.freeze({
    decision,
    ...(firstFailure ? { reasonCode: semanticFailureCodes[firstFailure] } : {}),
    evidence: recordedEvidence({
      ...parsed.data,
      orderedGateSequence: orderedReview.sequence,
    }, decision, failedChecks),
  });
}
