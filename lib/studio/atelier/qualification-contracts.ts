import { z } from "zod";
import { canonicalStringify, sha256Text } from "./canonical";

export const STUDIO_ATELIER_QUALIFICATION_EVIDENCE_SCHEMA_VERSION =
  "juw.atelier-qualification-evidence.v1" as const;
export const STUDIO_ATELIER_QUALIFICATION_READINESS_REPORT_SCHEMA_VERSION =
  "juw.atelier-qualification-readiness-report.v1" as const;
export const STUDIO_ATELIER_INDEPENDENT_REVIEW_SCHEMA_VERSION =
  "juw.atelier-independent-qualification-review.v1" as const;
export const STUDIO_ATELIER_REVIEWER_TRUST_POLICY_SCHEMA_VERSION =
  "juw.atelier-qualified-reviewer-trust-policy.v1" as const;
export const STUDIO_ATELIER_EVALUATOR_BINDING_SCHEMA_VERSION =
  "juw.atelier-evaluator-implementation-binding.v1" as const;
export const STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION =
  "juw.atelier-qualification.g004-g005-g009-g017-g023-g024.v3" as const;

export const STUDIO_ATELIER_QUALIFICATION_CASE_SPECS = Object.freeze([
  Object.freeze({
    caseId: "G004_FOUNDING_POSITIVE_TARGET",
    garmentId: "004",
    calibrationKind: "POSITIVE_COMPARISON_TARGET",
    requiredAssertionIds: Object.freeze([
      "EXACT_DERIVATIVE_CONTAINER_AND_PIXEL_READBACK",
      "FRONT_TRANSLATION_SCOPE_ONLY",
      "LEFT_PROFILE_TRANSLATION_SCOPE_ONLY",
      "RIGHT_REAR_TRANSLATION_SCOPE_ONLY",
      "CURRENT_AUTHORITY_OUTRANKS_G004",
      "G004_EXCLUDED_FROM_PROVIDER_AND_PARENT_BINDINGS",
      "FULL_FRAME_DUPLICATE_DENIAL_BEFORE_TRANSPORT",
      "VISUAL_DENIAL_NON_CLAIMS_PRESERVED",
    ]),
  }),
  Object.freeze({
    caseId: "G005_HOLISTIC_SUBJECT_LOCK",
    garmentId: "005",
    calibrationKind: "POSITIVE_CALIBRATION",
    requiredAssertionIds: Object.freeze([
      "REAL_IDENTITY_REMAINS_PRIMARY",
      "WHOLE_FRAME_BODY_AND_GARMENT_COHERENCE",
      "ACCEPTED_SUBJECT_REUSE_WITHOUT_REINTERPRETATION",
    ]),
  }),
  Object.freeze({
    caseId: "G009_ANGLE_CANON_FALSE_PASS",
    garmentId: "009",
    calibrationKind: "NEGATIVE_AND_CORRECTION_CALIBRATION",
    requiredAssertionIds: Object.freeze([
      "DEFICIENT_SIDE_AND_REAR_GEOMETRY_REJECTED",
      "DEDICATED_SIDE_AND_BACK_CANON_REQUIRED",
      "SIBLINGS_06_AND_07_INDEPENDENT_FROM_05",
    ]),
  }),
  Object.freeze({
    caseId: "G017_PROVIDER_OUTPUT_IS_NOT_ACCEPTANCE",
    garmentId: "017",
    calibrationKind: "CAPABILITY_AND_TERMINAL_FAILURE_CALIBRATION",
    requiredAssertionIds: Object.freeze([
      "NO_OUTPUT_MODERATION_IS_TERMINAL",
      "RETURNED_PIXELS_REMAIN_SUBJECT_TO_ALL_GATES",
      "PLACEHOLDER_MODEL_VIEW_NEVER_PROMOTED",
    ]),
  }),
  Object.freeze({
    caseId: "G023_SOURCE_ROOM_AND_BODY_REBASE",
    garmentId: "023",
    calibrationKind: "NEGATIVE_AND_CORRECTION_CALIBRATION",
    requiredAssertionIds: Object.freeze([
      "SOURCE_ROOM_LEAKAGE_REJECTED",
      "TOO_SLIM_SUBJECT_CANNOT_PARENT",
      "CORRECTION_PRESERVES_CONNECTED_SILHOUETTE",
    ]),
  }),
  Object.freeze({
    caseId: "G024_CURRENT_GOLDEN_SEQUENCE",
    garmentId: "024",
    calibrationKind: "POSITIVE_END_TO_END_CALIBRATION",
    requiredAssertionIds: Object.freeze([
      "VIEWS_01_THROUGH_07_PRESERVE_SEMANTIC_ROLES",
      "VIEW_05_LOCKS_BEFORE_INDEPENDENT_06_AND_07",
      "IDENTITY_BODY_GARMENT_ROOM_REALISM_AND_PRIVACY_PASS",
    ]),
  }),
] as const);

