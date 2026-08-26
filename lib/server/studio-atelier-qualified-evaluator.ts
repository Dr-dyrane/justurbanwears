import {
  STUDIO_GPT_IMAGE_2_ADAPTER,
  STUDIO_GPT_IMAGE_2_ADAPTER_VERSION,
  STUDIO_GPT_IMAGE_2_MODEL,
  STUDIO_GPT_IMAGE_2_POLICY_REVISION,
} from "../ai/studio-image-policy";
import {
  STUDIO_ATELIER_SEMANTIC_QA_SCHEMA_VERSION,
  STUDIO_ATELIER_SEMANTIC_RUBRIC_VERSION,
  STUDIO_ATELIER_SEMANTIC_THRESHOLD_VERSION,
  STUDIO_ATELIER_TECHNICAL_QA_SCHEMA_VERSION,
  STUDIO_ATELIER_TECHNICAL_RUBRIC_VERSION,
  STUDIO_ATELIER_TECHNICAL_THRESHOLD_VERSION,
  studioAtelierEvaluatorDescriptorSchema,
  type StudioAtelierEvaluatorDescriptor,
} from "../studio/atelier/quality-contracts";
import {
  STUDIO_ATELIER_G004_CALIBRATION_MANIFEST_SHA256,
  STUDIO_ATELIER_G004_CALIBRATION_REVISION,
  STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT,
} from "../studio/atelier/g004-calibration";
import { canonicalStringify, sha256Text } from "../studio/atelier/canonical";
import type {
  StudioAtelierSemanticQualityEvaluator,
  StudioAtelierTechnicalQualityEvaluator,
} from "./studio-atelier-durable-engine";

export const STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION =
  "juw.atelier-qualification.g004-g005-g009-g017-g023-g024.v2" as const;
export const STUDIO_ATELIER_QUALIFICATION_RECEIPT_SCHEMA_VERSION =
  "juw.atelier-qualified-evaluator-receipt.v1" as const;

export const STUDIO_ATELIER_QUALIFICATION_CASE_IDS = Object.freeze([
  "G004_FOUNDING_POSITIVE_TARGET",
  "G005_HOLISTIC_SUBJECT_LOCK",
  "G009_ANGLE_CANON_FALSE_PASS",
  "G017_PROVIDER_OUTPUT_IS_NOT_ACCEPTANCE",
  "G023_SOURCE_ROOM_AND_BODY_REBASE",
  "G024_CURRENT_GOLDEN_SEQUENCE",
] as const);

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export type StudioAtelierQualificationReadiness = Readonly<{
  schemaVersion: typeof STUDIO_ATELIER_QUALIFICATION_RECEIPT_SCHEMA_VERSION;
  status: "PASS";
  suiteVersion: typeof STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION;
  adapterId: typeof STUDIO_GPT_IMAGE_2_ADAPTER;
  adapterVersion: typeof STUDIO_GPT_IMAGE_2_ADAPTER_VERSION;
  provider: "openai";
  model: typeof STUDIO_GPT_IMAGE_2_MODEL;
  policyRevision: typeof STUDIO_GPT_IMAGE_2_POLICY_REVISION;
  technicalContract: Readonly<{
    schemaVersion: typeof STUDIO_ATELIER_TECHNICAL_QA_SCHEMA_VERSION;
    rubricVersion: typeof STUDIO_ATELIER_TECHNICAL_RUBRIC_VERSION;
    thresholdVersion: typeof STUDIO_ATELIER_TECHNICAL_THRESHOLD_VERSION;
  }>;
  semanticContract: Readonly<{
    schemaVersion: typeof STUDIO_ATELIER_SEMANTIC_QA_SCHEMA_VERSION;
    rubricVersion: typeof STUDIO_ATELIER_SEMANTIC_RUBRIC_VERSION;
    thresholdVersion: typeof STUDIO_ATELIER_SEMANTIC_THRESHOLD_VERSION;
  }>;
  g004Calibration: Readonly<{
    revision: typeof STUDIO_ATELIER_G004_CALIBRATION_REVISION;
    manifestSha256: typeof STUDIO_ATELIER_G004_CALIBRATION_MANIFEST_SHA256;
    readbackReceiptSha256: string;
  }>;
  qualificationReceiptSha256: string;
  independentReviewReceiptSha256: string;
  caseEvidence: readonly Readonly<{
    caseId: typeof STUDIO_ATELIER_QUALIFICATION_CASE_IDS[number];
    evidenceSha256: string;
  }>[];
  technicalEvaluator: StudioAtelierEvaluatorDescriptor;
  semanticEvaluator: StudioAtelierEvaluatorDescriptor;
  passedAt: string;
}>;

