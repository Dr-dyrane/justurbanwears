import { createHash } from "node:crypto";
import { generateText, Output } from "ai";
import sharp from "sharp";
import { z } from "zod";
import { canonicalStringify, sha256Text } from "../studio/atelier/canonical";
import { ATELIER_STAGE_RECIPES, atelierStageSchema } from "../studio/atelier/contracts";

export const STUDIO_ATELIER_VISUAL_EVALUATOR_POLICY_SCHEMA_VERSION =
  "juw.atelier-visual-evaluator-policy.v1" as const;
export const STUDIO_ATELIER_VISUAL_RUBRIC_SCHEMA_VERSION =
  "juw.atelier-visual-rubric.v1" as const;
export const STUDIO_ATELIER_VISUAL_EVIDENCE_SCHEMA_VERSION =
  "juw.atelier-visual-evidence.v1" as const;
export const STUDIO_ATELIER_VISUAL_ACCOUNTING_SCHEMA_VERSION =
  "juw.atelier-visual-accounting.v1" as const;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_MODEL_PATTERN = /^[a-z0-9][a-z0-9.-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,190}$/;
const SAFE_PROVIDER_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SAFE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,127}$/;
const LOCATOR_PATTERN = /(?:[a-z][a-z0-9+.-]*:\/\/|blob:|^[A-Za-z]:[\\/]|(?:^|\s)\.{0,2}\/|\S+\/\S+|\\)/i;

interface VisualImagePipeline {
  metadata(): Promise<{
    format?: string;
    width?: number;
    height?: number;
    pages?: number;
    orientation?: number;
  }>;
  ensureAlpha(): VisualImagePipeline;
  raw(): VisualImagePipeline;
  toBuffer(options: { resolveWithObject: true }): Promise<{
    data: Uint8Array;
    info: { width: number; height: number };
  }>;
}

const createImagePipeline = sharp as unknown as (
  input: Uint8Array,
  options: { failOn: "warning"; limitInputPixels: number },
) => VisualImagePipeline;

const sha256Schema = z.string().regex(SHA256_PATTERN);
const safeIdSchema = z.string().min(1).max(128).regex(SAFE_ID_PATTERN);
const safeCodeSchema = z.string().min(2).max(128).regex(SAFE_CODE_PATTERN);
const canonicalInstantSchema = z.string().refine((value) => {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}, "Expected a canonical UTC ISO-8601 instant.");
const locatorFreeTextSchema = z.string().trim().min(1).max(800).refine(
  (value) => !LOCATOR_PATTERN.test(value),
  "URLs, Blob coordinates and filesystem or object-store locators are forbidden.",
);

export const studioAtelierVisualEvaluatorPolicySchema = z.object({
  schemaVersion: z.literal(STUDIO_ATELIER_VISUAL_EVALUATOR_POLICY_SCHEMA_VERSION),
  evaluatorId: safeIdSchema,
  evaluatorVersion: safeIdSchema,
  policyRevision: safeIdSchema,
  provider: z.string().regex(SAFE_PROVIDER_PATTERN),
  model: z.string().regex(SAFE_MODEL_PATTERN),
  modelRevision: safeIdSchema,
  modelDigestSha256: sha256Schema,
  maxOutputTokens: z.number().int().min(100).max(2_000),
  timeoutMs: z.number().int().min(5_000).max(120_000),
  costCapUsd: z.number().finite().nonnegative().max(10),
}).strict().superRefine((value, context) => {
  if (!value.model.startsWith(`${value.provider}/`)) {
    context.addIssue({
      code: "custom",
      path: ["model"],
      message: "The pinned Gateway model must belong to the exact allowed provider.",
    });
  }
});

export type StudioAtelierVisualEvaluatorPolicy = z.infer<
  typeof studioAtelierVisualEvaluatorPolicySchema
>;

const authorityRoleSchema = z.enum([
  "GARMENT_AUTHORITY", "IDENTITY_AUTHORITY", "BODY_AUTHORITY",
  "ROOM_AUTHORITY", "ANGLE_AUTHORITY", "CALIBRATION_TARGET",
]);
const authorityBindingSchema = z.object({
  imageId: safeIdSchema,
  role: authorityRoleSchema,
  sha256: sha256Schema,
}).strict();
const gateAuthorityRoles = {
  GARMENT: ["GARMENT_AUTHORITY"],
  FACE: ["IDENTITY_AUTHORITY"],
  BODY: ["BODY_AUTHORITY"],
  ROOM: ["ROOM_AUTHORITY"],
  FINAL_INTEGRATION: ["ROOM_AUTHORITY"],
  TECHNICAL: [],
} as const;

