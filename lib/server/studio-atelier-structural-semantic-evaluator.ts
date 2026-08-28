import { canonicalStringify, sha256Text } from "../studio/atelier/canonical";
import {
  ATELIER_STAGE_RECIPES,
  atelierOperationSchema,
  type AtelierOperation,
  type AtelierStage,
} from "../studio/atelier/contracts";
import {
  isStudioAtelierG004ProviderPixelDenied,
  studioAtelierG004ProviderDenial,
} from "../studio/atelier/g004-provider-denial";

export const STUDIO_ATELIER_STRUCTURAL_SEMANTIC_EVALUATOR_ID =
  "juw.atelier.structural-semantic-preflight" as const;
export const STUDIO_ATELIER_STRUCTURAL_SEMANTIC_EVALUATOR_VERSION =
  "1.0.0" as const;
export const STUDIO_ATELIER_STRUCTURAL_SEMANTIC_POLICY_REVISION =
  "juw.atelier.structural-semantic-policy.v1" as const;
export const STUDIO_ATELIER_STRUCTURAL_SEMANTIC_EVIDENCE_VERSION =
  "juw.atelier.structural-semantic-evidence.v1" as const;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_ASSET_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{1,239}$/;

export const STUDIO_ATELIER_REQUIRED_VISUAL_JUDGMENTS = Object.freeze([
  "IDENTITY_FIDELITY",
  "BODY_FIDELITY",
  "GARMENT_FIDELITY",
  "HAIR_FIDELITY",
  "ROOM_AND_BRAND_FIDELITY",
  "PHOTOGRAPHIC_REALISM",
  "SKIN_TEXTURE",
  "GARMENT_TEXTURE",
  "OPTICS_PERSPECTIVE",
  "LIGHTING_INTEGRATION",
  "RENDERED_TEXT",
  "WATERMARK",
  "G004_POSITIVE_TARGET_COMPARISON",
  "G004_LOSSY_VISUAL_DUPLICATE_DENIAL",
] as const);

export type StudioAtelierRequiredVisualJudgment =
  typeof STUDIO_ATELIER_REQUIRED_VISUAL_JUDGMENTS[number];

export type StudioAtelierStructuralDecision =
  | "SATISFIED"
  | "BLOCKED"
  | "INDETERMINATE"
  | "NOT_APPLICABLE"
  | "NOT_EVALUATED";

export type StudioAtelierStructuralCheck = Readonly<{
  decision: StudioAtelierStructuralDecision;
  code: string;
}>;

export type StudioAtelierTransportConstituent = Readonly<{
  assetId: string;
  sha256: string;
  decodedPixelSha256: string;
}>;

export type StudioAtelierStructuralSemanticInput = Readonly<{
  evaluatedAt: string;
  operation: unknown;
  artifactSha256: string;
  transportConstituents: readonly StudioAtelierTransportConstituent[];
}>;

export type StudioAtelierStructuralSemanticEvidence = Readonly<{
  schemaVersion: typeof STUDIO_ATELIER_STRUCTURAL_SEMANTIC_EVIDENCE_VERSION;
  evaluator: Readonly<{
    id: typeof STUDIO_ATELIER_STRUCTURAL_SEMANTIC_EVALUATOR_ID;
    version: typeof STUDIO_ATELIER_STRUCTURAL_SEMANTIC_EVALUATOR_VERSION;
    policyRevision: typeof STUDIO_ATELIER_STRUCTURAL_SEMANTIC_POLICY_REVISION;
    visualEvaluatorInstalled: false;
  }>;
  evaluatedAt: string;
  artifactSha256: string;
  stage: AtelierStage | null;
  status: "BLOCKED" | "INDETERMINATE";
  productionPass: false;
  blockerCodes: readonly string[];
  checks: Readonly<{
    canonicalOperation: StudioAtelierStructuralCheck;
    authorityLineage: StudioAtelierStructuralCheck;
    stageView: StudioAtelierStructuralCheck;
    parentLineage: StudioAtelierStructuralCheck;
    inferredRearQuarantine: StudioAtelierStructuralCheck;
    transportConstituentBinding: StudioAtelierStructuralCheck;
    g004ExactBindingDenial: StudioAtelierStructuralCheck;
    g004LossyVisualDenial: StudioAtelierStructuralCheck;
    orderedGateInvariants: StudioAtelierStructuralCheck;
  }>;
  visualJudgments: Readonly<Record<
    StudioAtelierRequiredVisualJudgment,
    StudioAtelierStructuralCheck
  >>;
  orderedGateSequence: readonly Readonly<{
    gate: "GARMENT" | "FACE" | "BODY" | "ROOM" | "FINAL_INTEGRATION";
    decision: "BLOCKED" | "INDETERMINATE" | "NOT_APPLICABLE" | "NOT_EVALUATED";
  }>[];
  evaluationHash: string;
}>;

