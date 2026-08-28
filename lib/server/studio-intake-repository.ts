import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import {
  studioAssets,
  studioDecisions,
  studioGenerations,
  studioIntakes,
  studioModelProfiles,
  studioWardrobeItems,
} from "../../db/shop-postgres-schema";
import { getStudioDb } from "../../db/shop-postgres";
import type {
  IntakeFacts,
  OperatorSafeDecisionReceipt,
  OperatorSafeModelProfile,
  OperatorSafeIntake,
  OperatorSafeWardrobeItem,
} from "../studio/engine/contracts";
import { StudioEngineError } from "../studio/engine/errors";
import type { StudioOperator } from "./studio-operator";
import type {
  StudioGenerationProviderResultManifest,
} from "./studio-generation-result-store";
import type {
  StudioPaidGenerationClaim,
  StudioPaidGenerationIndeterminateMark,
} from "./studio-generation-execution";

type IntakeRow = typeof studioIntakes.$inferSelect;
type AssetRow = typeof studioAssets.$inferSelect;
type GenerationRow = typeof studioGenerations.$inferSelect;
type ModelProfileRow = typeof studioModelProfiles.$inferSelect;
type DecisionRow = typeof studioDecisions.$inferSelect;

const STUDIO_GENERATION_LEASE_MS = 10 * 60 * 1_000;
const PAID_GENERATION_OPERATIONS = new Set([
  "GARMENT_ANALYSIS",
  "GARMENT_FRONT",
  "MANNEQUIN_FRONT",
  "MODEL_TRY_ON",
  "EDITORIAL_MODEL",
]);

export function normalizeStudioIntakeDescription(description?: string | null): string | null {
  return description?.trim() || null;
}

export function studioIntakeIntentMatches(
  existing: Pick<IntakeRow, "kind" | "sourceMode" | "description">,
  requested: { kind: "GARMENT"; sourceMode: "CAMERA" | "UPLOAD" | "DESCRIBE"; description?: string },
): boolean {
  return existing.kind === requested.kind
    && existing.sourceMode === requested.sourceMode
    && normalizeStudioIntakeDescription(existing.description) === normalizeStudioIntakeDescription(requested.description);
}

export function studioInFlightCommandVersionMatches(input: {
  currentVersion: number;
  expectedVersion: number;
  exactCommandExists: boolean;
}): boolean {
  return input.expectedVersion === input.currentVersion
    || (
      input.exactCommandExists
      && input.expectedVersion + 1 === input.currentVersion
    );
}

export function isEligibleStudioIntakeCandidate(
  generation: Pick<GenerationRow, "operation" | "state" | "outputAssetId">,
): boolean {
  return generation.operation === "GARMENT_FRONT"
    && Boolean(generation.outputAssetId)
    && (generation.state === "COMPLETE" || generation.state === "APPROVED");
}

export function assertStudioGenerationRequestIdentity(
  existing: Pick<GenerationRow, "fingerprint">,
  expectedFingerprint: string,
): void {
  if (existing.fingerprint === expectedFingerprint) return;
  throw new StudioEngineError(
    "INVALID_REQUEST",
    409,
    "That Wear request key already belongs to a different command.",
    "Resume the saved command or start a new Wear intent.",
  );
}

function paidGenerationAttempt(parameters: Record<string, unknown>): number {
  const attempt = Number(parameters.attempt ?? 1);
  return Number.isInteger(attempt) && attempt > 0 ? attempt : 1;
}

export function studioPaidGenerationScopeKey(input: {
  intakeId: string;
  operation: string;
  parameters: Record<string, unknown>;
}): string | null {
  if (!PAID_GENERATION_OPERATIONS.has(input.operation)) return null;
  const subScope = input.operation === "MODEL_TRY_ON"
    ? `model:${String(input.parameters.modelProfileId ?? "missing")}`
    : input.operation === "EDITORIAL_MODEL"
      ? `parent:${String(input.parameters.parentGenerationId ?? "missing")}`
      : "base";
  return `studio-paid-scope:v1:${input.intakeId}:${input.operation}:${subScope}:${paidGenerationAttempt(input.parameters)}`;
}

function normalizedDecisionNote(note?: string | null): string | null {
  return note?.trim() || null;
}

export function buildOperatorSafeDecisionReceipt(input: {
  generationId: string;
  decision: OperatorSafeDecisionReceipt["decision"];
  note?: string | null;
  noteSha256?: string | null;
  decidedAt: Date | string;
}): OperatorSafeDecisionReceipt {
  const noteSha256 = input.noteSha256
    ?? createHash("sha256").update(normalizedDecisionNote(input.note) ?? "").digest("hex");
  const receiptId = createHash("sha256").update([
    "studio-decision-receipt.v1",
    input.generationId,
    input.decision,
    noteSha256,
  ].join("\n")).digest("hex");
  return {
    receiptId,
    generationId: input.generationId,
    decision: input.decision,
    noteSha256,
    decidedAt: (input.decidedAt instanceof Date ? input.decidedAt : new Date(input.decidedAt)).toISOString(),
  };
}

export function finalGenerationDecisionReceipt(
  generation: Pick<GenerationRow, "id" | "finalDecision" | "finalDecisionNoteSha256" | "decidedAt">,
): OperatorSafeDecisionReceipt | null {
  if (!generation.finalDecision || !generation.finalDecisionNoteSha256 || !generation.decidedAt) return null;
  return buildOperatorSafeDecisionReceipt({
    generationId: generation.id,
    decision: generation.finalDecision,
    noteSha256: generation.finalDecisionNoteSha256,
    decidedAt: generation.decidedAt,
  });
}

export function assertStudioCorrectionDecisionReceipt(input: {
  expectedGenerationId?: string;
  expectedReceiptId?: string;
  expectedCorrection?: string;
  generationId: string;
  receipt: OperatorSafeDecisionReceipt | null;
}): void {
  const correctionSha256 = createHash("sha256")
    .update(normalizedDecisionNote(input.expectedCorrection) ?? "")
    .digest("hex");
  if (
    input.expectedGenerationId === input.generationId
    && input.expectedReceiptId
    && input.receipt?.receiptId === input.expectedReceiptId
    && input.receipt.generationId === input.generationId
    && input.receipt.noteSha256 === correctionSha256
    && (input.receipt.decision === "EDIT" || input.receipt.decision === "RETRY")
  ) return;
  throw new StudioEngineError(
    "INVALID_TRANSITION",
    409,
    "This correction is not bound to the saved Edit or Retry decision.",
    "Reload the exact decision receipt before starting another paid attempt.",
  );
}

export function studioIntakeDecisionTransition(input: {
  generation: Pick<GenerationRow, "state" | "finalDecision" | "outputAssetId">;
  decision: "KEEP" | "EDIT" | "REJECT" | "RETRY";
}): {
  expectedGenerationState: GenerationRow["state"];
  generationState: GenerationRow["state"];
  expectedIntakeState: IntakeRow["state"];
  intakeState: IntakeRow["state"];
} {
  const retryingFailed = input.decision === "RETRY" && input.generation.state === "FAILED";
  const repeatedRetry = input.decision === "RETRY"
    && input.generation.state === "REJECTED"
    && input.generation.finalDecision === "RETRY";
  const reviewable = input.generation.state === "COMPLETE"
    || (input.generation.finalDecision === input.decision
      && (input.generation.state === "APPROVED" || input.generation.state === "REJECTED"));
  if (input.decision === "RETRY") {
    if (!retryingFailed && !repeatedRetry && input.generation.state !== "COMPLETE") {
      throw new StudioEngineError("INVALID_TRANSITION", 409, "That garment attempt does not need a retry.", "Review the current garment state.");
    }
  } else if (!reviewable || !input.generation.outputAssetId) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "There is no candidate awaiting that decision.", "Reload the current garment state.");
  }
  return {
    expectedGenerationState: retryingFailed ? "FAILED" : "COMPLETE",
    generationState: retryingFailed
      ? "FAILED"
      : input.decision === "KEEP" ? "APPROVED" : "REJECTED",
    expectedIntakeState: retryingFailed ? "FAILED" : "DECISION",
    intakeState: input.decision === "KEEP"
      ? "DECISION"
      : input.decision === "REJECT" ? "ARCHIVED" : "REVIEW",
  };
}