export const STUDIO_ATELIER_QUALIFICATION_CASE_IDS = Object.freeze(
  STUDIO_ATELIER_QUALIFICATION_CASE_SPECS.map((item) => item.caseId),
) as readonly [
  "G004_FOUNDING_POSITIVE_TARGET",
  "G005_HOLISTIC_SUBJECT_LOCK",
  "G009_ANGLE_CANON_FALSE_PASS",
  "G017_PROVIDER_OUTPUT_IS_NOT_ACCEPTANCE",
  "G023_SOURCE_ROOM_AND_BODY_REBASE",
  "G024_CURRENT_GOLDEN_SEQUENCE",
];

export const STUDIO_ATELIER_NATIVE_ROOM_QUALIFICATION_STAGES = Object.freeze([
  "ROOM_FINAL_05",
  "SIBLING_06",
  "SIBLING_07_CORE",
  "SIBLING_07_RECOVERY",
] as const);

export const STUDIO_ATELIER_QUALIFICATION_ROOM_PROFILES = Object.freeze([
  Object.freeze({
    profileId: "atelier-room-native-2x3-v1",
    roomCanvas: Object.freeze({ width: 1024, height: 1536 }),
    subjectWindow: Object.freeze({ left: 0, top: 0, width: 1024, height: 1536 }),
    transparentGuardPixels: 0,
  }),
  Object.freeze({
    profileId: "atelier-room-native-4x5-center-window-v1",
    roomCanvas: Object.freeze({ width: 1024, height: 1280 }),
    subjectWindow: Object.freeze({ left: 0, top: 128, width: 1024, height: 1280 }),
    transparentGuardPixels: 16,
  }),
] as const);

export const STUDIO_ATELIER_ROOM_STAGE_MATRIX = Object.freeze(
  STUDIO_ATELIER_QUALIFICATION_ROOM_PROFILES.flatMap((profile) =>
    STUDIO_ATELIER_NATIVE_ROOM_QUALIFICATION_STAGES.map((stage) => Object.freeze({
      profileId: profile.profileId,
      stage,
    })),
  ),
) as readonly [
  { profileId: "atelier-room-native-2x3-v1"; stage: "ROOM_FINAL_05" },
  { profileId: "atelier-room-native-2x3-v1"; stage: "SIBLING_06" },
  { profileId: "atelier-room-native-2x3-v1"; stage: "SIBLING_07_CORE" },
  { profileId: "atelier-room-native-2x3-v1"; stage: "SIBLING_07_RECOVERY" },
  { profileId: "atelier-room-native-4x5-center-window-v1"; stage: "ROOM_FINAL_05" },
  { profileId: "atelier-room-native-4x5-center-window-v1"; stage: "SIBLING_06" },
  { profileId: "atelier-room-native-4x5-center-window-v1"; stage: "SIBLING_07_CORE" },
  { profileId: "atelier-room-native-4x5-center-window-v1"; stage: "SIBLING_07_RECOVERY" },
];

export const STUDIO_ATELIER_ROOM_ASSERTION_IDS = Object.freeze([
  "PROVIDER_SUBJECT_IS_EXACT_TRANSPARENT_1024X1536_PNG",
  "SUBJECT_ALPHA_IS_INSIDE_PROFILE_WINDOW",
  "ROOM_PIXELS_ARE_EXACT_ONE_TO_ONE_COPY",
  "REVIEW_ARTIFACT_BINDS_EXACT_COMPOSITE",
  "TECHNICAL_AND_SEMANTIC_EVIDENCE_BIND_EXACT_COMPOSITE",
] as const);

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{1,191}$/;
const SAFE_ARTIFACT_ID_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,127}$/;

export const studioAtelierQualificationSha256Schema = z.string().regex(SHA256_PATTERN);

export const studioAtelierCanonicalInstantSchema = z.string().refine((value) => {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}, "Expected a canonical UTC ISO-8601 instant.");

export const studioAtelierRelativeEvidencePathSchema = z.string()
  .min(1)
  .max(512)
  .refine((value) => {
    if (
      value.includes("\\")
      || value.startsWith("/")
      || /^[A-Za-z]:/.test(value)
      || value.includes("\0")
    ) {
      return false;
    }
    const segments = value.split("/");
    return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
  }, "Evidence paths must be normalized relative paths contained by the packet root.");