function check(
  decision: StudioAtelierStructuralDecision,
  code: string,
): StudioAtelierStructuralCheck {
  return Object.freeze({ decision, code });
}

function satisfied(code: string): StudioAtelierStructuralCheck {
  return check("SATISFIED", code);
}

function blocked(code: string): StudioAtelierStructuralCheck {
  return check("BLOCKED", code);
}

function indeterminate(code: string): StudioAtelierStructuralCheck {
  return check("INDETERMINATE", code);
}

function notApplicable(code: string): StudioAtelierStructuralCheck {
  return check("NOT_APPLICABLE", code);
}

function notEvaluated(code: string): StudioAtelierStructuralCheck {
  return check("NOT_EVALUATED", code);
}

function validCanonicalInstant(value: string): boolean {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function isGarmentStage(stage: AtelierStage): boolean {
  return stage === "GARMENT_01_FRONT"
    || stage === "GARMENT_02_BACK"
    || stage === "GARMENT_03_MANNEQUIN"
    || stage === "GARMENT_04_DETAIL";
}

function isSubjectStage(stage: AtelierStage): boolean {
  return stage === "SUBJECT_A" || stage === "SUBJECT_B";
}

function isRearStage(stage: AtelierStage): boolean {
  return stage === "GARMENT_02_BACK"
    || stage === "SIBLING_07_CORE"
    || stage === "SIBLING_07_RECOVERY";
}

function operationBindings(operation: AtelierOperation): Set<string> {
  const bindings = new Set<string>();
  for (const item of [...operation.parentLocks, ...operation.authorityStack]) {
    bindings.add(`${item.assetId}:${item.sha256}`);
  }
  if (operation.directGarmentEvidence) {
    bindings.add(
      `${operation.directGarmentEvidence.output.assetId}:${operation.directGarmentEvidence.output.sha256}`,
    );
    for (const source of operation.directGarmentEvidence.constituents) {
      bindings.add(`${source.assetId}:${source.sha256}`);
    }
  }
  return bindings;
}

function validTransportConstituent(
  value: StudioAtelierTransportConstituent,
): boolean {
  return SAFE_ASSET_ID_PATTERN.test(value.assetId)
    && SHA256_PATTERN.test(value.sha256)
    && SHA256_PATTERN.test(value.decodedPixelSha256);
}

function structuralIssueCodes(rawOperation: unknown): Readonly<{
  authority: boolean;
  stageView: boolean;
  parent: boolean;
  inferredRear: boolean;
  g004: boolean;
}> {
  const parsed = atelierOperationSchema.safeParse(rawOperation);
  if (parsed.success) {
    return Object.freeze({
      authority: false,
      stageView: false,
      parent: false,
      inferredRear: false,
      g004: false,
    });
  }
  const issues = parsed.error.issues.map((issue) => ({
    path: issue.path.map(String),
    message: issue.message,
  }));
  const mentions = (prefix: string) => issues.some((issue) => issue.path[0] === prefix);
  return Object.freeze({
    authority: mentions("authorityStack") || mentions("directGarmentEvidence")
      || mentions("immutableSet"),
    stageView: mentions("stage") || mentions("view") || issues.some((issue) =>
      issue.path[0] === "outputContract" && issue.path.includes("targetView")
    ),
    parent: mentions("parentLocks") || mentions("immutableSet"),
    inferredRear: mentions("rearInference"),
    g004: issues.some((issue) => /G004 positive-target/i.test(issue.message)),
  });
}

function visualJudgments(stage: AtelierStage | null) {
  const garmentOnly = stage !== null && isGarmentStage(stage);
  const subject = stage !== null && isSubjectStage(stage);
  const noIdentityOrBody = stage === null || garmentOnly;
  const noRoom = stage === null || garmentOnly || subject;
  return Object.freeze({
    IDENTITY_FIDELITY: noIdentityOrBody
      ? notApplicable("IDENTITY_NOT_APPLICABLE_TO_GARMENT_ONLY_STAGE")
      : indeterminate("PRIVACY_APPROVED_IDENTITY_EVALUATOR_REQUIRED"),
    BODY_FIDELITY: noIdentityOrBody
      ? notApplicable("BODY_NOT_APPLICABLE_TO_GARMENT_ONLY_STAGE")
      : indeterminate("PRIVACY_APPROVED_BODY_EVALUATOR_REQUIRED"),
    GARMENT_FIDELITY: indeterminate("VERSION_LOCKED_GARMENT_VISUAL_EVALUATOR_REQUIRED"),
    HAIR_FIDELITY: noIdentityOrBody
      ? notApplicable("HAIR_NOT_APPLICABLE_TO_GARMENT_ONLY_STAGE")
      : indeterminate("PRIVACY_APPROVED_HAIR_EVALUATOR_REQUIRED"),
    ROOM_AND_BRAND_FIDELITY: noRoom
      ? notApplicable("ROOM_NOT_APPLICABLE_TO_THIS_STAGE")
      : indeterminate("VERSION_LOCKED_ROOM_AND_BRAND_VISUAL_EVALUATOR_REQUIRED"),
    PHOTOGRAPHIC_REALISM: indeterminate("VERSION_LOCKED_REALISM_EVALUATOR_REQUIRED"),
    SKIN_TEXTURE: noIdentityOrBody
      ? notApplicable("SKIN_NOT_APPLICABLE_TO_GARMENT_ONLY_STAGE")
      : indeterminate("PRIVACY_APPROVED_SKIN_TEXTURE_EVALUATOR_REQUIRED"),
    GARMENT_TEXTURE: indeterminate("VERSION_LOCKED_GARMENT_TEXTURE_EVALUATOR_REQUIRED"),
    OPTICS_PERSPECTIVE: indeterminate("VERSION_LOCKED_OPTICS_EVALUATOR_REQUIRED"),
    LIGHTING_INTEGRATION: indeterminate("VERSION_LOCKED_LIGHTING_EVALUATOR_REQUIRED"),
    RENDERED_TEXT: indeterminate("VERSION_LOCKED_TEXT_DETECTOR_REQUIRED"),
    WATERMARK: indeterminate("VERSION_LOCKED_WATERMARK_DETECTOR_REQUIRED"),
    G004_POSITIVE_TARGET_COMPARISON:
      indeterminate("VERSION_LOCKED_G004_COMPARISON_EVALUATOR_REQUIRED"),
    G004_LOSSY_VISUAL_DUPLICATE_DENIAL:
      indeterminate("SERVER_G004_LOSSY_VISUAL_DENIAL_RECEIPT_REQUIRED"),
  } satisfies Record<StudioAtelierRequiredVisualJudgment, StudioAtelierStructuralCheck>);
}

function orderedGateSequence(
  stage: AtelierStage | null,
  structuralBlocked: boolean,
): StudioAtelierStructuralSemanticEvidence["orderedGateSequence"] {
  const garmentOnly = stage !== null && isGarmentStage(stage);
  const subject = stage !== null && isSubjectStage(stage);
  const first = structuralBlocked ? "BLOCKED" as const : "INDETERMINATE" as const;
  return Object.freeze([
    Object.freeze({ gate: "GARMENT" as const, decision: first }),
    Object.freeze({
      gate: "FACE" as const,
      decision: garmentOnly ? "NOT_APPLICABLE" as const : "NOT_EVALUATED" as const,
    }),
    Object.freeze({
      gate: "BODY" as const,
      decision: garmentOnly ? "NOT_APPLICABLE" as const : "NOT_EVALUATED" as const,
    }),
    Object.freeze({
      gate: "ROOM" as const,
      decision: garmentOnly || subject
        ? "NOT_APPLICABLE" as const
        : "NOT_EVALUATED" as const,
    }),
    Object.freeze({ gate: "FINAL_INTEGRATION" as const, decision: "NOT_EVALUATED" as const }),
  ]);
}

/**
 * Proves structural invariants only. No caller can inject a visual evaluator,
 * and the result type cannot express production PASS. Visual truth remains
 * indeterminate until an exact privacy-approved evaluator is qualified.
 */
export function evaluateStudioAtelierStructuralSemanticPreflight(
  input: StudioAtelierStructuralSemanticInput,
): StudioAtelierStructuralSemanticEvidence {
  const parsed = atelierOperationSchema.safeParse(input.operation);
  const issueCodes = structuralIssueCodes(input.operation);
  const operation = parsed.success ? parsed.data : null;
  const stage = operation?.stage ?? null;
  const checks = {
    canonicalOperation: parsed.success
      ? satisfied("CANONICAL_OPERATION_STRUCTURALLY_VALID")
      : blocked("CANONICAL_OPERATION_INVALID"),
    authorityLineage: parsed.success
      ? satisfied("AUTHORITY_MEMBERSHIP_SCOPE_STATE_AND_GARMENT_LINEAGE_VALID")
      : issueCodes.authority
        ? blocked("AUTHORITY_LINEAGE_INVALID")
        : notEvaluated("AUTHORITY_LINEAGE_NOT_EVALUATED_WITH_INVALID_OPERATION"),
    stageView: parsed.success && ATELIER_STAGE_RECIPES[parsed.data.stage].view === parsed.data.view
      ? satisfied("STAGE_VIEW_AND_OUTPUT_TARGET_EXACT")
      : issueCodes.stageView
        ? blocked("STAGE_VIEW_INVALID")
        : notEvaluated("STAGE_VIEW_NOT_EVALUATED_WITH_INVALID_OPERATION"),
    parentLineage: parsed.success
      ? satisfied("PARENT_ROLE_STATE_STAGE_VIEW_AND_GARMENT_LINEAGE_VALID")
      : issueCodes.parent
        ? blocked("PARENT_LINEAGE_INVALID")
        : notEvaluated("PARENT_LINEAGE_NOT_EVALUATED_WITH_INVALID_OPERATION"),
    inferredRearQuarantine: parsed.success
      && (
        (isRearStage(parsed.data.stage)
          && parsed.data.rearInference?.mayBecomeDirectEvidence === false)
        || (!isRearStage(parsed.data.stage) && parsed.data.rearInference === undefined)
      )
      ? satisfied("INFERRED_REAR_DECLARATION_IS_QUARANTINED_FROM_DIRECT_EVIDENCE")
      : issueCodes.inferredRear
        ? blocked("INFERRED_REAR_QUARANTINE_INVALID")
        : notEvaluated("INFERRED_REAR_NOT_EVALUATED_WITH_INVALID_OPERATION"),
    transportConstituentBinding:
      notEvaluated("TRANSPORT_CONSTITUENTS_NOT_EVALUATED"),
    g004ExactBindingDenial: issueCodes.g004
      ? blocked("G004_EVALUATOR_ONLY_OPERATION_BINDING_DENIED")
      : notEvaluated("G004_EXACT_BINDINGS_NOT_EVALUATED"),
    g004LossyVisualDenial:
      indeterminate("SERVER_G004_LOSSY_VISUAL_DENIAL_RECEIPT_REQUIRED"),
    orderedGateInvariants:
      satisfied("ORDERED_GATES_STOP_AFTER_FIRST_BLOCK_OR_INDETERMINATE_RESULT"),
  };

  if (operation) {
    const allowed = operationBindings(operation);
    const constituentKeys = input.transportConstituents.map((item) =>
      `${item.assetId}:${item.sha256}`
    );
    const constituentsValid = input.transportConstituents.length > 0
      && input.transportConstituents.every(validTransportConstituent)
      && new Set(constituentKeys).size === constituentKeys.length
      && constituentKeys.every((item) => allowed.has(item));
    checks.transportConstituentBinding = constituentsValid
      ? satisfied("RAW_TRANSPORT_CONSTITUENTS_BIND_CANONICAL_AUTHORITY_OR_PARENT_BYTES")
      : blocked("TRANSPORT_CONSTITUENT_BINDING_INVALID");

    const operationAssets = [...operation.parentLocks, ...operation.authorityStack];
    const exactG004Denied = operationAssets.some((item) =>
      studioAtelierG004ProviderDenial(item) !== null
    ) || input.transportConstituents.some((item) =>
      studioAtelierG004ProviderDenial(item) !== null
      || isStudioAtelierG004ProviderPixelDenied(item.decodedPixelSha256)
    );
    checks.g004ExactBindingDenial = exactG004Denied
      ? blocked("G004_EVALUATOR_ONLY_BYTES_DENIED_FROM_OPERATION_OR_TRANSPORT")
      : satisfied("NO_EXACT_G004_EVALUATOR_ONLY_ID_CONTAINER_OR_PIXEL_BINDING");
  }

  const invalidTimestamp = !validCanonicalInstant(input.evaluatedAt);
  const invalidArtifactHash = !SHA256_PATTERN.test(input.artifactSha256);
  const blockerCodes = Object.values(checks)
    .filter((item) => item.decision === "BLOCKED")
    .map((item) => item.code);
  if (invalidTimestamp) blockerCodes.unshift("EVALUATED_AT_INVALID");
  if (invalidArtifactHash) blockerCodes.unshift("ARTIFACT_SHA256_INVALID");
  const sequence = orderedGateSequence(stage, blockerCodes.length > 0);
  const judgments = visualJudgments(stage);
  const body = Object.freeze({
    schemaVersion: STUDIO_ATELIER_STRUCTURAL_SEMANTIC_EVIDENCE_VERSION,
    evaluator: Object.freeze({
      id: STUDIO_ATELIER_STRUCTURAL_SEMANTIC_EVALUATOR_ID,
      version: STUDIO_ATELIER_STRUCTURAL_SEMANTIC_EVALUATOR_VERSION,
      policyRevision: STUDIO_ATELIER_STRUCTURAL_SEMANTIC_POLICY_REVISION,
      visualEvaluatorInstalled: false as const,
    }),
    evaluatedAt: input.evaluatedAt,
    artifactSha256: input.artifactSha256,
    stage,
    status: blockerCodes.length > 0 ? "BLOCKED" as const : "INDETERMINATE" as const,
    productionPass: false as const,
    blockerCodes: Object.freeze(blockerCodes),
    checks: Object.freeze(checks),
    visualJudgments: judgments,
    orderedGateSequence: sequence,
  });
  return Object.freeze({
    ...body,
    evaluationHash: sha256Text(canonicalStringify(body)),
  });
}
