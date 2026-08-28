import { studioGatewayPolicy } from "../../ai/studio-gateway";
import {
  claimGenerationCommand,
  createOrReuseGeneration,
  findGenerationByFingerprint,
  getOwnedWardrobeItem,
  updateGeneration,
} from "../../server/studio-intake-repository";
import type { StudioOperator } from "../../server/studio-operator";
import {
  claimLegacyStudioEngineWork,
  legacyStageFamilyForGarmentSetSlot,
} from "../../server/studio-engine-work-ownership-service";
import { StudioEngineError } from "./errors";
import { sha256 } from "./fingerprint";
import type {
  GarmentSetCommand,
  GarmentSetNextAction,
  GarmentSetSlot,
  GarmentSetSlotState,
  GarmentSetWorkspace,
} from "./garment-set-contracts";
import {
  createMediaCompletion,
  decideMediaCompletion,
  readLatestMediaCompletion,
} from "./media-completion-service";
import {
  decideWearCandidate,
  generateWearCandidate,
  getWearWorkspace,
} from "./wear-service";

function mediaState(state?: string): GarmentSetSlotState {
  if (!state) return "MISSING";
  if (state === "PENDING" || state === "RUNNING") return "BUILDING";
  if (state === "COMPLETE") return "REVIEW";
  if (state === "APPROVED") return "KEPT";
  return "FAILED";
}

function latest<T>(values: T[]): T | undefined {
  return values.at(-1);
}

function currentSlot(slots: GarmentSetSlot[]): GarmentSetSlot | null {
  return slots.find((slot) => slot.state === "REVIEW")
    ?? slots.find((slot) => slot.state === "BUILDING")
    ?? slots.find((slot) => slot.state !== "KEPT")
    ?? null;
}

function nextActionFor(slot: GarmentSetSlot | null): GarmentSetNextAction {
  if (!slot) return "DONE";
  if (slot.state === "REVIEW") return "REVIEW";
  if (slot.state === "BUILDING") return "WAIT";
  if (slot.state === "WAITING" || (slot.state === "FAILED" && !slot.canRetry)) return "BLOCKED";
  return "ADVANCE";
}

function actionLabel(slot: GarmentSetSlot | null, action: GarmentSetNextAction): string {
  if (!slot) return "Front set ready";
  if (action === "REVIEW") return `Review ${slot.label.toLowerCase()}`;
  if (action === "WAIT") return `Preparing ${slot.label.toLowerCase()}`;
  if (slot.requiresReconciliation) return "Reconciliation required";
  if (action === "BLOCKED") return `Add ${slot.label.toLowerCase()} evidence`;
  if (slot.state === "FAILED") return `Try ${slot.label.toLowerCase()} again`;
  return `Make ${slot.label.toLowerCase()}`;
}

function missingEvidenceFor(slot: GarmentSetSlot | null): string | null {
  if (!slot || (slot.state !== "WAITING" && !(slot.state === "FAILED" && !slot.canRetry))) return null;
  if (slot.requiresReconciliation) {
    return "Studio cannot confirm the provider result. An administrator must reconcile this saved attempt; no retry will run.";
  }
  if (slot.key === "LULU_TRY_ON") return "Current approved Lulu authority";
  if (slot.key === "GARMENT_BACK") return "A clear full-back photo";
  if (slot.key === "FABRIC_DETAIL") return "A clear fabric close-up";
  return `A source for ${slot.label.toLowerCase()}`;
}

function workspaceRevision(slots: GarmentSetSlot[]): string {
  return sha256(JSON.stringify(slots.map((slot) => ({
    key: slot.key,
    state: slot.state,
    jobId: slot.jobId ?? null,
    assetUrl: slot.assetUrl ?? null,
    canRetry: slot.canRetry ?? null,
    requiresReconciliation: slot.requiresReconciliation ?? false,
  })))).slice(0, 24);
}

function approvedLulu(models: Array<{ id: string; kind: string }>) {
  return models.find((model) => model.kind === "LULU_V3");
}

function assertCommandOwnership(
  command: { parameters: Record<string, unknown> },
  input: GarmentSetCommand,
  payloadHash: string,
) {
  if (
    command.parameters.idempotencyKey !== input.idempotencyKey
    || command.parameters.payloadHash !== payloadHash
  ) {
    throw new StudioEngineError(
      "VERSION_CONFLICT",
      409,
      "Another Genesis action owns this saved step.",
      "Continue from the current saved step.",
    );
  }
}

