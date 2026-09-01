import { and, eq, sql } from "drizzle-orm";
import { studioPendingProductCaptures } from "../../db/shop-postgres-schema";
import { getStudioDb } from "../../db/shop-postgres";
import type { PendingDirectCaptureRole } from "../studio/engine/pending-capture-contracts";
import { StudioEngineError } from "../studio/engine/errors";
import { studioWardrobeItemLockKey } from "./studio-wardrobe-item-lock";

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
  wardrobeItemId?: string;
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
  if (input.wardrobeItemId) {
    const guarded = await db.execute<{ allowed: boolean }>(sql`
      with command_lock as (
        select pg_advisory_xact_lock(hashtextextended(
          ${studioWardrobeItemLockKey(input.operatorSubject, input.wardrobeItemId)}, 0
        ))
      ), owned_piece as (
        select item.id
        from studio_wardrobe_items item cross join command_lock
        where item.id = ${input.wardrobeItemId}::uuid
          and item.operator_subject = ${input.operatorSubject}
          and item.state <> 'ARCHIVED'
        for update
      ), upserted_capture as (
        insert into studio_pending_product_captures (
          operator_subject, sku, role, blob_pathname, mime_type, byte_size,
          width, height, sha256, operator_approved_at
        )
        select
          ${input.operatorSubject}, ${input.sku}, ${input.role}, ${input.blobPathname},
          ${input.mimeType}, ${input.byteSize}, ${input.width ?? null}, ${input.height ?? null},
          ${input.sha256}, ${input.operatorApprovedAt}
        from owned_piece
        on conflict (operator_subject, sku, role) do update set
          blob_pathname = excluded.blob_pathname,
          mime_type = excluded.mime_type,
          byte_size = excluded.byte_size,
          width = excluded.width,
          height = excluded.height,
          sha256 = excluded.sha256,
          origin = 'DIRECT',
          completion_job_id = null,
          operator_approved_at = excluded.operator_approved_at,
          updated_at = now()
        returning id
      )
      select exists(select 1 from owned_piece) as allowed
      from command_lock
    `);
    const rows = ("rows" in guarded ? guarded.rows : guarded) as Array<{ allowed: unknown }>;
    const allowed = rows[0]?.allowed === true || rows[0]?.allowed === "t";
    if (!allowed) {
      throw new StudioEngineError(
        "INVALID_TRANSITION",
        409,
        "This piece is archived or no longer exists.",
        "Return to Archived.",
      );
    }
    const [row] = await db.select().from(studioPendingProductCaptures).where(and(
      eq(studioPendingProductCaptures.operatorSubject, input.operatorSubject),
      eq(studioPendingProductCaptures.sku, input.sku),
      eq(studioPendingProductCaptures.role, input.role),
    )).limit(1);
    if (!row) throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "The photo could not be saved.", "Try again.");
    return row;
  }
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
