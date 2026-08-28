import { and, eq, inArray } from "drizzle-orm";
import { getStudioDb } from "../../db/shop-postgres";
import {
  studioAtelierArtifacts,
  studioAtelierExecutions,
  studioAtelierOperationProjections,
  studioAtelierOperations,
} from "../../db/shop-postgres-schema";
import type { AtelierArtifactRow } from "./studio-atelier-repository";

const PUBLICATION_STAGES = Object.freeze([
  "GARMENT_01_FRONT",
  "GARMENT_02_BACK",
  "GARMENT_03_MANNEQUIN",
  "GARMENT_04_DETAIL",
  "ROOM_FINAL_05",
  "SIBLING_06",
  "SIBLING_07_CORE",
  "SIBLING_07_RECOVERY",
] as const);

/**
 * Private server-only candidate. The artifact carries its opaque storage
 * coordinate so the app can perform verified readback; it must never cross an
 * HTTP or Shop projection boundary.
 */
export type StudioAtelierLockedPublicationCandidate = Readonly<{
  operationId: string;
  operatorSubject: string;
  wardrobeItemId: string | null;
  garmentId: string;
  view: string;
  stage: string;
  semanticHash: string;
  rootSemanticHash: string;
  canonicalOperation: Record<string, unknown>;
  operationState: string;
  projectionVersion: number;
  projectionState: string;
  technicalDecision: string;
  semanticDecision: string;
  userDecision: string;
  materializedExecutionId: string | null;
  materializedArtifactId: string | null;
  materializedArtifactSha256: string | null;
  lockedArtifactId: string | null;
  lockedAssetId: string | null;
  lockedArtifactSha256: string | null;
  executionState: string;
  artifact: AtelierArtifactRow;
}>;

/**
 * Read-only resolution of the current operator-owned LOCKED publication set.
 * Durable adoption itself needs a later atomic receipt/CAS repository; this
 * query is intentionally not that write boundary.
 */
export async function listLockedStudioAtelierPublicationCandidates(input: Readonly<{
  operatorSubject: string;
  wardrobeItemId: string;
}>): Promise<StudioAtelierLockedPublicationCandidate[]> {
  const rows = await (await getStudioDb()).select({
    operationId: studioAtelierOperations.id,
    operatorSubject: studioAtelierOperations.operatorSubject,
    wardrobeItemId: studioAtelierOperations.wardrobeItemId,
    garmentId: studioAtelierOperations.garmentId,
    view: studioAtelierOperations.view,
    stage: studioAtelierOperations.stage,
    semanticHash: studioAtelierOperations.semanticHash,
    rootSemanticHash: studioAtelierOperations.rootSemanticHash,
    canonicalOperation: studioAtelierOperations.canonicalOperation,
    operationState: studioAtelierOperations.state,
    projectionVersion: studioAtelierOperationProjections.version,
    projectionState: studioAtelierOperationProjections.state,
    technicalDecision: studioAtelierOperationProjections.technicalDecision,
    semanticDecision: studioAtelierOperationProjections.semanticDecision,
    userDecision: studioAtelierOperationProjections.userDecision,
    materializedExecutionId: studioAtelierOperationProjections.materializedExecutionId,
    materializedArtifactId: studioAtelierOperationProjections.materializedArtifactId,
    materializedArtifactSha256: studioAtelierOperationProjections.materializedArtifactSha256,
    lockedArtifactId: studioAtelierOperationProjections.lockedArtifactId,
    lockedAssetId: studioAtelierOperationProjections.lockedAssetId,
    lockedArtifactSha256: studioAtelierOperationProjections.lockedArtifactSha256,
    executionState: studioAtelierExecutions.state,
    artifact: studioAtelierArtifacts,
  }).from(studioAtelierOperations).innerJoin(
    studioAtelierOperationProjections,
    eq(studioAtelierOperationProjections.operationId, studioAtelierOperations.id),
  ).innerJoin(
    studioAtelierArtifacts,
    eq(studioAtelierArtifacts.id, studioAtelierOperationProjections.lockedArtifactId),
  ).innerJoin(
    studioAtelierExecutions,
    and(
      eq(studioAtelierExecutions.id, studioAtelierOperationProjections.materializedExecutionId),
      eq(studioAtelierExecutions.id, studioAtelierArtifacts.executionId),
    ),
  ).where(and(
    eq(studioAtelierOperations.operatorSubject, input.operatorSubject),
    eq(studioAtelierOperations.wardrobeItemId, input.wardrobeItemId),
    eq(studioAtelierOperationProjections.state, "LOCKED"),
    inArray(studioAtelierOperations.stage, PUBLICATION_STAGES),
  ));
  return rows as StudioAtelierLockedPublicationCandidate[];
}
