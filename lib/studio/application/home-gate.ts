import type { StudioHydrationState } from "../domain/state";
import type { StudioApplicationStatus } from "../services/studio-application-client";
import type { StudioAuthorityStatus } from "../services/studio-authority-client";

export type StudioHomeGate = "loading" | "error" | "ready";

export interface StudioDetailHydrationGate {
  isReleased(): boolean;
  release(): void;
  wait(): Promise<void>;
}

export interface StudioSingleFlight<Result = void> {
  clear(): void;
  run(task: () => Promise<Result>): Promise<Result>;
}

export function createStudioDetailHydrationGate(
  initiallyReleased = false,
): StudioDetailHydrationGate {
  let released = initiallyReleased;
  let resolve: (() => void) | undefined;
  const ready = initiallyReleased
    ? Promise.resolve()
    : new Promise<void>((accept) => { resolve = accept; });

  return {
    isReleased: () => released,
    release() {
      if (released) return;
      released = true;
      resolve?.();
      resolve = undefined;
    },
    wait: () => ready,
  };
}

export function createStudioSingleFlight<Result = void>(): StudioSingleFlight<Result> {
  let inFlight: Promise<Result> | null = null;
  return {
    clear() {
      inFlight = null;
    },
    run(task) {
      if (inFlight) return inFlight;
      const request = Promise.resolve().then(task);
      const shared = request.finally(() => {
        if (inFlight === shared) inFlight = null;
      });
      inFlight = shared;
      return shared;
    },
  };
}

export function selectStudioHomeGate(input: {
  applicationStatus: StudioApplicationStatus;
  authorityStatus: StudioAuthorityStatus;
  hydration: StudioHydrationState;
  scenario: boolean;
}): StudioHomeGate {
  if (input.scenario) {
    if (input.hydration === "idle" || input.hydration === "restoring") return "loading";
    return "ready";
  }
  if (input.applicationStatus === "error") return "error";
  if (
    input.applicationStatus === "idle"
    || input.applicationStatus === "loading"
  ) return "loading";
  return "ready";
}
