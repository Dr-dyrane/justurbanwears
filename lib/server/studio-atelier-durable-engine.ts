import {
  createStudioAtelierEngineFacade,
  studioAtelierReviewDecisionSchema,
  type StudioAtelierEngineFacade,
  type StudioAtelierEnginePorts,
  type StudioAtelierReviewDecision,
  type StudioAtelierServerSnapshot,
} from "./studio-atelier-engine-facade";
import {
  createAtelierOperation,
  getAtelierCorrectionOperation,
  getAtelierExecution,
  getLatestAtelierExecutionForOperation,
  getAtelierOperation,
  getAtelierOperationByKey,
  getAtelierOperationProjection,
  listAtelierArtifacts,
  listAtelierOperationEvents,
  recordAtelierLifecycleEvent,
  type AtelierArtifactRow,
  type AtelierExecutionRow,
  type AtelierLifecycleEventRow,
  type AtelierOperationProjectionRow,
  type AtelierOperationRow,
} from "./studio-atelier-repository";
import {
  createStudioAtelierLockService,
  readAtelierArtifactBytes,
  type StudioAtelierLockedRoomResolver,
} from "./studio-atelier-lock-service";
import { StudioEngineError } from "../studio/engine/errors";
import {
  assessStudioAtelierSemanticQuality,
  assessStudioAtelierTechnicalQuality,
  type StudioAtelierEvaluatorDescriptor,
  type StudioAtelierQualityAssessment,
  type StudioAtelierSemanticQualityEvidence,
  type StudioAtelierTechnicalQualityEvidence,
} from "../studio/atelier/quality-contracts";
import { atelierOperationSchema } from "../studio/atelier/contracts";
import { studioAtelierG004CalibrationTargetForStage } from "../studio/atelier/g004-calibration";
import {
  verifyStudioAtelierG004Calibration,
  verifyStudioAtelierG004EvaluationTarget,
  type StudioAtelierG004CalibrationResolver,
  type StudioAtelierVerifiedG004EvaluationTarget,
} from "./studio-atelier-g004-calibration";

export type {
  StudioAtelierSemanticQualityEvidence,
  StudioAtelierTechnicalQualityEvidence,
} from "../studio/atelier/quality-contracts";

export type StudioAtelierQualityEvaluator<T> = (input: Readonly<{
  operatorSubject: string;
  operation: AtelierOperationRow;
  projection: AtelierOperationProjectionRow;
  execution: AtelierExecutionRow;
  artifact: AtelierArtifactRow;
  artifactBytes: Uint8Array;
}>) => Promise<T>;

export type StudioAtelierTechnicalQualityEvaluator =
  StudioAtelierQualityEvaluator<StudioAtelierTechnicalQualityEvidence>;
export type StudioAtelierSemanticQualityEvaluator = (input: Readonly<{
  operatorSubject: string;
  operation: AtelierOperationRow;
  projection: AtelierOperationProjectionRow;
  execution: AtelierExecutionRow;
  artifact: AtelierArtifactRow;
  artifactBytes: Uint8Array;
  g004Calibration: StudioAtelierVerifiedG004EvaluationTarget | null;
}>) => Promise<StudioAtelierSemanticQualityEvidence>;

export type StudioAtelierCorrectionPreparer = (input: Readonly<{
  operatorSubject: string;
  sourceOperationId: string;
  decision: Extract<StudioAtelierReviewDecision, { decision: "FIX_ONE_THING" }>;
}>) => Promise<Readonly<{ operationId: string }>>;

export type StudioAtelierMaterializer = (input: Readonly<{
  operatorSubject: string;
  operationId: string;
}>) => Promise<Readonly<{ reused: boolean }>>;

type DurableEngineDependencies = Readonly<{
  getOperation: typeof getAtelierOperation;
  getOperationByKey: typeof getAtelierOperationByKey;
  getCorrectionOperation: typeof getAtelierCorrectionOperation;
  getProjection: typeof getAtelierOperationProjection;
  getExecution: typeof getAtelierExecution;
  getLatestExecution: typeof getLatestAtelierExecutionForOperation;
  listArtifacts: typeof listAtelierArtifacts;
  listEvents: typeof listAtelierOperationEvents;
  createOperation: typeof createAtelierOperation;
  recordLifecycleEvent: typeof recordAtelierLifecycleEvent;
  readArtifact: typeof readAtelierArtifactBytes;
}>;