const visualCriterionSchema = z.object({
  criterionId: safeCodeSchema,
  gate: z.enum(["GARMENT", "FACE", "BODY", "ROOM", "FINAL_INTEGRATION", "TECHNICAL"]),
  instruction: locatorFreeTextSchema,
  requiredAuthorities: z.array(authorityBindingSchema).max(15),
  satisfiedCode: safeCodeSchema,
  notSatisfiedCode: safeCodeSchema,
  indeterminateCode: safeCodeSchema,
}).strict().superRefine((criterion, context) => {
  const ids = criterion.requiredAuthorities.map((authority) => authority.imageId);
  if (new Set(ids).size !== ids.length || gateAuthorityRoles[criterion.gate].some(
    (role) => !criterion.requiredAuthorities.some((authority) => authority.role === role),
  )) {
    context.addIssue({
      code: "custom",
      path: ["requiredAuthorities"],
      message: "Every comparison gate must bind its relevant authority by unique ID, role and hash.",
    });
  }
});

export const studioAtelierVisualRubricSchema = z.object({
  schemaVersion: z.literal(STUDIO_ATELIER_VISUAL_RUBRIC_SCHEMA_VERSION),
  rubricId: safeIdSchema,
  rubricVersion: safeIdSchema,
  thresholdVersion: safeIdSchema,
  criteria: z.array(visualCriterionSchema).min(1).max(32),
}).strict().superRefine((value, context) => {
  const ids = value.criteria.map((criterion) => criterion.criterionId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: "custom",
      path: ["criteria"],
      message: "Visual criterion IDs must be unique and ordered by the server rubric.",
    });
  }
});

type ParsedStudioAtelierVisualRubric = z.infer<typeof studioAtelierVisualRubricSchema>;
export type StudioAtelierVisualRubric = Readonly<
  Omit<ParsedStudioAtelierVisualRubric, "criteria"> & {
    criteria: readonly Readonly<
      Omit<ParsedStudioAtelierVisualRubric["criteria"][number], "requiredAuthorities"> & {
        requiredAuthorities: readonly Readonly<z.infer<typeof authorityBindingSchema>>[];
      }
    >[];
  }
>;

const visualImageSchema = z.object({
  imageId: safeIdSchema,
  role: z.enum([
    "CANDIDATE",
    "GARMENT_AUTHORITY",
    "IDENTITY_AUTHORITY",
    "BODY_AUTHORITY",
    "ROOM_AUTHORITY",
    "ANGLE_AUTHORITY",
    "CALIBRATION_TARGET",
  ]),
  bytes: z.instanceof(Uint8Array).refine((value) => value.byteLength > 0),
  sha256: sha256Schema,
  byteSize: z.number().int().positive(),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
}).strict();

const visualArtifactSchema = z.object({
  candidateImageId: safeIdSchema,
  sha256: sha256Schema,
  byteSize: z.number().int().positive(),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  kind: z.enum(["NORMALIZED", "COMPOSITE"]),
}).strict();

export const studioAtelierVisualEvaluationInputSchema = z.object({
  evaluationId: safeIdSchema,
  garmentId: z.string().regex(/^\d{3}$/),
  stage: atelierStageSchema,
  view: z.enum(["01", "02", "03", "04", "05", "06", "07", "SUBJECT"]),
  authorityDigestSha256: sha256Schema,
  artifact: visualArtifactSchema,
  images: z.array(visualImageSchema).min(1).max(16),
}).strict().superRefine((value, context) => {
  if (ATELIER_STAGE_RECIPES[value.stage].view !== value.view) {
    context.addIssue({
      code: "custom",
      path: ["view"],
      message: "The evaluator view must match the canonical stage recipe.",
    });
  }
  const ids = value.images.map((image) => image.imageId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["images"], message: "Image IDs must be unique." });
  }
  const hashes = value.images.map((image) => image.sha256);
  if (new Set(hashes).size !== hashes.length) {
    context.addIssue({
      code: "custom",
      path: ["images"],
      message: "One exact image cannot be assigned multiple evaluator roles.",
    });
  }
  value.images.forEach((image, index) => {
    if (image.byteSize !== image.bytes.byteLength || image.sha256 !== sha256Bytes(image.bytes)) {
      context.addIssue({
        code: "custom",
        path: ["images", index],
        message: "Image bytes must match their exact declared size and SHA-256.",
      });
    }
  });
  const candidates = value.images.filter((image) => image.role === "CANDIDATE");
  if (candidates.length !== 1) {
    context.addIssue({
      code: "custom",
      path: ["images"],
      message: "Exactly one app-owned candidate image is required.",
    });
    return;
  }
  const candidate = candidates[0]!;
  if (
    candidate.imageId !== value.artifact.candidateImageId
    || candidate.sha256 !== value.artifact.sha256
    || candidate.byteSize !== value.artifact.byteSize
    || candidate.mimeType !== value.artifact.mimeType
    || candidate.width !== value.artifact.width
    || candidate.height !== value.artifact.height
  ) {
    context.addIssue({
      code: "custom",
      path: ["artifact"],
      message: "The review artifact must bind the exact candidate image bytes.",
    });
  }
});

