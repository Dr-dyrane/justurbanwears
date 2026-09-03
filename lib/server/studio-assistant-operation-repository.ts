import { and, desc, eq, sql } from "drizzle-orm";
import { getStudioDb } from "../../db/shop-postgres";
import { studioAssistantOperations } from "../../db/shop-postgres-schema";
import {
  studioAssistantOperationErrorSchema,
  studioAssistantOperationPreviewSchema,
  studioAssistantOperationReceiptSchema,
  type StudioAssistantOperation,
  type StudioAssistantOperationError,
  type StudioAssistantOperationKind,
  type StudioAssistantOperationPreview,
  type StudioAssistantOperationReceipt,
  type StudioAssistantOperationState,
  type StudioAssistantTarget,
} from "../studio/assistant/tool-contracts";
import { StudioEngineError } from "../studio/engine/errors";
import type { StudioOperator } from "./studio-operator";
import { getStudioAssistantThread } from "./studio-assistant-thread-repository";

const OPERATION_TTL_MS = 24 * 60 * 60 * 1_000;

export type StudioAssistantOperationRow = typeof studioAssistantOperations.$inferSelect;

function actor(row: StudioAssistantOperationRow, kind: "created" | "executed") {
  if (kind === "created") {
    return { displayName: row.createdByDisplayName };
  }
  if (!row.executedByDisplayName) return null;
  return { displayName: row.executedByDisplayName };
}

function target(row: StudioAssistantOperationRow): StudioAssistantTarget {
  return {
    href: row.targetHref,
    id: row.targetId,
    label: row.targetLabel,
    reference: row.targetReference,
    type: row.targetType as StudioAssistantTarget["type"],
  };
}

