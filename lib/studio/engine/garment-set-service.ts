import type { StudioOperator } from "../../server/studio-operator";
import { getOwnedWardrobeItem } from "../../server/studio-intake-repository";
import { createMediaCompletion, readLatestMediaCompletion } from "./media-completion-service";
import { generateWearCandidate, getWearWorkspace } from "./wear-service";
import { sha256 } from "./fingerprint";
import { StudioEngineError } from "./errors";
import type {
  GarmentSetSlot,
  GarmentSetSlotState,
  GarmentSetWorkspace,
} from "./garment-set-contracts";
import { studioGatewayPolicy } from "../../ai/studio-gateway";

function mediaState(state?: string): GarmentSetSlotState {
  if (!state) return "MISSING";
  if (state === "PENDING" || state === "RUNNING") return "BUILDING";
  if (state === "COMPLETE") return "REVIEW";
  if (state === "APPROVED") return "KEPT";
  return "FAILED";
}

function wearState(state?: string): GarmentSetSlotState {
  return mediaState(state);
}

function latest<T>(values: T[]): T | undefined {
  return values.at(-1);
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
      "Review the garment front, then build the set.",
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

  const lulu = wear.models.find((model) => model.kind === "LULU_V3");
  const mannequin = latest(wear.generations.filter((generation) => generation.operation === "MANNEQUIN_FRONT"));
  const luluTryOn = latest(wear.generations.filter((generation) =>
    generation.operation === "MODEL_TRY_ON" && generation.modelProfileId === lulu?.id
  ));
  const editorial = latest(wear.generations.filter((generation) =>
    generation.operation === "EDITORIAL_MODEL" && generation.modelProfileId === lulu?.id
  ));

  const back = backResult.job;
  const detail = detailResult.job;
  const slots: GarmentSetSlot[] = [
    {
      key: "GARMENT_FRONT",
      label: "Product front",
      state: "KEPT",
      assetUrl: wear.garmentAssetUrl,
    },
    {
      key: "GARMENT_BACK",
      label: "Product back",
      state: mediaState(back?.state),
      ...(back?.assetUrl ? { assetUrl: back.assetUrl } : {}),
      ...(back ? { jobId: back.id, canRetry: back.canRetry } : {}),
      inferred: back?.sourceMode === "APPROVED_FRONT",
    },
    {
      key: "FABRIC_DETAIL",
      label: "Fabric detail",
      state: mediaState(detail?.state),
      ...(detail?.assetUrl ? { assetUrl: detail.assetUrl } : {}),
      ...(detail ? { jobId: detail.id, canRetry: detail.canRetry } : {}),
      inferred: detail?.sourceMode === "APPROVED_FRONT",
    },
    {
      key: "MANNEQUIN_FRONT",
      label: "On mannequin",
      state: wearState(mannequin?.state),
      ...(mannequin?.outputUrl ? { assetUrl: mannequin.outputUrl } : {}),
      ...(mannequin ? { jobId: mannequin.id, canRetry: mannequin.retryAvailable } : {}),
    },
    {
      key: "LULU_TRY_ON",
      label: "On Lulu",
      state: lulu ? wearState(luluTryOn?.state) : "WAITING",
      ...(luluTryOn?.outputUrl ? { assetUrl: luluTryOn.outputUrl } : {}),
      ...(luluTryOn ? { jobId: luluTryOn.id, canRetry: luluTryOn.retryAvailable } : {}),
    },
    {
      key: "EDITORIAL_LULU",
      label: "Editorial",
      state: luluTryOn?.state === "APPROVED" ? wearState(editorial?.state) : "WAITING",
      ...(editorial?.outputUrl ? { assetUrl: editorial.outputUrl } : {}),
      ...(editorial ? { jobId: editorial.id, canRetry: editorial.retryAvailable } : {}),
    },
  ];

  const actionableSlots = slots.filter((slot) => slot.key !== "GARMENT_FRONT");
  const state = actionableSlots.every((slot) => slot.state === "KEPT")
    ? "COMPLETE"
    : actionableSlots.some((slot) => slot.state === "BUILDING")
      ? "BUILDING"
      : actionableSlots.some((slot) => slot.state === "REVIEW")
        ? "REVIEW"
        : "INCOMPLETE";
  const maxCalls = actionableSlots.filter((slot) =>
    slot.state === "MISSING" || (slot.state === "FAILED" && slot.canRetry)
  ).length;

  return {
    id: sha256(`${item.id}:${item.version}:${item.approvedAssetId}`).slice(0, 24),
    wardrobeItemId,
    title: item.title,
    state,
    slots,
    nextAction: state === "COMPLETE" ? "DONE" : state === "REVIEW" ? "REVIEW" : "BUILD",
    maxAdditionalCostUsd: (maxCalls * studioGatewayPolicy.imageCostCapUsd).toFixed(3),
  };
}

export async function startGarmentSet(
  wardrobeItemId: string,
  operator: StudioOperator,
): Promise<GarmentSetWorkspace> {
  const before = await readGarmentSet(wardrobeItemId, operator);
  const wear = await getWearWorkspace(wardrobeItemId, operator);
  const lulu = wear.models.find((model) => model.kind === "LULU_V3");
  const luluTryOn = latest(wear.generations.filter((generation) =>
    generation.operation === "MODEL_TRY_ON" && generation.modelProfileId === lulu?.id
  ));
  const tasks: Promise<unknown>[] = [];

  const canStart = (key: GarmentSetSlot["key"]) => {
    const slot = before.slots.find((candidate) => candidate.key === key);
    return slot?.state === "MISSING" || (slot?.state === "FAILED" && slot.canRetry === true);
  };

  if (canStart("GARMENT_BACK")) {
    tasks.push(createMediaCompletion({
      target: { kind: "WARDROBE_ITEM", key: wardrobeItemId },
      role: "GARMENT_BACK",
      sourceMode: "APPROVED_FRONT",
      operator,
    }));
  }
  if (canStart("FABRIC_DETAIL")) {
    tasks.push(createMediaCompletion({
      target: { kind: "WARDROBE_ITEM", key: wardrobeItemId },
      role: "FABRIC_DETAIL",
      sourceMode: "APPROVED_FRONT",
      operator,
    }));
  }
  if (canStart("MANNEQUIN_FRONT")) {
    tasks.push(generateWearCandidate({ wardrobeItemId, operator, operation: "MANNEQUIN_FRONT" }));
  }
  if (lulu && canStart("LULU_TRY_ON")) {
    tasks.push(generateWearCandidate({
      wardrobeItemId,
      operator,
      operation: "MODEL_TRY_ON",
      modelProfileId: lulu.id,
    }));
  }
  if (luluTryOn?.state === "APPROVED" && canStart("EDITORIAL_LULU")) {
    tasks.push(generateWearCandidate({
      wardrobeItemId,
      operator,
      operation: "EDITORIAL_MODEL",
      parentGenerationId: luluTryOn.id,
    }));
  }

  if (!tasks.length) return before;
  await Promise.allSettled(tasks);
  return readGarmentSet(wardrobeItemId, operator);
}