const defaultDependencies: DurableEngineDependencies = Object.freeze({
  getOperation: getAtelierOperation,
  getOperationByKey: getAtelierOperationByKey,
  getCorrectionOperation: getAtelierCorrectionOperation,
  getProjection: getAtelierOperationProjection,
  getExecution: getAtelierExecution,
  getLatestExecution: getLatestAtelierExecutionForOperation,
  listArtifacts: listAtelierArtifacts,
  listEvents: listAtelierOperationEvents,
  createOperation: createAtelierOperation,
  recordLifecycleEvent: recordAtelierLifecycleEvent,
  readArtifact: readAtelierArtifactBytes,
});

type PrepareCommand = Parameters<StudioAtelierEnginePorts["prepareCompiledOperation"]>[0];
type EngineCommand = Parameters<StudioAtelierEnginePorts["readProjection"]>[0];
type ReviewCommand = Parameters<StudioAtelierEnginePorts["recordReviewOnce"]>[0];

function invalidState(message: string): StudioEngineError {
  return new StudioEngineError(
    "INVALID_TRANSITION",
    409,
    message,
    "Reload the durable Atelier projection and follow its next action.",
  );
}

function unavailable(message: string): StudioEngineError {
  return new StudioEngineError(
    "ENGINE_UNAVAILABLE",
    503,
    message,
    "Inspect the private operation ledger before continuing.",
  );
}

function reviewDecisionFromEvents(
  events: readonly AtelierLifecycleEventRow[],
): StudioAtelierReviewDecision | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event || ![
      "USER_APPROVED",
      "USER_REJECTED",
      "CORRECTION_AUTHORIZED",
      "BLOCKED_USER_DIRECTION",
    ].includes(event.eventType)) continue;
    const payload = event.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
    const evidence = (payload as Record<string, unknown>).evidence;
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) continue;
    const parsed = studioAtelierReviewDecisionSchema.safeParse(
      (evidence as Record<string, unknown>).reviewDecision,
    );
    if (parsed.success) return parsed.data;
  }
  return null;
}

async function durableSnapshot(
  dependencies: DurableEngineDependencies,
  input: Readonly<{ operatorSubject: string; operationId: string }>,
): Promise<StudioAtelierServerSnapshot | null> {
  const [operation, projection, correction, events] = await Promise.all([
    dependencies.getOperation(input),
    dependencies.getProjection(input),
    dependencies.getCorrectionOperation(input),
    dependencies.listEvents(input),
  ]);
  if (!operation || !projection) return null;
  return {
    operationId: operation.id,
    stage: operation.stage as StudioAtelierServerSnapshot["stage"],
    view: operation.view as StudioAtelierServerSnapshot["view"],
    state: projection.state as StudioAtelierServerSnapshot["state"],
    version: projection.version,
    correctionAuthorized: projection.correctionAuthorized,
    correctionOperationId: correction?.id ?? null,
    reviewDecision: reviewDecisionFromEvents(events),
  };
}

async function qualityContext(
  dependencies: DurableEngineDependencies,
  input: Readonly<{ operatorSubject: string; operationId: string }>,
) {
  const [operation, projection] = await Promise.all([
    dependencies.getOperation(input),
    dependencies.getProjection(input),
  ]);
  if (
    !operation
    || !projection
    || !projection.materializedExecutionId
    || !projection.materializedArtifactId
    || !projection.materializedArtifactSha256
  ) {
    throw unavailable("The materialized Atelier quality target is incomplete.");
  }
  const [execution, artifacts] = await Promise.all([
    dependencies.getExecution(projection.materializedExecutionId),
    dependencies.listArtifacts(projection.materializedExecutionId),
  ]);
  const artifact = artifacts.find((candidate) =>
    candidate.id === projection.materializedArtifactId
    && candidate.sha256 === projection.materializedArtifactSha256
    && candidate.state === "STORED"
  );
  if (!execution || execution.state !== "COMPLETE" || !artifact) {
    throw unavailable("The exact materialized Atelier quality target is unavailable.");
  }
  const artifactBytes = await dependencies.readArtifact(artifact);
  return { operation, projection, execution, artifact, artifactBytes };
}