export async function readGarmentSet(
  wardrobeItemId: string,
  operator: StudioOperator,
): Promise<GarmentSetWorkspace> {
  const item = await getOwnedWardrobeItem(wardrobeItemId, operator.subject);
  if (!item.approvedAssetId) {
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      "Keep the product front first.",
      "Review the garment front, then continue in Atelier.",
    );
  }

  const [backResult, detailResult, wear] = await Promise.all([
    readLatestMediaCompletion({
      target: { kind: "WARDROBE_ITEM", key: wardrobeItemId },
      role: "GARMENT_BACK",
      operator,
    }),
    readLatestMediaCompletion({
      target: { kind: "WARDROBE_ITEM", key: wardrobeItemId },
      role: "FABRIC_DETAIL",
      operator,
    }),
    getWearWorkspace(wardrobeItemId, operator),
  ]);

  const lulu = approvedLulu(wear.models);
  const mannequin = latest(wear.generations.filter((generation) => generation.operation === "MANNEQUIN_FRONT"));
  const luluTryOn = latest(wear.generations.filter((generation) =>
    generation.operation === "MODEL_TRY_ON" && generation.modelProfileId === lulu?.id
  ));
  const back = backResult.job;
  const detail = detailResult.job;
  const slots: GarmentSetSlot[] = [
    {
      key: "GARMENT_FRONT",
      view: "01",
      label: "Product front",
      state: "KEPT",
      assetUrl: wear.garmentAssetUrl,
    },
    {
      key: "GARMENT_BACK",
      view: "02",
      label: "Product back",
      state: mediaState(back?.state),
      ...(back?.assetUrl ? { assetUrl: back.assetUrl } : {}),
      ...(back ? {
        jobId: back.id,
        canRetry: back.canRetry,
        requiresReconciliation: back.requiresReconciliation,
      } : {}),
      inferred: back?.sourceMode === "APPROVED_FRONT",
    },
    {
      key: "MANNEQUIN_FRONT",
      view: "03",
      label: "Mannequin front",
      state: mediaState(mannequin?.state),
      ...(mannequin?.outputUrl ? { assetUrl: mannequin.outputUrl } : {}),
      ...(mannequin ? {
        jobId: mannequin.id,
        canRetry: mannequin.retryAvailable,
        requiresReconciliation: mannequin.requiresReconciliation,
      } : {}),
    },
    {
      key: "FABRIC_DETAIL",
      view: "04",
      label: "Fabric detail",
      state: mediaState(detail?.state),
      ...(detail?.assetUrl ? { assetUrl: detail.assetUrl } : {}),
      ...(detail ? {
        jobId: detail.id,
        canRetry: detail.canRetry,
        requiresReconciliation: detail.requiresReconciliation,
      } : {}),
      inferred: detail?.sourceMode === "APPROVED_FRONT",
    },
    {
      key: "LULU_TRY_ON",
      view: "05",
      label: "Lulu front",
      state: lulu ? mediaState(luluTryOn?.state) : "WAITING",
      ...(luluTryOn?.outputUrl ? { assetUrl: luluTryOn.outputUrl } : {}),
      ...(luluTryOn ? {
        jobId: luluTryOn.id,
        canRetry: luluTryOn.retryAvailable,
        requiresReconciliation: luluTryOn.requiresReconciliation,
      } : {}),
    },
  ];

  const active = currentSlot(slots);
  const nextAction = nextActionFor(active);
  const kept = slots.filter((slot) => slot.state === "KEPT").length;
  const state = nextAction === "DONE"
    ? "COMPLETE"
    : nextAction === "REVIEW"
      ? "REVIEW"
      : nextAction === "WAIT"
        ? "BUILDING"
        : nextAction === "BLOCKED"
          ? "BLOCKED"
          : "INCOMPLETE";
  const stage = nextAction === "DONE"
    ? "COMPLETE"
    : active?.key === "LULU_TRY_ON"
      ? "LULU"
      : "PRODUCT";

  return {
    id: sha256(`${item.id}:${item.approvedAssetId}:garment-genesis-v1`).slice(0, 24),
    wardrobeItemId,
    title: item.title,
    state,
    stage,
    slots,
    currentSlotKey: active?.key ?? null,
    nextAction,
    nextActionLabel: actionLabel(active, nextAction),
    progress: {
      kept,
      total: slots.length,
      percent: Math.round((kept / slots.length) * 100),
    },
    missingEvidence: missingEvidenceFor(active),
    receipt: nextAction === "DONE" ? {
      title: "Front set ready",
      detail: `${slots.length} views kept. Profile and rear three-quarter remain separate Atelier views from the accepted Lulu front.`,
      visibility: "PRIVATE",
    } : null,
    revision: workspaceRevision(slots),
    maxAdditionalCostUsd: nextAction === "ADVANCE"
      ? studioGatewayPolicy.imageCostCapUsd.toFixed(3)
      : "0.000",
  };
}

