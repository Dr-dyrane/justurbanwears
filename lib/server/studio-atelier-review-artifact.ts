import { createHash } from "node:crypto";
import { StudioEngineError } from "../studio/engine/errors";
import {
  getAtelierOperationProjection,
  getReusableAtelierResult,
  type AtelierArtifactRow,
  type AtelierExecutionRow,
  type AtelierOperationRow,
  type AtelierOperationProjectionRow,
} from "./studio-atelier-repository";
import {
  isStudioAtelierReviewableState,
  type StudioAtelierReviewableState,
} from "./studio-atelier-candidate-visibility";
import { readAtelierArtifactBytes } from "./studio-atelier-lock-service";
import type { StudioOperator } from "./studio-operator";

const OPERATION_ID_PATTERN = /^[a-zA-Z0-9._:/-]+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
]);

type ReviewArtifactDependencies = Readonly<{
  getCandidate: typeof getReusableAtelierResult;
  getProjection: typeof getAtelierOperationProjection;
  readArtifact: (artifact: AtelierArtifactRow) => Promise<Uint8Array>;
}>;

const defaultDependencies: ReviewArtifactDependencies = Object.freeze({
  getCandidate: getReusableAtelierResult,
  getProjection: getAtelierOperationProjection,
  readArtifact: readAtelierArtifactBytes,
});

export type StudioAtelierReviewArtifact = Readonly<{
  operationId: string;
  lifecycleState: StudioAtelierReviewableState;
  mimeType: "image/jpeg" | "image/png";
  byteSize: number;
  width: number;
  height: number;
  bytes: Uint8Array;
}>;

function invalidRequest(message: string): StudioEngineError {
  return new StudioEngineError(
    "INVALID_REQUEST",
    400,
    message,
    "Use the authenticated operator and operation ID returned by Studio.",
  );
}

function notFound(): StudioEngineError {
  return new StudioEngineError(
    "INTAKE_NOT_FOUND",
    404,
    "That Atelier review artifact is unavailable.",
    "Reload the current operation projection before reviewing it.",
  );
}

function unavailable(message: string): StudioEngineError {
  return new StudioEngineError(
    "ENGINE_UNAVAILABLE",
    503,
    message,
    "Restore and verify the exact private review artifact before continuing.",
  );
}

