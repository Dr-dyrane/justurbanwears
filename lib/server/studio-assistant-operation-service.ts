import { z } from "zod";
import { studioCollectionIntentSchema } from "../studio/collections/contracts";
import { intakeFactsSchema } from "../studio/engine/contracts";
import { StudioEngineError } from "../studio/engine/errors";
import {
  getGarmentLifecycleCommandReceipt,
  getGarmentPermanentDeleteReceipt,
  getGarmentPublishRevisionReceipt,
  permanentlyDeleteGarment,
  runGarmentLifecycleCommand,
} from "../studio/engine/garment-lifecycle-service";
import {
  studioAssistantOperationPreviewSchema,
  type StudioAssistantConfirmOperationCommand,
  type StudioAssistantOperation,
  type StudioAssistantOperationError,
  type StudioAssistantOperationKind,
  type StudioAssistantOperationPreview,
  type StudioAssistantOperationReceipt,
} from "../studio/assistant/tool-contracts";
import {
  applyStudioCollectionCommand,
  getStudioCollectionCommandReceipt,
} from "./studio-collection-repository";
import {
  cancelStudioAssistantOperation,
  finishStudioAssistantOperation,
  getStudioAssistantOperationRow,
  markStudioAssistantOperationIndeterminate,
  projectStudioAssistantOperation,
  startStudioAssistantOperation,
  type StudioAssistantOperationRow,
} from "./studio-assistant-operation-repository";
import type { StudioOperator } from "./studio-operator";

const factsPayloadSchema = z.object({ facts: intakeFactsSchema }).strict();
const dropPayloadSchema = z.object({ intent: studioCollectionIntentSchema }).strict();
const emptyPayloadSchema = z.object({}).strict();

function receipt(input: {
  actor: { displayName: string };
  detail: string;
  nextPrompt?: string | null;
  occurredAt?: string;
  outcome?: StudioAssistantOperationReceipt["outcome"];
  receiptId: string;
  route?: string | null;
  title: string;
}): StudioAssistantOperationReceipt {
  return {
    actor: { displayName: input.actor.displayName },
    detail: input.detail,
    nextPrompt: input.nextPrompt ?? null,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    outcome: input.outcome ?? "APPLIED",
    receiptId: input.receiptId,
    route: input.route ?? null,
    title: input.title,
  };
}

function operationError(error: unknown): StudioAssistantOperationError {
  if (error instanceof StudioEngineError) {
    const stale = error.code === "VERSION_CONFLICT" || error.code === "INVALID_TRANSITION";
    return { code: stale ? "STALE" : error.code, message: error.message, recovery: error.recovery };
  }
  return {
    code: "ENGINE_UNAVAILABLE",
    message: "Studio could not prove whether that change finished.",
    recovery: "Keep this conversation open while Ask Studio reconciles the existing operation. Do not prepare a duplicate.",
  };
}

function indeterminateError(row: StudioAssistantOperationRow): StudioAssistantOperationError {
  return {
    code: "INDETERMINATE",
    message: `Studio has no read-only receipt proving whether this ${row.kind.toLocaleLowerCase("en-US").replaceAll("_", " ")} finished.`,
    recovery: "Do not prepare or confirm a duplicate. Keep this exact operation and reconcile it through its owning Studio workflow.",
  };
}

function isDefinitiveFailure(error: unknown): error is StudioEngineError {
  return error instanceof StudioEngineError && [
    "AUTH_REQUIRED",
    "INTAKE_NOT_FOUND",
    "INVALID_REQUEST",
    "INVALID_TRANSITION",
    "OPERATOR_FORBIDDEN",
    "VERSION_CONFLICT",
  ].includes(error.code);
}

const confirmationByKind = {
  ARCHIVE: "ARCHIVE",
  DROP_MOVE: "MOVE_DROP",
  PERMANENT_DELETE: "DELETE_PERMANENTLY",
  PIECE_EDIT: "SAVE_PRIVATE_REVISION",
  PUBLISH_REVISION: "PUBLISH_REVISION",
} as const satisfies Record<StudioAssistantOperationKind, StudioAssistantConfirmOperationCommand["confirmation"]>;

