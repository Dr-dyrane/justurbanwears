import { randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
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

export const MEDIA_COMPLETION_0015_REQUIRED_COLUMNS = Object.freeze([
  "validation_invocation_started_at",
  "validation_result_received_at",
  "provider_invocation_started_at",
  "provider_result_received_at",
  "provider_result_blob_pathname",
  "provider_result_mime_type",
  "provider_result_byte_size",
  "provider_result_sha256",
] as const);

export const MEDIA_COMPLETION_0015_REQUIRED_CONSTRAINTS = Object.freeze([
  "studio_media_completion_jobs_validation_checkpoints",
  "studio_media_completion_jobs_provider_checkpoints",
  "studio_media_completion_jobs_state_known",
  "studio_media_completion_jobs_output_complete",
] as const);

type MediaCompletionSchemaPrerequisiteRow = Readonly<{
  kind: "COLUMN" | "CONSTRAINT";
  name: string;
}>;

export function missingMediaCompletionSchemaPrerequisites(
  rows: readonly MediaCompletionSchemaPrerequisiteRow[],
): string[] {
  const available = new Set(rows.map((row) => `${row.kind}:${row.name}`));
  return [
    ...MEDIA_COMPLETION_0015_REQUIRED_COLUMNS.map((name) => `COLUMN:${name}`),
    ...MEDIA_COMPLETION_0015_REQUIRED_CONSTRAINTS.map((name) => `CONSTRAINT:${name}`),
  ].filter((required) => !available.has(required));
}

type StudioDb = Awaited<ReturnType<typeof getStudioDb>>;
let mediaCompletionSchemaReady = false;

async function assertMediaCompletionSchemaReady(database: StudioDb): Promise<void> {
  if (mediaCompletionSchemaReady) return;
  const result = await database.execute<MediaCompletionSchemaPrerequisiteRow>(sql`
    select 'COLUMN'::text as kind, column_name::text as name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'studio_media_completion_jobs'
      and column_name in (
        'validation_invocation_started_at',
        'validation_result_received_at',
        'provider_invocation_started_at',
        'provider_result_received_at',
        'provider_result_blob_pathname',
        'provider_result_mime_type',
        'provider_result_byte_size',
        'provider_result_sha256'
      )
    union all
    select 'CONSTRAINT'::text as kind, constraint_name::text as name
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'studio_media_completion_jobs'
      and constraint_name in (
        'studio_media_completion_jobs_validation_checkpoints',
        'studio_media_completion_jobs_provider_checkpoints',
        'studio_media_completion_jobs_state_known',
        'studio_media_completion_jobs_output_complete'
      )
  `);
  const rows = ("rows" in result ? result.rows : result) as MediaCompletionSchemaPrerequisiteRow[];
  const missing = missingMediaCompletionSchemaPrerequisites(Array.isArray(rows) ? rows : []);
  if (missing.length) {
    throw new StudioEngineError(
      "ENGINE_UNAVAILABLE",
      503,
      "Studio media generation is not ready.",
      "Apply database migration 0015_media_completion_dispatch_fence. No generation was started.",
    );
  }
  // Only a successful inspection is cached. A missing or temporarily
  // unavailable schema is checked again on the next request.
  mediaCompletionSchemaReady = true;
}

async function getMediaCompletionDb(): Promise<StudioDb> {
  const database = await getStudioDb();
  await assertMediaCompletionSchemaReady(database);
  return database;
}

// Gateway validation and generation have bounded 30s + 60s abort signals.
// Ten minutes leaves ample upload/normalization headroom before recovery must
// classify the durable dispatch checkpoints. Recovery never guesses that a
// started provider invocation was free to repeat.
const MEDIA_COMPLETION_LEASE_MS = 10 * 60 * 1_000;

type MediaCompletionRecoveryCheckpoints = Pick<
  MediaCompletionJobRow,
  | "validationInvocationStartedAt"
  | "validationResultReceivedAt"
  | "providerInvocationStartedAt"
  | "providerResultReceivedAt"
  | "providerResultBlobPathname"
  | "providerResultMimeType"
  | "providerResultByteSize"
  | "providerResultSha256"
>;

export function hasRetainedMediaCompletionProviderResult(
  job: MediaCompletionRecoveryCheckpoints,
): boolean {
  return Boolean(
    job.providerInvocationStartedAt
    && job.providerResultReceivedAt
    && job.providerResultBlobPathname
    && job.providerResultMimeType
    && job.providerResultByteSize
    && job.providerResultByteSize > 0
    && job.providerResultSha256
    && /^[0-9a-f]{64}$/.test(job.providerResultSha256),
  );
}

export type ExpiredMediaCompletionDisposition =
  | "REQUEUE_PRE_DISPATCH"
  | "RESUME_RETAINED_RESULT"
  | "INDETERMINATE_RECONCILIATION";

export function classifyExpiredMediaCompletionClaim(
  job: MediaCompletionRecoveryCheckpoints,
): ExpiredMediaCompletionDisposition {
  if (hasRetainedMediaCompletionProviderResult(job)) return "RESUME_RETAINED_RESULT";
  if (job.providerInvocationStartedAt) return "INDETERMINATE_RECONCILIATION";
  if (job.validationInvocationStartedAt && !job.validationResultReceivedAt) {
    return "INDETERMINATE_RECONCILIATION";
  }
  return "REQUEUE_PRE_DISPATCH";
}

export async function listMediaCompletionJobs(input: {
  operatorSubject: string;
  targetKind: MediaCompletionTargetKind;
  targetKey: string;
  role: MediaCompletionRole;
}): Promise<MediaCompletionJobRow[]> {
  const database = await getMediaCompletionDb();
  return database.select().from(studioMediaCompletionJobs).where(and(
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
  const database = await getMediaCompletionDb();
  const [job] = await database.select().from(studioMediaCompletionJobs).where(and(
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
  const db = await getMediaCompletionDb();
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
  const database = await getMediaCompletionDb();
  const claimed = await database.update(studioMediaCompletionJobs).set({
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
  const database = await getMediaCompletionDb();
  const updated = await database.update(studioMediaCompletionJobs).set({
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
  const db = await getMediaCompletionDb();
  const expiredScope = [
    eq(studioMediaCompletionJobs.operatorSubject, input.operatorSubject),
    eq(studioMediaCompletionJobs.targetKind, input.targetKind),
    eq(studioMediaCompletionJobs.targetKey, input.targetKey),
    eq(studioMediaCompletionJobs.role, input.role),
    eq(studioMediaCompletionJobs.state, "RUNNING"),
    lte(studioMediaCompletionJobs.leaseExpiresAt, new Date()),
  ] as const;

  // A complete raw-result checkpoint can safely resume local normalization on
  // the same attempt. It must never open a new paid generation attempt.
  const retained = await db.update(studioMediaCompletionJobs).set({
    state: "PENDING",
    executionToken: null,
    startedAt: null,
    leaseExpiresAt: null,
    errorCode: "RETAINED_RESULT_RESUME",
    updatedAt: new Date(),
  }).where(and(...expiredScope,
    isNotNull(studioMediaCompletionJobs.providerResultReceivedAt),
    isNotNull(studioMediaCompletionJobs.providerResultBlobPathname),
    isNotNull(studioMediaCompletionJobs.providerResultMimeType),
    isNotNull(studioMediaCompletionJobs.providerResultByteSize),
    isNotNull(studioMediaCompletionJobs.providerResultSha256),
  )).returning({ id: studioMediaCompletionJobs.id });

  // Before either provider call starts, or after validation has a complete
  // result but before image dispatch, the same attempt is safe to requeue.
  const preDispatch = await db.update(studioMediaCompletionJobs).set({
    state: "PENDING",
    executionToken: null,
    startedAt: null,
    leaseExpiresAt: null,
    errorCode: null,
    updatedAt: new Date(),
  }).where(and(...expiredScope,
    isNull(studioMediaCompletionJobs.providerInvocationStartedAt),
    or(
      isNull(studioMediaCompletionJobs.validationInvocationStartedAt),
      isNotNull(studioMediaCompletionJobs.validationResultReceivedAt),
    ),
  )).returning({ id: studioMediaCompletionJobs.id });

  // Any remaining expired claim crossed a paid dispatch fence without a
  // complete retained result. Fail closed for explicit reconciliation.
  const indeterminate = await db.update(studioMediaCompletionJobs).set({
    state: "INDETERMINATE",
    executionToken: null,
    startedAt: null,
    leaseExpiresAt: null,
    errorCode: "RECONCILIATION_REQUIRED",
    updatedAt: new Date(),
  }).where(and(...expiredScope)).returning({ id: studioMediaCompletionJobs.id });

  return retained.length + preDispatch.length + indeterminate.length;
}

export async function requeueRetainedMediaCompletionResult(input: {
  id: string;
  operatorSubject: string;
}): Promise<boolean> {
  const database = await getMediaCompletionDb();
  const requeued = await database.update(studioMediaCompletionJobs).set({
    state: "PENDING",
    executionToken: null,
    startedAt: null,
    leaseExpiresAt: null,
    errorCode: "RETAINED_RESULT_RESUME",
    updatedAt: new Date(),
  }).where(and(
    eq(studioMediaCompletionJobs.id, input.id),
    eq(studioMediaCompletionJobs.operatorSubject, input.operatorSubject),
    eq(studioMediaCompletionJobs.state, "FAILED"),
    isNotNull(studioMediaCompletionJobs.providerResultReceivedAt),
    isNotNull(studioMediaCompletionJobs.providerResultBlobPathname),
    isNotNull(studioMediaCompletionJobs.providerResultMimeType),
    isNotNull(studioMediaCompletionJobs.providerResultByteSize),
    isNotNull(studioMediaCompletionJobs.providerResultSha256),
    sql`${studioMediaCompletionJobs.errorCode} is distinct from 'PAID_RESULT_POLICY_BLOCKED'`,
  )).returning({ id: studioMediaCompletionJobs.id });
  return requeued.length === 1;
}

export async function rejectMediaCompletionJob(input: {
  id: string;
  operatorSubject: string;
}): Promise<MediaCompletionJobRow> {
  const database = await getMediaCompletionDb();
  const [job] = await database.update(studioMediaCompletionJobs).set({
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
  const db = await getMediaCompletionDb();
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
  const database = await getMediaCompletionDb();
  const [lineage] = await database.select({ id: studioMediaCompletionJobs.id }).from(
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
  return ["COMPLETE", "APPROVED", "REJECTED", "FAILED", "INDETERMINATE"].includes(state);
}

// Keep the promoted capture table anchored in this server-only repository.
void studioPendingProductCaptures;
