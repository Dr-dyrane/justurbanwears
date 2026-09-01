import { createHash } from "node:crypto";
import {
  studioAtelierShopMediaRoleSchema,
  type StudioAtelierShopMediaRole,
} from "../studio/atelier/publication-adoption-contracts";
import { canonicalStringify } from "../studio/atelier/canonical";
import { StudioEngineError } from "../studio/engine/errors";
import {
  studioAtelierShopAdoptionSqlRepository,
  type StudioAtelierPublishedMediaAuthorization,
  type StudioAtelierShopAdoptionSqlRepository,
} from "./studio-atelier-publication-adoption-ledger-repository";
import { readAtelierArtifactBytes } from "./studio-atelier-artifact-readback";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export type StudioAtelierPublishedMedia = Readonly<{
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png";
  byteSize: number;
  sha256: string;
  etag: string;
}>;

type MediaDependencies = Readonly<{
  repository: StudioAtelierShopAdoptionSqlRepository;
  readArtifact: typeof readAtelierArtifactBytes;
}>;

function unavailable(): StudioEngineError {
  return new StudioEngineError(
    "INVALID_ASSET",
    404,
    "This Shop image is unavailable.",
    "Return to the current published Shop listing.",
  );
}

function parseIdentity(input: Readonly<{ receiptId: string; role: string }>): Readonly<{
  receiptId: string;
  role: StudioAtelierShopMediaRole;
}> {
  const receiptId = input.receiptId.trim().toLowerCase();
  const role = studioAtelierShopMediaRoleSchema.safeParse(input.role);
  if (!SHA256_PATTERN.test(receiptId) || !role.success) throw unavailable();
  return Object.freeze({ receiptId, role: role.data });
}

function authorizationIdentity(value: StudioAtelierPublishedMediaAuthorization): string {
  return canonicalStringify({
    receiptId: value.receiptId,
    role: value.role,
    operatorSubject: value.operatorSubject,
    wardrobeItemId: value.wardrobeItemId,
    garmentId: value.garmentId,
    adoptionRevision: value.adoptionRevision,
    publicationId: value.publicationId,
    publicationState: value.publicationState,
    publicationSourceRevision: value.publicationSourceRevision,
    operationId: value.operationId,
    projectionVersion: value.projectionVersion,
    lockedArtifactId: value.lockedArtifactId,
    lockedArtifactSha256: value.lockedArtifactSha256,
    mimeType: value.mimeType,
    byteSize: value.byteSize,
    width: value.width,
    height: value.height,
    artifact: {
      id: value.artifact.id,
      executionId: value.artifact.executionId,
      state: value.artifact.state,
      kind: value.artifact.kind,
      privacy: value.artifact.privacy,
      mimeType: value.artifact.mimeType,
      byteSize: value.artifact.byteSize,
      width: value.artifact.width,
      height: value.artifact.height,
      sha256: value.artifact.sha256,
      blobPathname: value.artifact.blobPathname,
    },
  });
}

function assertAuthorization(value: StudioAtelierPublishedMediaAuthorization | null): StudioAtelierPublishedMediaAuthorization {
  if (
    !value
    || value.publicationState !== "PUBLISHED"
    || value.publicationSourceRevision !== value.adoptionRevision
    || value.artifact.id !== value.lockedArtifactId
    || value.artifact.sha256 !== value.lockedArtifactSha256
    || value.artifact.mimeType !== value.mimeType
    || value.artifact.byteSize !== value.byteSize
    || value.artifact.width !== value.width
    || value.artifact.height !== value.height
    || value.artifact.state !== "STORED"
    || value.artifact.privacy !== "PRIVATE"
    || !["NORMALIZED", "COMPOSITE"].includes(value.artifact.kind)
  ) throw unavailable();
  return value;
}

export function createStudioAtelierPublishedMediaService(
  overrides: Partial<MediaDependencies> = {},
) {
  const dependencies: MediaDependencies = Object.freeze({
    repository: studioAtelierShopAdoptionSqlRepository,
    readArtifact: readAtelierArtifactBytes,
    ...overrides,
  });
  return async function readPublishedMedia(rawInput: Readonly<{
    receiptId: string;
    role: string;
  }>): Promise<StudioAtelierPublishedMedia> {
    const input = parseIdentity(rawInput);
    await dependencies.repository.assertReady();
    const before = assertAuthorization(
      await dependencies.repository.readPublishedMediaAuthorization(input),
    );
    const beforeIdentity = authorizationIdentity(before);
    const bytes = new Uint8Array(await dependencies.readArtifact(before.artifact));

    // Visibility can change while private Blob readback is in flight. The
    // second authoritative read is mandatory even for HEAD and conditional
    // GET requests; callers decide response shape only after this service.
    const after = assertAuthorization(
      await dependencies.repository.readPublishedMediaAuthorization(input),
    );
    if (authorizationIdentity(after) !== beforeIdentity) throw unavailable();

    const digest = createHash("sha256").update(bytes).digest("hex");
    if (bytes.byteLength !== before.byteSize || digest !== before.lockedArtifactSha256) {
      throw unavailable();
    }
    return Object.freeze({
      bytes,
      mimeType: before.mimeType,
      byteSize: before.byteSize,
      sha256: digest,
      etag: `"sha256-${digest}"`,
    });
  };
}

export const readStudioAtelierPublishedMedia =
  createStudioAtelierPublishedMediaService();