type ParsedStudioAtelierVisualEvaluationInput = z.infer<
  typeof studioAtelierVisualEvaluationInputSchema
>;
export type StudioAtelierVisualEvaluationInput = Readonly<
  Omit<ParsedStudioAtelierVisualEvaluationInput, "artifact" | "images"> & {
    artifact: Readonly<ParsedStudioAtelierVisualEvaluationInput["artifact"]>;
    images: readonly Readonly<ParsedStudioAtelierVisualEvaluationInput["images"][number]>[];
  }
>;

const visualModelCheckSchema = z.object({
  criterionId: safeCodeSchema,
  decision: z.enum(["SATISFIED", "NOT_SATISFIED", "INDETERMINATE"]),
  confidenceBasis: z.enum(["DIRECT_VISUAL_EVIDENCE", "INSUFFICIENT_VISUAL_EVIDENCE"]),
  evidenceImageIds: z.array(safeIdSchema).min(1).max(16),
  observation: locatorFreeTextSchema.max(240),
}).strict();

const visualModelOutputSchema = z.object({
  checks: z.array(visualModelCheckSchema).min(1).max(32),
}).strict();

export type StudioAtelierVisualGatewayRequest = Readonly<{
  model: string;
  prompt: string;
  images: readonly Readonly<{
    imageId: string;
    role: StudioAtelierVisualEvaluationInput["images"][number]["role"];
    bytes: Uint8Array;
    mimeType: StudioAtelierVisualEvaluationInput["images"][number]["mimeType"];
  }>[];
  maxOutputTokens: number;
  timeoutMs: number;
  providerOptions: Readonly<{
    only: readonly [string];
    has: readonly ["vision"];
    zeroDataRetention: true;
    disallowPromptTraining: true;
    tags: readonly ["studio:atelier-qualification", "stage:visual-evaluation"];
  }>;
}>;

export type StudioAtelierVisualGatewayResult = Readonly<{
  output: unknown;
  usage: unknown;
  providerMetadata: unknown;
}>;

export type StudioAtelierVisualAccountingRecord = Readonly<{
  schemaVersion: typeof STUDIO_ATELIER_VISUAL_ACCOUNTING_SCHEMA_VERSION;
  evaluationId: string;
  requestSha256: string;
  outcome: "SUCCEEDED" | "FAILED";
  provider: string;
  model: string;
  modelRevision: string;
  usage: Readonly<{
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  }>;
  costUsd: number | null;
  gatewayGenerationId: string | null;
  durationMs: number;
}>;

export const studioAtelierVisualAccountingRecordSchema = z.object({
  schemaVersion: z.literal(STUDIO_ATELIER_VISUAL_ACCOUNTING_SCHEMA_VERSION),
  evaluationId: safeIdSchema,
  requestSha256: sha256Schema,
  outcome: z.enum(["SUCCEEDED", "FAILED"]),
  provider: z.string().regex(SAFE_PROVIDER_PATTERN),
  model: z.string().regex(SAFE_MODEL_PATTERN),
  modelRevision: safeIdSchema,
  usage: z.object({
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    totalTokens: z.number().int().nonnegative().nullable(),
  }).strict(),
  costUsd: z.number().finite().nonnegative().nullable(),
  gatewayGenerationId: safeIdSchema.nullable(),
  durationMs: z.number().finite().nonnegative(),
}).strict();

export type StudioAtelierVisualAccountingReceipt = Readonly<{
  receiptSha256: string;
  recordedAt: string;
}>;

export type StudioAtelierVisualEvidence = Readonly<{
  schemaVersion: typeof STUDIO_ATELIER_VISUAL_EVIDENCE_SCHEMA_VERSION;
  evaluatedAt: string;
  evaluator: Readonly<{
    id: string;
    version: string;
    policyRevision: string;
    provider: string;
    model: string;
    modelRevision: string;
    modelDigestSha256: string;
    installationStatus: "UNQUALIFIED_FOUNDATION";
  }>;
  rubric: Readonly<{
    id: string;
    version: string;
    thresholdVersion: string;
  }>;
  requestSha256: string;
  evaluationId: string;
  garmentId: string;
  stage: StudioAtelierVisualEvaluationInput["stage"];
  view: StudioAtelierVisualEvaluationInput["view"];
  authorityDigestSha256: string;
  artifact: StudioAtelierVisualEvaluationInput["artifact"];
  derivedDecision: "SATISFIED" | "NOT_SATISFIED" | "INDETERMINATE";
  productionPass: false;
  checks: readonly Readonly<{
    criterionId: string;
    gate: StudioAtelierVisualRubric["criteria"][number]["gate"];
    decision: "SATISFIED" | "NOT_SATISFIED" | "INDETERMINATE";
    code: string;
    evidenceImageIds: readonly string[];
    observation: string;
  }>[];
  accounting: StudioAtelierVisualAccountingRecord;
  accountingReceiptSha256: string;
  evaluationHash: string;
}>;

