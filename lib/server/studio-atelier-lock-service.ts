import { createHash } from "node:crypto";
import { canonicalStringify } from "../studio/atelier/canonical";
import { atelierOperationSchema, type AtelierOperation } from "../studio/atelier/contracts";
import { StudioEngineError } from "../studio/engine/errors";
import {
  getAtelierExecution,
  getAtelierOperation,
  getAtelierOperationProjection,
  listAtelierArtifacts,
  recordAtelierLifecycleEvent,
  type AtelierArtifactRow,
  type AtelierOperationProjectionRow,
} from "./studio-atelier-repository";
import {
  STUDIO_ATELIER_LEGACY_SUBJECT_COMPOSITE_REVISION,
  STUDIO_ATELIER_SUBJECT_COMPOSITE_REVISION,
  compositeStudioAtelierSubject,
  preflightStudioAtelierSubjectComposite,
} from "./studio-atelier-subject-compositor";
import { getShopBlob } from "./vercel-blob";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export type StudioAtelierLockedRoomAuthority = Readonly<{
  assetId: string;
  sha256: string;
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
  manifestRevision: string;
  manifestHash: string;
}>;

export type StudioAtelierLockedRoomResolver = (input: Readonly<{
  operatorSubject: string;
  operationId: string;
  expected: Readonly<{
    assetId: string;
    sha256: string;
  }>;
}>) => Promise<StudioAtelierLockedRoomAuthority>;

type StudioAtelierLockDependencies = Readonly<{
  getOperation: typeof getAtelierOperation;
  getProjection: typeof getAtelierOperationProjection;
  getExecution: typeof getAtelierExecution;
  listArtifacts: typeof listAtelierArtifacts;
  readArtifact: (artifact: AtelierArtifactRow) => Promise<Uint8Array>;
  resolveLockedRoom: StudioAtelierLockedRoomResolver;
  recordLifecycleEvent: typeof recordAtelierLifecycleEvent;
}>;

