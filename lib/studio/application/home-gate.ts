import type { StudioHydrationState } from "../domain/state";
import type { StudioApplicationStatus } from "../services/studio-application-client";
import type { StudioAuthorityStatus } from "../services/studio-authority-client";

export type StudioHomeGate = "loading" | "error" | "ready";

export function selectStudioHomeGate(input: {
  applicationStatus: StudioApplicationStatus;
  authorityStatus: StudioAuthorityStatus;
  hydration: StudioHydrationState;
  scenario: boolean;
}): StudioHomeGate {
  if (input.hydration === "idle" || input.hydration === "restoring") return "loading";
  if (input.scenario) return "ready";
  if (input.applicationStatus === "error" || input.authorityStatus === "error") return "error";
  if (
    input.applicationStatus === "idle"
    || input.applicationStatus === "loading"
    || input.authorityStatus === "idle"
    || input.authorityStatus === "loading"
  ) return "loading";
  return "ready";
}