export const studioAtelierVisualEvidenceSchema = z.object({
  schemaVersion: z.literal(STUDIO_ATELIER_VISUAL_EVIDENCE_SCHEMA_VERSION),
  evaluatedAt: canonicalInstantSchema,
  evaluator: z.object({
    id: safeIdSchema,
    version: safeIdSchema,
    policyRevision: safeIdSchema,
    provider: z.string().regex(SAFE_PROVIDER_PATTERN),
    model: z.string().regex(SAFE_MODEL_PATTERN),
    modelRevision: safeIdSchema,
    modelDigestSha256: sha256Schema,
    installationStatus: z.literal("UNQUALIFIED_FOUNDATION"),
  }).strict(),
  rubric: z.object({
    id: safeIdSchema,
    version: safeIdSchema,
    thresholdVersion: safeIdSchema,
  }).strict(),
  requestSha256: sha256Schema,
  evaluationId: safeIdSchema,
  garmentId: z.string().regex(/^\d{3}$/),
  stage: atelierStageSchema,
  view: z.enum(["01", "02", "03", "04", "05", "06", "07", "SUBJECT"]),
  authorityDigestSha256: sha256Schema,
  artifact: visualArtifactSchema,
  derivedDecision: z.enum(["SATISFIED", "NOT_SATISFIED", "INDETERMINATE"]),
  productionPass: z.literal(false),
  checks: z.array(z.object({
    criterionId: safeCodeSchema,
    gate: z.enum(["GARMENT", "FACE", "BODY", "ROOM", "FINAL_INTEGRATION", "TECHNICAL"]),
    decision: z.enum(["SATISFIED", "NOT_SATISFIED", "INDETERMINATE"]),
    code: safeCodeSchema,
    evidenceImageIds: z.array(safeIdSchema).min(1).max(16),
    observation: locatorFreeTextSchema.max(240),
  }).strict()).min(1).max(32),
  accounting: studioAtelierVisualAccountingRecordSchema,
  accountingReceiptSha256: sha256Schema,
  evaluationHash: sha256Schema,
}).strict();

export type StudioAtelierVisualEvaluatorErrorCode =
  | "INVALID_CONFIGURATION"
  | "INVALID_INPUT"
  | "PROVIDER_FAILED"
  | "ACCOUNTING_PERSIST_FAILED"
  | "ACCOUNTING_MISSING"
  | "ACCOUNTING_OVER_CAP"
  | "INVALID_MODEL_OUTPUT";

export class StudioAtelierVisualEvaluatorError extends Error {
  constructor(
    readonly code: StudioAtelierVisualEvaluatorErrorCode,
    message: string,
    readonly accounting: StudioAtelierVisualAccountingRecord | null = null,
    readonly accountingReceipt: StudioAtelierVisualAccountingReceipt | null = null,
  ) {
    super(message);
    this.name = "StudioAtelierVisualEvaluatorError";
  }
}

export type StudioAtelierVisualEvaluatorDependencies = Readonly<{
  runGateway?: (
    request: StudioAtelierVisualGatewayRequest,
  ) => Promise<StudioAtelierVisualGatewayResult>;
  persistAccounting: (
    accounting: StudioAtelierVisualAccountingRecord,
  ) => Promise<StudioAtelierVisualAccountingReceipt>;
  now?: () => Date;
  monotonicNow?: () => number;
}>;

function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeNonnegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function safeCost(value: unknown): number | null {
  if (typeof value === "number") return safeNonnegativeNumber(value);
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  return safeNonnegativeNumber(Number(value));
}

function safeGatewayToken(value: unknown): string | null {
  return typeof value === "string" && SAFE_ID_PATTERN.test(value) ? value : null;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function failureRecords(error: unknown): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  let current: unknown = error;
  while (current && records.length < 4) {
    const record = objectRecord(current);
    if (!record || records.includes(record)) break;
    records.push(record);
    current = record.lastError ?? record.cause;
  }
  return records;
}

function usageFrom(value: unknown): StudioAtelierVisualAccountingRecord["usage"] {
  const usage = objectRecord(value);
  const tokenCount = (value: unknown) => Number.isSafeInteger(value)
    ? safeNonnegativeNumber(value)
    : null;
  return Object.freeze({
    inputTokens: tokenCount(usage?.inputTokens),
    outputTokens: tokenCount(usage?.outputTokens),
    totalTokens: tokenCount(usage?.totalTokens),
  });
}