async function recordQualityEvent(input: {
  dependencies: DurableEngineDependencies;
  operatorSubject: string;
  operationId: string;
  projection: AtelierOperationProjectionRow;
  result: StudioAtelierQualityAssessment;
  kind: "TECHNICAL" | "SEMANTIC";
}): Promise<void> {
  try {
    await input.dependencies.recordLifecycleEvent({
      operatorSubject: input.operatorSubject,
      operationId: input.operationId,
      expectedVersion: input.projection.version,
      eventType: `${input.kind}_${input.result.decision}`,
      actorSubject: `system:atelier-${input.kind.toLowerCase()}-qa`,
      executionId: input.projection.materializedExecutionId,
      artifactId: input.projection.materializedArtifactId,
      ...(input.result.decision === "FAIL" ? { reasonCode: input.result.reasonCode } : {}),
      evidence: input.result.evidence,
    });
  } catch {
    const latest = await input.dependencies.getProjection(input);
    const matches = input.kind === "TECHNICAL"
      ? latest?.technicalDecision === input.result.decision
      : latest?.semanticDecision === input.result.decision;
    if (!latest || !matches) {
      throw invalidState("The Atelier quality projection changed concurrently.");
    }
  }
}

async function recordReviewEvent(input: {
  dependencies: DurableEngineDependencies;
  operatorSubject: string;
  operationId: string;
  projection: AtelierOperationProjectionRow;
  eventType: "USER_APPROVED" | "USER_REJECTED" | "CORRECTION_AUTHORIZED" | "BLOCKED_USER_DIRECTION";
  decision: StudioAtelierReviewDecision;
  reasonCode?: string;
}): Promise<AtelierOperationProjectionRow> {
  try {
    const result = await input.dependencies.recordLifecycleEvent({
      operatorSubject: input.operatorSubject,
      operationId: input.operationId,
      expectedVersion: input.projection.version,
      eventType: input.eventType,
      actorSubject: input.operatorSubject,
      executionId: input.projection.materializedExecutionId,
      artifactId: input.projection.materializedArtifactId,
      reasonCode: input.reasonCode,
      evidence: { reviewDecision: input.decision },
    });
    return result.projection;
  } catch {
    const [latest, events] = await Promise.all([
      input.dependencies.getProjection(input),
      input.dependencies.listEvents(input),
    ]);
    const recorded = reviewDecisionFromEvents(events);
    const sameDecision = recorded !== null
      && JSON.stringify(recorded) === JSON.stringify(input.decision);
    const alreadyApplied = input.eventType === "USER_APPROVED"
      ? latest?.state === "USER_APPROVED" || latest?.state === "LOCKED"
      : input.eventType === "USER_REJECTED"
        ? latest?.userDecision === "REJECTED"
        : input.eventType === "CORRECTION_AUTHORIZED"
          ? latest?.correctionAuthorized === true
          : latest?.state === "BLOCKED_USER_DIRECTION";
    if (latest && sameDecision && alreadyApplied) return latest;
    throw invalidState("The Atelier review projection changed concurrently.");
  }
}

const TERMINAL_EXECUTION_BLOCK_STATES = new Set([
  "FAILED",
  "QUARANTINED",
  "INDETERMINATE",
]);

function terminalExecutionBlockReason(execution: AtelierExecutionRow): string {
  const errorCode = (execution.errorCode ?? "UNSPECIFIED")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    || "UNSPECIFIED";
  return `EXECUTION_${execution.state}:${errorCode}`.slice(0, 96);
}

/**
 * A terminal execution cannot leave the command projection at DRAFT, where a
 * later generate command would otherwise advertise another paid attempt. The
 * existing blocked projection is used because resolving a failed or uncertain
 * dispatch requires explicit operator/system direction. The event remains
 * append-only, hash-linked and projection-CAS guarded by the repository.
 */
async function blockDraftForTerminalExecution(
  dependencies: DurableEngineDependencies,
  command: EngineCommand,
): Promise<Readonly<{
  snapshot: StudioAtelierServerSnapshot;
  execution: AtelierExecutionRow;
}> | null> {
  const [projection, execution] = await Promise.all([
    dependencies.getProjection(command),
    dependencies.getLatestExecution(command),
  ]);
  if (
    !projection
    || !execution
    || !TERMINAL_EXECUTION_BLOCK_STATES.has(execution.state)
  ) return null;

  const reasonCode = terminalExecutionBlockReason(execution);
  if (projection.state === "DRAFT") {
    try {
      await dependencies.recordLifecycleEvent({
        ...command,
        expectedVersion: projection.version,
        eventType: "BLOCKED_USER_DIRECTION",
        actorSubject: "system:atelier-execution",
        executionId: execution.id,
        reasonCode,
        evidence: {
          executionState: execution.state,
          executionErrorCode: execution.errorCode ?? null,
        },
      });
    } catch {
      const latest = await dependencies.getProjection(command);
      if (
        latest?.state !== "BLOCKED_USER_DIRECTION"
        || latest.blockedReason !== reasonCode
      ) {
        throw invalidState("The Atelier execution block projection changed concurrently.");
      }
    }
  } else if (
    projection.state !== "BLOCKED_USER_DIRECTION"
    || projection.blockedReason !== reasonCode
  ) {
    return null;
  }

  const snapshot = await durableSnapshot(dependencies, command);
  if (!snapshot) throw unavailable("The blocked Atelier projection was not readable.");
  return { snapshot, execution };
}

