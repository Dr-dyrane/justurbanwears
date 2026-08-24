"use client";

import type { StudioApplicationProjection } from "../application/contracts";
import type { StudioScenario } from "../simulator";

export type StudioApplicationStatus = "idle" | "loading" | "ready" | "error";

type ApiFailure = { error?: { message?: string; recovery?: string } };

async function body<T>(response: Response): Promise<T> {
  const value = await response.json().catch(() => ({})) as T | ApiFailure;
  if (response.ok) return value as T;
  const failure = value as ApiFailure;
  throw new Error(
    [failure.error?.message, failure.error?.recovery].filter(Boolean).join(" ")
      || "Studio could not read its current snapshot.",
  );
}

export async function readStudioApplication(
  input: { scenario?: StudioScenario | null; signal?: AbortSignal } = {},
): Promise<StudioApplicationProjection> {
  const query = input.scenario
    ? `?scenario=${encodeURIComponent(input.scenario)}`
    : "";
  const response = await fetch(`/api/studio/application${query}`, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { accept: "application/json" },
    signal: input.signal,
  });
  return body<StudioApplicationProjection>(response);
}