export const studioAtelierEvidenceFileReferenceSchema = z.object({
  relativePath: studioAtelierRelativeEvidencePathSchema,
  sha256: studioAtelierQualificationSha256Schema,
  byteSize: z.number().int().nonnegative(),
  mediaType: z.string().min(1).max(127),
}).strict();

export type StudioAtelierEvidenceFileReference = z.infer<
  typeof studioAtelierEvidenceFileReferenceSchema
>;

const pngEvidenceFileReferenceSchema = studioAtelierEvidenceFileReferenceSchema.extend({
  mediaType: z.literal("image/png"),
}).strict();

const jsonEvidenceFileReferenceSchema = studioAtelierEvidenceFileReferenceSchema.extend({
  mediaType: z.literal("application/json"),
}).strict();

const qualificationArtifactSchema = z.object({
  artifactId: z.string().regex(SAFE_ARTIFACT_ID_PATTERN),
  role: z.enum([
    "INPUT_AUTHORITY",
    "PROVIDER_RAW_RESULT",
    "NORMALIZED_ARTIFACT",
    "REVIEW_ARTIFACT",
    "TECHNICAL_EVALUATION",
    "SEMANTIC_EVALUATION",
    "OPERATION_RECEIPT",
    "DECISION_RECEIPT",
    "MODERATION_RECEIPT",
    "OTHER_SUPPORTING_EVIDENCE",
  ]),
  file: studioAtelierEvidenceFileReferenceSchema,
}).strict();

const assertionResultSchema = z.enum([
  "SATISFIED",
  "NOT_SATISFIED",
  "INDETERMINATE",
]);

const caseAssertionSchema = z.object({
  assertionId: z.string().regex(SAFE_ARTIFACT_ID_PATTERN),
  result: assertionResultSchema,
  evidenceArtifactIds: z.array(z.string().regex(SAFE_ARTIFACT_ID_PATTERN)).min(1),
}).strict();

function qualificationCaseSchema(spec: typeof STUDIO_ATELIER_QUALIFICATION_CASE_SPECS[number]) {
  return z.object({
    caseId: z.literal(spec.caseId),
    garmentId: z.literal(spec.garmentId),
    calibrationKind: z.literal(spec.calibrationKind),
    evidenceRevision: z.string().regex(SAFE_IDENTIFIER_PATTERN),
    recordedAt: studioAtelierCanonicalInstantSchema,
    provenance: z.enum([
      "RETAINED_OPERATION",
      "CONTROLLED_QUALIFICATION_RUN",
      "VERSION_LOCKED_PUBLIC_DERIVATIVE",
    ]),
    artifacts: z.array(qualificationArtifactSchema).min(1),
    assertions: z.array(caseAssertionSchema),
  }).strict().superRefine((value, context) => {
    const artifactIds = value.artifacts.map((artifact) => artifact.artifactId);
    if (new Set(artifactIds).size !== artifactIds.length) {
      context.addIssue({ code: "custom", path: ["artifacts"], message: "Artifact IDs must be unique." });
    }
    const actualAssertions = value.assertions.map((assertion) => assertion.assertionId);
    if (canonicalStringify(actualAssertions) !== canonicalStringify(spec.requiredAssertionIds)) {
      context.addIssue({
        code: "custom",
        path: ["assertions"],
        message: "Case assertions must match the canonical ordered assertion set.",
      });
    }
    const knownArtifacts = new Set(artifactIds);
    value.assertions.forEach((assertion, assertionIndex) => {
      assertion.evidenceArtifactIds.forEach((artifactId, evidenceIndex) => {
        if (!knownArtifacts.has(artifactId)) {
          context.addIssue({
            code: "custom",
            path: ["assertions", assertionIndex, "evidenceArtifactIds", evidenceIndex],
            message: "Assertion evidence must resolve to an artifact in the same case.",
          });
        }
      });
    });
  });
}

export const studioAtelierQualificationCaseEvidenceSchema = z.tuple([
  qualificationCaseSchema(STUDIO_ATELIER_QUALIFICATION_CASE_SPECS[0]),
  qualificationCaseSchema(STUDIO_ATELIER_QUALIFICATION_CASE_SPECS[1]),
  qualificationCaseSchema(STUDIO_ATELIER_QUALIFICATION_CASE_SPECS[2]),
  qualificationCaseSchema(STUDIO_ATELIER_QUALIFICATION_CASE_SPECS[3]),
  qualificationCaseSchema(STUDIO_ATELIER_QUALIFICATION_CASE_SPECS[4]),
  qualificationCaseSchema(STUDIO_ATELIER_QUALIFICATION_CASE_SPECS[5]),
]);