export function assertNoConflictingActiveStudioGeneration(
  active: Pick<GenerationRow, "fingerprint"> | null,
  expectedFingerprint: string,
): void {
  if (!active || active.fingerprint === expectedFingerprint) return;
  throw new StudioEngineError(
    "INVALID_TRANSITION",
    409,
    "A different paid command already owns this Studio step.",
    "Continue from the saved command before starting another intent.",
  );
}

export async function findActivePaidGeneration(input: {
  intakeId: string;
  operation: string;
  attempt: number;
  parameters: Record<string, unknown>;
}): Promise<GenerationRow | null> {
  const subScope = input.operation === "MODEL_TRY_ON"
    ? `model:${String(input.parameters.modelProfileId ?? "missing")}`
    : input.operation === "EDITORIAL_MODEL"
      ? `parent:${String(input.parameters.parentGenerationId ?? "missing")}`
      : "base";
  const [row] = await (await getStudioDb()).select().from(studioGenerations).where(and(
    eq(studioGenerations.intakeId, input.intakeId),
    eq(studioGenerations.operation, input.operation),
    inArray(studioGenerations.state, ["PENDING", "RUNNING", "COMPLETE", "APPROVED"]),
    sql`${studioGenerations.parameters}->>'attempt' = ${String(input.attempt)}`,
    sql`case
      when ${studioGenerations.operation} = 'MODEL_TRY_ON'
        then 'model:' || coalesce(${studioGenerations.parameters}->>'modelProfileId', 'missing')
      when ${studioGenerations.operation} = 'EDITORIAL_MODEL'
        then 'parent:' || coalesce(${studioGenerations.parameters}->>'parentGenerationId', 'missing')
      else 'base'
    end = ${subScope}`,
  )).orderBy(studioGenerations.createdAt).limit(1);
  return row ?? null;
}

async function ownedIntake(id: string, subject: string): Promise<IntakeRow> {
  const [row] = await (await getStudioDb()).select().from(studioIntakes).where(and(
    eq(studioIntakes.id, id),
    eq(studioIntakes.operatorSubject, subject),
  )).limit(1);
  if (!row) {
    throw new StudioEngineError("INTAKE_NOT_FOUND", 404, "That intake was not found.", "Return to Wardrobe.");
  }
  return row;
}

export async function createOrReuseIntake(input: {
  operator: StudioOperator;
  kind: "GARMENT";
  sourceMode: "CAMERA" | "UPLOAD" | "DESCRIBE";
  description?: string;
  idempotencyKey: string;
}): Promise<OperatorSafeIntake> {
  const db = await getStudioDb();
  const normalizedDescription = normalizeStudioIntakeDescription(input.description);
  await db.insert(studioIntakes).values({
    operatorSubject: input.operator.subject,
    operatorEmail: input.operator.email,
    kind: input.kind,
    sourceMode: input.sourceMode,
    description: normalizedDescription,
    idempotencyKey: input.idempotencyKey,
  }).onConflictDoNothing();
  const [row] = await db.select().from(studioIntakes).where(and(
    eq(studioIntakes.operatorSubject, input.operator.subject),
    eq(studioIntakes.idempotencyKey, input.idempotencyKey),
  )).limit(1);
  if (!row) throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "Studio could not start.", "Try again.");
  if (!studioIntakeIntentMatches(row, input)) {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      409,
      "That intake key already belongs to different garment evidence.",
      "Start a new intake intent instead of reusing this saved request key.",
    );
  }
  return getIntakeSnapshot(row.id, input.operator.subject);
}

export async function getIntakeSnapshot(id: string, subject: string): Promise<OperatorSafeIntake> {
  const db = await getStudioDb();
  const intake = await ownedIntake(id, subject);
  const [assets, generations, wardrobe, decisionReceipts] = await Promise.all([
    db.select().from(studioAssets).where(eq(studioAssets.intakeId, id)).orderBy(studioAssets.createdAt),
    db.select().from(studioGenerations).where(eq(studioGenerations.intakeId, id)).orderBy(desc(studioGenerations.createdAt)),
    db.select().from(studioWardrobeItems).where(eq(studioWardrobeItems.intakeId, id)).limit(1),
    listLatestDecisionReceiptsForIntake(id),
  ]);
  const candidate = generations.find(isEligibleStudioIntakeCandidate);
  const retryableGeneration = generations.find((generation) => {
    const attempt = paidGenerationAttempt(generation.parameters);
    return generation.operation === "GARMENT_FRONT"
      && attempt < 2
      && (generation.state === "FAILED" || generation.state === "REJECTED");
  }) ?? null;
  const decisionReceipt = generations.map((generation) =>
    decisionReceipts.get(generation.id) ?? finalGenerationDecisionReceipt(generation)
  ).find(Boolean) ?? null;
  return {
    id: intake.id,
    kind: intake.kind,
    sourceMode: intake.sourceMode,
    state: intake.state,
    version: intake.version,
    description: intake.description,
    facts: intake.facts as Partial<IntakeFacts>,
    assets: assets.map((asset) => ({
      id: asset.id,
      role: asset.role,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
    })),
    ...(candidate && candidate.outputAssetId ? {
      candidate: {
        generationId: candidate.id,
        assetId: candidate.outputAssetId,
        status: candidate.state as "COMPLETE" | "APPROVED",
      },
    } : {}),
    ...(retryableGeneration ? {
      retryableGeneration: {
        generationId: retryableGeneration.id,
        status: retryableGeneration.state as "FAILED" | "REJECTED",
      },
    } : {}),
    ...(decisionReceipt ? { decisionReceipt } : {}),
    ...(wardrobe[0] ? { wardrobeItemId: wardrobe[0].id } : {}),
    ...(generations.some((generation) => generation.state === "INDETERMINATE") ? {
      reconciliation: {
        state: "INDETERMINATE" as const,
        retryAllowed: false as const,
        message: "A paid result could not be confirmed. An administrator must reconcile it before another attempt.",
      },
    } : {}),
  };
}

export async function listRecoverableIntakes(subject: string): Promise<OperatorSafeIntake[]> {
  const rows = await (await getStudioDb()).select({ id: studioIntakes.id }).from(studioIntakes).where(and(
    eq(studioIntakes.operatorSubject, subject),
    inArray(studioIntakes.state, ["DRAFT", "ANALYZING", "REVIEW", "GENERATING", "DECISION", "FAILED"]),
  )).orderBy(desc(studioIntakes.updatedAt)).limit(8);
  return Promise.all(rows.map((row) => getIntakeSnapshot(row.id, subject)));
}

export async function getOwnedIntakeRow(id: string, subject: string): Promise<IntakeRow> {
  return ownedIntake(id, subject);
}

