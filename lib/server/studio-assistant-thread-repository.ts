import { and, asc, desc, eq, gt, lt, lte, sql } from "drizzle-orm";
import { getStudioDb } from "../../db/shop-postgres";
import {
  studioAssistantMessages,
  studioAssistantThreads,
} from "../../db/shop-postgres-schema";
import type { StudioAssistantUIMessage } from "../ai/studio-assistant-agent";
import {
  studioAssistantFocusSchema,
  studioAssistantThreadTaskSchema,
  type StudioAssistantFocus,
  type StudioAssistantStoredMessage,
  type StudioAssistantReplyReconcileOutcome,
  type StudioAssistantThreadDetail,
  type StudioAssistantThreadSummary,
  type StudioAssistantThreadTask,
} from "../studio/assistant/threads";
import { StudioEngineError } from "../studio/engine/errors";
import { sha256 } from "../studio/engine/fingerprint";
import type { StudioOperator } from "./studio-operator";

type ThreadRow = typeof studioAssistantThreads.$inferSelect;
type MessageRow = typeof studioAssistantMessages.$inferSelect;
type BeginTurnDatabaseRow = {
  lease_acquired: boolean | number | string | null;
  response_acquired: boolean | number | string | null;
  response_id: string | null;
  response_role: string | null;
  response_sequence: number | string | null;
  response_status: string | null;
  thread_state: string | null;
  user_parts: unknown;
  user_role: string | null;
};

type SaveResponseDatabaseRow = {
  lease_released: boolean | number | string | null;
  response_exists: boolean | number | string | null;
  response_role: string | null;
  response_status: string | null;
  response_updated: boolean | number | string | null;
  thread_exists: boolean | number | string | null;
};

type ReconcileReplyDatabaseRow = {
  recovered: boolean | number | string | null;
  response_exists: boolean | number | string | null;
  response_role: string | null;
  response_status: string | null;
  thread_exists: boolean | number | string | null;
  thread_version: number | string | null;
};
type ThreadCommandDatabaseRow = {
  action: string | null;
  actor_subject: string | null;
  expected_version: number | string | null;
  idempotency_key: string | null;
  request_fingerprint: string | null;
  resulting_version: number | string | null;
  thread_id: string | null;
};

const STUDIO_ASSISTANT_REPLY_LEASE_SECONDS = 60;
const STUDIO_ASSISTANT_DEFAULT_MESSAGE_PAGE_SIZE = 60;
const STUDIO_ASSISTANT_MAX_MESSAGE_PAGE_SIZE = 120;
const STUDIO_ASSISTANT_MODEL_MESSAGE_WINDOW = 20;
const STUDIO_ASSISTANT_HISTORY_SUMMARY_MAX_CHARS = 12_000;