const defaultDependencies = Object.freeze({
  getOperation: getAtelierOperation,
  getProjection: getAtelierOperationProjection,
  getExecution: getAtelierExecution,
  listArtifacts: listAtelierArtifacts,
  readArtifact: readAtelierArtifactBytes,
  recordLifecycleEvent: recordAtelierLifecycleEvent,
});

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function readAtelierArtifactBytes(artifact: AtelierArtifactRow): Promise<Uint8Array> {
  const result = await getShopBlob("private", artifact.blobPathname, { useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new StudioEngineError(
      "INVALID_ASSET",
      503,
      "The approved Atelier artifact is unavailable.",
      "Restore the exact private content-addressed artifact before locking.",
    );
  }
  const bytes = new Uint8Array(await new Response(result.stream).arrayBuffer());
  if (
    bytes.byteLength !== artifact.byteSize
    || result.blob.size !== artifact.byteSize
    || sha256(bytes) !== artifact.sha256
  ) {
    throw new StudioEngineError(
      "INVALID_ASSET",
      503,
      "The approved Atelier artifact failed content-addressed verification.",
      "Restore the exact private artifact before locking.",
    );
  }
  return bytes;
}

function notFound(): StudioEngineError {
  return new StudioEngineError(
    "INTAKE_NOT_FOUND",
    404,
    "The Atelier operation was not found.",
    "Prepare the operation before locking it.",
  );
}

function invalidTransition(message: string): StudioEngineError {
  return new StudioEngineError(
    "INVALID_TRANSITION",
    409,
    message,
    "Reload the durable operation projection and follow its next action.",
  );
}

function canonicalOperation(value: unknown): AtelierOperation {
  const parsed = atelierOperationSchema.safeParse(value);
  if (!parsed.success) {
    throw new StudioEngineError(
      "ENGINE_UNAVAILABLE",
      503,
      "The stored Atelier operation is not canonical.",
      "Prepare it again from the current trusted declaration and truth bundle.",
    );
  }
  return parsed.data;
}

function roomAuthority(operation: AtelierOperation) {
  const matches = operation.authorityStack.filter((authority) =>
    authority.role === "LOCKED_ATELIER_ROOM"
  );
  if (matches.length !== 1) {
    throw new StudioEngineError(
      "INVALID_ASSET",
      503,
      "The canonical operation does not contain one exact locked-room authority.",
      "Resolve the exact room authority before locking the composite.",
    );
  }
  return matches[0];
}

function assertResolvedRoom(
  expected: Readonly<{ assetId: string; sha256: string }>,
  room: StudioAtelierLockedRoomAuthority,
  canvasPolicyRevision: string | null,
): void {
  if (
    room.assetId !== expected.assetId
    || room.sha256 !== expected.sha256
    || !SHA256_PATTERN.test(room.sha256)
    || sha256(room.bytes) !== room.sha256
    || !SHA256_PATTERN.test(room.manifestHash)
    || !room.manifestRevision.trim()
  ) {
    throw new StudioEngineError(
      "INVALID_ASSET",
      503,
      "The resolved room does not match the operation's locked authority.",
      "Restore the exact approved room bytes and manifest before locking.",
    );
  }
  preflightStudioAtelierSubjectComposite(room, canvasPolicyRevision);
}

function lockedLayer(operation: AtelierOperation): "IDENTITY" | "GARMENT" {
  return operation.stage === "SUBJECT_A" || operation.stage === "SUBJECT_B"
    ? "IDENTITY"
    : "GARMENT";
}

function lockedPrivacy(operation: AtelierOperation): "PUBLIC" | "PRIVATE_OPERATOR" | "PRIVATE_IDENTITY" {
  const rank = { PUBLIC: 0, PRIVATE_OPERATOR: 1, PRIVATE_IDENTITY: 2 } as const;
  return [...operation.parentLocks, ...operation.authorityStack].reduce<
    "PUBLIC" | "PRIVATE_OPERATOR" | "PRIVATE_IDENTITY"
  >((current, item) => rank[item.privacyClass] > rank[current] ? item.privacyClass : current, "PUBLIC");
}

function lockAssetId(semanticHash: string): string {
  if (!SHA256_PATTERN.test(semanticHash)) {
    throw new StudioEngineError(
      "ENGINE_UNAVAILABLE",
      503,
      "The stored Atelier semantic identity is invalid.",
      "Prepare the operation again from its trusted declaration.",
    );
  }
  return `atelier.lock/${semanticHash}`;
}

function exactCompositeSource(input: {
  composite: AtelierArtifactRow;
  artifacts: readonly AtelierArtifactRow[];
  expectedRoom: Readonly<{ assetId: string; sha256: string }>;
  canvasPolicyRevision: string | null;
}): AtelierArtifactRow {
  const metadata = input.composite.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw invalidTransition("The approved composite has no deterministic source metadata.");
  }
  const sourceArtifactIds = (metadata as Record<string, unknown>).sourceArtifactIds;
  const subjectSha256 = (metadata as Record<string, unknown>).subjectSha256;
  const expectedCompositeRevision = input.canvasPolicyRevision === null
    ? STUDIO_ATELIER_LEGACY_SUBJECT_COMPOSITE_REVISION
    : STUDIO_ATELIER_SUBJECT_COMPOSITE_REVISION;
  if (
    !Array.isArray(sourceArtifactIds)
    || sourceArtifactIds.length !== 1
    || typeof sourceArtifactIds[0] !== "string"
    || typeof subjectSha256 !== "string"
    || (metadata as Record<string, unknown>).compositionVersion
      !== expectedCompositeRevision
    || (metadata as Record<string, unknown>).roomAssetId !== input.expectedRoom.assetId
    || (metadata as Record<string, unknown>).roomSha256 !== input.expectedRoom.sha256
    || (input.canvasPolicyRevision !== null
      && (metadata as Record<string, unknown>).canvasPolicyRevision
        !== input.canvasPolicyRevision)
  ) {
    throw invalidTransition("The approved composite does not declare one exact room and subject source.");
  }
  const subject = input.artifacts.find((artifact) =>
    artifact.id === sourceArtifactIds[0]
    && artifact.executionId === input.composite.executionId
    && artifact.kind === "SUBJECT_LAYER"
    && artifact.state === "STORED"
    && artifact.mimeType === "image/png"
    && artifact.sha256 === subjectSha256
  );
  if (!subject) {
    throw invalidTransition("The exact transparent source of the approved composite is unavailable.");
  }
  return subject;
}