export async function updateIntakeVersioned(input: {
  id: string;
  subject: string;
  expectedVersion: number;
  state?: IntakeRow["state"];
  facts?: Record<string, string | number | null>;
  description?: string;
  errorCode?: string | null;
}): Promise<IntakeRow> {
  const nextVersion = input.expectedVersion + 1;
  const [updated] = await (await getStudioDb()).update(studioIntakes).set({
    ...(input.state ? { state: input.state } : {}),
    ...(input.facts ? { facts: input.facts } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.errorCode !== undefined ? { errorCode: input.errorCode } : {}),
    version: nextVersion,
    updatedAt: new Date(),
  }).where(and(
    eq(studioIntakes.id, input.id),
    eq(studioIntakes.operatorSubject, input.subject),
    eq(studioIntakes.version, input.expectedVersion),
  )).returning();
  if (updated) return updated;
  const current = await ownedIntake(input.id, input.subject);
  throw new StudioEngineError(
    "VERSION_CONFLICT",
    409,
    "This intake changed in another window.",
    `Reload the intake at version ${current.version}.`,
  );
}

export async function addStudioAsset(input: {
  intakeId: string;
  role: AssetRow["role"];
  blobPathname: string;
  blobUrl: string;
  mimeType: string;
  byteSize: number;
  width?: number | null;
  height?: number | null;
  sha256: string;
}): Promise<AssetRow> {
  const db = await getStudioDb();
  await db.insert(studioAssets).values(input).onConflictDoNothing();
  const [asset] = await db.select().from(studioAssets).where(and(
    eq(studioAssets.intakeId, input.intakeId),
    eq(studioAssets.sha256, input.sha256),
    eq(studioAssets.role, input.role),
  )).limit(1);
  if (!asset) throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "The image could not be saved.", "Try again.");
  return asset;
}

export function studioSourceBindingMatches(
  intake: Pick<IntakeRow, "sourceAssetId" | "sourceSha256">,
  asset: Pick<AssetRow, "id" | "sha256">,
): boolean {
  return intake.sourceAssetId === asset.id && intake.sourceSha256 === asset.sha256;
}

export async function bindStudioSourceAsset(input: {
  intakeId: string;
  subject: string;
  asset: Pick<AssetRow, "id" | "sha256">;
}): Promise<IntakeRow> {
  const db = await getStudioDb();
  const [bound] = await db.update(studioIntakes).set({
    sourceAssetId: input.asset.id,
    sourceSha256: input.asset.sha256,
    updatedAt: new Date(),
  }).where(and(
    eq(studioIntakes.id, input.intakeId),
    eq(studioIntakes.operatorSubject, input.subject),
    eq(studioIntakes.state, "DRAFT"),
    isNull(studioIntakes.sourceAssetId),
  )).returning();
  if (bound) return bound;
  const current = await ownedIntake(input.intakeId, input.subject);
  if (studioSourceBindingMatches(current, input.asset)) return current;
  throw new StudioEngineError(
    "INVALID_TRANSITION",
    409,
    "This intake already owns different immutable source evidence.",
    "Continue with the saved source or start a new intake for replacement evidence.",
  );
}

export function resolveBoundStudioSource<T extends Pick<AssetRow, "id" | "sha256" | "role">>(
  intake: Pick<IntakeRow, "sourceAssetId" | "sourceSha256" | "sourceMode">,
  assets: T[],
): T | null {
  if (!intake.sourceAssetId || !intake.sourceSha256) return null;
  const source = assets.find((asset) => asset.id === intake.sourceAssetId && asset.role === "SOURCE") ?? null;
  if (!source || source.sha256 !== intake.sourceSha256) {
    throw new StudioEngineError(
      "INVALID_ASSET",
      409,
      "The intake source binding no longer verifies.",
      "Restore the exact saved source before running Studio.",
    );
  }
  return source;
}

export async function getOwnedAsset(input: {
  intakeId: string;
  assetId: string;
  subject: string;
}): Promise<AssetRow> {
  await ownedIntake(input.intakeId, input.subject);
  const [asset] = await (await getStudioDb()).select().from(studioAssets).where(and(
    eq(studioAssets.id, input.assetId),
    eq(studioAssets.intakeId, input.intakeId),
  )).limit(1);
  if (!asset) throw new StudioEngineError("INTAKE_NOT_FOUND", 404, "That image was not found.", "Return to the intake.");
  return asset;
}

export async function listOwnedAssets(intakeId: string, subject: string): Promise<AssetRow[]> {
  await ownedIntake(intakeId, subject);
  return (await getStudioDb()).select().from(studioAssets).where(eq(studioAssets.intakeId, intakeId));
}

export async function createOrReuseGeneration(input: typeof studioGenerations.$inferInsert): Promise<GenerationRow> {
  const db = await getStudioDb();
  const paidScopeKey = studioPaidGenerationScopeKey(input);
  const values = { ...input, paidScopeKey };
  await db.insert(studioGenerations).values(values).onConflictDoNothing();
  if (input.requestId) {
    const [requestRow] = await db.select().from(studioGenerations).where(and(
      eq(studioGenerations.intakeId, input.intakeId),
      eq(studioGenerations.requestId, input.requestId),
    )).limit(1);
    if (requestRow) assertStudioGenerationRequestIdentity(requestRow, input.fingerprint);
    if (requestRow) return requestRow;
  }
  const [row] = await db.select().from(studioGenerations).where(and(
    eq(studioGenerations.intakeId, input.intakeId),
    eq(studioGenerations.fingerprint, input.fingerprint),
  )).limit(1);
  if (!row && paidScopeKey) {
    const [scopeRow] = await db.select().from(studioGenerations).where(
      eq(studioGenerations.paidScopeKey, paidScopeKey),
    ).limit(1);
    if (scopeRow) {
      assertNoConflictingActiveStudioGeneration(scopeRow, input.fingerprint);
      return scopeRow;
    }
  }
  if (!row) {
    const active = await findActivePaidGeneration({
      intakeId: input.intakeId,
      operation: input.operation,
      attempt: paidGenerationAttempt(input.parameters),
      parameters: input.parameters,
    });
    assertNoConflictingActiveStudioGeneration(active, input.fingerprint);
    throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "Generation could not start.", "Try again.");
  }
  return row;
}

export async function findGenerationByFingerprint(input: {
  intakeId: string;
  fingerprint: string;
}): Promise<GenerationRow | null> {
  const [row] = await (await getStudioDb()).select().from(studioGenerations).where(and(
    eq(studioGenerations.intakeId, input.intakeId),
    eq(studioGenerations.fingerprint, input.fingerprint),
  )).limit(1);
  return row ?? null;
}

export async function findGenerationByRequestId(input: {
  intakeId: string;
  requestId: string;
}): Promise<GenerationRow | null> {
  const [row] = await (await getStudioDb()).select().from(studioGenerations).where(and(
    eq(studioGenerations.intakeId, input.intakeId),
    eq(studioGenerations.requestId, input.requestId),
  )).limit(1);
  return row ?? null;
}

export async function claimGenerationCommand(id: string): Promise<boolean> {
  const startedAt = new Date();
  const rows = await (await getStudioDb()).update(studioGenerations).set({
    state: "RUNNING",
    executionToken: randomUUID(),
    startedAt,
    leaseExpiresAt: new Date(startedAt.getTime() + STUDIO_GENERATION_LEASE_MS),
    errorCode: null,
    updatedAt: startedAt,
  }).where(and(
    eq(studioGenerations.id, id),
    inArray(studioGenerations.state, ["PENDING", "FAILED"]),
  )).returning({ id: studioGenerations.id });
  return rows.length === 1;
}

