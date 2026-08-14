import { randomUUID } from "node:crypto";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import {
  studioMediaCompletionJobs,
  studioPendingProductCaptures,
} from "../../db/shop-postgres-schema";
import { getStudioDb } from "../../db/shop-postgres";
import type {
  MediaCompletionRole,
  MediaCompletionState,
  MediaCompletionTargetKind,
} from "../studio/engine/media-completion-contracts";
import { StudioEngineError } from "../studio/engine/errors";
import type { PendingCaptureRow } from "./studio-pending-capture-repository";

export type MediaCompletionJobRow = typeof studioMediaCompletionJobs.$inferSelect;

// Gateway validation and generation have bounded 30s + 60s abort signals.
// Ten minutes leaves ample upload/normalization headroom before a crashed
// invocation can be fenced off and exposed as a retryable failure.
const MEDIA_COMPLETION_LEASE_MS = 10 * 60 * 1_000;

export async function listMediaCompletionJobs(input: {
  operatorSubject: string;
  targetKind: MediaCompletionTargetKind;
  targetKey: string;
  role: MediaCompletionRole;
}): Promise<MediaCompletionJobRow[]> {
  return (await getStudioDb()).select().from(studioMediaCompletionJobs).where(and(
    eq(studioMediaCompletionJobs.operatorSubject, input.operatorSubject),
    eq(studioMediaCompletionJobs.targetKind, input.targetKind),
    eq(studioMediaCompletionJobs.targetKey, input.targetKey),
    eq(studioMediaCompletionJobs.role, input.role),
  )).orderBy(desc(studioMediaCompletionJobs.attempt), desc(studioMediaCompletionJobs.createdAt));
}

export async function getOwnedMediaCompletionJob(input: {
  id: string;
  operatorSubject: string;
}): Promise<MediaCompletionJobRow> {
  const [job] = await (await getStudioDb()).select().from(studioMediaCompletionJobs).where(and(
    eq(studioMediaCompletionJobs.id, input.id),
    eq(studioMediaCompletionJobs.operatorSubject, input.operatorSubject),
  )).limit(1);
  if (!job) {
    throw new StudioEngineError("INTAKE_NOT_FOUND", 404, "That AI view was not found.", "Open the piece again.");
  }
  return job;
}

export async function createOrReuseMediaCompletionJob(
  input: typeof studioMediaCompletionJobs.$inferInsert,
): Promise<MediaCompletionJobRow> {
  const db = await getStudioDb();
  await db.insert(studioMediaCompletionJobs).values(input).onConflictDoNothing();
  const [job] = await db.select().from(studioMediaCompletionJobs).where(and(
    eq(studioMediaCompletionJobs.operatorSubject, input.operatorSubject),
    eq(studioMediaCompletionJobs.targetKind, input.targetKind),
    eq(studioMediaCompletionJobs.targetKey, input.targetKey),
    eq(studioMediaCompletionJobs.role, input.role),
    eq(studioMediaCompletionJobs.attempt, input.attempt),
  )).limit(1);
  if (!job) {
    throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "The AI view could not start.", "Try again.");
  }
  return job;
}

export async function claimMediaCompletionJob(id: string): Promise<string | null> {
  const executionToken = randomUUID();
  const startedAt = new Date();
  const claimed = await (await getStudioDb()).update(studioMediaCompletionJobs).set({
    state: "RUNNING",
    executionToken,
    startedAt,
    leaseExpiresAt: new Date(startedAt.getTime() + MEDIA_COMPLETION_LEASE_MS),
    updatedAt: startedAt,
  }).where(and(
    eq(studioMediaCompletionJobs.id, id),
    eq(studioMediaCompletionJobs.state, "PENDING"),
  )).returning({ id: studioMediaCompletionJobs.id });
  return claimed.length === 1 ? executionToken : null;
}

export async function updateRunningMediaCompletionJob(
  id: string,
  executionToken: string,
  update: Partial<typeof studioMediaCompletionJobs.$inferInsert>,
): Promise<boolean> {
  const updated = await (await getStudioDb()).update(studioMediaCompletionJobs).set({
    ...update,
    updatedAt: new Date(),
  }).where(and(
    eq(studioMediaCompletionJobs.id, id),
    eq(studioMediaCompletionJobs.state, "RUNNING"),
    eq(studioMediaCompletionJobs.executionToken, executionToken),
  )).returning({ id: studioMediaCompletionJobs.id });
  return updated.length === 1;
}

export async function recoverStaleMediaCompletionJobs(input: {
  operatorSubject: string;
  targetKind: MediaCompletionTargetKind;
  targetKey: string;
  role: MediaCompletionRole;
}): Promise<number> {
  const recovered = await (await getStudioDb()).update(studioMediaCompletionJobs).set({
    state: "FAILED",
    executionToken: null,
    startedAt: null,
    leaseExpiresAt: null,
    errorCode: "STALE_EXECUTION",
    updatedAt: new Date(),
  }).where(and(
    eq(studioMediaCompletionJobs.operatorSubject, input.operatorSubject),
    eq(studioMediaCompletionJobs.targetKind, input.targetKind),
    eq(studioMediaCompletionJobs.targetKey, input.targetKey),
    eq(studioMediaCompletionJobs.role, input.role),
    eq(studioMediaCompletionJobs.state, "RUNNING"),
    lte(studioMediaCompletionJobs.leaseExpiresAt, new Date()),
  )).returning({ id: studioMediaCompletionJobs.id });
  return recovered.length;
}

