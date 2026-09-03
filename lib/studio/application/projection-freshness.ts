import type { StudioApplicationStatus } from "../services/studio-application-client";

export type StudioProjectionFreshness = {
  asOf: string | null;
  state: "CURRENT" | "LOADING" | "STALE" | "UNAVAILABLE";
};

/** Keep useful last-known data, but never present a failed refresh as current. */
export function selectStudioProjectionFreshness(input: {
  error: string;
  generatedAt: string | null;
  status: StudioApplicationStatus;
}): StudioProjectionFreshness {
  if (input.generatedAt) {
    return {
      asOf: input.generatedAt,
      state: input.error ? "STALE" : "CURRENT",
    };
  }
  return {
    asOf: null,
    state: input.status === "error" ? "UNAVAILABLE" : "LOADING",
  };
}

export function studioProjectionAsOfLabel(value: string | null): string {
  if (!value) return "Last update unavailable";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Last update unavailable";
  return `Last updated ${new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(date)}`;
}