export async function claimGeneration(id: string): Promise<boolean> {
  const startedAt = new Date();
  const rows = await (await getStudioDb()).update(studioGenerations).set({
    state: "RUNNING",
    executionToken: randomUUID(),
    startedAt,
    leaseExpiresAt: new Date(startedAt.getTime() + STUDIO_GENERATION_LEASE_MS),
    updatedAt: startedAt,
  }).where(and(
    eq(studioGenerations.id, id),
    eq(studioGenerations.state, "PENDING"),
  )).returning({ id: studioGenerations.id });
  return rows.length === 1;
}

export async function claimPaidGeneration(
  id: string,
  now = new Date(),
): Promise<StudioPaidGenerationClaim<GenerationRow>> {
  const db = await getStudioDb();
  const executionToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + STUDIO_GENERATION_LEASE_MS);
  const [claimed] = await db.update(studioGenerations).set({
    state: "RUNNING",
    executionToken,
    startedAt: sql`coalesce(${studioGenerations.startedAt}, ${now})`,
    leaseExpiresAt,
    errorCode: null,
    updatedAt: now,
  }).where(and(
    eq(studioGenerations.id, id),
    or(
      eq(studioGenerations.state, "PENDING"),
      and(
        eq(studioGenerations.state, "RUNNING"),
        lte(studioGenerations.leaseExpiresAt, now),
        isNull(studioGenerations.providerInvocationStartedAt),
      ),
      and(
        eq(studioGenerations.state, "RUNNING"),
        lte(studioGenerations.leaseExpiresAt, now),
        isNotNull(studioGenerations.providerResultReceivedAt),
      ),
    ),
  )).returning();
  if (claimed) {
    if (!claimed.executionToken) throw new Error("Claimed Studio generation is missing its execution token.");
    return {
      kind: claimed.providerResultReceivedAt ? "RESUME" : "CLAIMED",
      executionToken: claimed.executionToken,
      row: claimed,
    };
  }

  const [row] = await db.select().from(studioGenerations).where(eq(studioGenerations.id, id)).limit(1);
  if (!row) throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "Generation could not start.", "Try again.");
  if (row.state === "INDETERMINATE") return { kind: "INDETERMINATE", row };
  if (row.state !== "RUNNING") return { kind: "TERMINAL", row };
  if (
    row.leaseExpiresAt
    && row.leaseExpiresAt <= now
    && row.providerInvocationStartedAt
    && !row.providerResultReceivedAt
    && row.executionToken
  ) {
    return { kind: "RECONCILE", executionToken: row.executionToken, row };
  }
  return { kind: "JOINED", row };
}

export type StudioNoDispatchRecovery<Row> =
  | { kind: "READY_TO_DISPATCH"; row: Row }
  | { kind: "RESULT_READY"; row: Row }
  | { kind: "JOINED"; row: Row }
  | { kind: "INDETERMINATE"; row: Row }
  | { kind: "TERMINAL"; row: Row };

export async function recoverPaidGenerationWithoutDispatch(
  id: string,
  now = new Date(),
): Promise<StudioNoDispatchRecovery<GenerationRow>> {
  const db = await getStudioDb();
  const [row] = await db.select().from(studioGenerations).where(eq(studioGenerations.id, id)).limit(1);
  if (!row) throw new StudioEngineError("INVALID_TRANSITION", 409, "That paid command no longer exists.", "Reload the current Studio state.");
  if (row.state === "INDETERMINATE") return { kind: "INDETERMINATE", row };
  if (row.state === "PENDING") return { kind: "READY_TO_DISPATCH", row };
  if (row.state !== "RUNNING") return { kind: "TERMINAL", row };
  if (row.providerResultReceivedAt) return { kind: "RESULT_READY", row };
  if (!row.leaseExpiresAt || row.leaseExpiresAt > now) return { kind: "JOINED", row };
  if (row.providerInvocationStartedAt) {
    if (!row.executionToken) return { kind: "JOINED", row };
    const marked = await markPaidGenerationIndeterminate({ id, executionToken: row.executionToken });
    if (marked.kind === "INDETERMINATE") return marked;
    if (marked.kind === "RESULT_RECEIVED") return { kind: "RESULT_READY", row: marked.row };
    return { kind: "JOINED", row: marked.row };
  }
  const [released] = await db.update(studioGenerations).set({
    state: "PENDING",
    executionToken: null,
    startedAt: null,
    leaseExpiresAt: null,
    errorCode: null,
    updatedAt: now,
  }).where(and(
    eq(studioGenerations.id, id),
    eq(studioGenerations.state, "RUNNING"),
    ...(row.executionToken ? [eq(studioGenerations.executionToken, row.executionToken)] : []),
    lte(studioGenerations.leaseExpiresAt, now),
    isNull(studioGenerations.providerInvocationStartedAt),
    isNull(studioGenerations.providerResultReceivedAt),
  )).returning();
  if (released) return { kind: "READY_TO_DISPATCH", row: released };
  const [current] = await db.select().from(studioGenerations).where(eq(studioGenerations.id, id)).limit(1);
  if (!current) throw new StudioEngineError("INVALID_TRANSITION", 409, "That paid command no longer exists.", "Reload the current Studio state.");
  if (current.state === "INDETERMINATE") return { kind: "INDETERMINATE", row: current };
  if (current.providerResultReceivedAt) return { kind: "RESULT_READY", row: current };
  return { kind: current.state === "PENDING" ? "READY_TO_DISPATCH" : current.state === "RUNNING" ? "JOINED" : "TERMINAL", row: current };
}

export async function markPaidGenerationInvocationStarted(input: {
  id: string;
  executionToken: string;
}): Promise<void> {
  const db = await getStudioDb();
  const [updated] = await db.update(studioGenerations).set({
    providerInvocationStartedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(studioGenerations.id, input.id),
    eq(studioGenerations.state, "RUNNING"),
    eq(studioGenerations.executionToken, input.executionToken),
    isNull(studioGenerations.providerInvocationStartedAt),
  )).returning({ id: studioGenerations.id });
  if (updated) return;
  const [row] = await db.select().from(studioGenerations).where(and(
    eq(studioGenerations.id, input.id),
    eq(studioGenerations.state, "RUNNING"),
    eq(studioGenerations.executionToken, input.executionToken),
    isNotNull(studioGenerations.providerInvocationStartedAt),
  )).limit(1);
  if (!row) throw new Error("Studio generation invocation checkpoint was not acquired.");
}

export async function checkpointPaidGenerationResult(input: {
  id: string;
  executionToken: string;
  result: StudioGenerationProviderResultManifest;
}): Promise<void> {
  const db = await getStudioDb();
  const now = new Date();
  const [updated] = await db.update(studioGenerations).set({
    providerResultReceivedAt: now,
    providerResultBlobPathname: input.result.blobPathname,
    providerResultMimeType: input.result.mimeType,
    providerResultByteSize: input.result.byteSize,
    providerResultSha256: input.result.sha256,
    providerResultMetadata: input.result.providerEvidence ?? null,
    usage: input.result.usage,
    costUsd: input.result.costUsd === null ? null : input.result.costUsd.toFixed(6),
    leaseExpiresAt: new Date(now.getTime() + STUDIO_GENERATION_LEASE_MS),
    updatedAt: now,
  }).where(and(
    eq(studioGenerations.id, input.id),
    eq(studioGenerations.state, "RUNNING"),
    eq(studioGenerations.executionToken, input.executionToken),
    isNotNull(studioGenerations.providerInvocationStartedAt),
    isNull(studioGenerations.providerResultReceivedAt),
  )).returning({ id: studioGenerations.id });
  if (updated) return;
  const [row] = await db.select().from(studioGenerations).where(and(
    eq(studioGenerations.id, input.id),
    eq(studioGenerations.state, "RUNNING"),
    eq(studioGenerations.executionToken, input.executionToken),
    eq(studioGenerations.providerResultSha256, input.result.sha256),
    eq(studioGenerations.providerResultBlobPathname, input.result.blobPathname),
    input.result.providerEvidence
      ? eq(studioGenerations.providerResultMetadata, input.result.providerEvidence)
      : isNull(studioGenerations.providerResultMetadata),
  )).limit(1);
  if (!row) throw new Error("Studio generation provider result checkpoint was not acquired.");
}

