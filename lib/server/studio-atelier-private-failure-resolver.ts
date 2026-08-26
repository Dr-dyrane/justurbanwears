import type { StudioAtelierReviewDecision } from "./studio-atelier-engine-facade";
import {
  listAtelierOperationEvents,
  type AtelierLifecycleEventRow,
} from "./studio-atelier-repository";
import type {
  StudioAtelierPrivateFailureResolver,
} from "./studio-atelier-background-gate";
import {
  ATELIER_STAGE_LAYER_POLICIES,
  type AtelierLayer,
  type AtelierStage,
} from "../studio/atelier/contracts";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

type PrivateCorrection = Extract<
  StudioAtelierReviewDecision,
  { decision: "FIX_ONE_THING" }
>;

type PrivateFailureEvent = "TECHNICAL_FAIL" | "SEMANTIC_FAIL";

const CORRECTION_TARGET_LAYER = Object.freeze({
  FACE_TRANSLATION: "IDENTITY",
  BODY_GEOMETRY: "BODY",
  GARMENT_CONSTRUCTION: "GARMENT",
  GARMENT_SURFACE: "GARMENT",
  HAIR: "HAIR",
  LEFT_HAND: "HANDS",
  RIGHT_HAND: "HANDS",
  FOOTWEAR: "FOOTWEAR",
  POSE_ALIGNMENT: "POSE",
  CAMERA_ALIGNMENT: "CAMERA",
  LIGHTING_INTEGRATION: "LIGHTING",
  OUTPUT_GEOMETRY: "OUTPUT_GEOMETRY",
} as const satisfies Record<PrivateCorrection["target"], AtelierLayer>);

type FailureResolutionDependencies = Readonly<{
  listEvents: typeof listAtelierOperationEvents;
}>;

const defaultDependencies: FailureResolutionDependencies = Object.freeze({
  listEvents: listAtelierOperationEvents,
});

const ZERO_SPEND_REASON_CODES: ReadonlySet<string> = new Set([
  "SEMANTIC_DIRECT_GARMENT_AUTHORITY_FAILED",
  "SEMANTIC_CURRENT_GARMENT_LINEAGE_FAILED",
  "SEMANTIC_REAL_IDENTITY_AUTHORITY_FAILED",
  "SEMANTIC_REAL_BODY_AUTHORITY_FAILED",
  "SEMANTIC_LOCKED_ROOM_AUTHORITY_FAILED",
  "SEMANTIC_MULTI_ERA_BASELINE_FAILED",
]);

const CORRECTION_BY_REASON = Object.freeze({
  TECHNICAL_IMAGE_DECODE_FAILED: {
    decision: "FIX_ONE_THING",
    reason: "PHOTOREALISM_FAILURE",
    target: "OUTPUT_GEOMETRY",
  },
  TECHNICAL_SINGLE_IMAGE_FAILED: {
    decision: "FIX_ONE_THING",
    reason: "WRONG_STAGE_VIEW",
    target: "OUTPUT_GEOMETRY",
  },
  TECHNICAL_OUTPUT_CONTRACT_FAILED: {
    decision: "FIX_ONE_THING",
    reason: "WRONG_STAGE_VIEW",
    target: "OUTPUT_GEOMETRY",
  },
  TECHNICAL_COLOUR_SPACE_FAILED: {
    decision: "FIX_ONE_THING",
    reason: "PHOTOREALISM_FAILURE",
    target: "LIGHTING_INTEGRATION",
  },
  TECHNICAL_RENDERED_TEXT_FAILED: {
    decision: "FIX_ONE_THING",
    reason: "WRONG_STAGE_VIEW",
    target: "OUTPUT_GEOMETRY",
  },
  TECHNICAL_WATERMARK_FAILED: {
    decision: "FIX_ONE_THING",
    reason: "PHOTOREALISM_FAILURE",
    target: "OUTPUT_GEOMETRY",
  },
  TECHNICAL_SOURCE_ALPHA_FAILED: {
    decision: "FIX_ONE_THING",
    reason: "IMMUTABLE_TRUTH_DRIFT",
    target: "OUTPUT_GEOMETRY",
  },
  SEMANTIC_REAR_INFERENCE_QUARANTINE_FAILED: {
    decision: "FIX_ONE_THING",
    reason: "GARMENT_TRUTH_DRIFT",
    target: "GARMENT_CONSTRUCTION",
  },
  SEMANTIC_GARMENT_TRUTH_FAILED: {
    decision: "FIX_ONE_THING",
    reason: "GARMENT_TRUTH_DRIFT",
    target: "GARMENT_CONSTRUCTION",
  },
  SEMANTIC_GARMENT_TEXTURE_FAILED: {
    decision: "FIX_ONE_THING",
    reason: "GARMENT_TRUTH_DRIFT",
    target: "GARMENT_SURFACE",
  },
  SEMANTIC_IDENTITY_FAILED: {
    decision: "FIX_ONE_THING",
    reason: "IDENTITY_DRIFT",
    target: "FACE_TRANSLATION",
  },
  SEMANTIC_HAIR_FAILED: {
    decision: "FIX_ONE_THING",
    reason: "IDENTITY_DRIFT",
    target: "HAIR",
  },
  SEMANTIC_SKIN_TEXTURE_FAILED: {
    decision: "FIX_ONE_THING",
    reason: "IDENTITY_DRIFT",
    target: "FACE_TRANSLATION",
  },
  SEMANTIC_CONNECTED_BODY_GEOMETRY_FAILED: {
    decision: "FIX_ONE_THING",
    reason: "FULL_BODY_GEOMETRY_FAILURE",
    target: "BODY_GEOMETRY",
  },
  SEMANTIC_ATELIER_BRAND_FAILED: {
    decision: "FIX_ONE_THING",
    reason: "ATELIER_PIXEL_DRIFT",
    target: "CAMERA_ALIGNMENT",
  },
  SEMANTIC_VIEW_GRAMMAR_FAILED: {
    decision: "FIX_ONE_THING",
    reason: "WRONG_STAGE_VIEW",
    target: "POSE_ALIGNMENT",
  },
  SEMANTIC_FULL_FRAME_FORMAT_FAILED: {
    decision: "FIX_ONE_THING",
    reason: "WRONG_STAGE_VIEW",
    target: "OUTPUT_GEOMETRY",
  },
  SEMANTIC_PHOTOGRAPHIC_REALISM_FAILED: {
    decision: "FIX_ONE_THING",
    reason: "PHOTOREALISM_FAILURE",
    target: "LIGHTING_INTEGRATION",
  },
  SEMANTIC_LIGHTING_INTEGRATION_FAILED: {
    decision: "FIX_ONE_THING",
    reason: "PHOTOREALISM_FAILURE",
    target: "LIGHTING_INTEGRATION",
  },
  SEMANTIC_OPTICS_PERSPECTIVE_FAILED: {
    decision: "FIX_ONE_THING",
    reason: "PHOTOREALISM_FAILURE",
    target: "CAMERA_ALIGNMENT",
  },
  SEMANTIC_ARTIFACT_REJECTION_FAILED: {
    decision: "FIX_ONE_THING",
    reason: "PHOTOREALISM_FAILURE",
    target: "OUTPUT_GEOMETRY",
  },
} as const satisfies Record<string, PrivateCorrection>);