function accountingFromResult(
  input: Readonly<{
    evaluationId: string;
    requestSha256: string;
    provider: string;
    model: string;
    modelRevision: string;
    outcome: "SUCCEEDED" | "FAILED";
    usage: unknown;
    providerMetadata: unknown;
    durationMs: number;
  }>,
): StudioAtelierVisualAccountingRecord {
  const metadata = objectRecord(input.providerMetadata);
  const gateway = objectRecord(metadata?.gateway);
  const durationMs = Number.isFinite(input.durationMs) && input.durationMs >= 0
    ? input.durationMs
    : 0;
  return Object.freeze({
    schemaVersion: STUDIO_ATELIER_VISUAL_ACCOUNTING_SCHEMA_VERSION,
    evaluationId: input.evaluationId,
    requestSha256: input.requestSha256,
    outcome: input.outcome,
    provider: input.provider,
    model: input.model,
    modelRevision: input.modelRevision,
    usage: usageFrom(input.usage),
    costUsd: safeCost(gateway?.cost),
    gatewayGenerationId: safeGatewayToken(gateway?.generationId),
    durationMs,
  });
}

function accountingFromFailure(
  error: unknown,
  input: Omit<Parameters<typeof accountingFromResult>[0], "outcome" | "usage" | "providerMetadata">,
): StudioAtelierVisualAccountingRecord {
  const records = failureRecords(error);
  const usage = records.map((record) => record.usage).find((value) => objectRecord(value)) ?? null;
  const metadata = records
    .map((record) => record.providerMetadata)
    .find((value) => objectRecord(value)) ?? null;
  return accountingFromResult({ ...input, outcome: "FAILED", usage, providerMetadata: metadata });
}

function receiptSchema(value: unknown): StudioAtelierVisualAccountingReceipt {
  const parsed = z.object({
    receiptSha256: sha256Schema,
    recordedAt: canonicalInstantSchema,
  }).strict().safeParse(value);
  if (!parsed.success) {
    throw new StudioAtelierVisualEvaluatorError(
      "ACCOUNTING_PERSIST_FAILED",
      "The visual-evaluator accounting sink did not return a valid receipt.",
    );
  }
  return Object.freeze(parsed.data);
}

async function persistAccountingOrThrow(
  persistAccounting: StudioAtelierVisualEvaluatorDependencies["persistAccounting"],
  accounting: StudioAtelierVisualAccountingRecord,
): Promise<StudioAtelierVisualAccountingReceipt> {
  try {
    return receiptSchema(await persistAccounting(accounting));
  } catch (error) {
    if (error instanceof StudioAtelierVisualEvaluatorError) throw error;
    throw new StudioAtelierVisualEvaluatorError(
      "ACCOUNTING_PERSIST_FAILED",
      "The visual-evaluator accounting record could not be persisted.",
      accounting,
    );
  }
}

function requestHash(
  policy: StudioAtelierVisualEvaluatorPolicy,
  rubric: StudioAtelierVisualRubric,
  input: StudioAtelierVisualEvaluationInput,
): string {
  return sha256Text(canonicalStringify({
    evaluator: {
      id: policy.evaluatorId,
      version: policy.evaluatorVersion,
      policyRevision: policy.policyRevision,
      provider: policy.provider,
      model: policy.model,
      modelRevision: policy.modelRevision,
      modelDigestSha256: policy.modelDigestSha256,
    },
    rubric,
    evaluationId: input.evaluationId,
    garmentId: input.garmentId,
    stage: input.stage,
    view: input.view,
    authorityDigestSha256: input.authorityDigestSha256,
    artifact: input.artifact,
    images: input.images.map((image) => ({
      imageId: image.imageId,
      role: image.role,
      sha256: image.sha256,
      byteSize: image.byteSize,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
    })),
  }));
}

function buildPrompt(
  rubric: StudioAtelierVisualRubric,
  input: StudioAtelierVisualEvaluationInput,
): string {
  return [
    "Evaluate only the exact attached images against the ordered server rubric.",
    "Do not infer unseen garment, identity, body, room, angle, text or watermark details.",
    "Use INDETERMINATE whenever the attached pixels do not directly establish a criterion.",
    "Return every criterion exactly once in the supplied order.",
    "Every determinate comparison must cite the candidate and all exact required authority image IDs; calibration cannot substitute for direct authority.",
    "Do not return an aggregate decision, PASS flag, URLs, paths, storage coordinates or provider instructions.",
    `Context: ${canonicalStringify({
      garmentId: input.garmentId,
      stage: input.stage,
      view: input.view,
      authorityDigestSha256: input.authorityDigestSha256,
      artifactSha256: input.artifact.sha256,
    })}`,
    `Images: ${canonicalStringify(input.images.map((image) => ({
      imageId: image.imageId,
      role: image.role,
      sha256: image.sha256,
    })))}`,
    `Rubric: ${canonicalStringify(rubric.criteria.map((criterion) => ({
      criterionId: criterion.criterionId,
      gate: criterion.gate,
      instruction: criterion.instruction,
      requiredAuthorities: criterion.requiredAuthorities,
    })))}`,
  ].join("\n");
}

