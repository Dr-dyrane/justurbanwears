import { z } from "zod";
import {
  deriveOperationId,
  semanticOperationHash,
} from "../studio/atelier/canonical";
import {
  AtelierDeclarationCompilationError,
  compileAtelierOperationWithReceiptsV1,
  resolveTrustedAtelierTruthBundle,
  studioAtelierDeclarationSchema,
  validateStudioAtelierDeclaration,
  type CompiledAtelierOperationWithReceiptsV1,
  type StudioAtelierDeclaration,
  type StudioAtelierFileVerificationEvidence,
  type TrustedAtelierTruthBundleInput,
} from "../studio/atelier/declaration-compiler";
import {
  ATELIER_STAGE_RECIPES,
  atelierStageSchema,
  atelierViewSchema,
} from "../studio/atelier/contracts";
import { StudioEngineError } from "../studio/engine/errors";
import {
  studioAtelierCandidateVisibility,
  type StudioAtelierCandidateVisibility,
} from "./studio-atelier-candidate-visibility";

const operatorSubjectSchema = z.string().trim().min(1).max(240);
const operationIdSchema = z.string().trim().min(1).max(240)
  .regex(/^[a-zA-Z0-9._:/-]+$/);

const studioAtelierCorrectionReasonSchema = z.enum([
  "IDENTITY_DRIFT",
  "BODY_DRIFT",
  "GARMENT_TRUTH_DRIFT",
  "FULL_BODY_GEOMETRY_FAILURE",
  "PHOTOREALISM_FAILURE",
  "IMMUTABLE_TRUTH_DRIFT",
  "ATELIER_PIXEL_DRIFT",
  "WRONG_STAGE_VIEW",
  "SUBJECT_REFINEMENT_FAILURE",
]);

export const studioAtelierReviewReasonSchema = z.union([
  studioAtelierCorrectionReasonSchema,
  z.literal("PRIVATE_QA_UNCLASSIFIED"),
]);

export const studioAtelierReviewTargetSchema = z.enum([
  "FACE_TRANSLATION",
  "BODY_GEOMETRY",
  "GARMENT_CONSTRUCTION",
  "GARMENT_SURFACE",
  "HAIR",
  "LEFT_HAND",
  "RIGHT_HAND",
  "FOOTWEAR",
  "POSE_ALIGNMENT",
  "CAMERA_ALIGNMENT",
  "LIGHTING_INTEGRATION",
  "OUTPUT_GEOMETRY",
]);

export const studioAtelierReviewDecisionSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("KEEP"),
  }).strict(),
  z.object({
    decision: z.literal("FIX_ONE_THING"),
    reason: studioAtelierCorrectionReasonSchema,
    target: studioAtelierReviewTargetSchema,
  }).strict(),
  z.object({
    decision: z.literal("REJECT"),
    reason: studioAtelierReviewReasonSchema,
  }).strict(),
]);

export type StudioAtelierReviewDecision = z.infer<
  typeof studioAtelierReviewDecisionSchema
>;

const lifecycleStateSchema = z.enum([
  "DRAFT",
  "MATERIALIZED",
  "TECHNICAL_PASS",
  "TECHNICAL_FAIL",
  "SEMANTIC_PASS",
  "SEMANTIC_FAIL",
  "USER_APPROVED",
  "USER_REJECTED",
  "LOCKED",
  "SUPERSEDED",
  "BLOCKED_USER_DIRECTION",
]);

export type StudioAtelierLifecycleState = z.infer<typeof lifecycleStateSchema>;

/**
 * Private command snapshot. Implementations construct this from the durable
 * operation projection and event ledger. It contains no bytes, paths, prompt,
 * provider identity, hashes, consent evidence, or QA evidence.
 */
