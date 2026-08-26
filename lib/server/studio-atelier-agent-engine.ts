import {
  createStudioAtelierBackgroundGate,
  type StudioAtelierBackgroundGate,
} from "./studio-atelier-background-gate";
import type { StudioAtelierEngineFacade } from "./studio-atelier-engine-facade";
import {
  resolveStudioAtelierPrivateFailure,
} from "./studio-atelier-private-failure-resolver";

/**
 * Production composition for the private Atelier agent loop.
 *
 * The durable facade remains the lifecycle and paid-dispatch authority. The
 * ledger resolver reads only closed QA evidence, and the background gate is
 * the sole coordinator allowed to turn that evidence into the one bounded
 * correction operation permitted by the contract.
 */
export function createStudioAtelierAgentEngine(
  engine: StudioAtelierEngineFacade,
): StudioAtelierBackgroundGate {
  return createStudioAtelierBackgroundGate({
    engine,
    resolvePrivateFailure: resolveStudioAtelierPrivateFailure,
  });
}