const roomEvidenceFilesSchema = z.object({
  roomAuthority: pngEvidenceFileReferenceSchema,
  transparentSubject: pngEvidenceFileReferenceSchema,
  finalComposite: pngEvidenceFileReferenceSchema,
  technicalEvaluation: jsonEvidenceFileReferenceSchema,
  semanticEvaluation: jsonEvidenceFileReferenceSchema,
}).strict();

const roomAssertionSchema = z.object({
  assertionId: z.enum(STUDIO_ATELIER_ROOM_ASSERTION_IDS),
  result: assertionResultSchema,
}).strict();

function roomStageEvidenceSchema(
  profile: typeof STUDIO_ATELIER_QUALIFICATION_ROOM_PROFILES[number],
  stage: typeof STUDIO_ATELIER_NATIVE_ROOM_QUALIFICATION_STAGES[number],
) {
  return z.object({
    profileId: z.literal(profile.profileId),
    stage: z.literal(stage),
    roomCanvas: z.object({
      width: z.literal(profile.roomCanvas.width),
      height: z.literal(profile.roomCanvas.height),
    }).strict(),
    subjectWindow: z.object({
      left: z.literal(profile.subjectWindow.left),
      top: z.literal(profile.subjectWindow.top),
      width: z.literal(profile.subjectWindow.width),
      height: z.literal(profile.subjectWindow.height),
    }).strict(),
    transparentGuardPixels: z.literal(profile.transparentGuardPixels),
    evidenceRevision: z.string().regex(SAFE_IDENTIFIER_PATTERN),
    recordedAt: studioAtelierCanonicalInstantSchema,
    files: roomEvidenceFilesSchema,
    assertions: z.array(roomAssertionSchema),
  }).strict().superRefine((value, context) => {
    const actual = value.assertions.map((assertion) => assertion.assertionId);
    if (canonicalStringify(actual) !== canonicalStringify(STUDIO_ATELIER_ROOM_ASSERTION_IDS)) {
      context.addIssue({
        code: "custom",
        path: ["assertions"],
        message: "Room assertions must match the canonical ordered assertion set.",
      });
    }
  });
}

export const studioAtelierRoomStageEvidenceSchema = z.tuple([
  roomStageEvidenceSchema(
    STUDIO_ATELIER_QUALIFICATION_ROOM_PROFILES[0],
    STUDIO_ATELIER_NATIVE_ROOM_QUALIFICATION_STAGES[0],
  ),
  roomStageEvidenceSchema(
    STUDIO_ATELIER_QUALIFICATION_ROOM_PROFILES[0],
    STUDIO_ATELIER_NATIVE_ROOM_QUALIFICATION_STAGES[1],
  ),
  roomStageEvidenceSchema(
    STUDIO_ATELIER_QUALIFICATION_ROOM_PROFILES[0],
    STUDIO_ATELIER_NATIVE_ROOM_QUALIFICATION_STAGES[2],
  ),
  roomStageEvidenceSchema(
    STUDIO_ATELIER_QUALIFICATION_ROOM_PROFILES[0],
    STUDIO_ATELIER_NATIVE_ROOM_QUALIFICATION_STAGES[3],
  ),
  roomStageEvidenceSchema(
    STUDIO_ATELIER_QUALIFICATION_ROOM_PROFILES[1],
    STUDIO_ATELIER_NATIVE_ROOM_QUALIFICATION_STAGES[0],
  ),
  roomStageEvidenceSchema(
    STUDIO_ATELIER_QUALIFICATION_ROOM_PROFILES[1],
    STUDIO_ATELIER_NATIVE_ROOM_QUALIFICATION_STAGES[1],
  ),
  roomStageEvidenceSchema(
    STUDIO_ATELIER_QUALIFICATION_ROOM_PROFILES[1],
    STUDIO_ATELIER_NATIVE_ROOM_QUALIFICATION_STAGES[2],
  ),
  roomStageEvidenceSchema(
    STUDIO_ATELIER_QUALIFICATION_ROOM_PROFILES[1],
    STUDIO_ATELIER_NATIVE_ROOM_QUALIFICATION_STAGES[3],
  ),
]);

const evaluatorDependencySchema = z.object({
  packageName: z.string().regex(SAFE_IDENTIFIER_PATTERN),
  version: z.string().min(1).max(127),
  integritySha256: studioAtelierQualificationSha256Schema,
  evidenceFile: studioAtelierEvidenceFileReferenceSchema,
}).strict();