export const studioAtelierServerSnapshotSchema = z.object({
  operationId: operationIdSchema,
  stage: atelierStageSchema,
  view: atelierViewSchema,
  state: lifecycleStateSchema,
  version: z.number().int().nonnegative(),
  correctionAuthorized: z.boolean(),
  correctionOperationId: operationIdSchema.nullable().default(null),
  reviewDecision: studioAtelierReviewDecisionSchema.nullable().default(null),
}).strict().superRefine((snapshot, context) => {
  const expectedView = ATELIER_STAGE_RECIPES[snapshot.stage].view;
  if (snapshot.view !== expectedView) {
    context.addIssue({
      code: "custom",
      path: ["view"],
      message: `${snapshot.stage} must project view ${expectedView}.`,
    });
  }
  if (snapshot.correctionOperationId && !snapshot.correctionAuthorized) {
    context.addIssue({
      code: "custom",
      path: ["correctionOperationId"],
      message: "A correction operation requires stored correction authorization.",
    });
  }
});

export type StudioAtelierServerSnapshot = z.infer<
  typeof studioAtelierServerSnapshotSchema
>;

export const studioAtelierNextActionSchema = z.enum([
  "GENERATE",
  "WAIT_FOR_MATERIALIZATION",
  "REVIEW",
  "LOCK_OR_REUSE",
  "USE_LOCKED",
  "RESUME_RECORDED_REVIEW",
  "GENERATE_CORRECTION",
  "USER_DIRECTION_REQUIRED",
  "NONE",
]);

export type StudioAtelierNextAction = z.infer<
  typeof studioAtelierNextActionSchema
>;

export type StudioAtelierCommandResult = Readonly<{
  operationId: string;
  stage: StudioAtelierServerSnapshot["stage"];
  view: StudioAtelierServerSnapshot["view"];
  state: StudioAtelierLifecycleState;
  version: number;
  candidateVisibility: StudioAtelierCandidateVisibility;
  nextAction: StudioAtelierNextAction;
  reused: boolean;
  continuationOperationId?: string;
}>;

export type StudioAtelierPrepareInput = Readonly<{
  operatorSubject: string;
  operationKey: string;
  semanticHash: string;
  compiled: CompiledAtelierOperationWithReceiptsV1;
}>;

export type StudioAtelierPrepareResult = Readonly<{
  snapshot: StudioAtelierServerSnapshot;
  created: boolean;
}>;

export type StudioAtelierMaterializeResult = Readonly<{
  snapshot: StudioAtelierServerSnapshot;
  /** True only when this command actually crossed the paid dispatch fence. */
  providerInvoked: boolean;
}>;

/**
 * Every port is server-owned. Route bodies may provide only the four facade
 * command arguments; they may never implement a port or forward a port result.
 *
 * `materializeOnce` must acquire the durable DB fence before dispatch, resolve
 * exact dynamic bytes and consent from server state, persist paid raw bytes
 * before policy, and fail closed on an uncertain provider outcome. It must not
 * rely on an auto-retrying workflow step for exactly-once spending.
 *
 * `advanceQualityOnce` resolves the stored candidate and produces technical
 * and semantic QA evidence server-side. `recordReviewOnce` resolves that QA
 * and stored lineage; FIX_ONE_THING atomically authorizes at most one bounded
 * correction and returns its server-derived operation ID. `lockApprovedOnce`
 * resolves the stored approval, exact artifact bytes and exact room bytes, and
 * performs any required deterministic composite before the immutable lock.
 */