export async function markPaidGenerationIndeterminate(input: {
  id: string;
  executionToken: string;
  errorCode?: string;
}): Promise<StudioPaidGenerationIndeterminateMark<GenerationRow>> {
  const db = await getStudioDb();
  const [updated] = await db.update(studioGenerations).set({
    state: "INDETERMINATE",
    leaseExpiresAt: null,
    errorCode: input.errorCode ?? "INDETERMINATE_PROVIDER_RESULT",
    updatedAt: new Date(),
  }).where(and(
    eq(studioGenerations.id, input.id),
    eq(studioGenerations.state, "RUNNING"),
    eq(studioGenerations.executionToken, input.executionToken),
    isNull(studioGenerations.providerResultReceivedAt),
  )).returning();
  if (updated) return { kind: "INDETERMINATE", row: updated };
  const [row] = await db.select().from(studioGenerations).where(eq(studioGenerations.id, input.id)).limit(1);
  if (!row) throw new Error("Studio generation could not be marked indeterminate.");
  if (row.state === "INDETERMINATE") return { kind: "INDETERMINATE", row };
  if (row.providerResultReceivedAt) return { kind: "RESULT_RECEIVED", row };
  return { kind: "LOST_CLAIM", row };
}

export async function quarantinePaidGenerationResult(input: {
  id: string;
  executionToken: string;
  errorCode:
    | "ACCOUNTING_UNVERIFIED"
    | "ACCOUNTING_POLICY_INVALID"
    | "COST_POLICY_EXCEEDED"
    | "PROVIDER_RESULT_CONFLICT"
    | "MISSING_GATEWAY_USAGE"
    | "MISSING_PROVIDER_EVIDENCE"
    | "PROVIDER_WARNING"
    | "SERVED_MODEL_MISSING"
    | "SERVED_MODEL_MISMATCH"
    | "SERVED_PROVIDER_MISMATCH"
    | "INVALID_PROVIDER_IMAGE"
    | "OUTPUT_CONTRACT_MISMATCH";
}): Promise<boolean> {
  const [updated] = await (await getStudioDb()).update(studioGenerations).set({
    state: "INDETERMINATE",
    leaseExpiresAt: null,
    errorCode: input.errorCode,
    updatedAt: new Date(),
  }).where(and(
    eq(studioGenerations.id, input.id),
    eq(studioGenerations.state, "RUNNING"),
    eq(studioGenerations.executionToken, input.executionToken),
    isNotNull(studioGenerations.providerResultReceivedAt),
  )).returning({ id: studioGenerations.id });
  return Boolean(updated);
}

export async function transitionGenerationState(input: {
  id: string;
  expectedState: GenerationRow["state"];
  executionToken?: string;
  state: GenerationRow["state"];
  update?: Partial<typeof studioGenerations.$inferInsert>;
}): Promise<boolean> {
  const [updated] = await (await getStudioDb()).update(studioGenerations).set({
    ...input.update,
    state: input.state,
    ...(input.state === "RUNNING" ? {} : { leaseExpiresAt: null }),
    updatedAt: new Date(),
  }).where(and(
    eq(studioGenerations.id, input.id),
    eq(studioGenerations.state, input.expectedState),
    ...(input.executionToken ? [eq(studioGenerations.executionToken, input.executionToken)] : []),
  )).returning({ id: studioGenerations.id });
  return Boolean(updated);
}

export async function claimGenerationDecision(input: {
  id: string;
  expectedState: GenerationRow["state"];
  state: GenerationRow["state"];
  decision: "KEEP" | "EDIT" | "REJECT" | "RETRY";
  note?: string;
}): Promise<"CLAIMED" | "REPEATED" | "CONFLICT"> {
  const noteSha256 = createHash("sha256").update(input.note ?? "").digest("hex");
  const [updated] = await (await getStudioDb()).update(studioGenerations).set({
    state: input.state,
    finalDecision: input.decision,
    finalDecisionNoteSha256: noteSha256,
    decidedAt: new Date(),
    leaseExpiresAt: null,
    updatedAt: new Date(),
  }).where(and(
    eq(studioGenerations.id, input.id),
    eq(studioGenerations.state, input.expectedState),
    isNull(studioGenerations.finalDecision),
  )).returning({ id: studioGenerations.id });
  if (updated) return "CLAIMED";
  const [row] = await (await getStudioDb()).select({
    finalDecision: studioGenerations.finalDecision,
    finalDecisionNoteSha256: studioGenerations.finalDecisionNoteSha256,
  }).from(studioGenerations).where(eq(studioGenerations.id, input.id)).limit(1);
  if (row?.finalDecision === input.decision && row.finalDecisionNoteSha256 === noteSha256) return "REPEATED";
  return "CONFLICT";
}