async function runGatewayDefault(
  request: StudioAtelierVisualGatewayRequest,
): Promise<StudioAtelierVisualGatewayResult> {
  const content = [
    { type: "text" as const, text: request.prompt },
    ...request.images.flatMap((image) => [
      { type: "text" as const, text: `Image ${image.imageId}; role ${image.role}.` },
      { type: "file" as const, mediaType: image.mimeType, data: image.bytes },
    ]),
  ];
  const result = await generateText({
    model: request.model,
    output: Output.object({
      schema: visualModelOutputSchema,
      name: "atelier_visual_evaluation",
    }),
    messages: [{ role: "user", content }],
    maxOutputTokens: request.maxOutputTokens,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(request.timeoutMs),
    providerOptions: {
      gateway: {
        only: [...request.providerOptions.only],
        has: [...request.providerOptions.has],
        zeroDataRetention: request.providerOptions.zeroDataRetention,
        disallowPromptTraining: request.providerOptions.disallowPromptTraining,
        tags: [...request.providerOptions.tags],
      },
    },
  });
  return Object.freeze({
    output: result.output,
    usage: result.usage,
    providerMetadata: result.providerMetadata,
  });
}

function validateModelOutput(
  value: unknown,
  rubric: StudioAtelierVisualRubric,
  input: StudioAtelierVisualEvaluationInput,
) {
  const parsed = visualModelOutputSchema.safeParse(value);
  if (!parsed.success) {
    throw new StudioAtelierVisualEvaluatorError(
      "INVALID_MODEL_OUTPUT",
      "The visual evaluator returned evidence outside the closed response schema.",
    );
  }
  const expectedIds = rubric.criteria.map((criterion) => criterion.criterionId);
  const actualIds = parsed.data.checks.map((check) => check.criterionId);
  if (canonicalStringify(actualIds) !== canonicalStringify(expectedIds)) {
    throw new StudioAtelierVisualEvaluatorError(
      "INVALID_MODEL_OUTPUT",
      "The visual evaluator did not return the exact ordered rubric criteria.",
    );
  }
  const knownImageIds = new Set(input.images.map((image) => image.imageId));
  const candidateId = input.artifact.candidateImageId;
  for (const [index, check] of parsed.data.checks.entries()) {
    const criterion = rubric.criteria[index]!;
    if (
      new Set(check.evidenceImageIds).size !== check.evidenceImageIds.length
      || !check.evidenceImageIds.includes(candidateId)
      || check.evidenceImageIds.some((imageId) => !knownImageIds.has(imageId))
      || (check.decision !== "INDETERMINATE" && criterion.requiredAuthorities.some(
        (authority) => !check.evidenceImageIds.includes(authority.imageId),
      ))
      || (check.decision === "INDETERMINATE")
        !== (check.confidenceBasis === "INSUFFICIENT_VISUAL_EVIDENCE")
    ) {
      throw new StudioAtelierVisualEvaluatorError(
        "INVALID_MODEL_OUTPUT",
        "The visual evaluator returned unbound or internally inconsistent evidence.",
      );
    }
  }
  return parsed.data;
}

function configurationOrThrow(input: unknown): Readonly<{
  policy: StudioAtelierVisualEvaluatorPolicy;
  rubric: StudioAtelierVisualRubric;
}> {
  const parsed = z.object({
    policy: studioAtelierVisualEvaluatorPolicySchema,
    rubric: studioAtelierVisualRubricSchema,
  }).strict().safeParse(input);
  if (!parsed.success) {
    throw new StudioAtelierVisualEvaluatorError(
      "INVALID_CONFIGURATION",
      "The server-owned visual evaluator configuration is invalid.",
    );
  }
  const policy = Object.freeze({ ...parsed.data.policy });
  const rubric = Object.freeze({
    ...parsed.data.rubric,
    criteria: Object.freeze(parsed.data.rubric.criteria.map((criterion) =>
      Object.freeze({
        ...criterion,
        requiredAuthorities: Object.freeze(criterion.requiredAuthorities.map((authority) =>
          Object.freeze({ ...authority })
        )),
      })
    )),
  });
  return Object.freeze({ policy, rubric });
}

function immutableInputSnapshot(
  input: StudioAtelierVisualEvaluationInput,
): StudioAtelierVisualEvaluationInput {
  const images = input.images.map((image) => Object.freeze({
    ...image,
    bytes: new Uint8Array(image.bytes),
  }));
  if (images.some((image) =>
    image.byteSize !== image.bytes.byteLength || image.sha256 !== sha256Bytes(image.bytes)
  )) {
    throw new StudioAtelierVisualEvaluatorError(
      "INVALID_INPUT",
      "The app-owned image bytes changed while the evaluator input was being secured.",
    );
  }
  return Object.freeze({
    ...input,
    artifact: Object.freeze({ ...input.artifact }),
    images: Object.freeze(images),
  });
}