const evaluatorVisualModelSchema = z.object({
  provider: z.string().regex(SAFE_IDENTIFIER_PATTERN),
  modelId: z.string().regex(SAFE_IDENTIFIER_PATTERN),
  modelVersion: z.string().min(1).max(191),
  policyRevision: z.string().min(1).max(191),
  modelDigestSha256: studioAtelierQualificationSha256Schema,
  attestationFile: studioAtelierEvidenceFileReferenceSchema,
}).strict();

function evaluatorBindingSchema(kind: "TECHNICAL" | "SEMANTIC") {
  return z.object({
    schemaVersion: z.literal(STUDIO_ATELIER_EVALUATOR_BINDING_SCHEMA_VERSION),
    evaluatorKind: z.literal(kind),
    evaluatorId: z.string().regex(SAFE_IDENTIFIER_PATTERN),
    evaluatorVersion: z.string().min(1).max(191),
    policyRevision: z.string().min(1).max(191),
    qualificationSuiteVersion: z.literal(STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION),
    entryPointExport: z.string().min(3).max(512),
    sourceFiles: z.array(studioAtelierEvidenceFileReferenceSchema).min(1),
    implementationDigestSha256: studioAtelierQualificationSha256Schema,
    dependencies: z.array(evaluatorDependencySchema).min(1),
    dependencySetDigestSha256: studioAtelierQualificationSha256Schema,
    visualModels: z.array(evaluatorVisualModelSchema),
    modelSetDigestSha256: studioAtelierQualificationSha256Schema,
    contractFiles: z.array(studioAtelierEvidenceFileReferenceSchema).min(1),
    evaluationContractDigestSha256: studioAtelierQualificationSha256Schema,
  }).strict().superRefine((value, context) => {
    const identitySets = [
      { key: "sourceFiles", identities: value.sourceFiles.map((item) => item.relativePath) },
      { key: "dependencies", identities: value.dependencies.map((item) => item.packageName) },
      {
        key: "visualModels",
        identities: value.visualModels.map((item) => `${item.provider}/${item.modelId}`),
      },
      { key: "contractFiles", identities: value.contractFiles.map((item) => item.relativePath) },
    ] as const;
    for (const { key, identities } of identitySets) {
      if (new Set(identities).size !== identities.length) {
        context.addIssue({ code: "custom", path: [key], message: `${key} entries must be unique.` });
      }
      if (canonicalStringify(identities) !== canonicalStringify([...identities].sort())) {
        context.addIssue({ code: "custom", path: [key], message: `${key} entries must be canonically ordered.` });
      }
    }
    if (kind === "SEMANTIC" && value.visualModels.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["visualModels"],
        message: "The semantic evaluator must bind at least one exact visual model or detector.",
      });
    }
  });
}

export const studioAtelierEvaluatorBindingsSchema = z.tuple([
  evaluatorBindingSchema("TECHNICAL"),
  evaluatorBindingSchema("SEMANTIC"),
]);

export type StudioAtelierEvaluatorBinding = z.infer<
  typeof studioAtelierEvaluatorBindingsSchema
>[number];

export function deriveStudioAtelierEvaluatorImplementationDigest(
  binding: Readonly<{
    evaluatorKind: "TECHNICAL" | "SEMANTIC";
    evaluatorId: string;
    evaluatorVersion: string;
    policyRevision: string;
    qualificationSuiteVersion: string;
    entryPointExport: string;
    sourceFiles: readonly StudioAtelierEvidenceFileReference[];
  }>,
): string {
  return sha256Text(canonicalStringify({
    evaluatorKind: binding.evaluatorKind,
    evaluatorId: binding.evaluatorId,
    evaluatorVersion: binding.evaluatorVersion,
    policyRevision: binding.policyRevision,
    qualificationSuiteVersion: binding.qualificationSuiteVersion,
    entryPointExport: binding.entryPointExport,
    sourceFiles: binding.sourceFiles,
  }));
}

export function deriveStudioAtelierEvaluatorDependencyDigest(
  binding: Readonly<{ dependencies: readonly z.infer<typeof evaluatorDependencySchema>[] }>,
): string {
  return sha256Text(canonicalStringify(binding.dependencies));
}

export function deriveStudioAtelierEvaluatorModelDigest(
  binding: Readonly<{ visualModels: readonly z.infer<typeof evaluatorVisualModelSchema>[] }>,
): string {
  return sha256Text(canonicalStringify(binding.visualModels));
}