function qualityFailureEvent(
  events: readonly AtelierLifecycleEventRow[],
  expectedType: PrivateFailureEvent,
): AtelierLifecycleEventRow | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.eventType === expectedType) return event;
  }
  return null;
}

function closedFailureReason(
  event: AtelierLifecycleEventRow,
  expectedType: PrivateFailureEvent,
): string | null {
  const payload = event.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const reasonCode = payload.reasonCode;
  const evidence = payload.evidence;
  if (
    event.actorSubject !== `system:atelier-${
      expectedType === "TECHNICAL_FAIL" ? "technical" : "semantic"
    }-qa`
    || !event.executionId
    || !event.artifactId
    || event.operationId.length === 0
    ||
    typeof reasonCode !== "string"
    || !evidence
    || typeof evidence !== "object"
    || Array.isArray(evidence)
  ) return null;
  const record = evidence as Record<string, unknown>;
  if (
    record.aggregateDecision !== "FAIL"
    || !Array.isArray(record.failedChecks)
    || record.failedChecks.length === 0
    || record.failedChecks.some((check) => typeof check !== "string")
    || typeof record.evaluationHash !== "string"
    || !SHA256_PATTERN.test(record.evaluationHash)
  ) return null;
  return reasonCode;
}

function stageAllowsCorrection(
  stage: AtelierStage,
  correction: PrivateCorrection,
): boolean {
  const mutableLayer = CORRECTION_TARGET_LAYER[correction.target];
  const allowedLayers = ATELIER_STAGE_LAYER_POLICIES[stage]
    .allowedMutableLayers as readonly AtelierLayer[];
  return allowedLayers.includes(mutableLayer);
}

/**
 * Converts the exact persisted closed-QA failure into one bounded correction.
 * Unknown, malformed, provenance/lineage-only, and byte-integrity failures are
 * deliberately not guessed: returning null makes the background gate persist
 * a zero-spend user-direction block.
 */
export function createStudioAtelierLedgerFailureResolver(
  overrides: Partial<FailureResolutionDependencies> = {},
): StudioAtelierPrivateFailureResolver {
  const dependencies = Object.freeze({
    ...defaultDependencies,
    ...overrides,
  });
  return async (input) => {
    const expectedType: PrivateFailureEvent = input.state === "TECHNICAL_FAIL"
      ? "TECHNICAL_FAIL"
      : "SEMANTIC_FAIL";
    const events = await dependencies.listEvents({
      operatorSubject: input.operatorSubject,
      operationId: input.operationId,
    });
    const failure = qualityFailureEvent(events, expectedType);
    const reason = failure ? closedFailureReason(failure, expectedType) : null;
    if (!reason || ZERO_SPEND_REASON_CODES.has(reason)) return null;
    const correction = CORRECTION_BY_REASON[reason as keyof typeof CORRECTION_BY_REASON] ?? null;
    if (!correction || !stageAllowsCorrection(input.stage, correction)) return null;
    return correction;
  };
}

export const resolveStudioAtelierPrivateFailure =
  createStudioAtelierLedgerFailureResolver();
