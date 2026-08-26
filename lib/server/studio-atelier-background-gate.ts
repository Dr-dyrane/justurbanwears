import type {
  StudioAtelierCommandResult,
  StudioAtelierEngineFacade,
  StudioAtelierLifecycleState,
  StudioAtelierReviewDecision,
} from "./studio-atelier-engine-facade";
import { StudioEngineError } from "../studio/engine/errors";

type FailedQualityState = Extract<
  StudioAtelierLifecycleState,
  "TECHNICAL_FAIL" | "SEMANTIC_FAIL"
>;

export type StudioAtelierPrivateFailureDecision = Extract<
  StudioAtelierReviewDecision,
  { decision: "FIX_ONE_THING" | "REJECT" }
>;

export type StudioAtelierPrivateCorrectionDecision = Extract<
  StudioAtelierPrivateFailureDecision,
  { decision: "FIX_ONE_THING" }
>;

export type StudioAtelierPrivateFailureResolver = (
  input: Readonly<{
    operatorSubject: string;
    operationId: string;
    stage: StudioAtelierCommandResult["stage"];
    view: StudioAtelierCommandResult["view"];
    state: FailedQualityState;
    correction: boolean;
  }>,
) => StudioAtelierPrivateFailureDecision
  | null
  | Promise<StudioAtelierPrivateFailureDecision | null>;

export interface StudioAtelierBackgroundGate {
  /**
   * Runs private materialization and quality work until the candidate is safe
   * for human review, is already approved/locked, or reaches a terminal block.
   * It never locks on the user's behalf and never performs more than the one
   * correction already permitted by the durable operation contract.
   */
  run(
    operatorSubject: string,
    declaration: unknown,
  ): Promise<StudioAtelierCommandResult>;
  /**
   * Resumes a previously prepared operation from its current durable
   * projection. The caller supplies only authenticated operator scope and the
   * server-issued operation ID; declaration truth is never resent or rebuilt.
   */
  runPrepared(
    operatorSubject: string,
    operationId: string,
  ): Promise<StudioAtelierCommandResult>;
}

function isQualityFailure(
  result: StudioAtelierCommandResult,
): result is StudioAtelierCommandResult & { state: FailedQualityState } {
  return result.state === "TECHNICAL_FAIL" || result.state === "SEMANTIC_FAIL";
}

function unavailable(message: string): StudioEngineError {
  return new StudioEngineError(
    "ENGINE_UNAVAILABLE",
    503,
    message,
    "The private candidate remains hidden. Review the durable operation before continuing.",
  );
}

function correctionOperationId(
  result: StudioAtelierCommandResult,
  sourceOperationId: string,
): string {
  if (
    result.nextAction !== "GENERATE_CORRECTION"
    || !result.continuationOperationId
  ) {
    throw unavailable("Studio did not persist the authorized correction operation.");
  }
  if (result.continuationOperationId === sourceOperationId) {
    throw unavailable("Studio did not create a distinct semantic correction operation.");
  }
  return result.continuationOperationId;
}

function assertCorrectionProjection(
  source: StudioAtelierCommandResult,
  correctionOperationId: string,
  correction: StudioAtelierCommandResult,
): void {
  if (
    correction.operationId !== correctionOperationId
    || correction.stage !== source.stage
    || correction.view !== source.view
  ) {
    throw unavailable("Studio returned a correction outside the source stage and view.");
  }
}

const UNCLASSIFIED_PRIVATE_FAILURE: StudioAtelierPrivateFailureDecision =
  Object.freeze({
    decision: "REJECT",
    reason: "PRIVATE_QA_UNCLASSIFIED",
  });

/**
 * Coordinates the server-only compare -> one bounded correction -> recheck
 * loop. The facade remains the sole paid-dispatch and lifecycle authority.
 * This coordinator deliberately returns the facade's sanitized projection;
 * it has no artifact-reading port and therefore cannot disclose candidate
 * bytes while private gates are running or failing.
 */