export type StudioAssistantTurnBeginResult = Readonly<{
  contentFingerprint: string;
  kind: "ABORTED" | "ACQUIRED" | "COMPLETE" | "ERROR" | "PENDING";
  responseId: string;
  responseSequence: number;
}>;

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function focus(value: unknown): StudioAssistantFocus | null {
  const parsed = studioAssistantFocusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function pendingWork(value: unknown): StudioAssistantThreadTask[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((task) => {
    const parsed = studioAssistantThreadTaskSchema.safeParse(task);
    return parsed.success ? [parsed.data] : [];
  }).slice(-24);
}

function textFromParts(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value.flatMap((part) => {
    if (!part || typeof part !== "object") return [];
    const candidate = part as { text?: unknown; type?: unknown };
    return candidate.type === "text" && typeof candidate.text === "string"
      ? [candidate.text]
      : [];
  }).join("\n").trim();
}

export function studioAssistantTurnContentFingerprint(message: StudioAssistantUIMessage) {
  return sha256(textFromParts(message.parts));
}

export function studioAssistantResponseId(threadId: string, messageId: string) {
  return `assistant-${sha256(`${threadId}:${messageId}`).slice(0, 48)}`;
}

function databaseBoolean(value: BeginTurnDatabaseRow["response_acquired"]) {
  return value === true || value === 1 || value === "1" || value === "t" || value === "true";
}

function author(input: {
  subject: string | null;
  email: string | null;
  displayName: string;
}) {
  return {
    actorSubject: input.subject,
    displayName: input.displayName,
    email: input.email,
  };
}

function summary(row: ThreadRow): StudioAssistantThreadSummary {
  return {
    archivedAt: row.archivedAt ? iso(row.archivedAt) : null,
    createdAt: iso(row.createdAt),
    createdBy: author({
      displayName: row.createdByDisplayName,
      email: row.createdByEmail,
      subject: row.createdBySubject,
    }),
    focus: focus(row.focus),
    id: row.id,
    pendingTaskCount: pendingWork(row.pendingWork).filter((task) => task.status === "OPEN").length,
    state: row.state,
    title: row.title,
    updatedAt: iso(row.updatedAt),
    updatedBy: author({
      displayName: row.updatedByDisplayName,
      email: row.updatedByEmail,
      subject: row.updatedBySubject,
    }),
    version: row.version,
  };
}

function storedMessage(row: MessageRow): StudioAssistantStoredMessage {
  return {
    author: author({
      displayName: row.authorDisplayName,
      email: row.authorEmail,
      subject: row.authorSubject,
    }),
    createdAt: iso(row.createdAt),
    message: {
      id: row.id,
      parts: row.parts as StudioAssistantUIMessage["parts"],
      role: row.role,
    } as StudioAssistantUIMessage,
    model: row.model,
    sequence: row.sequence,
    status: row.status,
    tokenUsage: row.tokenUsage,
  };
}

function boundedHistoryData(value: string, maximum = 360) {
  const normalized = value.replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > maximum ? `${normalized.slice(0, maximum - 1).trimEnd()}…` : normalized;
}

function historyDataFromParts(value: unknown) {
  if (!Array.isArray(value)) return "";
  return boundedHistoryData(value.flatMap((part) => {
    if (!part || typeof part !== "object") return [];
    const candidate = part as {
      output?: { summary?: unknown; title?: unknown };
      text?: unknown;
      type?: unknown;
    };
    if (candidate.type === "text" && typeof candidate.text === "string") return [candidate.text];
    if (typeof candidate.type === "string" && candidate.type.startsWith("tool-") && candidate.output) {
      return [candidate.output.title, candidate.output.summary].filter((item): item is string => typeof item === "string");
    }
    return [];
  }).join(" "));
}

export function buildStudioAssistantHistorySummary(
  existing: string | null,
  rows: ReadonlyArray<Pick<MessageRow, "parts" | "role" | "sequence">>,
) {
  const additions = rows.flatMap((row) => {
    const data = historyDataFromParts(row.parts);
    return data ? [`${row.role === "user" ? "Operator" : "Ask Studio"}: ${data}`] : [];
  });
  const combined = [existing?.trim(), ...additions]
    .filter(Boolean)
    .join("\n")
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return combined.length > STUDIO_ASSISTANT_HISTORY_SUMMARY_MAX_CHARS
    ? `…${combined.slice(-(STUDIO_ASSISTANT_HISTORY_SUMMARY_MAX_CHARS - 1)).trimStart()}`
    : combined;
}

async function compactStudioAssistantHistory(input: {
  operator: StudioOperator;
  threadId: string;
}) {
  const database = await getStudioDb();
  const [row] = await database.select({
    historySummary: studioAssistantThreads.historySummary,
    historySummaryThroughSequence: studioAssistantThreads.historySummaryThroughSequence,
  }).from(studioAssistantThreads).where(and(
    eq(studioAssistantThreads.id, input.threadId),
    eq(studioAssistantThreads.workspaceId, input.operator.workspaceId),
  )).limit(1);
  if (!row) return;

  const latest = await database.select({ sequence: studioAssistantMessages.sequence })
    .from(studioAssistantMessages)
    .where(and(
      eq(studioAssistantMessages.threadId, input.threadId),
      eq(studioAssistantMessages.status, "COMPLETE"),
    ))
    .orderBy(desc(studioAssistantMessages.sequence))
    .limit(STUDIO_ASSISTANT_MODEL_MESSAGE_WINDOW + 1);
  if (latest.length <= STUDIO_ASSISTANT_MODEL_MESSAGE_WINDOW) return;

  const cutoff = latest[STUDIO_ASSISTANT_MODEL_MESSAGE_WINDOW]?.sequence;
  if (!cutoff || cutoff <= row.historySummaryThroughSequence) return;
  const candidates = await database.select({
    parts: studioAssistantMessages.parts,
    role: studioAssistantMessages.role,
    sequence: studioAssistantMessages.sequence,
  }).from(studioAssistantMessages).where(and(
    eq(studioAssistantMessages.threadId, input.threadId),
    eq(studioAssistantMessages.status, "COMPLETE"),
    gt(studioAssistantMessages.sequence, row.historySummaryThroughSequence),
    lte(studioAssistantMessages.sequence, cutoff),
  )).orderBy(asc(studioAssistantMessages.sequence)).limit(240);
  if (!candidates.length) return;

  const summaryText = buildStudioAssistantHistorySummary(row.historySummary, candidates);
  const throughSequence = candidates.at(-1)!.sequence;
  await database.update(studioAssistantThreads).set({
    historySummary: summaryText || "Earlier worklane messages contained no readable text.",
    historySummaryThroughSequence: throughSequence,
    historySummaryUpdatedAt: new Date(),
  }).where(and(
    eq(studioAssistantThreads.id, input.threadId),
    eq(studioAssistantThreads.workspaceId, input.operator.workspaceId),
    eq(studioAssistantThreads.historySummaryThroughSequence, row.historySummaryThroughSequence),
  ));
}

function notFound(): never {
  throw new StudioEngineError(
    "INTAKE_NOT_FOUND",
    404,
    "That Ask Studio conversation is unavailable.",
    "Open conversation history and choose another worklane.",
  );
}

async function threadRow(operator: StudioOperator, threadId: string): Promise<ThreadRow> {
  const rows = await (await getStudioDb()).select()
    .from(studioAssistantThreads)
    .where(and(
      eq(studioAssistantThreads.id, threadId),
      eq(studioAssistantThreads.workspaceId, operator.workspaceId),
    ))
    .limit(1);
  return rows[0] ?? notFound();
}

export async function createStudioAssistantThread(input: {
  focus?: StudioAssistantFocus | null;
  idempotencyKey: string;
  operator: StudioOperator;
  title?: string;
}): Promise<StudioAssistantThreadDetail> {
  const title = input.title?.trim() || "New conversation";
  const serializedFocus = input.focus ? JSON.stringify(input.focus) : null;
  const requestFingerprint = sha256(JSON.stringify({
    action: "CREATE",
    focus: input.focus ?? null,
    title,
  }));
  const result = await (await getStudioDb()).execute<ThreadCommandDatabaseRow>(sql`
    with command_lock as materialized (
      select pg_advisory_xact_lock(hashtextextended(
        ${`juw:studio:assistant-thread:${input.operator.workspaceId}:${input.idempotencyKey}`}::text,
        0
      ))
    ), existing_command as materialized (
      select command.*
      from studio_assistant_thread_commands as command, command_lock
      where command.workspace_id = ${input.operator.workspaceId}::uuid
        and command.idempotency_key = ${input.idempotencyKey}
      limit 1
    ), created_thread as (
      insert into studio_assistant_threads (
        workspace_id, title, state, focus, pending_work,
        created_by_subject, created_by_email, created_by_display_name,
        updated_by_subject, updated_by_email, updated_by_display_name,
        version, created_at, updated_at
      )
      select
        ${input.operator.workspaceId}::uuid, ${title}, 'OPEN', ${serializedFocus}::jsonb, '[]'::jsonb,
        ${input.operator.actorSubject}, ${input.operator.email}, ${input.operator.displayName},
        ${input.operator.actorSubject}, ${input.operator.email}, ${input.operator.displayName},
        1, clock_timestamp(), clock_timestamp()
      from command_lock
      where not exists (select 1 from existing_command)
      returning *
    ), created_command as (
      insert into studio_assistant_thread_commands (
        workspace_id, thread_id, actor_subject, action,
        expected_version, resulting_version, idempotency_key, request_fingerprint
      )
      select
        ${input.operator.workspaceId}::uuid, created_thread.id, ${input.operator.actorSubject}, 'CREATE',
        null, created_thread.version, ${input.idempotencyKey}, ${requestFingerprint}
      from created_thread
      returning *
    ), resolved_command as (
      select * from created_command
      union all
      select * from existing_command
    )
    select
      action,
      actor_subject,
      expected_version,
      idempotency_key,
      request_fingerprint,
      resulting_version,
      thread_id
    from resolved_command
    limit 1
  `);
  const command = result.rows[0];
  if (
    !command?.thread_id
    || command.action !== "CREATE"
    || command.idempotency_key !== input.idempotencyKey
    || command.request_fingerprint !== requestFingerprint
  ) {
    throw new StudioEngineError(
      "VERSION_CONFLICT",
      409,
      "That conversation action key was already used for a different request.",
      "Start a new conversation again.",
    );
  }
  return getStudioAssistantThread(input.operator, command.thread_id);
}

export async function listStudioAssistantThreads(
  operator: StudioOperator,
): Promise<StudioAssistantThreadSummary[]> {
  const rows = await (await getStudioDb()).select()
    .from(studioAssistantThreads)
    .where(eq(studioAssistantThreads.workspaceId, operator.workspaceId))
    .orderBy(desc(studioAssistantThreads.updatedAt))
    .limit(60);
  return rows.map(summary);
}

export async function getStudioAssistantThread(
  operator: StudioOperator,
  threadId: string,
  options: Readonly<{ beforeSequence?: number; limit?: number }> = {},
): Promise<StudioAssistantThreadDetail> {
  const row = await threadRow(operator, threadId);
  const limit = Math.min(
    STUDIO_ASSISTANT_MAX_MESSAGE_PAGE_SIZE,
    Math.max(1, Math.floor(options.limit ?? STUDIO_ASSISTANT_DEFAULT_MESSAGE_PAGE_SIZE)),
  );
  const messageRows = await (await getStudioDb()).select()
    .from(studioAssistantMessages)
    .where(and(
      eq(studioAssistantMessages.threadId, threadId),
      options.beforeSequence ? lt(studioAssistantMessages.sequence, options.beforeSequence) : undefined,
    ))
    .orderBy(desc(studioAssistantMessages.sequence))
    .limit(limit + 1);
  const pageRows = messageRows.slice(0, limit).reverse();
  return {
    ...summary(row),
    historySummary: row.historySummary && row.historySummaryUpdatedAt
      ? {
          text: row.historySummary,
          throughSequence: row.historySummaryThroughSequence,
          updatedAt: iso(row.historySummaryUpdatedAt),
        }
      : null,
    messagePage: {
      hasOlderMessages: messageRows.length > limit,
      oldestSequence: pageRows[0]?.sequence ?? null,
    },
    messages: pageRows.map(storedMessage),
    pendingWork: pendingWork(row.pendingWork),
  };
}

function titleFromMessage(message: StudioAssistantUIMessage) {
  const text = message.parts
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "New conversation";
  return text.length > 60 ? `${text.slice(0, 57).trimEnd()}…` : text;
}

/**
 * Claims one shared conversation turn in a single PostgreSQL statement. The
 * thread-row compare-and-swap is the server-owned lease: one different message
 * wins, while the same message can join or replay its deterministic response.
 */
export async function beginStudioAssistantTurn(input: {
  contentFingerprint: string;
  focus?: StudioAssistantFocus | null;
  message: StudioAssistantUIMessage;
  model: string;
  operator: StudioOperator;
  responseId: string;
  threadId: string;
}): Promise<StudioAssistantTurnBeginResult> {
  const actualFingerprint = studioAssistantTurnContentFingerprint(input.message);
  if (actualFingerprint !== input.contentFingerprint) {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      400,
      "That Ask Studio message fingerprint is invalid.",
      "Reload the conversation and send the message again.",
    );
  }

  const parts = JSON.stringify(input.message.parts);
  const serializedFocus = input.focus ? JSON.stringify(input.focus) : null;
  const result = await (await getStudioDb()).execute<BeginTurnDatabaseRow>(sql`
    with owned_thread as (
      select
        id,
        state,
        title,
        active_turn_message_id,
        active_turn_response_id,
        active_turn_lease_expires_at
      from studio_assistant_threads
      where id = ${input.threadId}::uuid
        and workspace_id = ${input.operator.workspaceId}::uuid
      limit 1
    ), existing_user as (
      select message.role, message.parts, message.sequence
      from studio_assistant_messages as message
      inner join owned_thread on owned_thread.id = message.thread_id
      where message.id = ${input.message.id}
      limit 1
    ), existing_response as (
      select message.id, message.role, message.status, message.sequence
      from studio_assistant_messages as message
      inner join owned_thread on owned_thread.id = message.thread_id
      where message.id = ${input.responseId}
      limit 1
    ), lease_gate as (
      update studio_assistant_threads as thread
      set
        active_turn_message_id = case
          when thread.active_turn_message_id = ${input.message.id}
            and thread.active_turn_response_id = ${input.responseId}
          then thread.active_turn_message_id
          else ${input.message.id}
        end,
        active_turn_response_id = case
          when thread.active_turn_message_id = ${input.message.id}
            and thread.active_turn_response_id = ${input.responseId}
          then thread.active_turn_response_id
          else ${input.responseId}
        end,
        active_turn_lease_expires_at = case
          when thread.active_turn_message_id = ${input.message.id}
            and thread.active_turn_response_id = ${input.responseId}
          then thread.active_turn_lease_expires_at
          else clock_timestamp() + interval '${sql.raw(String(STUDIO_ASSISTANT_REPLY_LEASE_SECONDS))} seconds'
        end,
        focus = case
          when thread.active_turn_message_id = ${input.message.id}
            and thread.active_turn_response_id = ${input.responseId}
          then thread.focus
          when ${input.focus === undefined}
          then thread.focus
          else ${serializedFocus}::jsonb
        end,
        title = case
          when thread.active_turn_message_id = ${input.message.id}
            and thread.active_turn_response_id = ${input.responseId}
          then thread.title
          when thread.title = 'New conversation' then ${titleFromMessage(input.message)}
          else thread.title
        end,
        updated_at = case
          when thread.active_turn_message_id = ${input.message.id}
            and thread.active_turn_response_id = ${input.responseId}
          then thread.updated_at
          else clock_timestamp()
        end,
        updated_by_subject = case
          when thread.active_turn_message_id = ${input.message.id}
            and thread.active_turn_response_id = ${input.responseId}
          then thread.updated_by_subject
          else ${input.operator.actorSubject}
        end,
        updated_by_email = case
          when thread.active_turn_message_id = ${input.message.id}
            and thread.active_turn_response_id = ${input.responseId}
          then thread.updated_by_email
          else ${input.operator.email}
        end,
        updated_by_display_name = case
          when thread.active_turn_message_id = ${input.message.id}
            and thread.active_turn_response_id = ${input.responseId}
          then thread.updated_by_display_name
          else ${input.operator.displayName}
        end,
        version = case
          when thread.active_turn_message_id = ${input.message.id}
            and thread.active_turn_response_id = ${input.responseId}
          then thread.version
          else thread.version + 1
        end
      from owned_thread
      where thread.id = owned_thread.id
        and thread.state = 'OPEN'
        and not exists (select 1 from existing_response)
        and (
          not exists (select 1 from existing_user)
          or exists (
            select 1 from existing_user
            where existing_user.role = 'user'
              and existing_user.parts = ${parts}::jsonb
          )
        )
        and (
          thread.active_turn_response_id is null
          or (
            thread.active_turn_message_id = ${input.message.id}
            and thread.active_turn_response_id = ${input.responseId}
          )
          or thread.active_turn_lease_expires_at <= clock_timestamp()
        )
      returning thread.id
    ), expired_response as (
      update studio_assistant_messages as message
      set
        status = 'ERROR',
        updated_at = clock_timestamp()
      from owned_thread, lease_gate
      where message.thread_id = owned_thread.id
        and message.id = owned_thread.active_turn_response_id
        and message.role = 'assistant'
        and message.status = 'PENDING'
        and owned_thread.active_turn_response_id is distinct from ${input.responseId}
        and owned_thread.active_turn_lease_expires_at <= clock_timestamp()
      returning message.id
    ), claimed_user as (
      insert into studio_assistant_messages (
        thread_id, id, role, parts, status,
        author_subject, author_email, author_display_name,
        created_at, updated_at
      )
      select
        owned_thread.id, ${input.message.id}, 'user', ${parts}::jsonb, 'COMPLETE',
        ${input.operator.actorSubject}, ${input.operator.email}, ${input.operator.displayName},
        clock_timestamp(), clock_timestamp()
      from owned_thread cross join lease_gate
      on conflict (thread_id, id) do update
        set updated_at = studio_assistant_messages.updated_at
      returning role, parts, sequence
    ), matching_user as (
      select role, parts, sequence
      from claimed_user
      where role = 'user'
        and parts = ${parts}::jsonb
    ), claimed_response as (
      insert into studio_assistant_messages (
        thread_id, id, role, parts, status,
        author_subject, author_email, author_display_name,
        model, token_usage, created_at, updated_at
      )
      select
        owned_thread.id, ${input.responseId}, 'assistant', '[]'::jsonb, 'PENDING',
        null, null, 'Ask Studio', ${input.model}, null,
        clock_timestamp() + interval '1 microsecond',
        clock_timestamp() + interval '1 microsecond'
      from owned_thread cross join matching_user
      on conflict (thread_id, id) do update
        set updated_at = studio_assistant_messages.updated_at
      returning id, role, status, sequence, (xmax = 0) as acquired
    ), user_view as (
      select role, parts, sequence from existing_user
      union all
      select role, parts, sequence from claimed_user
      limit 1
    ), response_view as (
      select id, role, status, sequence, false as acquired from existing_response
      union all
      select id, role, status, sequence, acquired from claimed_response
      limit 1
    )
    select
      (select state from owned_thread) as thread_state,
      (select role from user_view) as user_role,
      (select parts from user_view) as user_parts,
      (select id from response_view) as response_id,
      (select role from response_view) as response_role,
      (select status from response_view) as response_status,
      (select sequence from response_view) as response_sequence,
      (select acquired from response_view) as response_acquired,
      exists (select 1 from lease_gate) as lease_acquired,
      (select count(*) from expired_response) as expired_response_count
  `);
  const row = result.rows[0];
  if (!row?.thread_state) notFound();
  if (row.thread_state !== "OPEN") {
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      "That conversation is archived.",
      "Restore it from History before continuing the worklane.",
    );
  }

  if (!databaseBoolean(row.lease_acquired) && !row.response_id && !row.user_role) {
    throw new StudioEngineError(
      "THREAD_BUSY",
      409,
      "This conversation is answering another question.",
      "Your question is preserved. Send it when the current reply finishes.",
    );
  }

  const existingFingerprint = sha256(textFromParts(row.user_parts));
  if (row.user_role !== "user" || existingFingerprint !== input.contentFingerprint) {
    throw new StudioEngineError(
      "VERSION_CONFLICT",
      409,
      "That message ID already belongs to different conversation content.",
      "Refresh the conversation before sending it again.",
    );
  }
  if (row.response_role !== "assistant" || row.response_id !== input.responseId) {
    throw new StudioEngineError(
      "VERSION_CONFLICT",
      409,
      "That assistant response ID belongs to another message.",
      "Reload the conversation before continuing.",
    );
  }
  if (
    row.response_status !== "PENDING"
    && row.response_status !== "COMPLETE"
    && row.response_status !== "ERROR"
    && row.response_status !== "ABORTED"
  ) {
    throw new StudioEngineError(
      "VERSION_CONFLICT",
      409,
      "That assistant response has an invalid state.",
      "Reload the conversation before continuing.",
    );
  }
  const responseSequence = Number(row.response_sequence);
  if (!Number.isSafeInteger(responseSequence) || responseSequence <= 0) {
    throw new StudioEngineError(
      "VERSION_CONFLICT",
      409,
      "That assistant response has no valid conversation order.",
      "Reload the conversation before continuing.",
    );
  }

  return {
    contentFingerprint: input.contentFingerprint,
    kind: databaseBoolean(row.response_acquired) ? "ACQUIRED" : row.response_status,
    responseId: input.responseId,
    responseSequence,
  };
}