export function assertStudioAssistantOperationConfirmation(
  kind: StudioAssistantOperationKind,
  preview: StudioAssistantOperationPreview,
  command: StudioAssistantConfirmOperationCommand,
): void {
  if (command.confirmation !== confirmationByKind[kind]) {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      409,
      "That confirmation does not match the reviewed Ask Studio change.",
      "Reopen the review and confirm its exact action.",
    );
  }
  if (kind === "PUBLISH_REVISION" && (
    command.confirmation !== "PUBLISH_REVISION"
    || command.publicMediaConfirmed !== true
    || !preview.media
    || preview.media.length === 0
  )) {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      409,
      "That publication review does not include the exact approved media set.",
      "Prepare the publication again and review its approved media before confirming.",
    );
  }
}

function executionActor(row: StudioAssistantOperationRow) {
  return {
    displayName: row.executedByDisplayName ?? row.createdByDisplayName,
  };
}

async function inspectOperationReceipt(
  row: StudioAssistantOperationRow,
  operator: StudioOperator,
): Promise<StudioAssistantOperationReceipt | null> {
  if (row.kind === "PIECE_EDIT" || row.kind === "ARCHIVE") {
    const domain = await getGarmentLifecycleCommandReceipt({
      idempotencyKey: row.idempotencyKey,
      operator,
      wardrobeItemId: row.targetId,
    });
    return domain ? receipt({
      actor: executionActor(row),
      detail: domain.consequence,
      occurredAt: domain.occurredAt,
      outcome: "RECONCILED",
      receiptId: domain.receiptId,
      route: row.kind === "ARCHIVE" ? "/studio/wardrobe?collection=archived" : row.targetHref,
      title: domain.summary,
    }) : null;
  }
  if (row.kind === "PUBLISH_REVISION") {
    const domain = await getGarmentPublishRevisionReceipt({
      idempotencyKey: row.idempotencyKey,
      operator,
      wardrobeItemId: row.targetId,
    });
    return domain ? receipt({
      actor: executionActor(row),
      detail: "The reviewed private facts are live in Shop with the exact approved catalogue photo set.",
      occurredAt: domain.publishedAt,
      outcome: "RECONCILED",
      receiptId: domain.idempotencyKey,
      route: row.targetHref,
      title: "Revision published",
    }) : null;
  }
  if (row.kind === "DROP_MOVE") {
    if (!row.executedBySubject) return null;
    const domain = await getStudioCollectionCommandReceipt({
      idempotencyKey: row.idempotencyKey,
      operatorSubject: row.executedBySubject,
    });
    return domain ? receipt({
      actor: executionActor(row),
      detail: domain.consequence,
      occurredAt: domain.occurredAt,
      outcome: "RECONCILED",
      receiptId: domain.id,
      route: domain.nextRoute,
      title: "Drop changed",
    }) : null;
  }
  if (row.kind !== "PERMANENT_DELETE") return null;
  const deletion = await getGarmentPermanentDeleteReceipt({
    idempotencyKey: row.idempotencyKey,
    operator,
    wardrobeItemId: row.targetId,
  });
  return deletion ? receipt({
    actor: executionActor(row),
    detail: deletion.consequence,
    occurredAt: deletion.deletedAt,
    outcome: "RECONCILED",
    receiptId: row.idempotencyKey,
    route: "/studio/wardrobe?collection=archived",
    title: "Garment permanently deleted",
  }) : null;
}