export interface StudioAtelierEnginePorts {
  resolveFileVerification(input: Readonly<{
    operatorSubject: string;
    declaration: Readonly<StudioAtelierDeclaration>;
  }>): StudioAtelierFileVerificationEvidence
    | Promise<StudioAtelierFileVerificationEvidence>;
  resolveTrustedTruth(input: Readonly<{
    operatorSubject: string;
    declaration: Readonly<StudioAtelierDeclaration>;
  }>): TrustedAtelierTruthBundleInput | Promise<TrustedAtelierTruthBundleInput>;
  prepareCompiledOperation(
    input: StudioAtelierPrepareInput,
  ): Promise<StudioAtelierPrepareResult>;
  readProjection(input: Readonly<{
    operatorSubject: string;
    operationId: string;
  }>): Promise<StudioAtelierServerSnapshot | null>;
  materializeOnce(input: Readonly<{
    operatorSubject: string;
    operationId: string;
  }>): Promise<StudioAtelierMaterializeResult>;
  advanceQualityOnce(input: Readonly<{
    operatorSubject: string;
    operationId: string;
  }>): Promise<StudioAtelierServerSnapshot>;
  recordReviewOnce(input: Readonly<{
    operatorSubject: string;
    operationId: string;
    decision: StudioAtelierReviewDecision;
  }>): Promise<StudioAtelierServerSnapshot>;
  lockApprovedOnce(input: Readonly<{
    operatorSubject: string;
    operationId: string;
  }>): Promise<StudioAtelierServerSnapshot>;
}

export interface StudioAtelierEngineFacade {
  /**
   * Reads the current sanitized durable projection without preparing,
   * generating, reviewing, or locking anything.
   */
  readProjection(
    operatorSubject: string,
    operationId: string,
  ): Promise<StudioAtelierCommandResult>;
  prepare(
    operatorSubject: string,
    rawDeclaration: unknown,
  ): Promise<StudioAtelierCommandResult>;
  generate(
    operatorSubject: string,
    operationId: string,
  ): Promise<StudioAtelierCommandResult>;
  review(
    operatorSubject: string,
    operationId: string,
    decision: unknown,
  ): Promise<StudioAtelierCommandResult>;
  lockOrReuse(
    operatorSubject: string,
    operationId: string,
  ): Promise<StudioAtelierCommandResult>;
  /**
   * Replays only a previously stored FIX_ONE_THING review checkpoint. The
   * caller supplies no review reason or target, so private QA remains
   * server-owned while a crash between review events can converge.
   */
  resumeRecordedReview(
    operatorSubject: string,
    operationId: string,
  ): Promise<StudioAtelierCommandResult>;
}

function invalidRequest(message: string, recovery: string): StudioEngineError {
  return new StudioEngineError("INVALID_REQUEST", 400, message, recovery);
}

function invalidTransition(message: string, recovery: string): StudioEngineError {
  return new StudioEngineError("INVALID_TRANSITION", 409, message, recovery);
}

function unavailable(message: string, recovery: string): StudioEngineError {
  return new StudioEngineError("ENGINE_UNAVAILABLE", 503, message, recovery);
}

function parseOperatorSubject(value: unknown): string {
  const parsed = operatorSubjectSchema.safeParse(value);
  if (!parsed.success) {
    throw invalidRequest(
      "The Studio operator identity is invalid.",
      "Use the authenticated server operator identity.",
    );
  }
  return parsed.data;
}

function parseOperationId(value: unknown): string {
  const parsed = operationIdSchema.safeParse(value);
  if (!parsed.success) {
    throw invalidRequest(
      "The Atelier operation ID is invalid.",
      "Use the operation ID returned by prepare.",
    );
  }
  return parsed.data;
}

function parseRawDeclaration(value: unknown): StudioAtelierDeclaration {
  const parsed = studioAtelierDeclarationSchema.safeParse(value);
  if (!parsed.success) {
    throw invalidRequest(
      "The Studio Atelier declaration is invalid.",
      "Submit only the strict typed declaration fields; authority and execution fields are server-owned.",
    );
  }
  return parsed.data;
}

function parseReviewDecision(value: unknown): StudioAtelierReviewDecision {
  const parsed = studioAtelierReviewDecisionSchema.safeParse(value);
  if (!parsed.success) {
    throw invalidRequest(
      "The Atelier review decision is invalid.",
      "Choose Keep, Fix one thing with one bounded reason and target, or Reject with one bounded reason.",
    );
  }
  return Object.freeze(parsed.data);
}