function assertCurrentCommand(
  workspace: GarmentSetWorkspace,
  input: GarmentSetCommand,
): GarmentSetSlot {
  if (input.expectedRevision !== workspace.revision) {
    throw new StudioEngineError(
      "VERSION_CONFLICT",
      409,
      "This Genesis task changed.",
      "Continue from the current saved step.",
    );
  }
  const slot = workspace.slots.find((candidate) => candidate.key === workspace.currentSlotKey);
  if (!slot) {
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      "This front set is already ready.",
      "Continue with profile and rear three-quarter in Atelier.",
    );
  }
  return slot;
}

async function advanceCurrent(
  wardrobeItemId: string,
  operator: StudioOperator,
  slot: GarmentSetSlot,
  requestId: string,
  correction?: string,
  correctionReceipt?: {
    generationId: string;
    receiptId: string;
  },
) {
  if (slot.key === "GARMENT_BACK" || slot.key === "FABRIC_DETAIL") {
    await createMediaCompletion({
      target: { kind: "WARDROBE_ITEM", key: wardrobeItemId },
      role: slot.key,
      sourceMode: "APPROVED_FRONT",
      operator,
      ...(correction ? { correction } : {}),
    });
    return;
  }
  if (slot.key === "MANNEQUIN_FRONT") {
    await generateWearCandidate({
      wardrobeItemId,
      operator,
      requestId,
      operation: "MANNEQUIN_FRONT",
      ...(correction ? { correction } : {}),
      ...(correctionReceipt ? {
        correctionGenerationId: correctionReceipt.generationId,
        decisionReceiptId: correctionReceipt.receiptId,
      } : {}),
    });
    return;
  }
  if (slot.key === "LULU_TRY_ON") {
    const wear = await getWearWorkspace(wardrobeItemId, operator);
    const lulu = approvedLulu(wear.models);
    if (!lulu) {
      throw new StudioEngineError(
        "INVALID_TRANSITION",
        409,
        "Lulu is not ready in Studio.",
        "Approve the current Lulu authority in Models.",
      );
    }
    await generateWearCandidate({
      wardrobeItemId,
      operator,
      requestId,
      operation: "MODEL_TRY_ON",
      modelProfileId: lulu.id,
      ...(correction ? { correction } : {}),
      ...(correctionReceipt ? {
        correctionGenerationId: correctionReceipt.generationId,
        decisionReceiptId: correctionReceipt.receiptId,
      } : {}),
    });
  }
}

async function decideCurrent(
  wardrobeItemId: string,
  operator: StudioOperator,
  slot: GarmentSetSlot,
  decision: "KEEP" | "REJECT",
) {
  if (!slot.jobId) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "That view is not ready.", "Open the current saved step.");
  }
  if (slot.key === "GARMENT_BACK" || slot.key === "FABRIC_DETAIL") {
    await decideMediaCompletion({
      target: { kind: "WARDROBE_ITEM", key: wardrobeItemId },
      jobId: slot.jobId,
      operator,
      decision,
      ...(decision === "KEEP" && slot.inferred ? { truthConfirmed: true } : {}),
    });
    return;
  }
  await decideWearCandidate({
    wardrobeItemId,
    generationId: slot.jobId,
    operator,
    decision,
  });
}

async function fixCurrent(
  wardrobeItemId: string,
  operator: StudioOperator,
  slot: GarmentSetSlot,
  correction: string,
  requestId: string,
) {
  if (!slot.jobId) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "That view is not ready.", "Open the current saved step.");
  }
  if (slot.key === "GARMENT_BACK" || slot.key === "FABRIC_DETAIL") {
    await decideMediaCompletion({
      target: { kind: "WARDROBE_ITEM", key: wardrobeItemId },
      jobId: slot.jobId,
      operator,
      decision: "RETRY",
      correction,
    });
    return;
  }
  const decisionWorkspace = await decideWearCandidate({
    wardrobeItemId,
    generationId: slot.jobId,
    operator,
    decision: "EDIT",
    note: correction,
  });
  const decisionReceipt = decisionWorkspace.generations.find(
    (generation) => generation.id === slot.jobId,
  )?.decisionReceipt;
  if (
    !decisionReceipt
    || decisionReceipt.generationId !== slot.jobId
    || decisionReceipt.decision !== "EDIT"
  ) {
    throw new StudioEngineError(
      "ENGINE_UNAVAILABLE",
      503,
      "Studio could not confirm the saved correction decision.",
      "Reload this Genesis task before retrying. No generation was started.",
    );
  }
  await advanceCurrent(
    wardrobeItemId,
    operator,
    slot,
    requestId,
    correction,
    {
      generationId: decisionReceipt.generationId,
      receiptId: decisionReceipt.receiptId,
    },
  );
}