async function executeOperation(
  row: StudioAssistantOperationRow,
  operator: StudioOperator,
  confirmation: StudioAssistantConfirmOperationCommand,
): Promise<StudioAssistantOperationReceipt> {
  if (row.kind === "PIECE_EDIT") {
    const payload = factsPayloadSchema.parse(row.payload);
    if (!row.expectedVersion) throw new StudioEngineError("INVALID_REQUEST", 409, "That edit has no expected version.", "Prepare it again.");
    const workspace = await runGarmentLifecycleCommand({
      command: {
        command: "SAVE_FACTS",
        expectedVersion: row.expectedVersion,
        facts: payload.facts,
        idempotencyKey: row.idempotencyKey,
      },
      operator,
      wardrobeItemId: row.targetId,
    });
    const domain = await getGarmentLifecycleCommandReceipt({
      idempotencyKey: row.idempotencyKey,
      operator,
      wardrobeItemId: row.targetId,
    });
    if (!domain) throw new Error("The saved garment revision has no durable command receipt.");
    return receipt({
      actor: operator,
      detail: domain.consequence,
      nextPrompt: workspace.draft ? `Publish the current private revision for ${row.targetReference}.` : null,
      occurredAt: domain.occurredAt,
      receiptId: domain.receiptId,
      route: row.targetHref,
      title: domain.summary,
    });
  }
  if (row.kind === "PUBLISH_REVISION") {
    if (confirmation.confirmation !== "PUBLISH_REVISION") {
      throw new StudioEngineError("INVALID_REQUEST", 409, "That publication confirmation is invalid.", "Review the publication again.");
    }
    if (!row.expectedRevision) throw new StudioEngineError("INVALID_REQUEST", 409, "That revision has no exact review hash.", "Prepare it again.");
    await runGarmentLifecycleCommand({
      command: {
        command: "PUBLISH_REVISION",
        confirmation: confirmation.confirmation,
        expectedRevision: row.expectedRevision,
        idempotencyKey: row.idempotencyKey,
        publicMediaConfirmed: confirmation.publicMediaConfirmed,
      },
      operator,
      wardrobeItemId: row.targetId,
    });
    const domain = await getGarmentPublishRevisionReceipt({
      idempotencyKey: row.idempotencyKey,
      operator,
      wardrobeItemId: row.targetId,
    });
    if (!domain) throw new Error("The published revision has no durable command receipt.");
    return receipt({
      actor: operator,
      detail: "The reviewed private facts are now live in Shop. The approved catalogue photo set was preserved.",
      occurredAt: domain.publishedAt,
      receiptId: domain.idempotencyKey,
      route: row.targetHref,
      title: "Revision published",
    });
  }
  if (row.kind === "DROP_MOVE") {
    const payload = dropPayloadSchema.parse(row.payload);
    if (!row.expectedRevision) throw new StudioEngineError("INVALID_REQUEST", 409, "That drop move has no exact review hash.", "Prepare it again.");
    const domain = await applyStudioCollectionCommand({
      expectedRevision: row.expectedRevision,
      idempotencyKey: row.idempotencyKey,
      intent: payload.intent,
      operator,
    });
    return receipt({
      actor: operator,
      detail: domain.consequence,
      occurredAt: domain.occurredAt,
      outcome: domain.replayed ? "REPLAYED" : "APPLIED",
      receiptId: domain.id,
      route: domain.nextRoute,
      title: "Drop changed",
    });
  }
  if (row.kind === "ARCHIVE") {
    if (confirmation.confirmation !== "ARCHIVE") {
      throw new StudioEngineError("INVALID_REQUEST", 409, "That archive confirmation is invalid.", "Review the archive again.");
    }
    emptyPayloadSchema.parse(row.payload);
    if (!row.expectedVersion) throw new StudioEngineError("INVALID_REQUEST", 409, "That archive has no expected version.", "Prepare it again.");
    await runGarmentLifecycleCommand({
      command: {
        command: "ARCHIVE",
        confirmation: confirmation.confirmation,
        expectedVersion: row.expectedVersion,
        idempotencyKey: row.idempotencyKey,
      },
      operator,
      wardrobeItemId: row.targetId,
    });
    const domain = await getGarmentLifecycleCommandReceipt({
      idempotencyKey: row.idempotencyKey,
      operator,
      wardrobeItemId: row.targetId,
    });
    if (!domain) throw new Error("The archived garment has no durable command receipt.");
    return receipt({
      actor: operator,
      detail: domain.consequence,
      occurredAt: domain.occurredAt,
      receiptId: domain.receiptId,
      route: "/studio/wardrobe?collection=archived",
      title: domain.summary,
    });
  }
  if (confirmation.confirmation !== "DELETE_PERMANENTLY") {
    throw new StudioEngineError("INVALID_REQUEST", 409, "That deletion confirmation is invalid.", "Review the permanent deletion again.");
  }
  emptyPayloadSchema.parse(row.payload);
  if (!row.expectedVersion) throw new StudioEngineError("INVALID_REQUEST", 409, "That deletion has no expected version.", "Prepare it again.");
  const domain = await permanentlyDeleteGarment({
    command: {
      confirmation: confirmation.confirmation,
      expectedVersion: row.expectedVersion,
      idempotencyKey: row.idempotencyKey,
    },
    operator,
    wardrobeItemId: row.targetId,
  });
  return receipt({
    actor: operator,
    detail: domain.consequence,
    occurredAt: domain.deletedAt,
    receiptId: row.idempotencyKey,
    route: "/studio/wardrobe?collection=archived",
    title: "Garment permanently deleted",
  });
}