export async function saveStudioAssistantResponse(input: {
  message: StudioAssistantUIMessage;
  model: string | null;
  operator: StudioOperator;
  status: "ABORTED" | "COMPLETE" | "ERROR";
  threadId: string;
  tokenUsage?: Record<string, number> | null;
}) {
  const parts = JSON.stringify(input.message.parts);
  const tokenUsage = input.tokenUsage ? JSON.stringify(input.tokenUsage) : null;
  const database = await getStudioDb();
  const result = await database.execute<SaveResponseDatabaseRow>(sql`
    with owned_thread as (
      select id, active_turn_message_id, active_turn_response_id
      from studio_assistant_threads
      where id = ${input.threadId}::uuid
        and workspace_id = ${input.operator.workspaceId}::uuid
      limit 1
    ), candidate as (
      select message.role, message.status
      from studio_assistant_messages as message
      inner join owned_thread on owned_thread.id = message.thread_id
      where message.id = ${input.message.id}
      limit 1
    ), updated_response as (
      update studio_assistant_messages as message
      set
        model = ${input.model},
        parts = ${parts}::jsonb,
        status = ${input.status}::studio_assistant_message_state,
        token_usage = ${tokenUsage}::jsonb,
        updated_at = clock_timestamp()
      from owned_thread, candidate
      where message.thread_id = owned_thread.id
        and message.id = ${input.message.id}
        and message.role = 'assistant'
        and message.status = 'PENDING'
        and candidate.role = 'assistant'
        and candidate.status = 'PENDING'
        and owned_thread.active_turn_message_id is not null
        and owned_thread.active_turn_response_id = ${input.message.id}
      returning message.status
    ), released_thread as (
      update studio_assistant_threads as thread
      set
        active_turn_message_id = null,
        active_turn_response_id = null,
        active_turn_lease_expires_at = null,
        updated_at = clock_timestamp(),
        updated_by_subject = ${input.operator.actorSubject},
        updated_by_email = ${input.operator.email},
        updated_by_display_name = ${input.operator.displayName},
        version = thread.version + 1
      where thread.id = (select id from owned_thread)
        and thread.active_turn_response_id = ${input.message.id}
        and exists (select 1 from updated_response)
      returning thread.id
    )
    select
      exists (select 1 from owned_thread) as thread_exists,
      exists (select 1 from candidate) as response_exists,
      (select role from candidate) as response_role,
      coalesce(
        (select status::text from updated_response),
        (select status::text from candidate)
      ) as response_status,
      exists (select 1 from updated_response) as response_updated,
      exists (select 1 from released_thread) as lease_released
  `);
  const row = result.rows[0];
  if (!databaseBoolean(row?.thread_exists ?? null)) notFound();
  if (
    databaseBoolean(row?.response_exists ?? null)
    && row?.response_role === "assistant"
    && !databaseBoolean(row.response_updated)
    && row.response_status !== input.status
  ) {
    const [fresh] = await database.select({
      role: studioAssistantMessages.role,
      status: studioAssistantMessages.status,
    }).from(studioAssistantMessages).where(and(
      eq(studioAssistantMessages.threadId, input.threadId),
      eq(studioAssistantMessages.id, input.message.id),
    )).limit(1);
    if (fresh?.role === "assistant" && fresh.status === input.status) {
      await compactStudioAssistantHistory({ operator: input.operator, threadId: input.threadId });
      return;
    }
  }
  if (
    !databaseBoolean(row?.response_exists ?? null)
    || row?.response_role !== "assistant"
    || row.response_status !== input.status
    || (databaseBoolean(row.response_updated) && !databaseBoolean(row.lease_released))
  ) {
    throw new StudioEngineError(
      "VERSION_CONFLICT",
      409,
      "That assistant response is already in a different terminal state.",
      "Reload the conversation before continuing.",
    );
  }
  await compactStudioAssistantHistory({ operator: input.operator, threadId: input.threadId });
}

