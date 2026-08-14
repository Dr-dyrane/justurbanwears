import { and, eq } from "drizzle-orm";
import { studioPendingProductCaptures } from "../../db/shop-postgres-schema";
import { getStudioDb } from "../../db/shop-postgres";
import type { PendingDirectCaptureRole } from "../studio/engine/pending-capture-contracts";
import { StudioEngineError } from "../studio/engine/errors";

export type PendingCaptureRow = typeof studioPendingProductCaptures.$inferSelect;

export async function listPendingProductCaptures(input: {
  operatorSubject: string;
  sku: string;
}): Promise<PendingCaptureRow[]> {
  return (await getStudioDb()).select().from(studioPendingProductCaptures).where(and(
    eq(studioPendingProductCaptures.operatorSubject, input.operatorSubject),
    eq(studioPendingProductCaptures.sku, input.sku),
  ));
}

export async function getPendingProductCapture(input: {
  operatorSubject: string;
  sku: string;
  captureId: string;
}): Promise<PendingCaptureRow> {
  const [row] = await (await getStudioDb()).select().from(studioPendingProductCaptures).where(and(
    eq(studioPendingProductCaptures.id, input.captureId),
    eq(studioPendingProductCaptures.operatorSubject, input.operatorSubject),
    eq(studioPendingProductCaptures.sku, input.sku),
  )).limit(1);
  if (!row) throw new StudioEngineError("INTAKE_NOT_FOUND", 404, "That photo was not found.", "Open the draft again.");
  return row;
}

export async function upsertPendingProductCapture(input: {
  operatorSubject: string;
  sku: string;
  role: PendingDirectCaptureRole;
  blobPathname: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  sha256: string;
  operatorApprovedAt: Date;
}): Promise<PendingCaptureRow> {
  const db = await getStudioDb();
  const [row] = await db.insert(studioPendingProductCaptures).values(input).onConflictDoUpdate({
    target: [
      studioPendingProductCaptures.operatorSubject,
      studioPendingProductCaptures.sku,
      studioPendingProductCaptures.role,
    ],
    set: {
      blobPathname: input.blobPathname,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      width: input.width,
      height: input.height,
      sha256: input.sha256,
      origin: "DIRECT",
      completionJobId: null,
      operatorApprovedAt: input.operatorApprovedAt,
      updatedAt: new Date(),
    },
  }).returning();
  if (!row) throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "The photo could not be saved.", "Try again.");
  return row;
}
