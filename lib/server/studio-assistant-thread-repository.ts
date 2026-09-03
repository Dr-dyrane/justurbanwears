import { and, desc, eq, sql } from "drizzle-orm";
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
  response_acquired: boolean | number | string | null;
  response_id: string | null;
  response_role: string | null;
  response_status: string | null;
  thread_state: string | null;
  user_parts: unknown;
  user_role: string | null;
};

type ReconcileReplyDatabaseRow = {
  recovered: boolean | number | string | null;
  response_exists: boolean | number | string | null;
  response_role: string | null;
  response_status: string | null;
  thread_exists: boolean | number | string | null;
  thread_version: number | string | null;
};

const STUDIO_ASSISTANT_REPLY_LEASE_SECONDS = 60;

export type StudioAssistantTurnBeginResult = Readonly<{
  contentFingerprint: string;
  kind: "ABORTED" | "ACQUIRED" | "COMPLETE" | "ERROR" | "PENDING";
  responseId: string;
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
    status: row.status,
    tokenUsage: row.tokenUsage,
  };
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
  operator: StudioOperator;
  title?: string;
}): Promise<StudioAssistantThreadDetail> {
  const title = input.title?.trim() || "New conversation";
  const rows = await (await getStudioDb()).insert(studioAssistantThreads).values({
    createdByDisplayName: input.operator.displayName,
    createdByEmail: input.operator.email,
    createdBySubject: input.operator.actorSubject,
    focus: input.focus ?? null,
    title,
    updatedByDisplayName: input.operator.displayName,
    updatedByEmail: input.operator.email,
    updatedBySubject: input.operator.actorSubject,
    workspaceId: input.operator.workspaceId,
  }).returning();
  const row = rows[0];
  if (!row) throw new Error("Ask Studio did not create the conversation.");
  return { ...summary(row), messages: [], pendingWork: [] };
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
): Promise<StudioAssistantThreadDetail> {
  const row = await threadRow(operator, threadId);
  const messageRows = await (await getStudioDb()).select()
    .from(studioAssistantMessages)
    .where(eq(studioAssistantMessages.threadId, threadId))
    .orderBy(desc(studioAssistantMessages.createdAt), desc(studioAssistantMessages.id))
    .limit(120);
  return {
    ...summary(row),
    messages: messageRows.reverse().map(storedMessage),
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
 * Claims one shared conversation turn in a single PostgreSQL statement.
 * The no-op conflict updates make a concurrent winner visible without changing
 * its immutable user content or resetting an existing assistant terminal state.
 */
export async function beginStudioAssistantTurn(input: {
  contentFingerprint: string;
  focus: StudioAssistantFocus | null;
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
      select id, state, title
      from studio_assistant_threads
      where id = ${input.threadId}::uuid
        and workspace_id = ${input.operator.workspaceId}::uuid
      limit 1
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
      from owned_thread
      where owned_thread.state = 'OPEN'
      on conflict (thread_id, id) do update
        set updated_at = studio_assistant_messages.updated_at
      returning role, parts
    ), matching_user as (
      select role, parts
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
      returning id, role, status, (xmax = 0) as acquired
    ), touched_thread as (
      update studio_assistant_threads as thread
      set
        focus = ${serializedFocus}::jsonb,
        title = case
          when thread.title = 'New conversation' then ${titleFromMessage(input.message)}
          else thread.title
        end,
        updated_at = clock_timestamp(),
        updated_by_subject = ${input.operator.actorSubject},
        updated_by_email = ${input.operator.email},
        updated_by_display_name = ${input.operator.displayName},
        version = thread.version + 1
      where thread.id = ${input.threadId}::uuid
        and exists (
          select 1 from claimed_response
          where claimed_response.acquired
            and claimed_response.role = 'assistant'
            and claimed_response.status = 'PENDING'
        )
      returning thread.id
    )
    select
      (select state from owned_thread) as thread_state,
      (select role from claimed_user) as user_role,
      (select parts from claimed_user) as user_parts,
      (select id from claimed_response) as response_id,
      (select role from claimed_response) as response_role,
      (select status from claimed_response) as response_status,
      (select acquired from claimed_response) as response_acquired,
      exists (select 1 from touched_thread) as thread_touched
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

  return {
    contentFingerprint: input.contentFingerprint,
    kind: databaseBoolean(row.response_acquired) ? "ACQUIRED" : row.response_status,
    responseId: input.responseId,
  };
}

async function touchThread(input: {
  focus?: StudioAssistantFocus | null;
  operator: StudioOperator;
  threadId: string;
  title?: string;
}) {
  await (await getStudioDb()).update(studioAssistantThreads).set({
    ...(input.focus !== undefined ? { focus: input.focus } : {}),
    ...(input.title ? { title: input.title } : {}),
    updatedAt: new Date(),
    updatedByDisplayName: input.operator.displayName,
    updatedByEmail: input.operator.email,
    updatedBySubject: input.operator.actorSubject,
    version: sql`${studioAssistantThreads.version} + 1`,
  }).where(and(
    eq(studioAssistantThreads.id, input.threadId),
    eq(studioAssistantThreads.workspaceId, input.operator.workspaceId),
  ));
}

export async function appendStudioAssistantUserMessage(input: {
  focus?: StudioAssistantFocus | null;
  message: StudioAssistantUIMessage;
  operator: StudioOperator;
  threadId: string;
}) {
  const thread = await threadRow(input.operator, input.threadId);
  if (thread.state !== "OPEN") {
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      "That conversation is archived.",
      "Restore it from History before continuing the worklane.",
    );
  }
  const inserted = await (await getStudioDb()).insert(studioAssistantMessages).values({
    authorDisplayName: input.operator.displayName,
    authorEmail: input.operator.email,
    authorSubject: input.operator.actorSubject,
    id: input.message.id,
    parts: input.message.parts as Array<Record<string, unknown>>,
    role: "user",
    status: "COMPLETE",
    threadId: input.threadId,
  }).onConflictDoNothing().returning({ id: studioAssistantMessages.id });

  if (!inserted.length) {
    const existing = await (await getStudioDb()).select()
      .from(studioAssistantMessages)
      .where(and(
        eq(studioAssistantMessages.threadId, input.threadId),
        eq(studioAssistantMessages.id, input.message.id),
      ))
      .limit(1);
    if (!existing[0]
      || existing[0].role !== "user"
      || JSON.stringify(existing[0].parts) !== JSON.stringify(input.message.parts)) {
      throw new StudioEngineError(
        "VERSION_CONFLICT",
        409,
        "That message no longer matches this conversation.",
        "Refresh the conversation before sending it again.",
      );
    }
    return;
  }

  await touchThread({
    focus: input.focus,
    operator: input.operator,
    threadId: input.threadId,
    ...(thread.title === "New conversation" ? { title: titleFromMessage(input.message) } : {}),
  });
}

export async function saveStudioAssistantResponse(input: {
  message: StudioAssistantUIMessage;
  model: string | null;
  operator: StudioOperator;
  status: "ABORTED" | "COMPLETE" | "ERROR";
  threadId: string;
  tokenUsage?: Record<string, number> | null;
}) {
  await threadRow(input.operator, input.threadId);
  const database = await getStudioDb();
  const [updated] = await database.update(studioAssistantMessages).set({
    model: input.model,
    parts: input.message.parts as Array<Record<string, unknown>>,
    status: input.status,
    tokenUsage: input.tokenUsage ?? null,
    updatedAt: new Date(),
  }).where(and(
    eq(studioAssistantMessages.threadId, input.threadId),
    eq(studioAssistantMessages.id, input.message.id),
    eq(studioAssistantMessages.role, "assistant"),
    eq(studioAssistantMessages.status, "PENDING"),
  )).returning({ id: studioAssistantMessages.id });
  if (!updated) {
    const [saved] = await database.select({
      role: studioAssistantMessages.role,
      status: studioAssistantMessages.status,
    })
      .from(studioAssistantMessages)
      .where(and(
        eq(studioAssistantMessages.threadId, input.threadId),
        eq(studioAssistantMessages.id, input.message.id),
      ))
      .limit(1);
    if (!saved || saved.role !== "assistant" || saved.status !== input.status) {
      throw new StudioEngineError(
        "VERSION_CONFLICT",
        409,
        "That assistant response is already in a different terminal state.",
        "Reload the conversation before continuing.",
      );
    }
    return;
  }
  await touchThread({ operator: input.operator, threadId: input.threadId });
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
      select id, version
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
        and candidate.updated_at <= clock_timestamp() - interval '${sql.raw(String(STUDIO_ASSISTANT_REPLY_LEASE_SECONDS))} seconds'
        and owned_thread.version = ${input.expectedThreadVersion}
      returning message.id
    ), touched_thread as (
      update studio_assistant_threads as thread
      set
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
}) {
  await threadRow(input.operator, input.threadId);
  await touchThread(input);
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
  operator: StudioOperator;
  threadId: string;
}): Promise<StudioAssistantThreadDetail> {
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

  const state = action.kind === "ARCHIVE"
    ? "ARCHIVED" as const
    : action.kind === "RESTORE"
      ? "OPEN" as const
      : current.state;
  const rows = await (await getStudioDb()).update(studioAssistantThreads).set({
    archivedAt: state === "ARCHIVED" ? new Date() : null,
    pendingWork: nextWork,
    state,
    ...(action.kind === "RENAME" ? { title: action.title.trim() } : {}),
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