export function deriveStudioAtelierEvaluationContractDigest(
  binding: Readonly<{ contractFiles: readonly StudioAtelierEvidenceFileReference[] }>,
): string {
  return sha256Text(canonicalStringify(binding.contractFiles));
}

const currentAdapterBindingSchema = z.object({
  baseAdapterId: z.literal("vercel-ai-gateway/openai-gpt-image-2"),
  baseAdapterVersion: z.literal("atelier-gpt-image-2-v2"),
  transparentSubjectAdapterId: z.literal(
    "vercel-ai-gateway/openai-gpt-image-2/transparent-subject",
  ),
  transparentSubjectAdapterVersion: z.literal(
    "atelier-gpt-image-2-transparent-subject-v1",
  ),
  provider: z.literal("openai"),
  model: z.literal("openai/gpt-image-2"),
  policyRevision: z.literal("2026-08-26.3"),
  transparentSubjectProfileId: z.literal("atelier-transparent-subject-png-v1"),
  transparentSubjectProfileRevision: z.literal("2026-08-27.1"),
  providerCanvas: z.object({ width: z.literal(1024), height: z.literal(1536) }).strict(),
  roomCanvasPolicyRevision: z.literal("juw.atelier-native-room-canvas.v1"),
  compositorRevision: z.literal("sharp-native-room-window-v2"),
}).strict();

const qualificationActorSchema = z.object({
  actorId: z.string().regex(SAFE_IDENTIFIER_PATTERN),
  identityType: z.enum(["HUMAN", "SERVICE"]),
}).strict();

const qualificationActorsSchema = z.object({
  evidenceAuthors: z.array(qualificationActorSchema).min(1),
  qualificationOperators: z.array(qualificationActorSchema).min(1),
}).strict().superRefine((value, context) => {
  for (const key of ["evidenceAuthors", "qualificationOperators"] as const) {
    const actorIds = value[key].map((actor) => actor.actorId);
    if (new Set(actorIds).size !== actorIds.length) {
      context.addIssue({ code: "custom", path: [key], message: `${key} must be unique.` });
    }
  }
});

export const studioAtelierQualificationEvidencePacketSchema = z.object({
  schemaVersion: z.literal(STUDIO_ATELIER_QUALIFICATION_EVIDENCE_SCHEMA_VERSION),
  suiteVersion: z.literal(STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION),
  packetRevision: z.string().regex(SAFE_IDENTIFIER_PATTERN),
  createdAt: studioAtelierCanonicalInstantSchema,
  adapterBinding: currentAdapterBindingSchema,
  actors: qualificationActorsSchema,
  cases: studioAtelierQualificationCaseEvidenceSchema,
  roomStageEvidence: studioAtelierRoomStageEvidenceSchema,
  evaluators: studioAtelierEvaluatorBindingsSchema,
  evidenceContentSha256: studioAtelierQualificationSha256Schema,
  independentReviewReceipt: jsonEvidenceFileReferenceSchema,
}).strict();

export type StudioAtelierQualificationEvidencePacket = z.infer<
  typeof studioAtelierQualificationEvidencePacketSchema
>;

export function deriveStudioAtelierQualificationEvidenceContentSha256(
  packet: StudioAtelierQualificationEvidencePacket,
): string {
  return sha256Text(canonicalStringify({
    schemaVersion: packet.schemaVersion,
    suiteVersion: packet.suiteVersion,
    packetRevision: packet.packetRevision,
    createdAt: packet.createdAt,
    adapterBinding: packet.adapterBinding,
    actors: packet.actors,
    cases: packet.cases,
    roomStageEvidence: packet.roomStageEvidence,
    evaluators: packet.evaluators,
  }));
}

const reviewedCasesSchema = z.tuple(
  STUDIO_ATELIER_QUALIFICATION_CASE_SPECS.map((spec) => z.object({
    caseId: z.literal(spec.caseId),
    evidenceDigestSha256: studioAtelierQualificationSha256Schema,
  }).strict()) as [
    z.ZodObject<{ caseId: z.ZodLiteral<"G004_FOUNDING_POSITIVE_TARGET">; evidenceDigestSha256: typeof studioAtelierQualificationSha256Schema }>,
    z.ZodObject<{ caseId: z.ZodLiteral<"G005_HOLISTIC_SUBJECT_LOCK">; evidenceDigestSha256: typeof studioAtelierQualificationSha256Schema }>,
    z.ZodObject<{ caseId: z.ZodLiteral<"G009_ANGLE_CANON_FALSE_PASS">; evidenceDigestSha256: typeof studioAtelierQualificationSha256Schema }>,
    z.ZodObject<{ caseId: z.ZodLiteral<"G017_PROVIDER_OUTPUT_IS_NOT_ACCEPTANCE">; evidenceDigestSha256: typeof studioAtelierQualificationSha256Schema }>,
    z.ZodObject<{ caseId: z.ZodLiteral<"G023_SOURCE_ROOM_AND_BODY_REBASE">; evidenceDigestSha256: typeof studioAtelierQualificationSha256Schema }>,
    z.ZodObject<{ caseId: z.ZodLiteral<"G024_CURRENT_GOLDEN_SEQUENCE">; evidenceDigestSha256: typeof studioAtelierQualificationSha256Schema }>,
  ],
);