export async function commandGarmentSet(
  wardrobeItemId: string,
  operator: StudioOperator,
  input: GarmentSetCommand,
): Promise<GarmentSetWorkspace> {
  const item = await getOwnedWardrobeItem(wardrobeItemId, operator.subject);
  const before = await readGarmentSet(wardrobeItemId, operator);
  const payloadHash = sha256(JSON.stringify({
    command: input.command,
    expectedRevision: input.expectedRevision,
    correction: input.command === "FIX_CURRENT" ? input.correction : null,
    costConfirmed: input.command === "ADVANCE_CURRENT" ? input.costConfirmed : null,
  }));
  const commandFingerprint = sha256(`garment-genesis-command-v1:${wardrobeItemId}:${input.expectedRevision}`);
  const existingCommand = await findGenerationByFingerprint({
    intakeId: item.intakeId,
    fingerprint: commandFingerprint,
  });

  if (existingCommand) {
    assertCommandOwnership(existingCommand, input, payloadHash);
    if (existingCommand.state === "COMPLETE" || existingCommand.state === "RUNNING") return before;
  }

  const ownershipSlot = assertCurrentCommand(before, input);
  await claimLegacyStudioEngineWork({
    operatorSubject: operator.subject,
    wardrobeItemId,
    stageFamily: legacyStageFamilyForGarmentSetSlot(ownershipSlot.key),
  });
  const commandJob = existingCommand ?? await createOrReuseGeneration({
    intakeId: item.intakeId,
    operation: "GENESIS_COMMAND",
    state: "PENDING",
    model: "studio-command",
    promptVersion: "garment-genesis-command-v1",
    promptHash: payloadHash,
    sourceAssetIds: [],
    sourceHashes: [],
    fingerprint: commandFingerprint,
    parameters: {
      command: input.command,
      expectedRevision: input.expectedRevision,
      idempotencyKey: input.idempotencyKey,
      payloadHash,
    },
  });
  assertCommandOwnership(commandJob, input, payloadHash);
  if (!(await claimGenerationCommand(commandJob.id))) return readGarmentSet(wardrobeItemId, operator);

  try {
    const currentWorkspace = await readGarmentSet(wardrobeItemId, operator);
    const currentSlot = assertCurrentCommand(currentWorkspace, input);
    if (input.command === "ADVANCE_CURRENT") {
      if (currentWorkspace.nextAction !== "ADVANCE") {
        throw new StudioEngineError("INVALID_TRANSITION", 409, "That step is already underway.", "Continue from the current saved step.");
      }
      await advanceCurrent(wardrobeItemId, operator, currentSlot, commandJob.id);
    } else if (input.command === "KEEP_CURRENT") {
      if (currentWorkspace.nextAction !== "REVIEW") {
        throw new StudioEngineError("INVALID_TRANSITION", 409, "That view is not awaiting review.", "Continue from the current saved step.");
      }
      await decideCurrent(wardrobeItemId, operator, currentSlot, "KEEP");
    } else if (input.command === "FIX_CURRENT") {
      if (currentWorkspace.nextAction !== "REVIEW") {
        throw new StudioEngineError("INVALID_TRANSITION", 409, "That view is not awaiting review.", "Continue from the current saved step.");
      }
      await fixCurrent(wardrobeItemId, operator, currentSlot, input.correction, commandJob.id);
    } else {
      if (currentWorkspace.nextAction !== "REVIEW") {
        throw new StudioEngineError("INVALID_TRANSITION", 409, "That view is not awaiting review.", "Continue from the current saved step.");
      }
      await decideCurrent(wardrobeItemId, operator, currentSlot, "REJECT");
    }
    await updateGeneration(commandJob.id, { state: "COMPLETE", errorCode: null });
    return readGarmentSet(wardrobeItemId, operator);
  } catch (error) {
    await updateGeneration(commandJob.id, {
      state: "FAILED",
      errorCode: error instanceof StudioEngineError ? error.code : "ENGINE_UNAVAILABLE",
    });
    throw error;
  }
}