async function verifyImageAuthorities(
  input: StudioAtelierVisualEvaluationInput,
  rubric: StudioAtelierVisualRubric,
): Promise<void> {
  const imageById = new Map(input.images.map((image) => [image.imageId, image]));
  for (const criterion of rubric.criteria) {
    for (const authority of criterion.requiredAuthorities) {
      const image = imageById.get(authority.imageId);
      if (!image || image.role !== authority.role || image.sha256 !== authority.sha256) {
        throw new StudioAtelierVisualEvaluatorError(
          "INVALID_INPUT",
          "The visual rubric requires an exact authority image that is missing or mismatched.",
        );
      }
    }
  }
  const formats = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp" } as const;
  const decodedImages = new Set<string>();
  for (const image of input.images) {
    try {
      if (image.byteSize > 20 * 1024 * 1024) throw new Error("Image too large");
      const decoder = createImagePipeline(image.bytes, { failOn: "warning", limitInputPixels: 20_000_000 });
      const metadata = await decoder.metadata();
      if (metadata.format !== formats[image.mimeType]
        || metadata.width !== image.width || metadata.height !== image.height
        || (metadata.pages ?? 1) !== 1 || (metadata.orientation ?? 1) !== 1) {
        throw new Error("Image metadata mismatch");
      }
      // Metadata alone can succeed for a truncated image. Decode every pixel
      // before any private bytes may reach the evaluator provider.
      const decoded = await decoder.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      if (decoded.info.width !== image.width || decoded.info.height !== image.height) {
        throw new Error("Decoded dimensions mismatch");
      }
      const pixelIdentity = `${image.width}:${image.height}:${sha256Bytes(decoded.data)}`;
      if (decodedImages.has(pixelIdentity)) throw new Error("Duplicate authority pixels");
      decodedImages.add(pixelIdentity);
    } catch {
      throw new StudioAtelierVisualEvaluatorError(
        "INVALID_INPUT",
        "The evaluator image is undecodable, mismatches its declared format or dimensions, or duplicates another image's pixels.",
      );
    }
  }
}

/**
 * Creates one fixed evaluator from server-owned policy and rubric bindings.
 * This foundation is intentionally not referenced by the production qualified
 * evaluator resolver. Qualification must bind this source, its exact visual
 * model attestation and the independent human review before installation.
 */