function reviewedRoomStageItemSchema(
  item: typeof STUDIO_ATELIER_ROOM_STAGE_MATRIX[number],
) {
  return z.object({
    profileId: z.literal(item.profileId),
    stage: z.literal(item.stage),
    evidenceDigestSha256: studioAtelierQualificationSha256Schema,
  }).strict();
}

const reviewedRoomStageSchema = z.tuple([
  reviewedRoomStageItemSchema(STUDIO_ATELIER_ROOM_STAGE_MATRIX[0]),
  reviewedRoomStageItemSchema(STUDIO_ATELIER_ROOM_STAGE_MATRIX[1]),
  reviewedRoomStageItemSchema(STUDIO_ATELIER_ROOM_STAGE_MATRIX[2]),
  reviewedRoomStageItemSchema(STUDIO_ATELIER_ROOM_STAGE_MATRIX[3]),
  reviewedRoomStageItemSchema(STUDIO_ATELIER_ROOM_STAGE_MATRIX[4]),
  reviewedRoomStageItemSchema(STUDIO_ATELIER_ROOM_STAGE_MATRIX[5]),
  reviewedRoomStageItemSchema(STUDIO_ATELIER_ROOM_STAGE_MATRIX[6]),
  reviewedRoomStageItemSchema(STUDIO_ATELIER_ROOM_STAGE_MATRIX[7]),
]);

const reviewedEvaluatorsSchema = z.tuple([
  z.object({
    evaluatorKind: z.literal("TECHNICAL"),
    implementationDigestSha256: studioAtelierQualificationSha256Schema,
    dependencySetDigestSha256: studioAtelierQualificationSha256Schema,
    modelSetDigestSha256: studioAtelierQualificationSha256Schema,
    evaluationContractDigestSha256: studioAtelierQualificationSha256Schema,
  }).strict(),
  z.object({
    evaluatorKind: z.literal("SEMANTIC"),
    implementationDigestSha256: studioAtelierQualificationSha256Schema,
    dependencySetDigestSha256: studioAtelierQualificationSha256Schema,
    modelSetDigestSha256: studioAtelierQualificationSha256Schema,
    evaluationContractDigestSha256: studioAtelierQualificationSha256Schema,
  }).strict(),
]);

export const STUDIO_ATELIER_INDEPENDENCE_STATEMENT =
  "I am a human reviewer independent of evidence authorship and qualification execution, and I reviewed the exact content-addressed packet." as const;
export const STUDIO_ATELIER_REVIEW_SIGNATURE_CONVENTION =
  "juw.atelier-independent-qualification-review.v1\\n{reviewContentSha256}" as const;

export const studioAtelierIndependentReviewReceiptSchema = z.object({
  schemaVersion: z.literal(STUDIO_ATELIER_INDEPENDENT_REVIEW_SCHEMA_VERSION),
  suiteVersion: z.literal(STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION),
  reviewId: z.string().regex(SAFE_IDENTIFIER_PATTERN),
  reviewer: z.object({
    identityType: z.literal("HUMAN"),
    reviewerId: z.string().regex(SAFE_IDENTIFIER_PATTERN),
    keyId: z.string().regex(SAFE_IDENTIFIER_PATTERN),
  }).strict(),
  reviewedAt: studioAtelierCanonicalInstantSchema,
  evidenceContentSha256: studioAtelierQualificationSha256Schema,
  reviewedCases: reviewedCasesSchema,
  reviewedRoomStageEvidence: reviewedRoomStageSchema,
  reviewedEvaluators: reviewedEvaluatorsSchema,
  independenceAttestation: z.object({
    statement: z.literal(STUDIO_ATELIER_INDEPENDENCE_STATEMENT),
    reviewerWasNotEvidenceAuthor: z.literal(true),
    reviewerDidNotOperateQualificationProvider: z.literal(true),
    conflictsOfInterest: z.tuple([]),
  }).strict(),
  conclusion: z.enum([
    "EVIDENCE_SUFFICIENT_FOR_INSTALLATION_REVIEW",
    "EVIDENCE_INSUFFICIENT",
  ]),
  reviewContentSha256: studioAtelierQualificationSha256Schema,
  signature: z.object({
    algorithm: z.literal("Ed25519"),
    signedPayloadConvention: z.literal(STUDIO_ATELIER_REVIEW_SIGNATURE_CONVENTION),
    valueBase64: z.string().min(80).max(128).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  }).strict(),
}).strict();

