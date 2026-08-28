import type { StudioAtelierEngineFacade } from "./studio-atelier-engine-facade";
import type {
  CreateStudioAtelierProductionRuntimeInput,
  StudioAtelierProductionRuntime,
} from "./studio-atelier-production-runtime";
import type { StudioAtelierReviewArtifact } from "./studio-atelier-review-artifact";
import type { StudioOperator } from "./studio-operator";

export type StudioAtelierRouteRuntimeLoader =
  () => Promise<StudioAtelierProductionRuntime>;

export type StudioAtelierRecoveryRuntime = Readonly<{
  readProjection: StudioAtelierEngineFacade["readProjection"];
  readReviewArtifact(input: Readonly<{
    operator: StudioOperator;
    operationId: string;
  }>): Promise<StudioAtelierReviewArtifact>;
}>;

export type StudioAtelierRecoveryRuntimeLoader =
  () => Promise<StudioAtelierRecoveryRuntime>;

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
 * Caches one capability-minimal recovery composition. A failed construction is
 * not cached so a transient repository or private-storage repair can recover
 * without restarting the process.
 */
export function createStudioAtelierRecoveryRuntimeLoader(
  createRuntime: () => Promise<StudioAtelierRecoveryRuntime>,
): StudioAtelierRecoveryRuntimeLoader {
  let current: Promise<StudioAtelierRecoveryRuntime> | null = null;

  return async () => {
    if (current) return current;
    const task = createRuntime();
    current = task;
    try {
      return await task;
    } catch (error) {
      if (current === task) current = null;
      throw error;
    }
  };
}

const loadDefaultStudioAtelierRecoveryRuntime =
  createStudioAtelierRecoveryRuntimeLoader(async () => {
    const [durableEngine, reviewArtifact] = await Promise.all([
      import("./studio-atelier-durable-engine"),
      import("./studio-atelier-review-artifact"),
    ]);
    return Object.freeze({
      readProjection: durableEngine.readDurableStudioAtelierProjection,
      readReviewArtifact: reviewArtifact.readStudioAtelierReviewArtifact,
    });
  });

/**
 * Read-only recovery is intentionally independent from paid runtime
 * qualification. It can read only the operator-scoped durable projection and
 * the already-semantic-pass content-addressed review artifact; it exposes no
 * prepare, run, evaluator, review or lock capability.
 */
export function loadStudioAtelierRecoveryRuntime(): Promise<
  StudioAtelierRecoveryRuntime
> {
  return loadDefaultStudioAtelierRecoveryRuntime();
}

const loadDefaultStudioAtelierRouteRuntime = (() => {
  let current: Promise<StudioAtelierProductionRuntime> | null = null;
  return async () => {
    if (current) return current;
    const task = import("./studio-atelier-route-production-composition").then(
      ({ loadStudioAtelierRouteProductionRuntime }) =>
        loadStudioAtelierRouteProductionRuntime(),
    );
    current = task;
    try {
      return await task;
    } catch (error) {
      if (current === task) current = null;
      throw error;
    }
  };
})();

/**
 * The default route binding verifies qualification before loading any
 * I/O-bearing composition module. Today the canonical resolver is absent, so
 * this fails closed without probing Postgres/Blob or constructing a paid path.
 */
export function loadStudioAtelierRouteRuntime(): Promise<
  StudioAtelierProductionRuntime
> {
  return loadDefaultStudioAtelierRouteRuntime();
}