export function createStudioAtelierVisualEvaluator(
  configuration: Readonly<{
    policy: StudioAtelierVisualEvaluatorPolicy;
    rubric: StudioAtelierVisualRubric;
  }>,
  dependencies: StudioAtelierVisualEvaluatorDependencies,
) {
  const fixed = configurationOrThrow(configuration);
  const runGateway = dependencies.runGateway ?? runGatewayDefault;
  const now = dependencies.now ?? (() => new Date());
  const monotonicNow = dependencies.monotonicNow ?? (() => performance.now());

  return async function evaluateStudioAtelierVisualEvidence(
    rawInput: StudioAtelierVisualEvaluationInput,
  ): Promise<StudioAtelierVisualEvidence> {
    const parsedInput = studioAtelierVisualEvaluationInputSchema.safeParse(rawInput);
    if (!parsedInput.success) {
      throw new StudioAtelierVisualEvaluatorError(
        "INVALID_INPUT",
        "The app-owned visual evaluator input is invalid or contains an external locator.",
      );
    }
    const input = immutableInputSnapshot(parsedInput.data);
    await verifyImageAuthorities(input, fixed.rubric);
    const exactRequestSha256 = requestHash(fixed.policy, fixed.rubric, input);
    const request = Object.freeze({
      model: fixed.policy.model,
      prompt: buildPrompt(fixed.rubric, input),
      images: Object.freeze(input.images.map((image) => Object.freeze({
        imageId: image.imageId,
        role: image.role,
        bytes: image.bytes,
        mimeType: image.mimeType,
      }))),
      maxOutputTokens: fixed.policy.maxOutputTokens,
      timeoutMs: fixed.policy.timeoutMs,
      providerOptions: Object.freeze({
        only: Object.freeze([fixed.policy.provider]) as readonly [string],
        has: Object.freeze(["vision"] as const),
        zeroDataRetention: true as const,
        disallowPromptTraining: true as const,
        tags: Object.freeze([
          "studio:atelier-qualification",
          "stage:visual-evaluation",
        ] as const),
      }),
    } satisfies StudioAtelierVisualGatewayRequest);
    const startedAt = monotonicNow();
    let gatewayResult: StudioAtelierVisualGatewayResult;
    try {
      gatewayResult = await runGateway(request);
    } catch (error) {
      const accounting = accountingFromFailure(error, {
        evaluationId: input.evaluationId,
        requestSha256: exactRequestSha256,
        provider: fixed.policy.provider,
        model: fixed.policy.model,
        modelRevision: fixed.policy.modelRevision,
        durationMs: monotonicNow() - startedAt,
      });
      const receipt = await persistAccountingOrThrow(dependencies.persistAccounting, accounting);
      throw new StudioAtelierVisualEvaluatorError(
        "PROVIDER_FAILED",
        "The visual evaluator provider call failed; its sanitized accounting was retained.",
        accounting,
        receipt,
      );
    }

    const accounting = accountingFromResult({
      evaluationId: input.evaluationId,
      requestSha256: exactRequestSha256,
      provider: fixed.policy.provider,
      model: fixed.policy.model,
      modelRevision: fixed.policy.modelRevision,
      outcome: "SUCCEEDED",
      usage: gatewayResult.usage,
      providerMetadata: gatewayResult.providerMetadata,
      durationMs: monotonicNow() - startedAt,
    });
    const receipt = await persistAccountingOrThrow(dependencies.persistAccounting, accounting);
    if (accounting.costUsd === null || accounting.gatewayGenerationId === null
      || Object.values(accounting.usage).some((count) => count === null)
      || accounting.usage.totalTokens !== accounting.usage.inputTokens! + accounting.usage.outputTokens!) {
      throw new StudioAtelierVisualEvaluatorError(
        "ACCOUNTING_MISSING",
        "The visual evaluator accounting was retained, but cost, generation identity or consistent token usage is unavailable.",
        accounting,
        receipt,
      );
    }
    if (accounting.costUsd > fixed.policy.costCapUsd) {
      throw new StudioAtelierVisualEvaluatorError(
        "ACCOUNTING_OVER_CAP",
        "The visual evaluator accounting was retained, but the call exceeded the fixed server cost cap.",
        accounting,
        receipt,
      );
    }

    let modelOutput: ReturnType<typeof validateModelOutput>;
    try {
      modelOutput = validateModelOutput(gatewayResult.output, fixed.rubric, input);
    } catch (error) {
      if (error instanceof StudioAtelierVisualEvaluatorError) {
        throw new StudioAtelierVisualEvaluatorError(
          error.code,
          error.message,
          accounting,
          receipt,
        );
      }
      throw error;
    }
    const checks = Object.freeze(modelOutput.checks.map((check, index) => {
      const criterion = fixed.rubric.criteria[index]!;
      const code = check.decision === "SATISFIED"
        ? criterion.satisfiedCode
        : check.decision === "NOT_SATISFIED"
          ? criterion.notSatisfiedCode
          : criterion.indeterminateCode;
      return Object.freeze({
        criterionId: criterion.criterionId,
        gate: criterion.gate,
        decision: check.decision,
        code,
        evidenceImageIds: Object.freeze([...check.evidenceImageIds]),
        observation: check.observation,
      });
    }));
    const derivedDecision = checks.some((check) => check.decision === "NOT_SATISFIED")
      ? "NOT_SATISFIED" as const
      : checks.some((check) => check.decision === "INDETERMINATE")
        ? "INDETERMINATE" as const
        : "SATISFIED" as const;
    const evaluatedAt = now().toISOString();
    const evidenceBody = Object.freeze({
      schemaVersion: STUDIO_ATELIER_VISUAL_EVIDENCE_SCHEMA_VERSION,
      evaluatedAt,
      evaluator: Object.freeze({
        id: fixed.policy.evaluatorId,
        version: fixed.policy.evaluatorVersion,
        policyRevision: fixed.policy.policyRevision,
        provider: fixed.policy.provider,
        model: fixed.policy.model,
        modelRevision: fixed.policy.modelRevision,
        modelDigestSha256: fixed.policy.modelDigestSha256,
        installationStatus: "UNQUALIFIED_FOUNDATION" as const,
      }),
      rubric: Object.freeze({
        id: fixed.rubric.rubricId,
        version: fixed.rubric.rubricVersion,
        thresholdVersion: fixed.rubric.thresholdVersion,
      }),
      requestSha256: exactRequestSha256,
      evaluationId: input.evaluationId,
      garmentId: input.garmentId,
      stage: input.stage,
      view: input.view,
      authorityDigestSha256: input.authorityDigestSha256,
      artifact: input.artifact,
      derivedDecision,
      productionPass: false as const,
      checks,
      accounting,
      accountingReceiptSha256: receipt.receiptSha256,
    });
    const evidence = Object.freeze({
      ...evidenceBody,
      evaluationHash: sha256Text(canonicalStringify(evidenceBody)),
    });
    const parsedEvidence = studioAtelierVisualEvidenceSchema.safeParse(evidence);
    if (!parsedEvidence.success) {
      throw new StudioAtelierVisualEvaluatorError(
        "INVALID_MODEL_OUTPUT",
        "The visual evaluator could not produce evidence under the closed evidence schema.",
        accounting,
        receipt,
      );
    }
    return evidence;
  };
}
