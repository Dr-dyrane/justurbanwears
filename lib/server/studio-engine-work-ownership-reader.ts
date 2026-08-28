import { sql } from "drizzle-orm";
import { z } from "zod";
import { getStudioDb } from "../../db/shop-postgres";
import { StudioEngineError } from "../studio/engine/errors";
import {
  studioEngineOwners,
  studioEngineStageFamilies,
  type StudioEngineOwner,
  type StudioEngineStageFamily,
} from "./studio-engine-work-ownership-repository";

const ownershipReadInputSchema = z.object({
  operatorSubject: z.string().min(1).max(512).refine((value) => value === value.trim()),
  wardrobeItemId: z.string().uuid(),
  stageFamily: z.enum(studioEngineStageFamilies),
}).strict();

export type StudioEngineWorkOwnershipRead =
  | Readonly<{ state: "UNCLAIMED" }>
  | Readonly<{ state: "OWNED"; owner: StudioEngineOwner }>;

export type ReadStudioEngineWorkOwnershipInput = Readonly<{
  operatorSubject: string;
  wardrobeItemId: string;
  stageFamily: StudioEngineStageFamily;
}>;

type OwnershipLookupRow = Readonly<{
  wardrobe_item_id: string;
  owner: string | null;
}>;

type OwnershipReadRepository = Readonly<{
  read(input: ReadStudioEngineWorkOwnershipInput): Promise<OwnershipLookupRow | null>;
}>;

async function readOwnershipRow(
  input: ReadStudioEngineWorkOwnershipInput,
): Promise<OwnershipLookupRow | null> {
  const result = await (await getStudioDb()).execute<OwnershipLookupRow>(sql`
    select wardrobe.id::text as wardrobe_item_id, ownership.owner
    from studio_wardrobe_items wardrobe
    left join studio_engine_work_ownership ownership
      on ownership.operator_subject = wardrobe.operator_subject
     and ownership.wardrobe_item_id = wardrobe.id
     and ownership.stage_family = ${input.stageFamily}
    where wardrobe.id = ${input.wardrobeItemId}::uuid
      and wardrobe.operator_subject = ${input.operatorSubject}
    limit 1
  `);
  return result.rows[0] ?? null;
}

function missingWardrobeItem(): StudioEngineError {
  return new StudioEngineError(
    "INTAKE_NOT_FOUND",
    404,
    "That garment is not available in this Studio.",
    "Return to Wardrobe and open the exact garment again.",
  );
}

function unreadableOwnership(): StudioEngineError {
  return new StudioEngineError(
    "ENGINE_UNAVAILABLE",
    503,
    "The saved Studio workflow owner could not be verified.",
    "Try again after the Studio ownership ledger is repaired.",
  );
}

/**
 * Returns the current immutable owner without claiming, renewing or releasing
 * anything. Missing/foreign wardrobe UUIDs are deliberately not represented as
 * unclaimed: the authenticated operator must own the exact wardrobe row first.
 */
export function createStudioEngineWorkOwnershipReader(
  repository: OwnershipReadRepository = { read: readOwnershipRow },
) {
  return async function readStudioEngineWorkOwnership(
    input: ReadStudioEngineWorkOwnershipInput,
  ): Promise<StudioEngineWorkOwnershipRead> {
    const parsed = ownershipReadInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new StudioEngineError(
        "INVALID_REQUEST",
        400,
        "That Studio ownership lookup is not valid.",
        "Open the exact Wardrobe garment and try again.",
      );
    }
    const exactInput = parsed.data;
    const row = await repository.read(exactInput);
    if (!row || row.wardrobe_item_id !== exactInput.wardrobeItemId) {
      throw missingWardrobeItem();
    }
    if (row.owner === null) return Object.freeze({ state: "UNCLAIMED" as const });
    if (!studioEngineOwners.includes(row.owner as StudioEngineOwner)) {
      throw unreadableOwnership();
    }
    return Object.freeze({ state: "OWNED" as const, owner: row.owner as StudioEngineOwner });
  };
}

export const readStudioEngineWorkOwnership = createStudioEngineWorkOwnershipReader();
