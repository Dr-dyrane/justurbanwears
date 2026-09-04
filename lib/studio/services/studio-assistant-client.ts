"use client";

import type {
  StudioAssistantReplyReconcileOutcome,
  StudioAssistantThreadDetail,
  StudioAssistantThreadSummary,
} from "../assistant/threads";
import type {
  StudioAssistantOperation,
  StudioAssistantOperationCommand,
} from "../assistant/tool-contracts";
import type { z } from "zod";
import type { updateStudioAssistantThreadSchema } from "../assistant/threads";

type ApiFailure = { error?: { code?: string; message?: string; recovery?: string } };

export class StudioAssistantClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
    readonly recovery: string | null,
  ) {
    super([message, recovery].filter(Boolean).join(" ") || "Ask Studio could not complete that action.");
    this.name = "StudioAssistantClientError";
  }
}

async function body<T>(response: Response): Promise<T> {
  const value = await response.json().catch(() => ({})) as T | ApiFailure;
  if (response.ok) return value as T;
  const failure = value as ApiFailure;
  throw new StudioAssistantClientError(
    response.status,
    failure.error?.code ?? null,
    failure.error?.message ?? "Ask Studio could not complete that action.",
    failure.error?.recovery ?? null,
  );
}

async function request<T>(path: string, init?: RequestInit) {
  return body<T>(await fetch(path, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}) },
    ...init,
  }));
}

export async function listStudioAssistantThreads(signal?: AbortSignal) {
  const response = await request<{ threads: StudioAssistantThreadSummary[] }>(
    "/api/studio/ask/threads",
    { signal },
  );
  return response.threads;
}

export async function createStudioAssistantThread(input: {
  idempotencyKey: string;
  pieceReference?: string;
  title?: string;
}) {
  const response = await request<{ thread: StudioAssistantThreadDetail }>(
    "/api/studio/ask/threads",
    { body: JSON.stringify(input), method: "POST" },
  );
  return response.thread;
}

export async function readStudioAssistantThread(id: string, signal?: AbortSignal) {
  const response = await request<{ thread: StudioAssistantThreadDetail }>(
    `/api/studio/ask/threads/${encodeURIComponent(id)}`,
    { signal },
  );
  return response.thread;
}

export async function updateStudioAssistantThread(
  id: string,
  input: z.infer<typeof updateStudioAssistantThreadSchema>,
) {
  const response = await request<{ thread: StudioAssistantThreadDetail }>(
    `/api/studio/ask/threads/${encodeURIComponent(id)}`,
    { body: JSON.stringify(input), method: "PATCH" },
  );
  return response.thread;
}

export async function reconcileStudioAssistantReply(
  threadId: string,
  messageId: string,
  expectedThreadVersion: number,
) {
  return request<{
    outcome: StudioAssistantReplyReconcileOutcome;
    thread: StudioAssistantThreadDetail;
  }>(
    `/api/studio/ask/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/reconcile`,
    { body: JSON.stringify({ expectedThreadVersion }), method: "POST" },
  );
}

export async function listStudioAssistantOperations(threadId: string, signal?: AbortSignal) {
  const response = await request<{ operations: StudioAssistantOperation[] }>(
    `/api/studio/ask/operations?threadId=${encodeURIComponent(threadId)}`,
    { signal },
  );
  return response.operations;
}

export async function readStudioAssistantOperation(id: string, signal?: AbortSignal) {
  const response = await request<{ operation: StudioAssistantOperation }>(
    `/api/studio/ask/operations/${encodeURIComponent(id)}`,
    { signal },
  );
  return response.operation;
}

export async function updateStudioAssistantOperation(
  id: string,
  input: StudioAssistantOperationCommand,
) {
  const response = await request<{ operation: StudioAssistantOperation }>(
    `/api/studio/ask/operations/${encodeURIComponent(id)}`,
    { body: JSON.stringify(input), method: "PATCH" },
  );
  return response.operation;
}
