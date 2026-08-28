import { sql } from "drizzle-orm";
import { getStudioDb } from "../../db/shop-postgres";

export const studioEngineOwners = ["LEGACY", "ATELIER"] as const;
export type StudioEngineOwner = (typeof studioEngineOwners)[number];

export const studioEngineStageFamilies = [
  "GARMENT_FRONT",
  "GARMENT_BACK",
  "GARMENT_MANNEQUIN",
  "GARMENT_DETAIL",
  "SUBJECT",
  "ROOM_FINAL",
] as const;
export type StudioEngineStageFamily = (typeof studioEngineStageFamilies)[number];

export type StudioEngineWorkOwnershipRow = Readonly<{
  operatorSubject: string;
  wardrobeItemId: string;
  stageFamily: StudioEngineStageFamily;
  owner: StudioEngineOwner;
  semanticHash: string;
  createdAt: Date;
  updatedAt: Date;
  reused: boolean;
}>;

export type ClaimStudioEngineWorkOwnershipInput = Readonly<{
  operatorSubject: string;
  wardrobeItemId: string;
  stageFamily: StudioEngineStageFamily;
  owner: StudioEngineOwner;
  semanticHash: string;
}>;

type OwnershipDatabaseRow = {
  operator_subject: string;
  wardrobe_item_id: string;
  stage_family: StudioEngineStageFamily;
  owner: StudioEngineOwner;
  semantic_hash: string;
  created_at: Date | string;
  updated_at: Date | string;
  reused: boolean | string | number;
};

function reusedValue(value: OwnershipDatabaseRow["reused"]): boolean {
  return value === true || value === "true" || value === 1;
}

/**
 * Atomically inserts the first owner or returns the immutable existing owner.
 * The no-op conflict update deliberately changes neither owner nor semantic
 * identity; it only makes the concurrent winner visible in the same statement.
 */
export async function claimStudioEngineWorkOwnershipRow(
  input: ClaimStudioEngineWorkOwnershipInput,
): Promise<StudioEngineWorkOwnershipRow | null> {
  const result = await (await getStudioDb()).execute<OwnershipDatabaseRow>(sql`
    insert into studio_engine_work_ownership (
      operator_subject, wardrobe_item_id, stage_family, owner,
      semantic_hash, created_at, updated_at
    )
    select
      ${input.operatorSubject}, wardrobe.id, ${input.stageFamily}, ${input.owner},
      ${input.semanticHash}, now(), now()
    from studio_wardrobe_items wardrobe
    where wardrobe.id = ${input.wardrobeItemId}::uuid
      and wardrobe.operator_subject = ${input.operatorSubject}
    on conflict (operator_subject, wardrobe_item_id, stage_family)
    do update set updated_at = studio_engine_work_ownership.updated_at
    returning
      operator_subject, wardrobe_item_id, stage_family, owner, semantic_hash,
      created_at, updated_at, (xmax <> 0) as reused
  `);
  const row = result.rows[0];
  if (!row) return null;
  return {
    operatorSubject: row.operator_subject,
    wardrobeItemId: row.wardrobe_item_id,
    stageFamily: row.stage_family,
    owner: row.owner,
    semanticHash: row.semantic_hash,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    reused: reusedValue(row.reused),
  };
}