export async function rejectMediaCompletionJob(input: {
  id: string;
  operatorSubject: string;
}): Promise<MediaCompletionJobRow> {
  const [job] = await (await getStudioDb()).update(studioMediaCompletionJobs).set({
    state: "REJECTED",
    rejectedAt: new Date(),
    approvedAt: null,
    updatedAt: new Date(),
  }).where(and(
    eq(studioMediaCompletionJobs.id, input.id),
    eq(studioMediaCompletionJobs.operatorSubject, input.operatorSubject),
    eq(studioMediaCompletionJobs.state, "COMPLETE"),
  )).returning();
  if (!job) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "That AI view is not awaiting review.", "Open the latest view.");
  }
  return job;
}

/**
 * KEEP is one SQL boundary: only a complete, owned candidate can become an
 * approved capture, and the final row retains its AI job foreign key.
 */
export async function approveAndPromoteMediaCompletionJob(input: {
  id: string;
  operatorSubject: string;
  captureKey: string;
  truthConfirmed: boolean;
}): Promise<MediaCompletionJobRow> {
  const db = await getStudioDb();
  const result = await db.execute(sql`
    with approved_job as (
      update studio_media_completion_jobs
      set state = 'APPROVED',
          source_validation = case
            when source_validation->>'sourceMode' = 'APPROVED_FRONT'
              then source_validation || jsonb_build_object('operatorTruthConfirmed', true)
            else source_validation
          end,
          approved_at = now(), rejected_at = null, updated_at = now()
      where id = ${input.id}::uuid
        and operator_subject = ${input.operatorSubject}
        and state = 'COMPLETE'
        and (
          coalesce(source_validation->>'sourceMode', 'UPLOADED_AUTHORITY') <> 'APPROVED_FRONT'
          or ${input.truthConfirmed}
        )
        and output_blob_pathname is not null
        and output_mime_type is not null
        and output_byte_size > 0
        and output_sha256 ~ '^[0-9a-f]{64}$'
      returning *
    ), promoted_capture as (
      insert into studio_pending_product_captures (
        operator_subject, sku, role, blob_pathname, mime_type, byte_size,
        width, height, sha256, privacy, origin, completion_job_id,
        operator_approved_at, created_at, updated_at
      )
      select
        operator_subject, ${input.captureKey}, role, output_blob_pathname,
        output_mime_type, output_byte_size, output_width, output_height,
        output_sha256, 'PRIVATE', 'AI_DERIVED', id, now(), now(), now()
      from approved_job
      on conflict (operator_subject, sku, role) do update set
        blob_pathname = excluded.blob_pathname,
        mime_type = excluded.mime_type,
        byte_size = excluded.byte_size,
        width = excluded.width,
        height = excluded.height,
        sha256 = excluded.sha256,
        privacy = 'PRIVATE',
        origin = 'AI_DERIVED',
        completion_job_id = excluded.completion_job_id,
        operator_approved_at = excluded.operator_approved_at,
        updated_at = now()
      returning id
    )
    select approved_job.* from approved_job, promoted_capture
  `);
  const rows = "rows" in result ? result.rows : result;
  if (!Array.isArray(rows) || !rows.length) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "That AI view is not awaiting review.", "Open the latest view.");
  }
  return getOwnedMediaCompletionJob({ id: input.id, operatorSubject: input.operatorSubject });
}

export async function captureHasApprovedMediaLineage(input: {
  capture: PendingCaptureRow;
  targetKind: MediaCompletionTargetKind;
  targetKey: string;
}): Promise<boolean> {
  if (input.capture.origin === "DIRECT") return input.capture.completionJobId === null;
  if (input.capture.origin !== "AI_DERIVED" || !input.capture.completionJobId) return false;
  const [lineage] = await (await getStudioDb()).select({ id: studioMediaCompletionJobs.id }).from(
    studioMediaCompletionJobs,
  ).where(and(
    eq(studioMediaCompletionJobs.id, input.capture.completionJobId),
    eq(studioMediaCompletionJobs.operatorSubject, input.capture.operatorSubject),
    eq(studioMediaCompletionJobs.targetKind, input.targetKind),
    eq(studioMediaCompletionJobs.targetKey, input.targetKey),
    eq(studioMediaCompletionJobs.role, input.capture.role),
    eq(studioMediaCompletionJobs.state, "APPROVED"),
    eq(studioMediaCompletionJobs.outputBlobPathname, input.capture.blobPathname),
    eq(studioMediaCompletionJobs.outputSha256, input.capture.sha256),
  )).limit(1);
  return Boolean(lineage);
}

export function isTerminalMediaCompletionState(state: string): state is MediaCompletionState {
  return ["COMPLETE", "APPROVED", "REJECTED", "FAILED"].includes(state);
}

// Keep the promoted capture table anchored in this server-only repository.
void studioPendingProductCaptures;