/**
 * Reconciles a claimed reply without invoking a model or a Studio tool. A
 * recent PENDING row keeps its lease; an orphan older than one minute becomes
 * a truthful ERROR so the preserved question can be sent again deliberately.
 */
export async function reconcileStudioAssistantReply(input: {
  expectedThreadVersion: number;
  messageId: string;
  operator: StudioOperator;
  threadId: string;
}): Promise<Readonly<{
  outcome: StudioAssistantReplyReconcileOutcome;
  thread: StudioAssistantThreadDetail;
}>> {
  const result = await (await getStudioDb()).execute<ReconcileReplyDatabaseRow>(sql`
    with owned_thread as (
      select
        id,
        version,
        active_turn_response_id,
        active_turn_lease_expires_at
      from studio_assistant_threads
      where id = ${input.threadId}::uuid
        and workspace_id = ${input.operator.workspaceId}::uuid
      limit 1
    ), candidate as (
      select message.role, message.status, message.updated_at
      from studio_assistant_messages as message
      inner join owned_thread on owned_thread.id = message.thread_id
      where message.id = ${input.messageId}
      limit 1
    ), recovered as (
      update studio_assistant_messages as message
      set
        status = 'ERROR',
        updated_at = clock_timestamp()
      from owned_thread, candidate
      where message.thread_id = owned_thread.id
        and message.id = ${input.messageId}
        and message.role = 'assistant'
        and message.status = 'PENDING'
        and candidate.role = 'assistant'
        and candidate.status = 'PENDING'
        and owned_thread.version = ${input.expectedThreadVersion}
        and (
          (
            owned_thread.active_turn_response_id = ${input.messageId}
            and owned_thread.active_turn_lease_expires_at <= clock_timestamp()
          )
          or (
            owned_thread.active_turn_response_id is null
            and candidate.updated_at <= clock_timestamp() - interval '${sql.raw(String(STUDIO_ASSISTANT_REPLY_LEASE_SECONDS))} seconds'
          )
        )
      returning message.id
    ), touched_thread as (
      update studio_assistant_threads as thread
      set
        active_turn_message_id = case
          when thread.active_turn_response_id = ${input.messageId} then null
          else thread.active_turn_message_id
        end,
        active_turn_response_id = case
          when thread.active_turn_response_id = ${input.messageId} then null
          else thread.active_turn_response_id
        end,
        active_turn_lease_expires_at = case
          when thread.active_turn_response_id = ${input.messageId} then null
          else thread.active_turn_lease_expires_at
        end,
        updated_at = clock_timestamp(),
        updated_by_subject = ${input.operator.actorSubject},
        updated_by_email = ${input.operator.email},
        updated_by_display_name = ${input.operator.displayName},
        version = thread.version + 1
      where thread.id = (select id from owned_thread)
        and exists (select 1 from recovered)
      returning thread.id
    )
    select
      exists (select 1 from owned_thread) as thread_exists,
      (select version from owned_thread) as thread_version,
      exists (select 1 from candidate) as response_exists,
      (select role from candidate) as response_role,
      (select status from candidate) as response_status,
      exists (select 1 from recovered) as recovered,
      exists (select 1 from touched_thread) as thread_touched
  `);
  const row = result.rows[0];
  if (!databaseBoolean(row?.thread_exists ?? null)) notFound();
  if (!databaseBoolean(row?.response_exists ?? null)) {
    throw new StudioEngineError(
      "INTAKE_NOT_FOUND",
      404,
      "That Ask Studio reply is unavailable.",
      "Refresh the conversation before checking it again.",
    );
  }
  if (row?.response_role !== "assistant") {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      400,
      "Only an Ask Studio reply can be reconciled.",
      "Choose the interrupted reply below the preserved question.",
    );
  }

  const thread = await getStudioAssistantThread(input.operator, input.threadId);
  const response = thread.messages.find((stored) => stored.message.id === input.messageId);
  if (!response || response.message.role !== "assistant") {
    throw new StudioEngineError(
      "INTAKE_NOT_FOUND",
      404,
      "That Ask Studio reply is unavailable.",
      "Refresh the conversation before checking it again.",
    );
  }
  if (response.status !== "PENDING") {
    return {
      outcome: databaseBoolean(row?.recovered ?? null) ? "RECOVERED" : "TERMINAL",
      thread,
    };
  }
  if (Number(row?.thread_version) !== input.expectedThreadVersion) {
    throw new StudioEngineError(
      "VERSION_CONFLICT",
      409,
      "This conversation changed in another session.",
      "Refresh the conversation before checking that reply again.",
    );
  }
  return { outcome: "RUNNING", thread };
}