function parseSnapshot(
  value: unknown,
  expectedOperationId?: string,
): StudioAtelierServerSnapshot {
  const parsed = studioAtelierServerSnapshotSchema.safeParse(value);
  if (!parsed.success || (
    expectedOperationId !== undefined
    && parsed.data.operationId !== expectedOperationId
  )) {
    throw unavailable(
      "The Atelier engine returned an invalid operation projection.",
      "Reload the operation from the durable ledger before continuing.",
    );
  }
  return parsed.data;
}

function nextAction(snapshot: StudioAtelierServerSnapshot): StudioAtelierNextAction {
  if (
    snapshot.correctionOperationId
    && ["TECHNICAL_FAIL", "SEMANTIC_FAIL", "USER_REJECTED"].includes(snapshot.state)
  ) {
    return "GENERATE_CORRECTION";
  }
  if (
    snapshot.reviewDecision?.decision === "FIX_ONE_THING"
    && !snapshot.correctionOperationId
    && ["TECHNICAL_FAIL", "SEMANTIC_FAIL", "USER_REJECTED"].includes(snapshot.state)
  ) {
    return "RESUME_RECORDED_REVIEW";
  }
  switch (snapshot.state) {
    case "DRAFT":
      return "GENERATE";
    case "MATERIALIZED":
    case "TECHNICAL_PASS":
      return "WAIT_FOR_MATERIALIZATION";
    case "TECHNICAL_FAIL":
    case "SEMANTIC_PASS":
    case "SEMANTIC_FAIL":
      return "REVIEW";
    case "USER_APPROVED":
      return "LOCK_OR_REUSE";
    case "LOCKED":
      return "USE_LOCKED";
    case "USER_REJECTED":
      return "NONE";
    case "BLOCKED_USER_DIRECTION":
      return "USER_DIRECTION_REQUIRED";
    case "SUPERSEDED":
      return "NONE";
  }
}

function publicResult(
  snapshot: StudioAtelierServerSnapshot,
  reused: boolean,
): StudioAtelierCommandResult {
  return Object.freeze({
    operationId: snapshot.operationId,
    stage: snapshot.stage,
    view: snapshot.view,
    state: snapshot.state,
    version: snapshot.version,
    candidateVisibility: studioAtelierCandidateVisibility(snapshot.state),
    nextAction: nextAction(snapshot),
    reused,
    ...(snapshot.correctionOperationId
      ? { continuationOperationId: snapshot.correctionOperationId }
      : {}),
  });
}

function decisionKey(decision: StudioAtelierReviewDecision): string {
  switch (decision.decision) {
    case "KEEP":
      return "KEEP";
    case "REJECT":
      return `REJECT:${decision.reason}`;
    case "FIX_ONE_THING":
      return `FIX_ONE_THING:${decision.reason}:${decision.target}`;
  }
}

function sameDecision(
  left: StudioAtelierReviewDecision | null,
  right: StudioAtelierReviewDecision,
): boolean {
  return left !== null && decisionKey(left) === decisionKey(right);
}

function compilationFailure(error: unknown): StudioEngineError {
  if (!(error instanceof AtelierDeclarationCompilationError)) {
    return unavailable(
      "The Atelier declaration could not be compiled.",
      "Verify the trusted state and authority sources before trying again.",
    );
  }
  if ([
    "INVALID_DECLARATION",
    "TRUTH_SOURCE_MISMATCH",
    "STAGE_NOT_AUTHORIZED",
    "INVALID_CORRECTION_AUTHORIZATION",
  ].includes(error.code)) {
    return invalidRequest(
      "The declaration conflicts with the current trusted Atelier state.",
      "Prepare a declaration for the current authorized stage and truth.",
    );
  }
  return unavailable(
    "The trusted Atelier authority bundle is incomplete or invalid.",
    "Repair and verify the server-owned state, manifest, and lock projection.",
  );
}

function operationKey(operatorSubject: string, operationId: string): string {
  return `${operatorSubject}\u0000${operationId}`;
}