export type StudioAtelierQualifiedEvaluatorBundle = Readonly<{
  qualification: StudioAtelierQualificationReadiness;
  technicalEvaluator: StudioAtelierEvaluatorDescriptor;
  semanticEvaluator: StudioAtelierEvaluatorDescriptor;
  evaluateTechnicalQuality: StudioAtelierTechnicalQualityEvaluator;
  evaluateSemanticQuality: StudioAtelierSemanticQualityEvaluator;
}>;

function validCanonicalInstant(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function receiptHashBody(value: StudioAtelierQualificationReadiness) {
  const technicalEvaluator = {
    id: value.technicalEvaluator.id,
    version: value.technicalEvaluator.version,
    policyRevision: value.technicalEvaluator.policyRevision,
    qualificationSuiteVersion: value.technicalEvaluator.qualificationSuiteVersion,
  };
  const semanticEvaluator = {
    id: value.semanticEvaluator.id,
    version: value.semanticEvaluator.version,
    policyRevision: value.semanticEvaluator.policyRevision,
    qualificationSuiteVersion: value.semanticEvaluator.qualificationSuiteVersion,
  };
  return {
    schemaVersion: value.schemaVersion,
    status: value.status,
    suiteVersion: value.suiteVersion,
    adapterId: value.adapterId,
    adapterVersion: value.adapterVersion,
    provider: value.provider,
    model: value.model,
    policyRevision: value.policyRevision,
    technicalContract: value.technicalContract,
    semanticContract: value.semanticContract,
    g004Calibration: value.g004Calibration,
    independentReviewReceiptSha256: value.independentReviewReceiptSha256,
    caseEvidence: value.caseEvidence,
    technicalEvaluator,
    semanticEvaluator,
    passedAt: value.passedAt,
  };
}

/** The evaluator descriptors point back to this hash; their pointer is omitted to avoid a hash cycle. */
export function deriveStudioAtelierQualificationReceiptSha256(
  value: StudioAtelierQualificationReadiness,
): string {
  return sha256Text(canonicalStringify(receiptHashBody(value)));
}

/**
 * Validates only the sanitized receipt envelope. Production authority still
 * requires this envelope to come from the server-owned resolver below; a
 * caller-created object can never install evaluator code or clear readiness.
 */
export function isStudioAtelierQualificationReadiness(
  value: unknown,
): value is StudioAtelierQualificationReadiness {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<StudioAtelierQualificationReadiness>;
  if (
    candidate.schemaVersion !== STUDIO_ATELIER_QUALIFICATION_RECEIPT_SCHEMA_VERSION
    || candidate.status !== "PASS"
    || candidate.suiteVersion !== STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION
    || candidate.adapterId !== STUDIO_GPT_IMAGE_2_ADAPTER
    || candidate.adapterVersion !== STUDIO_GPT_IMAGE_2_ADAPTER_VERSION
    || candidate.provider !== "openai"
    || candidate.model !== STUDIO_GPT_IMAGE_2_MODEL
    || candidate.policyRevision !== STUDIO_GPT_IMAGE_2_POLICY_REVISION
    || !candidate.technicalContract
    || typeof candidate.technicalContract !== "object"
    || canonicalStringify(candidate.technicalContract) !== canonicalStringify({
      schemaVersion: STUDIO_ATELIER_TECHNICAL_QA_SCHEMA_VERSION,
      rubricVersion: STUDIO_ATELIER_TECHNICAL_RUBRIC_VERSION,
      thresholdVersion: STUDIO_ATELIER_TECHNICAL_THRESHOLD_VERSION,
    })
    || !candidate.semanticContract
    || typeof candidate.semanticContract !== "object"
    || canonicalStringify(candidate.semanticContract) !== canonicalStringify({
      schemaVersion: STUDIO_ATELIER_SEMANTIC_QA_SCHEMA_VERSION,
      rubricVersion: STUDIO_ATELIER_SEMANTIC_RUBRIC_VERSION,
      thresholdVersion: STUDIO_ATELIER_SEMANTIC_THRESHOLD_VERSION,
    })
    || !candidate.g004Calibration
    || typeof candidate.g004Calibration !== "object"
    || canonicalStringify(candidate.g004Calibration) !== canonicalStringify({
      revision: STUDIO_ATELIER_G004_CALIBRATION_REVISION,
      manifestSha256: STUDIO_ATELIER_G004_CALIBRATION_MANIFEST_SHA256,
      readbackReceiptSha256:
        STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT.receiptSha256,
    })
    || typeof candidate.qualificationReceiptSha256 !== "string"
    || !SHA256_PATTERN.test(candidate.qualificationReceiptSha256)
    || typeof candidate.independentReviewReceiptSha256 !== "string"
    || !SHA256_PATTERN.test(candidate.independentReviewReceiptSha256)
    || !validCanonicalInstant(candidate.passedAt)
    || !studioAtelierEvaluatorDescriptorSchema.safeParse(
      candidate.technicalEvaluator,
    ).success
    || !studioAtelierEvaluatorDescriptorSchema.safeParse(
      candidate.semanticEvaluator,
    ).success
    || candidate.technicalEvaluator?.qualificationSuiteVersion
      !== STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION
    || candidate.semanticEvaluator?.qualificationSuiteVersion
      !== STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION
    || candidate.technicalEvaluator?.qualificationReceiptSha256
      !== candidate.qualificationReceiptSha256
    || candidate.semanticEvaluator?.qualificationReceiptSha256
      !== candidate.qualificationReceiptSha256
    || !Array.isArray(candidate.caseEvidence)
    || candidate.caseEvidence.length !== STUDIO_ATELIER_QUALIFICATION_CASE_IDS.length
  ) {
    return false;
  }
  const casesValid = STUDIO_ATELIER_QUALIFICATION_CASE_IDS.every((caseId, index) => {
    const evidence = candidate.caseEvidence?.[index];
    return evidence?.caseId === caseId
      && typeof evidence.evidenceSha256 === "string"
      && SHA256_PATTERN.test(evidence.evidenceSha256);
  });
  return casesValid
    && deriveStudioAtelierQualificationReceiptSha256(
      candidate as StudioAtelierQualificationReadiness,
    ) === candidate.qualificationReceiptSha256;
}

export function verifyStudioAtelierQualifiedEvaluatorBundle(
  value: StudioAtelierQualifiedEvaluatorBundle | null,
): StudioAtelierQualifiedEvaluatorBundle | null {
  if (
    !value
    || !isStudioAtelierQualificationReadiness(value.qualification)
    || typeof value.evaluateTechnicalQuality !== "function"
    || typeof value.evaluateSemanticQuality !== "function"
    || canonicalStringify(value.technicalEvaluator)
      !== canonicalStringify(value.qualification.technicalEvaluator)
    || canonicalStringify(value.semanticEvaluator)
      !== canonicalStringify(value.qualification.semanticEvaluator)
  ) {
    return null;
  }
  return value;
}

/**
 * No canonical all-case PASS receipt and independently reviewed production
 * evaluator implementation are checked in yet. Production therefore remains
 * deliberately disabled instead of accepting caller evaluators or inventing a
 * qualification result. Installing a bundle here requires a separately
 * audited immutable receipt plus the exact server-owned evaluator functions.
 */
export function resolveStudioAtelierQualifiedEvaluatorBundle():
  StudioAtelierQualifiedEvaluatorBundle | null {
  return null;
}