export async function applyStudioIntakeDecisionAtomic(input: {
  intakeId: string;
  generationId: string;
  actorSubject: string;
  expectedVersion: number;
  expectedIntakeState: IntakeRow["state"];
  intakeState: IntakeRow["state"];
  expectedGenerationState: GenerationRow["state"];
  generationState: GenerationRow["state"];
  decision: "KEEP" | "EDIT" | "REJECT" | "RETRY";
  note?: string;
}): Promise<OperatorSafeDecisionReceipt> {
  const db = await getStudioDb();
  const note = normalizedDecisionNote(input.note);
  const noteSha256 = createHash("sha256").update(note ?? "").digest("hex");
  const idempotencyKey = `generation:${input.generationId}:${input.decision}`;
  try {
    await db.execute(sql`
      with eligible as materialized (
        select generation.id as generation_id, intake.id as intake_id
        from studio_generations as generation
        join studio_intakes as intake on intake.id = generation.intake_id
        where generation.id = ${input.generationId}::uuid
          and generation.intake_id = ${input.intakeId}::uuid
          and generation.state = ${input.expectedGenerationState}::studio_generation_state
          and generation.final_decision is null
          and intake.id = ${input.intakeId}::uuid
          and intake.operator_subject = ${input.actorSubject}
          and intake.state = ${input.expectedIntakeState}::studio_intake_state
          and intake.version = ${input.expectedVersion}
        for update of generation, intake
      ), claimed_generation as (
        update studio_generations as generation
        set state = ${input.generationState}::studio_generation_state,
            final_decision = ${input.decision}::studio_decision_kind,
            final_decision_note_sha256 = ${noteSha256},
            decided_at = now(),
            lease_expires_at = null,
            updated_at = now()
        from eligible
        where generation.id = eligible.generation_id
        returning generation.id
      ), claimed_intake as (
        update studio_intakes as intake
        set state = ${input.intakeState}::studio_intake_state,
            version = intake.version + 1,
            updated_at = now()
        from eligible
        where intake.id = eligible.intake_id
          and exists (select 1 from claimed_generation)
        returning intake.id
      ), asserted_decision as (
        insert into studio_decisions (
          intake_id, generation_id, actor_subject, decision, note, idempotency_key
        ) values (
          ${input.intakeId}::uuid,
          ${input.generationId}::uuid,
          case
            when exists (select 1 from claimed_generation)
             and exists (select 1 from claimed_intake)
            then ${input.actorSubject}
            else null
          end,
          ${input.decision}::studio_decision_kind,
          ${note},
          ${idempotencyKey}
        )
        on conflict (idempotency_key) where idempotency_key is not null do update
        set actor_subject = case
          when studio_decisions.intake_id = excluded.intake_id
           and studio_decisions.generation_id = excluded.generation_id
           and studio_decisions.decision = excluded.decision
           and coalesce(btrim(studio_decisions.note), '') = coalesce(btrim(excluded.note), '')
          then studio_decisions.actor_subject
          else null
        end
        returning id
      )
      select id from asserted_decision
    `);
  } catch {
    // A concurrent winner or a crash after the generation decision can leave
    // the immutable decision ahead of its receipt/intake projection. The
    // exact replay below is a no-spend deterministic repair; a different
    // decision or note remains a conflict.
  }

  const [generation, intake] = await Promise.all([
    getGeneration(input.generationId, input.intakeId),
    ownedIntake(input.intakeId, input.actorSubject),
  ]);
  if (
    !generation
    || generation.finalDecision !== input.decision
    || generation.finalDecisionNoteSha256 !== noteSha256
    || generation.state !== input.generationState
  ) {
    if (intake.version !== input.expectedVersion) {
      throw new StudioEngineError("VERSION_CONFLICT", 409, "This intake changed in another window.", `Reload the intake at version ${intake.version}.`);
    }
    throw new StudioEngineError("INVALID_TRANSITION", 409, "That candidate already has a different decision.", "Reload the current intake.");
  }

  const receipt = await appendDecisionOnce({
    intakeId: input.intakeId,
    generationId: input.generationId,
    actorSubject: input.actorSubject,
    decision: input.decision,
    note: note ?? undefined,
  });
  if (intake.state === input.intakeState) return receipt;
  if (intake.state !== input.expectedIntakeState || intake.version !== input.expectedVersion) {
    throw new StudioEngineError("VERSION_CONFLICT", 409, "This intake changed in another window.", `Reload the intake at version ${intake.version}.`);
  }
  await updateIntakeVersioned({
    id: input.intakeId,
    subject: input.actorSubject,
    expectedVersion: input.expectedVersion,
    state: input.intakeState,
  });
  return receipt;
}

export async function updateGeneration(id: string, update: Partial<typeof studioGenerations.$inferInsert>): Promise<void> {
  await (await getStudioDb()).update(studioGenerations).set({
    ...update,
    ...(update.state && update.state !== "RUNNING" ? { leaseExpiresAt: null } : {}),
    updatedAt: new Date(),
  }).where(eq(studioGenerations.id, id));
}

export async function appendDecision(input: {
  intakeId: string;
  generationId?: string | null;
  actorSubject: string;
  decision: "KEEP" | "EDIT" | "REJECT" | "RETRY";
  note?: string;
}): Promise<void> {
  await (await getStudioDb()).insert(studioDecisions).values({ ...input, generationId: input.generationId || null });
}

export async function appendDecisionOnce(input: {
  intakeId: string;
  generationId: string;
  actorSubject: string;
  decision: "KEEP" | "EDIT" | "REJECT" | "RETRY";
  note?: string;
}): Promise<OperatorSafeDecisionReceipt> {
  const db = await getStudioDb();
  const idempotencyKey = `generation:${input.generationId}:${input.decision}`;
  const note = normalizedDecisionNote(input.note);
  await db.insert(studioDecisions).values({
    ...input,
    note,
    idempotencyKey,
  }).onConflictDoNothing();
  const [row] = await db.select().from(studioDecisions).where(
    eq(studioDecisions.idempotencyKey, idempotencyKey),
  ).limit(1);
  if (
    !row
    || row.intakeId !== input.intakeId
    || row.generationId !== input.generationId
    || row.actorSubject !== input.actorSubject
    || row.decision !== input.decision
    || normalizedDecisionNote(row.note) !== note
  ) {
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      "That Studio decision key already belongs to a different decision intent.",
      "Reload the saved decision before continuing.",
    );
  }
  return buildOperatorSafeDecisionReceipt({
    generationId: input.generationId,
    decision: row.decision,
    note: row.note,
    decidedAt: row.createdAt,
  });
}

export async function listLatestDecisionReceiptsForIntake(
  intakeId: string,
): Promise<Map<string, OperatorSafeDecisionReceipt>> {
  const rows = await (await getStudioDb()).select().from(studioDecisions).where(and(
    eq(studioDecisions.intakeId, intakeId),
    isNotNull(studioDecisions.generationId),
  )).orderBy(desc(studioDecisions.createdAt), desc(studioDecisions.id));
  const receipts = new Map<string, OperatorSafeDecisionReceipt>();
  for (const row of rows as DecisionRow[]) {
    if (!row.generationId || receipts.has(row.generationId)) continue;
    receipts.set(row.generationId, buildOperatorSafeDecisionReceipt({
      generationId: row.generationId,
      decision: row.decision,
      note: row.note,
      decidedAt: row.createdAt,
    }));
  }
  return receipts;
}

export async function hasGenerationDecision(input: {
  generationId: string;
  decision: "KEEP" | "EDIT" | "REJECT" | "RETRY";
}): Promise<boolean> {
  const [row] = await (await getStudioDb()).select({ id: studioDecisions.id }).from(studioDecisions).where(and(
    eq(studioDecisions.generationId, input.generationId),
    eq(studioDecisions.decision, input.decision),
  )).limit(1);
  return Boolean(row);
}

export async function commitWardrobeItem(input: {
  intakeId: string;
  operatorSubject: string;
  facts: IntakeFacts;
  approvedAssetId: string;
}): Promise<OperatorSafeWardrobeItem> {
  const db = await getStudioDb();
  await db.insert(studioWardrobeItems).values({
    intakeId: input.intakeId,
    operatorSubject: input.operatorSubject,
    ...input.facts,
    approvedAssetId: input.approvedAssetId,
  }).onConflictDoNothing();
  const [item] = await db.select().from(studioWardrobeItems).where(eq(studioWardrobeItems.intakeId, input.intakeId)).limit(1);
  if (!item) throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "The garment could not be saved.", "Try again.");
  await db.execute(sql`
    insert into studio_garment_events (
      wardrobe_item_id, operator_subject, event_type, summary, details, occurred_at
    )
    select ${item.id}::uuid, ${input.operatorSubject}, 'COMMITTED', 'Saved to Wardrobe',
      jsonb_build_object('intakeId', ${input.intakeId}), ${item.createdAt}
    where not exists (
      select 1 from studio_garment_events
      where wardrobe_item_id = ${item.id}::uuid and event_type = 'COMMITTED'
    )
  `);
  return mapWardrobeItem(item);
}

export function wardrobeCommitIntentMatches(
  item: Pick<OperatorSafeWardrobeItem,
    "intakeId" | "title" | "category" | "colour" | "sizeLabel" | "condition" | "price" | "approvedAssetId"
  >,
  input: {
    intakeId: string;
    facts: IntakeFacts;
    approvedAssetId: string;
  },
): boolean {
  return item.intakeId === input.intakeId
    && item.title === input.facts.title
    && item.category === input.facts.category
    && item.colour === input.facts.colour
    && item.sizeLabel === input.facts.sizeLabel
    && item.condition === input.facts.condition
    && item.price === input.facts.price
    && item.approvedAssetId === input.approvedAssetId;
}

