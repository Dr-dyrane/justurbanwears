import type { WearOperation } from "../studio/engine/contracts";
import type { GarmentSetSlot } from "../studio/engine/garment-set-contracts";
import type { MediaCompletionRole } from "../studio/engine/media-completion-contracts";
import { StudioEngineError } from "../studio/engine/errors";
import { sha256 } from "../studio/engine/fingerprint";
import type { AtelierStage } from "../studio/atelier/contracts";
import {
  claimStudioEngineWorkOwnershipRow,
  type ClaimStudioEngineWorkOwnershipInput,
  type StudioEngineOwner,
  type StudioEngineStageFamily,
  type StudioEngineWorkOwnershipRow,
} from "./studio-engine-work-ownership-repository";

const OWNERSHIP_SEMANTIC_REVISION = "juw.studio-engine-work-ownership.v1";

export type StudioEngineOwnershipClaim = Readonly<{
  owner: StudioEngineOwner;
  stageFamily: StudioEngineStageFamily;
  semanticHash: string;
  reused: boolean;
}>;

type OwnershipRepository = Readonly<{
  claim(input: ClaimStudioEngineWorkOwnershipInput): Promise<StudioEngineWorkOwnershipRow | null>;
}>;

export function studioEngineOwnershipSemanticHash(input: Readonly<{
  operatorSubject: string;
  wardrobeItemId: string;
  stageFamily: StudioEngineStageFamily;
}>): string {
  return sha256([
    OWNERSHIP_SEMANTIC_REVISION,
    input.operatorSubject,
    input.wardrobeItemId,
    input.stageFamily,
  ].join("\n"));
}

export function legacyStageFamilyForGarmentSetSlot(
  slot: GarmentSetSlot["key"],
): StudioEngineStageFamily {
  if (slot === "GARMENT_FRONT") return "GARMENT_FRONT";
  if (slot === "GARMENT_BACK") return "GARMENT_BACK";
  if (slot === "MANNEQUIN_FRONT") return "GARMENT_MANNEQUIN";
  if (slot === "FABRIC_DETAIL") return "GARMENT_DETAIL";
  return "SUBJECT";
}

export function legacyStageFamilyForWearOperation(
  operation: WearOperation,
): StudioEngineStageFamily {
  if (operation === "MANNEQUIN_FRONT") return "GARMENT_MANNEQUIN";
  if (operation === "MODEL_TRY_ON") return "SUBJECT";
  return "ROOM_FINAL";
}

export function legacyStageFamilyForMediaCompletionRole(
  role: MediaCompletionRole,
): StudioEngineStageFamily {
  if (role === "GARMENT_FRONT") return "GARMENT_FRONT";
  if (role === "GARMENT_BACK") return "GARMENT_BACK";
  return "GARMENT_DETAIL";
}

export function atelierStageFamily(stage: AtelierStage): StudioEngineStageFamily {
  if (stage === "GARMENT_01_FRONT") return "GARMENT_FRONT";
  if (stage === "GARMENT_02_BACK") return "GARMENT_BACK";
  if (stage === "GARMENT_03_MANNEQUIN") return "GARMENT_MANNEQUIN";
  if (stage === "GARMENT_04_DETAIL") return "GARMENT_DETAIL";
  if (stage === "SUBJECT_A" || stage === "SUBJECT_B") return "SUBJECT";
  return "ROOM_FINAL";
}

function ownershipConflict(): StudioEngineError {
  return new StudioEngineError(
    "INVALID_TRANSITION",
    409,
    "This garment stage is already owned by another Studio workflow.",
    "Continue from the saved workflow for this garment stage. No new generation was started.",
  );
}

function missingWardrobeItem(): StudioEngineError {
  return new StudioEngineError(
    "INTAKE_NOT_FOUND",
    404,
    "That garment is not available in this Studio.",
    "Return to Wardrobe and open the exact garment again.",
  );
}

export function createStudioEngineWorkOwnershipService(
  repository: OwnershipRepository = { claim: claimStudioEngineWorkOwnershipRow },
) {
  async function claim(
    owner: StudioEngineOwner,
    input: Readonly<{
      operatorSubject: string;
      wardrobeItemId: string;
      stageFamily: StudioEngineStageFamily;
    }>,
  ): Promise<StudioEngineOwnershipClaim> {
    const semanticHash = studioEngineOwnershipSemanticHash(input);
    const row = await repository.claim({ ...input, owner, semanticHash });
    if (!row) throw missingWardrobeItem();
    if (row.owner !== owner || row.semanticHash !== semanticHash) throw ownershipConflict();
    return Object.freeze({ owner, stageFamily: input.stageFamily, semanticHash, reused: row.reused });
  }

  return Object.freeze({
    claimLegacy(input: Readonly<{
      operatorSubject: string;
      wardrobeItemId: string;
      stageFamily: StudioEngineStageFamily;
    }>) {
      return claim("LEGACY", input);
    },
    claimAtelier(input: Readonly<{
      operatorSubject: string;
      wardrobeItemId: string;
      stageFamily: StudioEngineStageFamily;
    }>) {
      return claim("ATELIER", input);
    },
  });
}

const studioEngineWorkOwnershipService = createStudioEngineWorkOwnershipService();

export const claimLegacyStudioEngineWork = studioEngineWorkOwnershipService.claimLegacy;
export const claimAtelierStudioEngineWork = studioEngineWorkOwnershipService.claimAtelier;
