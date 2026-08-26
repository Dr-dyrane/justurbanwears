import type { StudioAtelierReviewDecision } from "./studio-atelier-engine-facade";
import type { StudioAtelierReviewArtifact } from "./studio-atelier-review-artifact";
import type { StudioOperator } from "./studio-operator";
import { StudioEngineError } from "../studio/engine/errors";
import {
  loadStudioAtelierRouteRuntime,
  type StudioAtelierRouteRuntimeLoader,
} from "./studio-atelier-route-runtime";

function hiddenCandidate(): StudioEngineError {
  return new StudioEngineError(
    "INVALID_TRANSITION",
    409,
    "That Atelier operation does not have a reviewable candidate.",
    "Wait for private quality checks to pass, then reload the operation.",
  );
}

function decisionConflict(): StudioEngineError {
  return new StudioEngineError(
    "INVALID_TRANSITION",
    409,
    "That Atelier operation already has a different review outcome.",
    "Reload the durable operation projection and follow its current action.",
  );
}

export type StudioAtelierRouteService = Readonly<{
  prepare(operator: StudioOperator, declaration: unknown): ReturnType<
    Awaited<ReturnType<StudioAtelierRouteRuntimeLoader>>["facade"]["prepare"]
  >;
  run(operator: StudioOperator, operationId: string): ReturnType<
    Awaited<ReturnType<StudioAtelierRouteRuntimeLoader>>["agent"]["runPrepared"]
  >;
  recover(operator: StudioOperator, operationId: string): ReturnType<
    Awaited<ReturnType<StudioAtelierRouteRuntimeLoader>>["facade"]["readProjection"]
  >;
  readReviewMedia(
    operator: StudioOperator,
    operationId: string,
  ): Promise<StudioAtelierReviewArtifact>;
  decide(
    operator: StudioOperator,
    operationId: string,
    decision: StudioAtelierReviewDecision,
  ): ReturnType<
    Awaited<ReturnType<StudioAtelierRouteRuntimeLoader>>["facade"]["review"]
  >;
}>;

/**
 * Narrow authenticated route composition. It accepts only an operator identity
 * established by server auth, the strict declaration/operation ID and one
 * typed human decision. No provider, prompt, authority, hashes, QA evidence,
 * attempt, private locator or executable port can enter through this API.
 */
export function createStudioAtelierRouteService(input: Readonly<{
  loadRuntime: StudioAtelierRouteRuntimeLoader;
}>): StudioAtelierRouteService {
  return Object.freeze({
    async prepare(operator, declaration) {
      const runtime = await input.loadRuntime();
      return runtime.facade.prepare(operator.subject, declaration);
    },

    async run(operator, operationId) {
      const runtime = await input.loadRuntime();
      // The background gate, rather than facade.generate, owns the private
      // compare/correct/recheck loop. Its result is still a status-only DTO.
      return runtime.agent.runPrepared(operator.subject, operationId);
    },

    async recover(operator, operationId) {
      const runtime = await input.loadRuntime();
      return runtime.facade.readProjection(operator.subject, operationId);
    },

    async readReviewMedia(operator, operationId) {
      const runtime = await input.loadRuntime();
      return runtime.readReviewArtifact({ operator, operationId });
    },

    async decide(operator, operationId, decision) {
      const runtime = await input.loadRuntime();
      const current = await runtime.facade.readProjection(
        operator.subject,
        operationId,
      );

      // The facade also serves the private background driver and therefore can
      // record server-owned failure decisions. The authenticated human route
      // is intentionally narrower: it may never act on a hidden candidate.
      if (current.candidateVisibility !== "REVIEWABLE") {
        throw hiddenCandidate();
      }

      if (current.state === "LOCKED") {
        if (decision.decision !== "KEEP") throw decisionConflict();
        return runtime.facade.lockOrReuse(operator.subject, operationId);
      }
      if (current.state === "USER_APPROVED") {
        if (decision.decision !== "KEEP") throw decisionConflict();
        return runtime.facade.lockOrReuse(operator.subject, operationId);
      }
      if (current.state !== "SEMANTIC_PASS") throw hiddenCandidate();

      const reviewed = await runtime.facade.review(
        operator.subject,
        operationId,
        decision,
      );
      if (decision.decision !== "KEEP") return reviewed;

      // Keep authorizes an immutable lock of the same reviewed bytes. Locking
      // is deterministic/local and cannot invoke the provider. If the process
      // stops between review and lock, a repeated Keep resumes from the durable
      // USER_APPROVED projection above.
      return runtime.facade.lockOrReuse(operator.subject, operationId);
    },
  });
}

export const studioAtelierRouteService = createStudioAtelierRouteService({
  loadRuntime: loadStudioAtelierRouteRuntime,
});