async function projectionOrThrow(
  ports: Pick<StudioAtelierEnginePorts, "readProjection">,
  operatorSubject: string,
  operationId: string,
): Promise<StudioAtelierServerSnapshot> {
  const projection = await ports.readProjection({ operatorSubject, operationId });
  if (!projection) {
    throw new StudioEngineError(
      "INTAKE_NOT_FOUND",
      404,
      "That Atelier operation was not found.",
      "Prepare the operation before continuing.",
    );
  }
  return parseSnapshot(projection, operationId);
}

/**
 * Builds the sanitized, read-only projection boundary without exposing any
 * prepare, paid-dispatch, review or lock port. Recovery routes use this narrow
 * reader so an evaluator or provider outage cannot make durable status
 * unreadable, while no mutation capability enters the recovery composition.
 */
export function createStudioAtelierProjectionReader(
  ports: Pick<StudioAtelierEnginePorts, "readProjection">,
): StudioAtelierEngineFacade["readProjection"] {
  return async function readProjection(
    rawOperatorSubject: string,
    rawOperationId: string,
  ): Promise<StudioAtelierCommandResult> {
    const operatorSubject = parseOperatorSubject(rawOperatorSubject);
    const operationId = parseOperationId(rawOperationId);
    return publicResult(
      await projectionOrThrow(ports, operatorSubject, operationId),
      true,
    );
  };
}

function reviewIsAlreadyRecorded(
  snapshot: StudioAtelierServerSnapshot,
  decision: StudioAtelierReviewDecision,
): boolean {
  if (
    decision.decision === "KEEP"
    && (snapshot.state === "USER_APPROVED" || snapshot.state === "LOCKED")
  ) return true;
  if (sameDecision(snapshot.reviewDecision, decision)) {
    if (decision.decision === "FIX_ONE_THING") {
      // USER_REJECTED and CORRECTION_AUTHORIZED are durable intermediate
      // checkpoints. A crash between either checkpoint and correction
      // preparation must resume the same bounded command until its derived
      // operation exists. Authorization alone is not a usable continuation.
      return snapshot.correctionOperationId !== null
        || snapshot.state === "BLOCKED_USER_DIRECTION"
        || snapshot.state === "SUPERSEDED";
    }
    return snapshot.state === "USER_REJECTED"
      || snapshot.state === "BLOCKED_USER_DIRECTION"
      || snapshot.state === "SUPERSEDED";
  }
  return false;
}

function assertReviewMayAdvance(
  snapshot: StudioAtelierServerSnapshot,
  decision: StudioAtelierReviewDecision,
): void {
  if (decision.decision === "KEEP") {
    if (snapshot.state !== "SEMANTIC_PASS") {
      throw invalidTransition(
        "Only a semantic-pass candidate can be kept.",
        "Use the current candidate actions shown by the engine projection.",
      );
    }
    return;
  }
  if (decision.decision === "REJECT") {
    if (!["TECHNICAL_FAIL", "SEMANTIC_PASS", "SEMANTIC_FAIL"].includes(snapshot.state)) {
      throw invalidTransition(
        "That candidate is not awaiting a rejection decision.",
        "Open the current operation projection before reviewing it.",
      );
    }
    return;
  }
  if (![
    "TECHNICAL_FAIL",
    "SEMANTIC_PASS",
    "SEMANTIC_FAIL",
    "USER_REJECTED",
  ].includes(snapshot.state)) {
    throw invalidTransition(
      "That candidate cannot begin a bounded correction.",
      "Review the current materialized candidate or follow the engine's next action.",
    );
  }
}

/**
 * Garment-independent Studio engine boundary: prepare -> generate -> review ->
 * lock/reuse. Garment/view behavior is compiled data, never a facade branch.
 */