export type StudioAtelierIndependentReviewReceipt = z.infer<
  typeof studioAtelierIndependentReviewReceiptSchema
>;

export function deriveStudioAtelierIndependentReviewContentSha256(
  receipt: StudioAtelierIndependentReviewReceipt,
): string {
  return sha256Text(canonicalStringify({
    schemaVersion: receipt.schemaVersion,
    suiteVersion: receipt.suiteVersion,
    reviewId: receipt.reviewId,
    reviewer: receipt.reviewer,
    reviewedAt: receipt.reviewedAt,
    evidenceContentSha256: receipt.evidenceContentSha256,
    reviewedCases: receipt.reviewedCases,
    reviewedRoomStageEvidence: receipt.reviewedRoomStageEvidence,
    reviewedEvaluators: receipt.reviewedEvaluators,
    independenceAttestation: receipt.independenceAttestation,
    conclusion: receipt.conclusion,
  }));
}

export function studioAtelierIndependentReviewSignaturePayload(
  reviewContentSha256: string,
): string {
  return `${STUDIO_ATELIER_INDEPENDENT_REVIEW_SCHEMA_VERSION}\n${reviewContentSha256}`;
}

const authorizedReviewerSchema = z.object({
  reviewerId: z.string().regex(SAFE_IDENTIFIER_PATTERN),
  displayName: z.string().min(1).max(191),
  keyId: z.string().regex(SAFE_IDENTIFIER_PATTERN),
  publicKeySpkiPem: z.string().min(100).max(2048),
  publicKeySpkiSha256: studioAtelierQualificationSha256Schema,
  authorizedSuiteVersion: z.literal(STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION),
  validFrom: studioAtelierCanonicalInstantSchema,
  validUntil: studioAtelierCanonicalInstantSchema,
}).strict();

export const studioAtelierReviewerTrustPolicySchema = z.object({
  schemaVersion: z.literal(STUDIO_ATELIER_REVIEWER_TRUST_POLICY_SCHEMA_VERSION),
  policyRevision: z.string().regex(SAFE_IDENTIFIER_PATTERN),
  authorizedHumanReviewers: z.array(authorizedReviewerSchema).min(1),
  policyContentSha256: studioAtelierQualificationSha256Schema,
}).strict().superRefine((value, context) => {
  const identities = value.authorizedHumanReviewers.map((reviewer) =>
    `${reviewer.reviewerId}:${reviewer.keyId}`
  );
  if (new Set(identities).size !== identities.length) {
    context.addIssue({
      code: "custom",
      path: ["authorizedHumanReviewers"],
      message: "Reviewer/key identities must be unique.",
    });
  }
  value.authorizedHumanReviewers.forEach((reviewer, index) => {
    if (new Date(reviewer.validUntil).getTime() <= new Date(reviewer.validFrom).getTime()) {
      context.addIssue({
        code: "custom",
        path: ["authorizedHumanReviewers", index, "validUntil"],
        message: "Reviewer authorization must end after it begins.",
      });
    }
  });
});

export type StudioAtelierReviewerTrustPolicy = z.infer<
  typeof studioAtelierReviewerTrustPolicySchema
>;

export function deriveStudioAtelierReviewerTrustPolicyContentSha256(
  policy: StudioAtelierReviewerTrustPolicy,
): string {
  return sha256Text(canonicalStringify({
    schemaVersion: policy.schemaVersion,
    policyRevision: policy.policyRevision,
    authorizedHumanReviewers: policy.authorizedHumanReviewers,
  }));
}

export function deriveStudioAtelierCaseEvidenceDigest(
  value: StudioAtelierQualificationEvidencePacket["cases"][number],
): string {
  return sha256Text(canonicalStringify(value));
}

export function deriveStudioAtelierRoomStageEvidenceDigest(
  value: StudioAtelierQualificationEvidencePacket["roomStageEvidence"][number],
): string {
  return sha256Text(canonicalStringify(value));
}