export function projectStudioAssistantOperation(row: StudioAssistantOperationRow): StudioAssistantOperation {
  return {
    createdAt: row.createdAt.toISOString(),
    createdBy: actor(row, "created")!,
    executedAt: row.executedAt?.toISOString() ?? null,
    executedBy: actor(row, "executed"),
    expectedRevision: row.expectedRevision,
    expectedVersion: row.expectedVersion,
    expiresAt: row.expiresAt.toISOString(),
    id: row.id,
    kind: row.kind,
    lastError: row.lastError ? studioAssistantOperationErrorSchema.parse(row.lastError) : null,
    preview: studioAssistantOperationPreviewSchema.parse(row.preview),
    receipt: row.receipt ? studioAssistantOperationReceiptSchema.parse(row.receipt) : null,
    state: row.state,
    target: target(row),
    threadId: row.threadId,
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}

async function ownedRow(operator: StudioOperator, operationId: string): Promise<StudioAssistantOperationRow> {
  const [row] = await (await getStudioDb()).select()
    .from(studioAssistantOperations)
    .where(and(
      eq(studioAssistantOperations.id, operationId),
      eq(studioAssistantOperations.workspaceId, operator.workspaceId),
    ))
    .limit(1);
  if (!row) {
    throw new StudioEngineError(
      "INTAKE_NOT_FOUND",
      404,
      "That prepared Ask Studio change was not found.",
      "Return to the conversation and prepare it again.",
    );
  }
  return row;
}

export async function getStudioAssistantOperation(
  operator: StudioOperator,
  operationId: string,
): Promise<StudioAssistantOperation> {
  return projectStudioAssistantOperation(await ownedRow(operator, operationId));
}

export async function getStudioAssistantOperationRow(
  operator: StudioOperator,
  operationId: string,
): Promise<StudioAssistantOperationRow> {
  return ownedRow(operator, operationId);
}

export async function listStudioAssistantOperations(
  operator: StudioOperator,
  threadId: string,
): Promise<StudioAssistantOperation[]> {
  await getStudioAssistantThread(operator, threadId);
  const rows = await (await getStudioDb()).select()
    .from(studioAssistantOperations)
    .where(and(
      eq(studioAssistantOperations.threadId, threadId),
      eq(studioAssistantOperations.workspaceId, operator.workspaceId),
    ))
    .orderBy(desc(studioAssistantOperations.updatedAt))
    .limit(80);
  return rows.map(projectStudioAssistantOperation);
}

export async function createOrReuseStudioAssistantOperation(input: {
  expectedRevision?: string | null;
  expectedVersion?: number | null;
  idempotencyKey: string;
  kind: StudioAssistantOperationKind;
  operator: StudioOperator;
  payload: Record<string, unknown>;
  preview: StudioAssistantOperationPreview;
  requestFingerprint: string;
  target: StudioAssistantTarget;
  threadId: string;
}): Promise<StudioAssistantOperation> {
  await getStudioAssistantThread(input.operator, input.threadId);
  const expiresAt = new Date(Date.now() + OPERATION_TTL_MS);
  const [inserted] = await (await getStudioDb()).insert(studioAssistantOperations).values({
    createdByDisplayName: input.operator.displayName,
    createdByEmail: input.operator.email,
    createdBySubject: input.operator.actorSubject,
    expectedRevision: input.expectedRevision ?? null,
    expectedVersion: input.expectedVersion ?? null,
    expiresAt,
    idempotencyKey: input.idempotencyKey,
    kind: input.kind,
    payload: input.payload,
    preview: input.preview,
    requestFingerprint: input.requestFingerprint,
    state: "PREPARED",
    targetHref: input.target.href,
    targetId: input.target.id,
    targetLabel: input.target.label,
    targetReference: input.target.reference,
    targetType: input.target.type,
    threadId: input.threadId,
    workspaceId: input.operator.workspaceId,
  }).onConflictDoNothing().returning();
  if (inserted) return projectStudioAssistantOperation(inserted);

  const [existing] = await (await getStudioDb()).select()
    .from(studioAssistantOperations)
    .where(and(
      eq(studioAssistantOperations.workspaceId, input.operator.workspaceId),
      eq(studioAssistantOperations.idempotencyKey, input.idempotencyKey),
    ))
    .limit(1);
  if (!existing || existing.requestFingerprint !== input.requestFingerprint) {
    throw new StudioEngineError(
      "VERSION_CONFLICT",
      409,
      "That Ask Studio preparation key was already used for another change.",
      "Prepare the change again from the current conversation.",
    );
  }
  return projectStudioAssistantOperation(existing);
}

export async function startStudioAssistantOperation(input: {
  expectedVersion: number;
  operationId: string;
  operator: StudioOperator;
}): Promise<{ acquired: boolean; row: StudioAssistantOperationRow }> {
  const current = await ownedRow(input.operator, input.operationId);
  if (current.state !== "PREPARED") return { acquired: false, row: current };
  if (current.version !== input.expectedVersion) {
    throw new StudioEngineError(
      "VERSION_CONFLICT",
      409,
      "That prepared change was updated in another session.",
      "Refresh the conversation and review its current state.",
    );
  }
  if (current.expiresAt.getTime() <= Date.now()) {
    throw new StudioEngineError(
      "VERSION_CONFLICT",
      409,
      "That prepared change expired.",
      "Ask Studio to prepare it again from current Studio truth.",
    );
  }
  const now = new Date();
  const [started] = await (await getStudioDb()).update(studioAssistantOperations).set({
    executedAt: now,
    executedByDisplayName: input.operator.displayName,
    executedByEmail: input.operator.email,
    // Preserve the exact data-scope subject that the owning domain records on
    // its idempotent receipt. Human attribution remains in the paired name and
    // email columns and is never re-authored by a later reconciler.
    executedBySubject: input.operator.subject,
    lastError: null,
    state: "EXECUTING",
    updatedAt: now,
    version: sql`${studioAssistantOperations.version} + 1`,
  }).where(and(
    eq(studioAssistantOperations.id, input.operationId),
    eq(studioAssistantOperations.workspaceId, input.operator.workspaceId),
    eq(studioAssistantOperations.state, "PREPARED"),
    eq(studioAssistantOperations.version, input.expectedVersion),
  )).returning();
  return started
    ? { acquired: true, row: started }
    : { acquired: false, row: await ownedRow(input.operator, input.operationId) };
}

export async function finishStudioAssistantOperation(input: {
  error?: StudioAssistantOperationError | null;
  operationId: string;
  operator: StudioOperator;
  receipt?: StudioAssistantOperationReceipt | null;
  state: Extract<StudioAssistantOperationState, "FAILED" | "SUCCEEDED">;
}): Promise<StudioAssistantOperation> {
  const now = new Date();
  const [updated] = await (await getStudioDb()).update(studioAssistantOperations).set({
    lastError: input.error ?? null,
    receipt: input.receipt ?? null,
    state: input.state,
    updatedAt: now,
    version: sql`${studioAssistantOperations.version} + 1`,
  }).where(and(
    eq(studioAssistantOperations.id, input.operationId),
    eq(studioAssistantOperations.workspaceId, input.operator.workspaceId),
    eq(studioAssistantOperations.state, "EXECUTING"),
  )).returning();
  return projectStudioAssistantOperation(updated ?? await ownedRow(input.operator, input.operationId));
}

export async function markStudioAssistantOperationIndeterminate(input: {
  error: StudioAssistantOperationError;
  operationId: string;
  operator: StudioOperator;
}): Promise<StudioAssistantOperation> {
  const [updated] = await (await getStudioDb()).update(studioAssistantOperations).set({
    lastError: input.error,
    updatedAt: new Date(),
    version: sql`${studioAssistantOperations.version} + 1`,
  }).where(and(
    eq(studioAssistantOperations.id, input.operationId),
    eq(studioAssistantOperations.workspaceId, input.operator.workspaceId),
    eq(studioAssistantOperations.state, "EXECUTING"),
  )).returning();
  return projectStudioAssistantOperation(updated ?? await ownedRow(input.operator, input.operationId));
}

export async function cancelStudioAssistantOperation(input: {
  expectedVersion: number;
  operationId: string;
  operator: StudioOperator;
}): Promise<StudioAssistantOperation> {
  const current = await ownedRow(input.operator, input.operationId);
  if (current.state === "CANCELLED") return projectStudioAssistantOperation(current);
  if (current.state !== "PREPARED") {
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      "That prepared change can no longer be cancelled.",
      "Review its current receipt in the conversation.",
    );
  }
  if (current.version !== input.expectedVersion) {
    throw new StudioEngineError(
      "VERSION_CONFLICT",
      409,
      "That prepared change was updated in another session.",
      "Refresh the conversation and review it again.",
    );
  }
  const now = new Date();
  const [cancelled] = await (await getStudioDb()).update(studioAssistantOperations).set({
    executedAt: now,
    executedByDisplayName: input.operator.displayName,
    executedByEmail: input.operator.email,
    executedBySubject: input.operator.actorSubject,
    state: "CANCELLED",
    updatedAt: now,
    version: sql`${studioAssistantOperations.version} + 1`,
  }).where(and(
    eq(studioAssistantOperations.id, input.operationId),
    eq(studioAssistantOperations.workspaceId, input.operator.workspaceId),
    eq(studioAssistantOperations.state, "PREPARED"),
    eq(studioAssistantOperations.version, input.expectedVersion),
  )).returning();
  if (!cancelled) return projectStudioAssistantOperation(await ownedRow(input.operator, input.operationId));
  return projectStudioAssistantOperation(cancelled);
}