async function lockAfterConcurrentAdvance(input: {
  dependencies: StudioAtelierLockDependencies;
  operatorSubject: string;
  operationId: string;
  expectedArtifactSha256: string;
}): Promise<AtelierOperationProjectionRow> {
  const projection = await input.dependencies.getProjection(input);
  if (
    projection?.state === "LOCKED"
    && projection.lockedArtifactSha256 === input.expectedArtifactSha256
  ) return projection;
  throw invalidTransition("The Atelier lock projection changed concurrently.");
}

/**
 * Server-only lock boundary. The caller supplies only operator + operation ID;
 * approval and every reviewed artifact byte are reloaded from trusted stores.
 */
export function createStudioAtelierLockService(
  input: Readonly<{
    resolveLockedRoom: StudioAtelierLockedRoomResolver;
    overrides?: Partial<Omit<StudioAtelierLockDependencies, "resolveLockedRoom">>;
  }>,
) {
  const dependencies: StudioAtelierLockDependencies = Object.freeze({
    ...defaultDependencies,
    ...input.overrides,
    resolveLockedRoom: input.resolveLockedRoom,
  });

  return async function lockApprovedOnce(command: Readonly<{
    operatorSubject: string;
    actorSubject?: string;
    operationId: string;
  }>): Promise<AtelierOperationProjectionRow> {
    const [operationRow, initialProjection] = await Promise.all([
      dependencies.getOperation(command),
      dependencies.getProjection(command),
    ]);
    if (!operationRow || !initialProjection) throw notFound();
    if (initialProjection.state === "LOCKED") return initialProjection;
    if (initialProjection.state !== "USER_APPROVED") {
      throw invalidTransition("Only the exact user-approved Atelier artifact can be locked.");
    }
    if (
      !initialProjection.materializedExecutionId
      || !initialProjection.materializedArtifactId
      || !initialProjection.materializedArtifactSha256
    ) {
      throw invalidTransition("The approved projection has no exact materialized artifact.");
    }

    const operation = canonicalOperation(operationRow.canonicalOperation);
    const [execution, artifacts] = await Promise.all([
      dependencies.getExecution(initialProjection.materializedExecutionId),
      dependencies.listArtifacts(initialProjection.materializedExecutionId),
    ]);
    if (!execution || execution.state !== "COMPLETE" || execution.operationId !== operationRow.id) {
      throw invalidTransition("The approved materialization is not a complete scoped execution.");
    }
    const materialized = artifacts.find((artifact) =>
      artifact.id === initialProjection.materializedArtifactId
      && artifact.state === "STORED"
      && artifact.sha256 === initialProjection.materializedArtifactSha256
    );
    if (!materialized) {
      throw invalidTransition("The exact approved materialized artifact is unavailable.");
    }

    let lockArtifact = materialized;
    let lockEvidence: Record<string, unknown> = {
      outputMode: operation.outputContract.mode,
      sourceArtifactId: materialized.id,
      sourceArtifactSha256: materialized.sha256,
    };

    if (operation.outputContract.mode === "TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE") {
      if (materialized.kind !== "COMPOSITE" || materialized.mimeType !== "image/png") {
        throw invalidTransition("A transparent-composite operation must approve its exact deterministic PNG composite.");
      }
      const expectedRoom = roomAuthority(operation);
      const compositePolicy = operation.outputContract.deterministicComposite;
      const canvasPolicyRevision = "canvasPolicyRevision" in compositePolicy
        ? compositePolicy.canvasPolicyRevision
        : null;
      const subject = exactCompositeSource({
        composite: materialized,
        artifacts,
        expectedRoom,
        canvasPolicyRevision,
      });
      const room = await dependencies.resolveLockedRoom({
        ...command,
        expected: { assetId: expectedRoom.assetId, sha256: expectedRoom.sha256 },
      });
      assertResolvedRoom(expectedRoom, room, canvasPolicyRevision);
      const [subjectBytes, reviewedCompositeBytes] = await Promise.all([
        dependencies.readArtifact(subject),
        dependencies.readArtifact(materialized),
      ]);
      if (subjectBytes.byteLength !== subject.byteSize || sha256(subjectBytes) !== subject.sha256) {
        throw new StudioEngineError(
          "INVALID_ASSET",
          503,
          "The reviewed composite's subject bytes do not match their durable artifact.",
          "Restore the exact materialized subject layer before locking.",
        );
      }
      if (
        reviewedCompositeBytes.byteLength !== materialized.byteSize
        || sha256(reviewedCompositeBytes) !== materialized.sha256
      ) {
        throw new StudioEngineError(
          "INVALID_ASSET",
          503,
          "The approved composite bytes do not match their durable artifact.",
          "Restore the exact reviewed composite before locking.",
        );
      }
      const recomputed = await compositeStudioAtelierSubject({
        room: {
          bytes: room.bytes,
          mimeType: room.mimeType,
          sha256: room.sha256,
        },
        subject: {
          bytes: subjectBytes,
          mimeType: "image/png",
          sha256: subject.sha256,
        },
      });
      if (recomputed.sha256 !== materialized.sha256) {
        throw new StudioEngineError(
          "INVALID_ASSET",
          503,
          "The approved composite is not the deterministic result of its exact room and subject.",
          "Restore the exact pre-review composite; never replace approved bytes after review.",
        );
      }
      const recordedCanvasProfile = materialized.metadata
        && typeof materialized.metadata === "object"
        && !Array.isArray(materialized.metadata)
        ? (materialized.metadata as Record<string, unknown>).canvasProfile
        : null;
      if (
        canvasPolicyRevision !== null
        && canonicalStringify(recordedCanvasProfile)
          !== canonicalStringify(recomputed.canvasProfile)
      ) {
        throw new StudioEngineError(
          "INVALID_ASSET",
          503,
          "The approved composite canvas-profile evidence does not match deterministic recomposition.",
          "Restore the exact pre-review composite metadata and native-room mapping.",
        );
      }
      lockArtifact = materialized;
      lockEvidence = {
        ...lockEvidence,
        compositeRevision: canvasPolicyRevision === null
          ? STUDIO_ATELIER_LEGACY_SUBJECT_COMPOSITE_REVISION
          : STUDIO_ATELIER_SUBJECT_COMPOSITE_REVISION,
        lockVerificationCompositeRevision: STUDIO_ATELIER_SUBJECT_COMPOSITE_REVISION,
        roomAssetId: room.assetId,
        roomSha256: room.sha256,
        roomManifestRevision: room.manifestRevision,
        roomManifestHash: room.manifestHash,
        subjectArtifactId: subject.id,
        subjectArtifactSha256: subject.sha256,
        compositeArtifactSha256: lockArtifact.sha256,
        canvasPolicyRevision,
        canvasProfile: canvasPolicyRevision === null ? null : recomputed.canvasProfile,
        roomPixelsGenerated: 0,
      };
    } else {
      if (materialized.kind !== "NORMALIZED") {
        throw invalidTransition("A full-frame operation must approve its exact normalized artifact.");
      }
      const reviewedBytes = await dependencies.readArtifact(materialized);
      if (
        reviewedBytes.byteLength !== materialized.byteSize
        || sha256(reviewedBytes) !== materialized.sha256
      ) {
        throw new StudioEngineError(
          "INVALID_ASSET",
          503,
          "The approved normalized bytes do not match their durable artifact.",
          "Restore the exact reviewed artifact before locking.",
        );
      }
    }

    try {
      const locked = await dependencies.recordLifecycleEvent({
        ...command,
        expectedVersion: initialProjection.version,
        eventType: "LOCKED",
        actorSubject: command.actorSubject ?? command.operatorSubject,
        executionId: execution.id,
        artifactId: lockArtifact.id,
        lockedAssetId: lockAssetId(operationRow.semanticHash),
        lockedParentDescriptor: {
          lockedLayer: lockedLayer(operation),
          privacyClass: lockedPrivacy(operation),
        },
        evidence: lockEvidence,
      });
      return locked.projection;
    } catch {
      return lockAfterConcurrentAdvance({
        dependencies,
        ...command,
        expectedArtifactSha256: lockArtifact.sha256,
      });
    }
  };
}