export async function commitStudioIntakeAtomic(input: {
  intakeId: string;
  operatorSubject: string;
  expectedVersion: number;
  generationId: string;
  approvedAssetId: string;
  facts: IntakeFacts;
}): Promise<{ intake: IntakeRow; wardrobeItem: OperatorSafeWardrobeItem; repeated: boolean }> {
  const db = await getStudioDb();
  const factsJson = JSON.stringify(input.facts);
  const result = await db.execute(sql`
    with approved_generation as (
      select generation.id, generation.output_asset_id
      from studio_generations as generation
      where generation.id = ${input.generationId}::uuid
        and generation.intake_id = ${input.intakeId}::uuid
        and generation.state = 'APPROVED'
        and generation.final_decision = 'KEEP'
        and generation.output_asset_id = ${input.approvedAssetId}::uuid
    ), claimed_intake as (
      update studio_intakes as intake
      set state = 'COMMITTED',
          facts = ${factsJson}::jsonb,
          version = intake.version + 1,
          error_code = null,
          updated_at = now()
      where intake.id = ${input.intakeId}::uuid
        and intake.operator_subject = ${input.operatorSubject}
        and intake.state = 'DECISION'
        and intake.version = ${input.expectedVersion}
        and exists (select 1 from approved_generation)
        and not exists (
          select 1
          from studio_wardrobe_items as existing
          where existing.intake_id = intake.id
            and (
              existing.operator_subject <> ${input.operatorSubject}
              or existing.title <> ${input.facts.title}
              or existing.category <> ${input.facts.category}
              or existing.colour <> ${input.facts.colour}
              or existing.size_label <> ${input.facts.sizeLabel}
              or existing.condition <> ${input.facts.condition}
              or existing.price <> ${input.facts.price}
              or existing.approved_asset_id is distinct from ${input.approvedAssetId}::uuid
            )
        )
      returning intake.id
    ), inserted_item as (
      insert into studio_wardrobe_items (
        intake_id, operator_subject, title, category, colour, size_label,
        condition, price, approved_asset_id
      )
      select
        ${input.intakeId}::uuid, ${input.operatorSubject}, ${input.facts.title},
        ${input.facts.category}, ${input.facts.colour}, ${input.facts.sizeLabel},
        ${input.facts.condition}, ${input.facts.price}, ${input.approvedAssetId}::uuid
      from claimed_intake
      on conflict (intake_id) do nothing
      returning id, created_at
    ), committed_item as (
      select id, created_at from inserted_item
      union all
      select existing.id, existing.created_at
      from studio_wardrobe_items as existing
      where existing.intake_id = ${input.intakeId}::uuid
        and exists (select 1 from claimed_intake)
      limit 1
    ), ownership_item as (
      select id, created_at from committed_item
      union all
      select existing.id, existing.created_at
      from studio_wardrobe_items as existing
      where existing.intake_id = ${input.intakeId}::uuid
        and existing.operator_subject = ${input.operatorSubject}
        and existing.title = ${input.facts.title}
        and existing.category = ${input.facts.category}
        and existing.colour = ${input.facts.colour}
        and existing.size_label = ${input.facts.sizeLabel}
        and existing.condition = ${input.facts.condition}
        and existing.price = ${input.facts.price}
        and existing.approved_asset_id = ${input.approvedAssetId}::uuid
        and exists (select 1 from approved_generation)
        and not exists (select 1 from committed_item)
      limit 1
    ), ownership_claim as (
      insert into studio_engine_work_ownership (
        operator_subject, wardrobe_item_id, stage_family, owner,
        semantic_hash, created_at, updated_at
      )
      select
        ${input.operatorSubject}, item.id, 'GARMENT_FRONT', 'LEGACY',
        encode(digest(convert_to(
          'juw.studio-engine-work-ownership.v1' || E'\n'
          || ${input.operatorSubject} || E'\n'
          || item.id::text || E'\n'
          || 'GARMENT_FRONT',
          'UTF8'
        ), 'sha256'), 'hex'),
        item.created_at,
        item.created_at
      from ownership_item as item
      on conflict (operator_subject, wardrobe_item_id, stage_family)
      do update set updated_at = studio_engine_work_ownership.updated_at
      where studio_engine_work_ownership.owner = 'LEGACY'
        and studio_engine_work_ownership.semantic_hash = excluded.semantic_hash
      returning wardrobe_item_id
    ), inserted_event as (
      insert into studio_garment_events (
        wardrobe_item_id, operator_subject, event_type, summary, details, occurred_at
      )
      select item.id, ${input.operatorSubject}, 'COMMITTED', 'Saved to Wardrobe',
        jsonb_build_object(
          'intakeId', ${input.intakeId},
          'generationId', ${input.generationId},
          'approvedAssetId', ${input.approvedAssetId}
        ), item.created_at
      from committed_item as item
      where not exists (
        select 1 from studio_garment_events
        where wardrobe_item_id = item.id and event_type = 'COMMITTED'
      )
      returning id
    )
    select
      exists(select 1 from claimed_intake) as claimed,
      exists(select 1 from ownership_claim) as ownership_claimed
  `);
  const resultRow = result.rows[0] as {
    claimed?: boolean | string | number;
    ownership_claimed?: boolean | string | number;
  } | undefined;
  const claimed = Boolean(resultRow?.claimed === true
    || resultRow?.claimed === "true"
    || resultRow?.claimed === 1);
  const ownershipClaimed = Boolean(resultRow?.ownership_claimed === true
    || resultRow?.ownership_claimed === "true"
    || resultRow?.ownership_claimed === 1);
  const [intake, wardrobeItem] = await Promise.all([
    ownedIntake(input.intakeId, input.operatorSubject),
    getCommittedWardrobeItem({ intakeId: input.intakeId, operatorSubject: input.operatorSubject }),
  ]);
  const intentMatches = Boolean(wardrobeItem && wardrobeCommitIntentMatches(wardrobeItem, input));
  const savedFacts = intake.facts as Partial<IntakeFacts>;
  const intakeFactsMatch = savedFacts.title === input.facts.title
    && savedFacts.category === input.facts.category
    && savedFacts.colour === input.facts.colour
    && savedFacts.sizeLabel === input.facts.sizeLabel
    && savedFacts.condition === input.facts.condition
    && savedFacts.price === input.facts.price;
  if (intake.state === "COMMITTED" && intentMatches && intakeFactsMatch && wardrobeItem) {
    if (!ownershipClaimed) {
      throw new StudioEngineError(
        "INVALID_TRANSITION",
        409,
        "This garment stage is already owned by another Studio workflow.",
        "Continue from the saved workflow for this garment stage. No new generation was started.",
      );
    }
    return { intake, wardrobeItem, repeated: !claimed };
  }
  if (intake.state === "COMMITTED" || wardrobeItem) {
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      "This garment was already committed with different saved facts or media.",
      "Reload the committed Wardrobe item instead of overwriting it.",
    );
  }
  if (intake.version !== input.expectedVersion) {
    throw new StudioEngineError("VERSION_CONFLICT", 409, "This intake changed in another window.", `Reload the intake at version ${intake.version}.`);
  }
  throw new StudioEngineError("INVALID_TRANSITION", 409, "This garment is not ready to save.", "Keep the exact candidate first.");
}

export async function getCommittedWardrobeItem(input: {
  intakeId: string;
  operatorSubject: string;
}): Promise<OperatorSafeWardrobeItem | null> {
  const [item] = await (await getStudioDb()).select().from(studioWardrobeItems).where(and(
    eq(studioWardrobeItems.intakeId, input.intakeId),
    eq(studioWardrobeItems.operatorSubject, input.operatorSubject),
  )).limit(1);
  return item ? mapWardrobeItem(item) : null;
}