export type CreateDurableStudioAtelierEngineInput = Readonly<{
  resolveFileVerification: StudioAtelierEnginePorts["resolveFileVerification"];
  resolveTrustedTruth: StudioAtelierEnginePorts["resolveTrustedTruth"];
  materializeOnce: StudioAtelierMaterializer;
  evaluateTechnicalQuality: StudioAtelierTechnicalQualityEvaluator;
  evaluateSemanticQuality: StudioAtelierSemanticQualityEvaluator;
  technicalEvaluator: StudioAtelierEvaluatorDescriptor;
  semanticEvaluator: StudioAtelierEvaluatorDescriptor;
  resolveG004Calibration: StudioAtelierG004CalibrationResolver;
  prepareCorrection: StudioAtelierCorrectionPreparer;
  resolveLockedRoom: StudioAtelierLockedRoomResolver;
  overrides?: Partial<DurableEngineDependencies> & Readonly<{
    lockApprovedOnce?: StudioAtelierEnginePorts["lockApprovedOnce"];
  }>;
}>;

/** Build durable ports; only server composition code may provide these dependencies. */
export function createDurableStudioAtelierEnginePorts(
  input: CreateDurableStudioAtelierEngineInput,
): StudioAtelierEnginePorts {
  const dependencies: DurableEngineDependencies = Object.freeze({
    ...defaultDependencies,
    ...input.overrides,
  });
  const lockApprovedOnce = input.overrides?.lockApprovedOnce
    ?? createStudioAtelierLockService({
      resolveLockedRoom: input.resolveLockedRoom,
      overrides: {
        getOperation: dependencies.getOperation,
        getProjection: dependencies.getProjection,
        getExecution: dependencies.getExecution,
        listArtifacts: dependencies.listArtifacts,
        readArtifact: dependencies.readArtifact,
        recordLifecycleEvent: dependencies.recordLifecycleEvent,
      },
    });

  const readProjection: StudioAtelierEnginePorts["readProjection"] = (command) =>
    durableSnapshot(dependencies, command);

  return Object.freeze({
    resolveFileVerification: input.resolveFileVerification,
    resolveTrustedTruth: input.resolveTrustedTruth,
    async prepareCompiledOperation(command: PrepareCommand) {
      const operation = command.compiled.operation;
      const existing = await dependencies.getOperationByKey({
        operatorSubject: command.operatorSubject,
        operationKey: command.operationKey,
      });
      const created = await dependencies.createOperation({
        operatorSubject: command.operatorSubject,
        operationKey: command.operationKey,
        garmentId: operation.garmentId,
        view: operation.view,
        stage: operation.stage,
        contractVersion: operation.contractVersion,
        workflowRevision: operation.workflowRevision,
        semanticHash: command.semanticHash,
        declarationReceipt: command.compiled.declarationReceipt,
        truthReceipt: command.compiled.truthReceipt,
        canonicalOperation: operation,
        parentAssets: operation.parentLocks,
        authorityStack: operation.authorityStack,
        changeSet: operation.changeSet,
        immutableSet: operation.immutableSet,
        outputContract: operation.outputContract,
        failureGates: operation.failureGates,
      });
      const snapshot = await durableSnapshot(dependencies, {
        operatorSubject: command.operatorSubject,
        operationId: created.id,
      });
      if (!snapshot) throw unavailable("The prepared Atelier projection was not readable.");
      return {
        snapshot,
        created: existing === null,
      };
    },
    readProjection,
    async materializeOnce(command: EngineCommand) {
      const operationRow = await dependencies.getOperation(command);
      const canonicalOperation = atelierOperationSchema.safeParse(
        operationRow?.canonicalOperation,
      );
      if (!operationRow || !canonicalOperation.success) {
        throw unavailable("The stored Atelier operation is not canonical for calibration preflight.");
      }
      if (studioAtelierG004CalibrationTargetForStage(canonicalOperation.data.stage)) {
        try {
          await verifyStudioAtelierG004Calibration(
            await input.resolveG004Calibration(),
          );
        } catch {
          throw unavailable(
            "The exact G004 positive-target calibration pixels failed pre-spend readback.",
          );
        }
      }

      let result: Awaited<ReturnType<StudioAtelierMaterializer>> | null = null;
      let materializeError: unknown;
      try {
        result = await input.materializeOnce(command);
      } catch (error) {
        materializeError = error;
      }

      const blocked = await blockDraftForTerminalExecution(dependencies, command);
      if (blocked) {
        return {
          snapshot: blocked.snapshot,
          providerInvoked: result
            ? !result.reused
            : blocked.execution.providerInvocationStartedAt !== null,
        };
      }
      if (materializeError !== undefined) throw materializeError;

      const snapshot = await durableSnapshot(dependencies, command);
      if (!snapshot) throw unavailable("The materialized Atelier projection was not readable.");
      return { snapshot, providerInvoked: !result!.reused };
    },
    async advanceQualityOnce(command: EngineCommand) {
      let snapshot = await durableSnapshot(dependencies, command);
      if (!snapshot) throw unavailable("The Atelier quality projection was not found.");
      if (snapshot.state === "MATERIALIZED") {
        const context = await qualityContext(dependencies, command);
        const canonicalOperation = atelierOperationSchema.safeParse(
          context.operation.canonicalOperation,
        );
        if (!canonicalOperation.success) {
          throw unavailable("The stored Atelier operation is not canonical for technical QA.");
        }
        const evaluatorEvidence = await input.evaluateTechnicalQuality({
          ...command,
          ...context,
        });
        const result = assessStudioAtelierTechnicalQuality({
          value: evaluatorEvidence,
          operationStage: canonicalOperation.data.stage,
          outputMode: canonicalOperation.data.outputContract.mode,
          evaluator: input.technicalEvaluator,
          artifact: {
            sha256: context.artifact.sha256,
            kind: context.artifact.kind,
            mimeType: context.artifact.mimeType,
            byteSize: context.artifact.byteSize,
            width: context.artifact.width,
            height: context.artifact.height,
          },
        });
        if (!result) {
          throw unavailable("A server technical evaluator returned evidence that does not match the closed rubric or exact review artifact.");
        }
        await recordQualityEvent({
          dependencies,
          ...command,
          projection: context.projection,
          result,
          kind: "TECHNICAL",
        });
        snapshot = await durableSnapshot(dependencies, command);
        if (!snapshot) throw unavailable("The technical QA projection was not readable.");
      }
      if (snapshot.state === "TECHNICAL_PASS") {
        const context = await qualityContext(dependencies, command);
        const canonicalOperation = atelierOperationSchema.safeParse(
          context.operation.canonicalOperation,
        );
        if (!canonicalOperation.success) {
          throw unavailable("The stored Atelier operation is not canonical for semantic QA.");
        }
        let g004Calibration: StudioAtelierVerifiedG004EvaluationTarget | null = null;
        const expectedG004Target = studioAtelierG004CalibrationTargetForStage(
          canonicalOperation.data.stage,
        );
        if (expectedG004Target) {
          try {
            const calibration = await verifyStudioAtelierG004Calibration(
              await input.resolveG004Calibration(),
            );
            const target = calibration.assets.find(
              (asset) => asset.binding.id === expectedG004Target.id,
            );
            if (!target) throw new Error("The stage-scoped G004 target is missing.");
            g004Calibration = await verifyStudioAtelierG004EvaluationTarget({
              receipt: calibration.receipt,
              target,
            }, expectedG004Target);
          } catch {
            throw unavailable(
              "The exact G004 positive-target calibration pixels failed semantic-QA readback.",
            );
          }
        }
        const evaluatorEvidence = await input.evaluateSemanticQuality({
          ...command,
          ...context,
          g004Calibration,
        });
        if (g004Calibration && expectedG004Target) {
          try {
            await verifyStudioAtelierG004EvaluationTarget(
              g004Calibration,
              expectedG004Target,
            );
          } catch {
            throw unavailable(
              "The stage-scoped G004 target changed during semantic evaluation.",
            );
          }
        }
        const result = assessStudioAtelierSemanticQuality({
          value: evaluatorEvidence,
          operationStage: canonicalOperation.data.stage,
          artifactSha256: context.artifact.sha256,
          g004Calibration: g004Calibration?.receipt ?? null,
          evaluator: input.semanticEvaluator,
        });
        if (!result) {
          throw unavailable("A server semantic evaluator returned evidence that does not match the closed rubric, stage, baseline or exact review artifact.");
        }
        await recordQualityEvent({
          dependencies,
          ...command,
          projection: context.projection,
          result,
          kind: "SEMANTIC",
        });
        snapshot = await durableSnapshot(dependencies, command);
        if (!snapshot) throw unavailable("The semantic QA projection was not readable.");
      }
      return snapshot;
    },
    async recordReviewOnce(command: ReviewCommand) {
      const decision = studioAtelierReviewDecisionSchema.parse(command.decision);
      const [operation, initialProjection] = await Promise.all([
        dependencies.getOperation(command),
        dependencies.getProjection(command),
      ]);
      if (!operation || !initialProjection) throw unavailable("The review projection was not found.");
      let projection = initialProjection;

      if (decision.decision === "KEEP") {
        if (projection.state !== "SEMANTIC_PASS") {
          throw invalidState("Only a semantic-pass candidate can be approved.");
        }
        projection = await recordReviewEvent({
          dependencies,
          ...command,
          projection,
          eventType: "USER_APPROVED",
          decision,
        });
      } else if (decision.decision === "REJECT") {
        if (!["TECHNICAL_FAIL", "SEMANTIC_PASS", "SEMANTIC_FAIL"].includes(projection.state)) {
          throw invalidState("That candidate is not awaiting rejection.");
        }
        projection = await recordReviewEvent({
          dependencies,
          ...command,
          projection,
          eventType: projection.state === "SEMANTIC_PASS"
            ? "USER_REJECTED"
            : "BLOCKED_USER_DIRECTION",
          decision,
          reasonCode: decision.reason,
        });
      } else {
        if (operation.correctionOrdinal > 0) {
          if (projection.state === "SEMANTIC_PASS") {
            projection = await recordReviewEvent({
              dependencies,
              ...command,
              projection,
              eventType: "USER_REJECTED",
              decision,
              reasonCode: decision.reason,
            });
          }
          projection = await recordReviewEvent({
            dependencies,
            ...command,
            projection,
            eventType: "BLOCKED_USER_DIRECTION",
            decision,
            reasonCode: "CORRECTION_BUDGET_EXHAUSTED",
          });
        } else {
          if (projection.state === "SEMANTIC_PASS") {
            projection = await recordReviewEvent({
              dependencies,
              ...command,
              projection,
              eventType: "USER_REJECTED",
              decision,
              reasonCode: decision.reason,
            });
          }
          if (!projection.correctionAuthorized) {
            projection = await recordReviewEvent({
              dependencies,
              ...command,
              projection,
              eventType: "CORRECTION_AUTHORIZED",
              decision,
              reasonCode: decision.reason,
            });
          }
          let correction = await dependencies.getCorrectionOperation(command);
          if (!correction) {
            const prepared = await input.prepareCorrection({
              operatorSubject: command.operatorSubject,
              sourceOperationId: command.operationId,
              decision,
            });
            correction = await dependencies.getOperation({
              operatorSubject: command.operatorSubject,
              operationId: prepared.operationId,
            });
            if (!correction || correction.correctionOfSemanticHash !== operation.semanticHash) {
              throw unavailable("The bounded correction did not bind its authorized source.");
            }
          }
        }
      }
      const snapshot = await durableSnapshot(dependencies, command);
      if (!snapshot) throw unavailable("The reviewed Atelier projection was not readable.");
      return snapshot;
    },
    async lockApprovedOnce(command: EngineCommand) {
      await lockApprovedOnce(command);
      const snapshot = await durableSnapshot(dependencies, command);
      if (!snapshot) throw unavailable("The locked Atelier projection was not readable.");
      return snapshot;
    },
  });
}

/** Server-composed garment-independent four-command engine. */
export function createDurableStudioAtelierEngine(
  input: CreateDurableStudioAtelierEngineInput,
): StudioAtelierEngineFacade {
  return createStudioAtelierEngineFacade(createDurableStudioAtelierEnginePorts(input));
}