function invalidAsset(message: string): StudioEngineError {
  return new StudioEngineError(
    "INVALID_ASSET",
    503,
    message,
    "Restore and verify the exact private review artifact before continuing.",
  );
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseCommand(input: Readonly<{
  operator: StudioOperator;
  operationId: string;
}>): Readonly<{ operatorSubject: string; operationId: string }> {
  const operatorSubject = input.operator?.subject?.trim();
  const operationId = input.operationId?.trim();
  if (!operatorSubject || operatorSubject.length > 240) {
    throw invalidRequest("The Studio operator identity is invalid.");
  }
  if (
    !operationId
    || operationId.length > 240
    || !OPERATION_ID_PATTERN.test(operationId)
  ) {
    throw invalidRequest("The Atelier operation ID is invalid.");
  }
  return Object.freeze({ operatorSubject, operationId });
}

function assertArtifactTuple(input: Readonly<{
  operatorSubject: string;
  operationId: string;
  operation: AtelierOperationRow;
  projection: AtelierOperationProjectionRow;
  execution: AtelierExecutionRow;
  artifact: AtelierArtifactRow;
}>): void {
  const {
    operatorSubject,
    operationId,
    operation,
    projection,
    execution,
    artifact,
  } = input;
  if (
    operation.id !== operationId
    || operation.operatorSubject !== operatorSubject
    || projection.operationId !== operationId
    || execution.operationId !== operationId
    || execution.id !== artifact.executionId
    || execution.state !== "COMPLETE"
    || projection.semanticDecision !== "PASS"
    || !projection.materializedExecutionId
    || projection.materializedExecutionId !== artifact.executionId
    || projection.materializedArtifactId !== artifact.id
    || projection.materializedArtifactSha256 !== artifact.sha256
    || !SHA256_PATTERN.test(artifact.sha256)
    || artifact.state !== "STORED"
    || !["NORMALIZED", "COMPOSITE"].includes(artifact.kind)
    || !SAFE_IMAGE_MIME_TYPES.has(artifact.mimeType)
    || artifact.byteSize <= 0
    || artifact.width === null
    || artifact.height === null
    || artifact.width <= 0
    || artifact.height <= 0
  ) {
    throw unavailable("The durable review projection does not resolve one exact stored image artifact.");
  }
  if (
    projection.state === "LOCKED"
    && (
      projection.lockedArtifactId !== artifact.id
      || projection.lockedArtifactSha256 !== artifact.sha256
    )
  ) {
    throw unavailable("The locked projection does not resolve the exact reviewed artifact.");
  }
}

const ALLOWED_REVIEWABLE_ADVANCES = Object.freeze({
  SEMANTIC_PASS: new Set<StudioAtelierReviewableState>([
    "SEMANTIC_PASS",
    "USER_APPROVED",
    "LOCKED",
  ]),
  USER_APPROVED: new Set<StudioAtelierReviewableState>([
    "USER_APPROVED",
    "LOCKED",
  ]),
  LOCKED: new Set<StudioAtelierReviewableState>(["LOCKED"]),
} satisfies Record<
  StudioAtelierReviewableState,
  ReadonlySet<StudioAtelierReviewableState>
>);

function assertFinalProjection(input: Readonly<{
  initial: AtelierOperationProjectionRow;
  latest: AtelierOperationProjectionRow | null;
  artifact: AtelierArtifactRow;
}>): StudioAtelierReviewableState {
  const { initial, latest, artifact } = input;
  const initialState = initial.state;
  const latestState = latest?.state;
  if (
    !isStudioAtelierReviewableState(initialState)
    || !latest
    || !latestState
    || !isStudioAtelierReviewableState(latestState)
  ) throw notFound();
  if (
    latest.operationId !== initial.operationId
    || latest.semanticDecision !== "PASS"
    || latest.version < initial.version
    || (latest.version === initial.version && latestState !== initialState)
    || !ALLOWED_REVIEWABLE_ADVANCES[initialState].has(latestState)
    || latest.materializedExecutionId !== artifact.executionId
    || latest.materializedArtifactId !== artifact.id
    || latest.materializedArtifactSha256 !== artifact.sha256
  ) {
    throw unavailable("The Atelier review artifact changed while it was being verified.");
  }
  if (
    latest.state === "LOCKED"
    && (
      latest.lockedArtifactId !== artifact.id
      || latest.lockedArtifactSha256 !== artifact.sha256
    )
  ) {
    throw unavailable("The locked projection no longer resolves the exact reviewed artifact.");
  }
  return latestState;
}

/**
 * Authenticated server composition passes the operator subject into this
 * boundary. The repository resolves only that operator's operation, and this
 * service returns bytes only after closed semantic QA (or its later approval
 * and lock states). Private Blob coordinates, provider URLs, hashes and
 * artifact IDs are deliberately absent from the return value.
 */
export function createStudioAtelierReviewArtifactService(
  overrides: Partial<ReviewArtifactDependencies> = {},
) {
  const dependencies: ReviewArtifactDependencies = Object.freeze({
    ...defaultDependencies,
    ...overrides,
  });

  return async function readStudioAtelierReviewArtifact(rawInput: Readonly<{
    operator: StudioOperator;
    operationId: string;
  }>): Promise<StudioAtelierReviewArtifact> {
    const input = parseCommand(rawInput);
    const candidate = await dependencies.getCandidate(input);
    if (!candidate) {
      const projection = await dependencies.getProjection(input);
      if (!projection || !isStudioAtelierReviewableState(projection.state)) {
        throw notFound();
      }
      throw unavailable("The semantic-pass Atelier candidate has no verified review artifact.");
    }
    if (!isStudioAtelierReviewableState(candidate.projection.state)) {
      throw notFound();
    }
    assertArtifactTuple({
      operatorSubject: input.operatorSubject,
      operationId: input.operationId,
      operation: candidate.operation,
      projection: candidate.projection,
      execution: candidate.execution,
      artifact: candidate.artifact,
    });

    const bytes = new Uint8Array(await dependencies.readArtifact(candidate.artifact));
    if (
      bytes.byteLength !== candidate.artifact.byteSize
      || sha256(bytes) !== candidate.artifact.sha256
    ) {
      throw invalidAsset("The private Atelier review artifact failed content-addressed verification.");
    }

    // Re-authorize after the potentially slow private-Blob read. A rejection,
    // supersession or artifact swap during that read must fail closed.
    const latest = await dependencies.getProjection(input);
    const lifecycleState = assertFinalProjection({
      initial: candidate.projection,
      latest,
      artifact: candidate.artifact,
    });

    return Object.freeze({
      operationId: input.operationId,
      lifecycleState,
      mimeType: candidate.artifact.mimeType as StudioAtelierReviewArtifact["mimeType"],
      byteSize: candidate.artifact.byteSize,
      width: candidate.artifact.width!,
      height: candidate.artifact.height!,
      bytes,
    });
  };
}

export const readStudioAtelierReviewArtifact =
  createStudioAtelierReviewArtifactService();