export async function listWardrobeItems(subject: string): Promise<OperatorSafeWardrobeItem[]> {
  const rows = await (await getStudioDb()).select().from(studioWardrobeItems).where(
    eq(studioWardrobeItems.operatorSubject, subject),
  ).orderBy(desc(studioWardrobeItems.updatedAt));
  return rows.map(mapWardrobeItem);
}

export async function getOwnedWardrobeItem(id: string, subject: string) {
  const [item] = await (await getStudioDb()).select().from(studioWardrobeItems).where(and(
    eq(studioWardrobeItems.id, id),
    eq(studioWardrobeItems.operatorSubject, subject),
  )).limit(1);
  if (!item) throw new StudioEngineError("INTAKE_NOT_FOUND", 404, "That garment was not found.", "Return to Wardrobe.");
  return item;
}

export async function ensureLuluV3Profile(input: {
  blobPathname: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  sha256: string;
}): Promise<ModelProfileRow> {
  if (
    input.sha256 !== "ef88e65e78780101693720fd872c23857e4311412900acb28fdc139b08a373b8"
    || input.width !== 972
    || input.height !== 1619
  ) {
    throw new StudioEngineError("INVALID_ASSET", 503, "Lulu authority did not verify.", "Ask an administrator to restore the approved V3 master.");
  }
  const db = await getStudioDb();
  await db.insert(studioModelProfiles).values({
    operatorSubject: null,
    name: "Lulu",
    authorityId: "lulu-v3",
    kind: "LULU_V3",
    sourceBlobPathname: input.blobPathname,
    sourceMimeType: input.mimeType,
    sourceByteSize: input.byteSize,
    sourceWidth: input.width,
    sourceHeight: input.height,
    sourceSha256: input.sha256,
    licenseUrl: null,
    authority: {
      canonVersion: "3.0.0",
      approvalState: "IDENTITY_MASTER_USER_APPROVED",
      approvedOn: "2026-08-10",
      approvedBy: "user",
      privacy: "PRIVATE_PRODUCTION_ONLY",
      publishable: false,
      allowedUse: "Private justurban wears Studio try-on generation.",
      restrictedUse: "Never expose the identity master or publish it as product media.",
    },
    authorityConfirmedAt: new Date("2026-08-10T00:00:00.000Z"),
  }).onConflictDoNothing();
  const [profile] = await db.select().from(studioModelProfiles).where(eq(studioModelProfiles.authorityId, "lulu-v3")).limit(1);
  if (!profile) throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "Lulu is unavailable.", "Choose another model.");
  if (
    profile.kind !== "LULU_V3"
    || profile.sourceSha256 !== input.sha256
    || profile.sourceWidth !== input.width
    || profile.sourceHeight !== input.height
  ) {
    throw new StudioEngineError("INVALID_ASSET", 503, "Lulu authority did not verify.", "Ask an administrator to restore the approved V3 master.");
  }
  return profile;
}

export async function createOrReuseStockModel(input: {
  operatorSubject: string;
  name: string;
  authorityId: string;
  blobPathname: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  sha256: string;
  licenseUrl: string;
}): Promise<ModelProfileRow> {
  const db = await getStudioDb();
  await db.insert(studioModelProfiles).values({
    operatorSubject: input.operatorSubject,
    name: input.name,
    authorityId: input.authorityId,
    kind: "AUTHORIZED_STOCK",
    sourceBlobPathname: input.blobPathname,
    sourceMimeType: input.mimeType,
    sourceByteSize: input.byteSize,
    sourceWidth: input.width,
    sourceHeight: input.height,
    sourceSha256: input.sha256,
    licenseUrl: input.licenseUrl,
    authority: {
      adultConfirmed: true,
      operatorAuthorityConfirmed: true,
      sourceUrl: input.licenseUrl,
      licenseUrl: input.licenseUrl,
      privacy: "PRIVATE_PRODUCTION_ONLY",
      publishable: false,
      allowedUse: "Private Studio try-on generation.",
      restrictedUse: "No publication without a separate public-media approval.",
    },
    authorityConfirmedAt: new Date(),
  }).onConflictDoNothing();
  const [profile] = await db.select().from(studioModelProfiles).where(and(
    eq(studioModelProfiles.authorityId, input.authorityId),
    eq(studioModelProfiles.operatorSubject, input.operatorSubject),
  )).limit(1);
  if (!profile) throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "The model could not be saved.", "Try again.");
  return profile;
}

export async function listOwnedModelProfiles(subject: string): Promise<ModelProfileRow[]> {
  return (await getStudioDb()).select().from(studioModelProfiles).where(
    sql`${studioModelProfiles.operatorSubject} = ${subject} or ${studioModelProfiles.kind} = 'LULU_V3'`,
  ).orderBy(studioModelProfiles.createdAt);
}

export async function getOwnedModelProfile(id: string, subject: string): Promise<ModelProfileRow> {
  const [profile] = await (await getStudioDb()).select().from(studioModelProfiles).where(and(
    eq(studioModelProfiles.id, id),
    sql`(${studioModelProfiles.operatorSubject} = ${subject} or ${studioModelProfiles.kind} = 'LULU_V3')`,
    eq(studioModelProfiles.state, "READY"),
  )).limit(1);
  if (!profile) throw new StudioEngineError("INVALID_REQUEST", 400, "Choose an approved model.", "Add or select a ready model.");
  return profile;
}

export function mapModelProfile(profile: ModelProfileRow, wardrobeItemId: string): OperatorSafeModelProfile {
  return {
    id: profile.id,
    name: profile.name,
    kind: profile.kind as OperatorSafeModelProfile["kind"],
    state: "READY",
    sourceAssetUrl: `/api/studio/wardrobe/${wardrobeItemId}/models/${profile.id}/asset`,
  };
}

function mapWardrobeItem(item: typeof studioWardrobeItems.$inferSelect): OperatorSafeWardrobeItem {
  return {
    id: item.id,
    intakeId: item.intakeId,
    title: item.title,
    category: item.category as IntakeFacts["category"],
    colour: item.colour,
    sizeLabel: item.sizeLabel,
    condition: item.condition,
    price: item.price,
    quantity: 1,
    state: item.state as "DRAFT" | "READY" | "ARCHIVED",
    approvedAssetId: item.approvedAssetId,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function latestGenerationForIntake(intakeId: string): Promise<GenerationRow | null> {
  const [row] = await (await getStudioDb()).select().from(studioGenerations).where(eq(studioGenerations.intakeId, intakeId)).orderBy(desc(studioGenerations.createdAt)).limit(1);
  return row ?? null;
}

export async function listGenerationsForIntake(intakeId: string): Promise<GenerationRow[]> {
  return (await getStudioDb()).select().from(studioGenerations).where(
    eq(studioGenerations.intakeId, intakeId),
  ).orderBy(studioGenerations.createdAt);
}

export async function getGeneration(id: string, intakeId: string): Promise<GenerationRow | null> {
  const [row] = await (await getStudioDb()).select().from(studioGenerations).where(and(
    eq(studioGenerations.id, id),
    eq(studioGenerations.intakeId, intakeId),
  )).limit(1);
  return row ?? null;
}

export async function getAssetsByIds(ids: string[]): Promise<AssetRow[]> {
  return ids.length ? (await getStudioDb()).select().from(studioAssets).where(inArray(studioAssets.id, ids)) : [];
}