export async function reconcileStudioAssistantOperation(
  operator: StudioOperator,
  operationId: string,
): Promise<StudioAssistantOperation> {
  const row = await getStudioAssistantOperationRow(operator, operationId);
  if (row.state !== "EXECUTING") return projectStudioAssistantOperation(row);
  const reconciled = await inspectOperationReceipt(row, operator);
  const operation = projectStudioAssistantOperation(row);
  return reconciled
    ? { ...operation, lastError: null, receipt: reconciled, state: "SUCCEEDED" }
    : { ...operation, lastError: operation.lastError ?? indeterminateError(row) };
}

export async function persistReconciledStudioAssistantOperation(input: {
  expectedVersion: number;
  operationId: string;
  operator: StudioOperator;
}): Promise<StudioAssistantOperation> {
  const row = await getStudioAssistantOperationRow(input.operator, input.operationId);
  if (row.state !== "EXECUTING") return projectStudioAssistantOperation(row);
  if (row.version !== input.expectedVersion) {
    throw new StudioEngineError(
      "VERSION_CONFLICT",
      409,
      "That operation changed in another session.",
      "Refresh the conversation and review its current receipt.",
    );
  }
  const reconciled = await inspectOperationReceipt(row, input.operator);
  if (!reconciled) {
    const operation = projectStudioAssistantOperation(row);
    return { ...operation, lastError: operation.lastError ?? indeterminateError(row) };
  }
  return finishStudioAssistantOperation({
    operationId: row.id,
    operator: input.operator,
    receipt: reconciled,
    state: "SUCCEEDED",
  });
}

export async function confirmStudioAssistantOperation(input: {
  command: StudioAssistantConfirmOperationCommand;
  expectedVersion: number;
  operationId: string;
  operator: StudioOperator;
}): Promise<StudioAssistantOperation> {
  const prepared = await getStudioAssistantOperationRow(input.operator, input.operationId);
  assertStudioAssistantOperationConfirmation(
    prepared.kind,
    studioAssistantOperationPreviewSchema.parse(prepared.preview),
    input.command,
  );
  const started = await startStudioAssistantOperation(input);
  if (!started.acquired) {
    if (started.row.state === "EXECUTING") {
      const reconciled = await reconcileStudioAssistantOperation(input.operator, input.operationId);
      if (reconciled.state === "SUCCEEDED" && reconciled.receipt) {
        return finishStudioAssistantOperation({
          operationId: started.row.id,
          operator: input.operator,
          receipt: reconciled.receipt,
          state: "SUCCEEDED",
        });
      }
      return reconciled;
    }
    return projectStudioAssistantOperation(started.row);
  }
  try {
    const applied = await executeOperation(started.row, input.operator, input.command);
    return finishStudioAssistantOperation({
      operationId: started.row.id,
      operator: input.operator,
      receipt: applied,
      state: "SUCCEEDED",
    });
  } catch (error) {
    try {
      const reconciled = await inspectOperationReceipt(started.row, input.operator);
      if (reconciled) {
        return finishStudioAssistantOperation({
          operationId: started.row.id,
          operator: input.operator,
          receipt: reconciled,
          state: "SUCCEEDED",
        });
      }
    } catch {
      // Receipt inspection is deliberately read-only. The original execution
      // remains the primary error and no command is replayed here.
    }
    if (isDefinitiveFailure(error)) {
      return finishStudioAssistantOperation({
        error: operationError(error),
        operationId: started.row.id,
        operator: input.operator,
        state: "FAILED",
      });
    }
    return markStudioAssistantOperationIndeterminate({
      error: indeterminateError(started.row),
      operationId: started.row.id,
      operator: input.operator,
    });
  }
}

export async function cancelPreparedStudioAssistantOperation(input: {
  expectedVersion: number;
  operationId: string;
  operator: StudioOperator;
}) {
  return cancelStudioAssistantOperation(input);
}

export async function readStudioAssistantOperation(
  operator: StudioOperator,
  operationId: string,
) {
  return reconcileStudioAssistantOperation(operator, operationId);
}
