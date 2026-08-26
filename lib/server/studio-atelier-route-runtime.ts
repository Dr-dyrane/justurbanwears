import { StudioEngineError } from "../studio/engine/errors";
import type {
  CreateStudioAtelierProductionRuntimeInput,
  StudioAtelierProductionRuntime,
} from "./studio-atelier-production-runtime";

export type StudioAtelierRouteRuntimeLoader =
  () => Promise<StudioAtelierProductionRuntime>;

/**
 * Converts one fully verified server composition into a process-local runtime
 * loader. Construction is cached because it verifies the exact G004 readback;
 * a rejected construction promise is not cached, so a repaired environment
 * can recover without a process restart.
 */
export function createStudioAtelierRouteRuntimeLoader(
  input: CreateStudioAtelierProductionRuntimeInput,
): StudioAtelierRouteRuntimeLoader {
  let current: Promise<StudioAtelierProductionRuntime> | null = null;

  return async () => {
    if (current) return current;
    const task = import("./studio-atelier-production-runtime").then(
      ({ createStudioAtelierProductionRuntime }) =>
        createStudioAtelierProductionRuntime(input),
    );
    current = task;
    try {
      return await task;
    } catch (error) {
      if (current === task) current = null;
      throw error;
    }
  };
}

/**
 * Production routes deliberately fail closed until the concrete, verified
 * server ports and readiness evidence are installed as one release atom.
 * This placeholder has no provider, repository or private-media dependency,
 * so exposing the route files cannot accidentally create a paid dispatch
 * path while migration/qualification/canvas readiness is incomplete.
 */
export async function loadStudioAtelierRouteRuntime(): Promise<
  StudioAtelierProductionRuntime
> {
  throw new StudioEngineError(
    "ENGINE_DISABLED",
    503,
    "The durable Atelier production runtime is not enabled on this host.",
    "Install and verify the server-owned Atelier ports, ledger migration, private store, authority, policy, qualification, and room readiness as one release atom.",
  );
}