export function createStudioAtelierEngineFacade(
  ports: StudioAtelierEnginePorts,
): StudioAtelierEngineFacade {
  const prepareInFlight = new Map<string, Promise<StudioAtelierCommandResult>>();
  const generateInFlight = new Map<string, Promise<StudioAtelierCommandResult>>();
  const reviewInFlight = new Map<string, Promise<StudioAtelierCommandResult>>();
  const lockInFlight = new Map<string, Promise<StudioAtelierCommandResult>>();
  const resumeReviewInFlight = new Map<string, Promise<StudioAtelierCommandResult>>();

  const readProjection = createStudioAtelierProjectionReader(ports);

  async function prepare(
    rawOperatorSubject: string,
    rawDeclaration: unknown,
  ): Promise<StudioAtelierCommandResult> {
    const operatorSubject = parseOperatorSubject(rawOperatorSubject);
    const declaration = parseRawDeclaration(rawDeclaration);
    const fileVerification = await ports.resolveFileVerification({
      operatorSubject,
      declaration: Object.freeze(declaration),
    });

    let compiled: CompiledAtelierOperationWithReceiptsV1;
    try {
      const validatedDeclaration = validateStudioAtelierDeclaration(declaration, {
        resolveFileVerification: () => fileVerification,
      });
      const rawTruth = await ports.resolveTrustedTruth({
        operatorSubject,
        declaration: validatedDeclaration.declaration,
      });
      const truth = resolveTrustedAtelierTruthBundle({
        resolveTrustedTruth: () => rawTruth,
      });
      compiled = compileAtelierOperationWithReceiptsV1({
        validatedDeclaration,
        truth,
      });
    } catch (error) {
      throw compilationFailure(error);
    }

    const semanticHash = semanticOperationHash(compiled.operation);
    const compiledOperationKey = deriveOperationId(compiled.operation);
    const key = operationKey(operatorSubject, compiledOperationKey);
    const active = prepareInFlight.get(key);
    if (active) {
      const result = await active;
      return Object.freeze({ ...result, reused: true });
    }
    const task = (async () => {
      const result = await ports.prepareCompiledOperation({
        operatorSubject,
        operationKey: compiledOperationKey,
        semanticHash,
        compiled,
      });
      return publicResult(
        parseSnapshot(result.snapshot),
        !result.created,
      );
    })();
    prepareInFlight.set(key, task);
    try {
      return await task;
    } finally {
      if (prepareInFlight.get(key) === task) prepareInFlight.delete(key);
    }
  }

  async function generate(
    rawOperatorSubject: string,
    rawOperationId: string,
  ): Promise<StudioAtelierCommandResult> {
    const operatorSubject = parseOperatorSubject(rawOperatorSubject);
    const operationId = parseOperationId(rawOperationId);
    const key = operationKey(operatorSubject, operationId);
    const active = generateInFlight.get(key);
    if (active) {
      const result = await active;
      return Object.freeze({ ...result, reused: true });
    }
    const task = (async () => {
      let snapshot = await projectionOrThrow(ports, operatorSubject, operationId);
      let providerInvoked = false;
      if (snapshot.state === "DRAFT") {
        const materialized = await ports.materializeOnce({ operatorSubject, operationId });
        snapshot = parseSnapshot(materialized.snapshot, operationId);
        providerInvoked = materialized.providerInvoked;
      }
      if (snapshot.state === "MATERIALIZED" || snapshot.state === "TECHNICAL_PASS") {
        snapshot = parseSnapshot(
          await ports.advanceQualityOnce({ operatorSubject, operationId }),
          operationId,
        );
      }
      return publicResult(snapshot, !providerInvoked);
    })();
    generateInFlight.set(key, task);
    try {
      return await task;
    } finally {
      if (generateInFlight.get(key) === task) generateInFlight.delete(key);
    }
  }

  async function review(
    rawOperatorSubject: string,
    rawOperationId: string,
    rawDecision: unknown,
  ): Promise<StudioAtelierCommandResult> {
    const operatorSubject = parseOperatorSubject(rawOperatorSubject);
    const operationId = parseOperationId(rawOperationId);
    const decision = parseReviewDecision(rawDecision);
    const key = operationKey(operatorSubject, operationId);

    const active = reviewInFlight.get(key);
    if (active) {
      await active;
      return review(operatorSubject, operationId, decision);
    }
    const task = (async () => {
      const snapshot = await projectionOrThrow(ports, operatorSubject, operationId);
      if (reviewIsAlreadyRecorded(snapshot, decision)) {
        return publicResult(snapshot, true);
      }
      if (snapshot.reviewDecision && !sameDecision(snapshot.reviewDecision, decision)) {
        throw invalidTransition(
          "That operation already has a different review decision.",
          "Use the stored review projection or prepare an authorized correction.",
        );
      }
      assertReviewMayAdvance(snapshot, decision);
      const reviewed = parseSnapshot(
        await ports.recordReviewOnce({
          operatorSubject,
          operationId,
          decision,
        }),
        operationId,
      );
      return publicResult(reviewed, false);
    })();
    reviewInFlight.set(key, task);
    try {
      return await task;
    } finally {
      if (reviewInFlight.get(key) === task) reviewInFlight.delete(key);
    }
  }

  async function lockOrReuse(
    rawOperatorSubject: string,
    rawOperationId: string,
  ): Promise<StudioAtelierCommandResult> {
    const operatorSubject = parseOperatorSubject(rawOperatorSubject);
    const operationId = parseOperationId(rawOperationId);
    const key = operationKey(operatorSubject, operationId);
    const active = lockInFlight.get(key);
    if (active) {
      const result = await active;
      return Object.freeze({ ...result, reused: true });
    }
    const task = (async () => {
      const snapshot = await projectionOrThrow(ports, operatorSubject, operationId);
      if (snapshot.state === "LOCKED") return publicResult(snapshot, true);
      if (snapshot.state !== "USER_APPROVED") {
        throw invalidTransition(
          "Only an explicitly kept candidate can be locked.",
          "Review the candidate and choose Keep before locking it.",
        );
      }
      const locked = parseSnapshot(
        await ports.lockApprovedOnce({ operatorSubject, operationId }),
        operationId,
      );
      if (locked.state !== "LOCKED") {
        throw unavailable(
          "The approved Atelier result was not durably locked.",
          "Reload the operation projection before trying again.",
        );
      }
      return publicResult(locked, false);
    })();
    lockInFlight.set(key, task);
    try {
      return await task;
    } finally {
      if (lockInFlight.get(key) === task) lockInFlight.delete(key);
    }
  }

  async function resumeRecordedReview(
    rawOperatorSubject: string,
    rawOperationId: string,
  ): Promise<StudioAtelierCommandResult> {
    const operatorSubject = parseOperatorSubject(rawOperatorSubject);
    const operationId = parseOperationId(rawOperationId);
    const key = operationKey(operatorSubject, operationId);
    const active = resumeReviewInFlight.get(key);
    if (active) {
      const result = await active;
      return Object.freeze({ ...result, reused: true });
    }
    const task = (async () => {
      const snapshot = await projectionOrThrow(ports, operatorSubject, operationId);
      if (nextAction(snapshot) !== "RESUME_RECORDED_REVIEW") {
        // Another request may already have repaired the checkpoint. Returning
        // the latest projection lets the operation-ID recovery loop converge
        // without replaying a caller-authored decision.
        return publicResult(snapshot, true);
      }
      if (snapshot.reviewDecision?.decision !== "FIX_ONE_THING") {
        throw unavailable(
          "The Atelier operation has no recorded correction review to resume.",
          "Reload the durable operation projection before continuing.",
        );
      }
      return review(
        operatorSubject,
        operationId,
        snapshot.reviewDecision,
      );
    })();
    resumeReviewInFlight.set(key, task);
    try {
      return await task;
    } finally {
      if (resumeReviewInFlight.get(key) === task) resumeReviewInFlight.delete(key);
    }
  }

  return Object.freeze({
    readProjection,
    prepare,
    generate,
    review,
    lockOrReuse,
    resumeRecordedReview,
  });
}