export function createStudioAtelierBackgroundGate(input: Readonly<{
  engine: StudioAtelierEngineFacade;
  resolvePrivateFailure: StudioAtelierPrivateFailureResolver;
}>): StudioAtelierBackgroundGate {
  const inFlight = new Map<string, Promise<StudioAtelierCommandResult>>();

  async function classifyAndRecord(
    operatorSubject: string,
    result: StudioAtelierCommandResult & { state: FailedQualityState },
    correction: boolean,
  ): Promise<StudioAtelierCommandResult> {
    let decision: StudioAtelierPrivateFailureDecision | null = null;
    try {
      decision = await input.resolvePrivateFailure({
        operatorSubject,
        operationId: result.operationId,
        stage: result.stage,
        view: result.view,
        state: result.state,
        correction,
      });
    } catch {
      // A private classifier outage must not leave a failed artifact exposed as
      // an actionable REVIEW candidate. Persist a bounded server rejection;
      // this does not invoke the provider or consume correction budget.
    }
    return input.engine.review(
      operatorSubject,
      result.operationId,
      decision ?? UNCLASSIFIED_PRIVATE_FAILURE,
    );
  }

  async function advance(
    operatorSubject: string,
    prepared: StudioAtelierCommandResult,
  ): Promise<StudioAtelierCommandResult> {
    let current = prepared;

    if (["DRAFT", "MATERIALIZED", "TECHNICAL_PASS"].includes(current.state)) {
      current = await input.engine.generate(operatorSubject, current.operationId);
    }

    if (current.nextAction === "RESUME_RECORDED_REVIEW") {
      current = await input.engine.resumeRecordedReview(
        operatorSubject,
        current.operationId,
      );
      if (current.nextAction === "RESUME_RECORDED_REVIEW") {
        throw unavailable("Studio did not finish reconciling the recorded correction review.");
      }
    }

    // A prior crash or reload may resume an already-authorized correction. Its
    // semantic operation ID is durable, so this is reconciliation, not a new
    // hidden retry decision.
    let correction = false;
    if (current.nextAction === "GENERATE_CORRECTION") {
      const source = current;
      const continuation = correctionOperationId(source, source.operationId);
      current = await input.engine.generate(
        operatorSubject,
        continuation,
      );
      assertCorrectionProjection(source, continuation, current);
      correction = true;
    }

    if (!isQualityFailure(current)) return current;

    const reviewed = await classifyAndRecord(operatorSubject, current, correction);
    if (correction) {
      if (
        reviewed.nextAction === "GENERATE_CORRECTION"
        || reviewed.state !== "BLOCKED_USER_DIRECTION"
      ) {
        throw unavailable("Studio attempted to authorize more than one private correction.");
      }
      return reviewed;
    }

    if (reviewed.state === "BLOCKED_USER_DIRECTION") return reviewed;

    const continuation = correctionOperationId(reviewed, current.operationId);
    const corrected = await input.engine.generate(
      operatorSubject,
      continuation,
    );
    assertCorrectionProjection(current, continuation, corrected);
    if (!isQualityFailure(corrected)) return corrected;

    // Recording the second failure with FIX_ONE_THING consumes no provider
    // call. The durable engine recognizes the exhausted correction ordinal and
    // transitions to BLOCKED_USER_DIRECTION.
    const blocked = await classifyAndRecord(operatorSubject, corrected, true);
    if (
      blocked.nextAction === "GENERATE_CORRECTION"
      || blocked.state !== "BLOCKED_USER_DIRECTION"
    ) {
      throw unavailable("Studio attempted to continue after its correction budget was exhausted.");
    }
    return blocked;
  }

  async function runFromProjection(
    operatorSubject: string,
    prepared: StudioAtelierCommandResult,
  ): Promise<StudioAtelierCommandResult> {
    const key = `${operatorSubject}\n${prepared.operationId}`;
    const active = inFlight.get(key);
    if (active) return active;

    const task = advance(operatorSubject, prepared);
    inFlight.set(key, task);
    try {
      return await task;
    } finally {
      if (inFlight.get(key) === task) inFlight.delete(key);
    }
  }

  async function run(
    operatorSubject: string,
    declaration: unknown,
  ): Promise<StudioAtelierCommandResult> {
    return runFromProjection(
      operatorSubject,
      await input.engine.prepare(operatorSubject, declaration),
    );
  }

  async function runPrepared(
    operatorSubject: string,
    operationId: string,
  ): Promise<StudioAtelierCommandResult> {
    return runFromProjection(
      operatorSubject,
      await input.engine.readProjection(operatorSubject, operationId),
    );
  }

  return Object.freeze({ run, runPrepared });
}
