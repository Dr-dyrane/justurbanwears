import { z } from "zod";

const operationIdSchema = z.string().trim().min(1).max(240)
  .regex(/^[a-zA-Z0-9._:/-]+$/);

const operationSchema = z.object({
  operationId: operationIdSchema,
  stage: z.enum([
    "GARMENT_01_FRONT",
    "GARMENT_02_BACK",
    "GARMENT_03_MANNEQUIN",
    "GARMENT_04_DETAIL",
    "SUBJECT_A",
    "SUBJECT_B",
    "ROOM_FINAL_05",
    "SIBLING_06",
    "SIBLING_07_CORE",
    "SIBLING_07_RECOVERY",
  ]),
  view: z.enum(["01", "02", "03", "04", "05", "06", "07"]),
  state: z.enum([
    "DRAFT",
    "MATERIALIZED",
    "TECHNICAL_PASS",
    "TECHNICAL_FAIL",
    "SEMANTIC_PASS",
    "SEMANTIC_FAIL",
    "USER_APPROVED",
    "USER_REJECTED",
    "LOCKED",
    "BLOCKED_USER_DIRECTION",
    "SUPERSEDED",
  ]),
  version: z.number().int().nonnegative(),
  candidateVisibility: z.enum(["HIDDEN", "REVIEWABLE"]),
  nextAction: z.enum([
    "GENERATE",
    "WAIT_FOR_MATERIALIZATION",
    "REVIEW",
    "LOCK_OR_REUSE",
    "USE_LOCKED",
    "RESUME_RECORDED_REVIEW",
    "GENERATE_CORRECTION",
    "USER_DIRECTION_REQUIRED",
    "NONE",
  ]),
  reused: z.boolean(),
  continuationOperationId: operationIdSchema.optional(),
}).strict();

const operationEnvelopeSchema = z.object({ operation: operationSchema }).strict();
const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string().trim().min(1).max(120),
    message: z.string().trim().min(1).max(500),
    recovery: z.string().trim().min(1).max(500),
  }).strict(),
}).strict();

export type StudioAtelierUiOperation = z.infer<typeof operationSchema>;

/**
 * This client is deliberately recovery-only. Command capability is denied
 * locally until an authenticated server projection grants each exact command.
 * Do not infer mutation readiness from an operation's nextAction.
 */
export const STUDIO_ATELIER_RECOVERY_CAPABILITY = Object.freeze({
  prepare: false,
  generate: false,
  review: false,
  lockOrReuse: false,
  recover: true,
  reviewMedia: true,
} as const);

export class StudioAtelierUiReadError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly recovery: string,
  ) {
    super(message);
    this.name = "StudioAtelierUiReadError";
  }
}

/**
 * Vite development refreshes can temporarily retain an error created by the
 * previous module instance. Use a strict structural fallback so the operator
 * still receives the server's sanitized blocker instead of a generic network
 * message when `instanceof` crosses that refresh boundary.
 */
export function isStudioAtelierUiReadError(
  value: unknown,
): value is StudioAtelierUiReadError {
  if (value instanceof StudioAtelierUiReadError) return true;
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StudioAtelierUiReadError>;
  return candidate.name === "StudioAtelierUiReadError"
    && typeof candidate.message === "string"
    && typeof candidate.status === "number"
    && Number.isInteger(candidate.status)
    && typeof candidate.code === "string"
    && typeof candidate.recovery === "string";
}

function canonicalOperationId(operationId: string): string {
  const direct = operationIdSchema.safeParse(operationId);
  if (direct.success) return direct.data;

  // Next decodes dynamic route parameters, while some compatible local
  // runtimes currently preserve the encoded segment. Accept either form once,
  // then apply the same strict operation-ID grammar before making a request.
  let decoded: string;
  try {
    decoded = decodeURIComponent(operationId);
  } catch {
    return operationIdSchema.parse(operationId);
  }
  return operationIdSchema.parse(decoded);
}

function operationPath(operationId: string): string {
  return `/api/studio/atelier/operations/${encodeURIComponent(
    canonicalOperationId(operationId),
  )}`;
}

export async function readStudioAtelierOperation(
  operationId: string,
  signal?: AbortSignal,
): Promise<StudioAtelierUiOperation> {
  const expectedOperationId = canonicalOperationId(operationId);
  const response = await fetch(operationPath(expectedOperationId), {
    cache: "no-store",
    credentials: "same-origin",
    headers: { accept: "application/json" },
    method: "GET",
    signal,
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new StudioAtelierUiReadError(
      "Studio could not read this saved Atelier operation.",
      response.status,
      "INVALID_RESPONSE",
      "Check the saved operation again. No generation was started.",
    );
  }

  if (!response.ok) {
    const parsed = errorEnvelopeSchema.safeParse(body);
    throw new StudioAtelierUiReadError(
      parsed.success
        ? parsed.data.error.message
        : "Studio could not read this saved Atelier operation.",
      response.status,
      parsed.success ? parsed.data.error.code : "READ_FAILED",
      parsed.success
        ? parsed.data.error.recovery
        : "Check the saved operation again. No generation was started.",
    );
  }

  const parsed = operationEnvelopeSchema.safeParse(body);
  if (!parsed.success || parsed.data.operation.operationId !== expectedOperationId) {
    throw new StudioAtelierUiReadError(
      "Studio returned an invalid Atelier operation projection.",
      response.status,
      "INVALID_RESPONSE",
      "Reload this exact operation from the durable ledger.",
    );
  }
  return Object.freeze(parsed.data.operation);
}

export function retainNewestStudioAtelierOperation(
  current: StudioAtelierUiOperation | null,
  incoming: StudioAtelierUiOperation,
): StudioAtelierUiOperation {
  if (!current) return incoming;
  if (current.operationId !== incoming.operationId) return current;
  return incoming.version >= current.version ? incoming : current;
}

export function shouldPollStudioAtelierOperation(
  operation: StudioAtelierUiOperation,
): boolean {
  return operation.nextAction === "WAIT_FOR_MATERIALIZATION";
}

export function studioAtelierReviewMediaUrl(
  operation: StudioAtelierUiOperation,
): string | null {
  if (
    operation.candidateVisibility !== "REVIEWABLE"
    || !["SEMANTIC_PASS", "USER_APPROVED", "LOCKED"].includes(operation.state)
  ) return null;
  return `${operationPath(operation.operationId)}/review-media?v=${operation.version}`;
}
