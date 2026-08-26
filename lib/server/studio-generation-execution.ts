import type {
  StudioGenerationProviderResult,
  StudioGenerationProviderResultManifest,
} from "./studio-generation-result-store";
import { studioGenerationProviderResultsMatch } from "./studio-generation-result-store";

export type StudioPaidGenerationClaim<Row> =
  | { kind: "CLAIMED"; executionToken: string; row: Row }
  | { kind: "RESUME"; executionToken: string; row: Row }
  | { kind: "RECONCILE"; executionToken: string; row: Row }
  | { kind: "JOINED"; row: Row }
  | { kind: "INDETERMINATE"; row: Row }
  | { kind: "TERMINAL"; row: Row };

export type StudioPaidGenerationExecution<Row> =
  | { kind: "READY"; row: Row; executionToken: string; result: StudioGenerationProviderResult & StudioGenerationProviderResultManifest }
  | { kind: "JOINED"; row: Row }
  | { kind: "INDETERMINATE"; row: Row }
  | { kind: "TERMINAL"; row: Row };

export type StudioPaidGenerationIndeterminateMark<Row> =
  | { kind: "INDETERMINATE"; row: Row }
  | { kind: "RESULT_RECEIVED"; row: Row }
  | { kind: "LOST_CLAIM"; row: Row };

export class StudioPaidGenerationIndeterminateError extends Error {
  constructor(readonly causeError: unknown) {
    super("The paid provider invocation could not be reconciled safely.");
    this.name = "StudioPaidGenerationIndeterminateError";
  }
}

export function studioPaidAccountingQuarantineReason(
  costUsd: number | null,
  costCapUsd: number,
): "ACCOUNTING_UNVERIFIED" | "ACCOUNTING_POLICY_INVALID" | "COST_POLICY_EXCEEDED" | null {
  if (!Number.isFinite(costCapUsd) || costCapUsd < 0) return "ACCOUNTING_POLICY_INVALID";
  if (costUsd === null
    || !Number.isFinite(costUsd)
    || costUsd < 0
  ) return "ACCOUNTING_UNVERIFIED";
  return costUsd > costCapUsd ? "COST_POLICY_EXCEEDED" : null;
}

export function studioPaidResultRequiresQuarantine(costUsd: number | null, costCapUsd: number): boolean {
  return studioPaidAccountingQuarantineReason(costUsd, costCapUsd) !== null;
}

export function studioPaidProviderEvidenceQuarantineReason(
  result: StudioGenerationProviderResult,
  expectedModel: string,
  expectedProvider?: string,
): "MISSING_GATEWAY_USAGE" | "MISSING_PROVIDER_EVIDENCE" | "PROVIDER_WARNING" | "SERVED_MODEL_MISSING" | "SERVED_MODEL_MISMATCH" | "SERVED_PROVIDER_MISMATCH" | null {
  if (!result.usage || Object.keys(result.usage).length === 0) return "MISSING_GATEWAY_USAGE";
  const evidence = result.providerEvidence;
  if (!evidence || evidence.requestedModel !== expectedModel) return "MISSING_PROVIDER_EVIDENCE";
  if (evidence.warnings.length > 0) return "PROVIDER_WARNING";
  if (evidence.servedModels.length === 0) return "SERVED_MODEL_MISSING";
  if (evidence.servedModels.some((model) => model !== expectedModel)) return "SERVED_MODEL_MISMATCH";
  if (expectedProvider && evidence.servedProvider !== null && evidence.servedProvider !== expectedProvider) {
    return "SERVED_PROVIDER_MISMATCH";
  }
  return null;
}

export async function executeStudioPaidGeneration<Row>(input: {
  claim: () => Promise<StudioPaidGenerationClaim<Row>>;
  markInvocationStarted: (executionToken: string) => Promise<void>;
  invoke: () => Promise<StudioGenerationProviderResult>;
  persistResult: (result: StudioGenerationProviderResult) => Promise<StudioGenerationProviderResult & StudioGenerationProviderResultManifest>;
  readRetainedResult: () => Promise<(StudioGenerationProviderResult & StudioGenerationProviderResultManifest) | null>;
  checkpointResult: (
    executionToken: string,
    result: StudioGenerationProviderResultManifest,
  ) => Promise<void>;
  markIndeterminate: (executionToken: string) => Promise<StudioPaidGenerationIndeterminateMark<Row>>;
  markResultConflictIndeterminate: (executionToken: string) => Promise<boolean>;
}): Promise<StudioPaidGenerationExecution<Row>> {
  const claim = await input.claim();
  if (claim.kind === "JOINED" || claim.kind === "INDETERMINATE" || claim.kind === "TERMINAL") {
    return claim;
  }

  const reconcileUncertainResult = async (): Promise<StudioPaidGenerationExecution<Row>> => {
    const mark = await input.markIndeterminate(claim.executionToken);
    if (mark.kind === "INDETERMINATE") return mark;
    const concurrentlyRetained = await input.readRetainedResult().catch(() => null);
    if (concurrentlyRetained) {
      return {
        kind: "READY",
        row: mark.row,
        executionToken: claim.executionToken,
        result: concurrentlyRetained,
      };
    }
    return { kind: "JOINED", row: mark.row };
  };

  let retained: (StudioGenerationProviderResult & StudioGenerationProviderResultManifest) | null = null;
  if (claim.kind === "RESUME" || claim.kind === "RECONCILE") {
    retained = await input.readRetainedResult();
    if (!retained) {
      return reconcileUncertainResult();
    }
  } else {
    await input.markInvocationStarted(claim.executionToken);
    let providerResult: StudioGenerationProviderResult;
    try {
      providerResult = await input.invoke();
    } catch (error) {
      const recovered = await reconcileUncertainResult();
      if (recovered.kind !== "INDETERMINATE") return recovered;
      throw new StudioPaidGenerationIndeterminateError(error);
    }
    try {
      retained = await input.persistResult(providerResult);
    } catch (error) {
      retained = await input.readRetainedResult().catch(() => null);
      if (retained && studioGenerationProviderResultsMatch(retained, providerResult)) {
        // A same-result writer won the immutable Blob race. Continue with the
        // exact bytes and accounting that this worker received.
      } else {
        const mark = await input.markIndeterminate(claim.executionToken);
        if (mark.kind === "INDETERMINATE") {
          throw new StudioPaidGenerationIndeterminateError(error);
        }
        if (mark.kind === "RESULT_RECEIVED") {
          const checkpointed = await input.readRetainedResult().catch(() => null);
          if (checkpointed && studioGenerationProviderResultsMatch(checkpointed, providerResult)) {
            retained = checkpointed;
          } else {
            const quarantined = await input.markResultConflictIndeterminate(claim.executionToken);
            if (quarantined) throw new StudioPaidGenerationIndeterminateError(error);
            return { kind: "JOINED", row: mark.row };
          }
        } else {
          return { kind: "JOINED", row: mark.row };
        }
      }
    }
  }

  await input.checkpointResult(claim.executionToken, retained);
  return {
    kind: "READY",
    row: claim.row,
    executionToken: claim.executionToken,
    result: retained,
  };
}
