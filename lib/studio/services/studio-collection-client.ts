"use client";

import type {
  StudioCollectionCommandResponse,
  StudioCollectionIntent,
  StudioCollectionPreview,
  StudioCollectionReceipt,
} from "../collections/contracts";
import type { StudioCollectionScope } from "../application/contracts";

type ApiFailure = { error?: { message?: string; recovery?: string } };

async function body<T>(response: Response): Promise<T> {
  const value = await response.json().catch(() => ({})) as T | ApiFailure;
  if (response.ok) return value as T;
  const failure = value as ApiFailure;
  throw new Error(
    [failure.error?.message, failure.error?.recovery].filter(Boolean).join(" ")
      || "Studio could not complete that drop change.",
  );
}

async function command(payload: Record<string, unknown>) {
  return body<StudioCollectionCommandResponse>(await fetch("/api/studio/collections", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(payload),
  }));
}

export async function previewStudioCollection(intent: StudioCollectionIntent): Promise<StudioCollectionPreview> {
  const response = await command({ phase: "PREVIEW", intent });
  if (!response.preview) throw new Error("Studio did not return a drop preview.");
  return response.preview;
}

export async function confirmStudioCollection(input: {
  preview: StudioCollectionPreview;
  idempotencyKey: string;
}): Promise<{ receipt: StudioCollectionReceipt; collections: StudioCollectionScope[] }> {
  const response = await command({
    phase: "CONFIRM",
    confirmation: input.preview.intent.command,
    expectedRevision: input.preview.expectedRevision,
    idempotencyKey: input.idempotencyKey,
    intent: input.preview.intent,
  });
  if (!response.receipt || !response.collections) throw new Error("Studio did not return a durable drop receipt.");
  return { receipt: response.receipt, collections: response.collections };
}