export async function updateStudioAssistantThreadFocus(input: {
  focus: StudioAssistantFocus | null;
  operator: StudioOperator;
  threadId: string;
  turnMessageId: string;
}) {
  const responseId = studioAssistantResponseId(input.threadId, input.turnMessageId);
  const [updated] = await (await getStudioDb()).update(studioAssistantThreads).set({
    focus: input.focus,
    updatedAt: new Date(),
    updatedByDisplayName: input.operator.displayName,
    updatedByEmail: input.operator.email,
    updatedBySubject: input.operator.actorSubject,
    version: sql`${studioAssistantThreads.version} + 1`,
  }).where(and(
    eq(studioAssistantThreads.id, input.threadId),
    eq(studioAssistantThreads.workspaceId, input.operator.workspaceId),
    eq(studioAssistantThreads.state, "OPEN"),
    eq(studioAssistantThreads.activeTurnMessageId, input.turnMessageId),
    eq(studioAssistantThreads.activeTurnResponseId, responseId),
  )).returning({ id: studioAssistantThreads.id });
  if (!updated) {
    throw new StudioEngineError(
      "VERSION_CONFLICT",
      409,
      "This Ask Studio turn no longer owns the conversation focus.",
      "Refresh the conversation before continuing.",
    );
  }
}

export async function updateStudioAssistantThread(input: {
  action:
    | { kind: "ARCHIVE" }
    | { kind: "RESTORE" }
    | { kind: "RENAME"; title: string }
    | { kind: "SAVE_TASK"; task: StudioAssistantThreadTask }
    | { kind: "SET_TASK_STATUS"; status: "DONE" | "OPEN"; taskId: string }
    | { kind: "DELETE_TASK"; taskId: string };
  expectedVersion: number;
  idempotencyKey?: string;
  operator: StudioOperator;
  threadId: string;
}): Promise<StudioAssistantThreadDetail> {
  if (
    input.action.kind === "RENAME"
    || input.action.kind === "ARCHIVE"
    || input.action.kind === "RESTORE"
  ) {
    if (!input.idempotencyKey) {
      throw new StudioEngineError(
        "INVALID_REQUEST",
        400,
        "That conversation action has no durable command identity.",
        "Reload History and try again.",
      );
    }
    const action = input.action;
    const title = action.kind === "RENAME" ? action.title.trim() : null;
    const requestFingerprint = sha256(JSON.stringify({
      action: action.kind,
      expectedVersion: input.expectedVersion,
      threadId: input.threadId,
      ...(title ? { title } : {}),
    }));
    const result = await (await getStudioDb()).execute<ThreadCommandDatabaseRow>(sql`
      with command_lock as materialized (
        select pg_advisory_xact_lock(hashtextextended(
          ${`juw:studio:assistant-thread:${input.operator.workspaceId}:${input.idempotencyKey}`}::text,
          0
        ))
      ), existing_command as materialized (
        select command.*
        from studio_assistant_thread_commands as command, command_lock
        where command.workspace_id = ${input.operator.workspaceId}::uuid
          and command.idempotency_key = ${input.idempotencyKey}
        limit 1
      ), target as materialized (
        select thread.*
        from studio_assistant_threads as thread, command_lock
        where thread.id = ${input.threadId}::uuid
          and thread.workspace_id = ${input.operator.workspaceId}::uuid
        for update of thread
      ), mutation as (
        update studio_assistant_threads as thread
        set
          title = case when ${action.kind}::text = 'RENAME' then ${title}::text else thread.title end,
          state = case
            when ${action.kind}::text = 'ARCHIVE' then 'ARCHIVED'::studio_assistant_thread_state
            when ${action.kind}::text = 'RESTORE' then 'OPEN'::studio_assistant_thread_state
            else thread.state
          end,
          archived_at = case
            when ${action.kind}::text = 'ARCHIVE' then clock_timestamp()
            when ${action.kind}::text = 'RESTORE' then null
            else thread.archived_at
          end,
          updated_at = clock_timestamp(),
          updated_by_subject = ${input.operator.actorSubject},
          updated_by_email = ${input.operator.email},
          updated_by_display_name = ${input.operator.displayName},
          version = thread.version + 1
        from target
        where thread.id = target.id
          and target.version = ${input.expectedVersion}
          and not exists (select 1 from existing_command)
          and (
            ${action.kind}::text = 'RENAME'
            or (${action.kind}::text = 'ARCHIVE' and target.state = 'OPEN' and target.active_turn_response_id is null)
            or (${action.kind}::text = 'RESTORE' and target.state = 'ARCHIVED')
          )
        returning thread.*
      ), created_command as (
        insert into studio_assistant_thread_commands (
          workspace_id, thread_id, actor_subject, action,
          expected_version, resulting_version, idempotency_key, request_fingerprint
        )
        select
          ${input.operator.workspaceId}::uuid, mutation.id, ${input.operator.actorSubject}, ${action.kind},
          ${input.expectedVersion}, mutation.version, ${input.idempotencyKey}, ${requestFingerprint}
        from mutation
        returning *
      ), resolved_command as (
        select * from created_command
        union all
        select * from existing_command
      )
      select
        action,
        actor_subject,
        expected_version,
        idempotency_key,
        request_fingerprint,
        resulting_version,
        thread_id
      from resolved_command
      limit 1
    `);
    const command = result.rows[0];
    if (command) {
      if (
        command.thread_id !== input.threadId
        || command.action !== action.kind
        || command.idempotency_key !== input.idempotencyKey
        || command.request_fingerprint !== requestFingerprint
      ) {
        throw new StudioEngineError(
          "VERSION_CONFLICT",
          409,
          "That conversation action key was already used for a different request.",
          "Refresh History and prepare the action again.",
        );
      }
      return getStudioAssistantThread(input.operator, input.threadId);
    }

    const current = await threadRow(input.operator, input.threadId);
    if (current.version !== input.expectedVersion) {
      throw new StudioEngineError(
        "VERSION_CONFLICT",
        409,
        "This conversation changed in another session.",
        "Refresh History and try that action again.",
      );
    }
    if (action.kind === "ARCHIVE" && current.activeTurnResponseId) {
      throw new StudioEngineError(
        "THREAD_BUSY",
        409,
        "This conversation is still answering a question.",
        "Wait for the reply to finish before archiving it.",
      );
    }
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      action.kind === "RESTORE" ? "That conversation is already active." : "That conversation is already archived.",
      "Refresh History to see its current state.",
    );
  }

  const current = await threadRow(input.operator, input.threadId);
  if (current.version !== input.expectedVersion) {
    throw new StudioEngineError(
      "VERSION_CONFLICT",
      409,
      "This conversation changed in another session.",
      "Refresh History and try that action again.",
    );
  }

  const action = input.action;
  const work = pendingWork(current.pendingWork);
  let nextWork = work;
  if (action.kind === "SAVE_TASK") {
    nextWork = work.some((task) => task.id === action.task.id)
      ? work
      : [...work, action.task].slice(-24);
  } else if (action.kind === "SET_TASK_STATUS") {
    nextWork = work.map((task) => task.id === action.taskId
      ? { ...task, status: action.status }
      : task);
  } else if (action.kind === "DELETE_TASK") {
    nextWork = work.filter((task) => task.id !== action.taskId);
  }

  const rows = await (await getStudioDb()).update(studioAssistantThreads).set({
    pendingWork: nextWork,
    updatedAt: new Date(),
    updatedByDisplayName: input.operator.displayName,
    updatedByEmail: input.operator.email,
    updatedBySubject: input.operator.actorSubject,
    version: sql`${studioAssistantThreads.version} + 1`,
  }).where(and(
    eq(studioAssistantThreads.id, input.threadId),
    eq(studioAssistantThreads.workspaceId, input.operator.workspaceId),
    eq(studioAssistantThreads.version, input.expectedVersion),
  )).returning({ id: studioAssistantThreads.id });
  if (!rows.length) {
    throw new StudioEngineError(
      "VERSION_CONFLICT",
      409,
      "This conversation changed in another session.",
      "Refresh History and try that action again.",
    );
  }
  return getStudioAssistantThread(input.operator, input.threadId);
}
