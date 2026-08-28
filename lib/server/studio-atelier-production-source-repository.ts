import { createHash } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  studioAtelierArtifacts,
  studioAtelierExecutions,
  studioAtelierOperationProjections,
  studioAtelierOperations,
} from "../../db/shop-postgres-schema";
import { getStudioDb } from "../../db/shop-postgres";
import {
  atelierOperationSchema,
  parentLockSchema,
  type AtelierOperation,
  type AtelierStage,
  type ParentLock,
  type ParentRole,
} from "../studio/atelier/contracts";
import { verifyStudioImage } from "../studio/engine/assets";
import { StudioEngineError } from "../studio/engine/errors";
import { wardrobeCaptureKey } from "../studio/engine/pending-capture-service";
import {
  getOwnedIntakeRow,
  getOwnedWardrobeItem,
  listOwnedAssets,
  resolveBoundStudioSource,
} from "./studio-intake-repository";
import {
  getAtelierCorrectionOperation,
  getAtelierOperation,
  getAtelierOperationProjection,
  listAtelierOperationEvents,
  type AtelierArtifactRow,
  type AtelierLifecycleEventRow,
  type AtelierOperationProjectionRow,
  type AtelierOperationRow,
} from "./studio-atelier-repository";
import {
  listPendingProductCaptures,
} from "./studio-pending-capture-repository";
import { getShopBlob } from "./vercel-blob";

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
] as const);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StudioAtelierProductionImageMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp";

export type StudioAtelierProductionImageRecord = Readonly<{
  assetId: string;
  sha256: string;
  mimeType: StudioAtelierProductionImageMimeType;
  byteSize: number;
  width: number;
  height: number;
  blobPathname: string;
}>;

export type StudioAtelierOwnedGarmentSource = Readonly<{
  operatorSubject: string;
  wardrobeItemId: string;
  garmentId: string;
  intakeId: string;
  wardrobeVersion: number;
  intakeVersion: number;
  facts: Readonly<{
    title: string;
    category: string;
    colour: string;
    sizeLabel: string;
    condition: string;
  }>;
  source: StudioAtelierProductionImageRecord;
  approvedFront: StudioAtelierProductionImageRecord;
  directCaptures: readonly Readonly<{
    role: "GARMENT_BACK" | "FABRIC_DETAIL";
    image: StudioAtelierProductionImageRecord;
  }>[];
}>;

export type StudioAtelierLockedProductionArtifact = Readonly<{
  operationId: string;
  semanticHash: string;
  parent: ParentLock;
  image: StudioAtelierProductionImageRecord;
}>;

export type StudioAtelierReviewableProductionArtifact = Readonly<{
  operationId: string;
  semanticHash: string;
  stage: "SUBJECT_A";
  reviewState: "GATE_PASS_PRIVATE" | "LOCKED";
  image: StudioAtelierProductionImageRecord;
}>;

export type StudioAtelierProductionOperationBundle = Readonly<{
  row: AtelierOperationRow;
  operation: AtelierOperation;
  projection: AtelierOperationProjectionRow;
  events: readonly AtelierLifecycleEventRow[];
  correction: AtelierOperationRow | null;
}>;

export type StudioAtelierProductionSourceRepository = Readonly<{
  resolveOwnedGarment(input: Readonly<{
    operatorSubject: string;
    wardrobeItemId: string;
  }>): Promise<StudioAtelierOwnedGarmentSource>;
  listLockedArtifacts(input: Readonly<{
    operatorSubject: string;
    wardrobeItemId: string;
  }>): Promise<readonly StudioAtelierLockedProductionArtifact[]>;
  resolveReviewableSubjectA(input: Readonly<{
    operatorSubject: string;
    wardrobeItemId: string;
  }>): Promise<StudioAtelierReviewableProductionArtifact | null>;
  resolveOperation(input: Readonly<{
    operatorSubject: string;
    operationId: string;
  }>): Promise<StudioAtelierProductionOperationBundle | null>;
  resolveOperationBySemanticHash(input: Readonly<{
    operatorSubject: string;
    semanticHash: string;
  }>): Promise<StudioAtelierProductionOperationBundle | null>;
  readVerifiedImage(
    image: StudioAtelierProductionImageRecord,
  ): Promise<Readonly<{
    bytes: Uint8Array;
    mimeType: StudioAtelierProductionImageMimeType;
  }>>;
}>;

export type StudioAtelierProductionSourceRepositoryOverrides = Partial<
  StudioAtelierProductionSourceRepository
>;

function invalidAsset(message: string, action: string): never {
  throw new StudioEngineError("INVALID_ASSET", 503, message, action);
}

function safeMimeType(value: string): StudioAtelierProductionImageMimeType {
  if (IMAGE_MIME_TYPES.has(value as StudioAtelierProductionImageMimeType)) {
    return value as StudioAtelierProductionImageMimeType;
  }
  return invalidAsset(
    "A private Atelier source has an unsupported media type.",
    "Restore the exact JPEG, PNG or WebP source before continuing.",
  );
}

function positiveInteger(value: number | null, label: string): number {
  if (Number.isSafeInteger(value) && (value ?? 0) > 0) return value!;
  return invalidAsset(
    `A private Atelier source has no verified ${label}.`,
    "Restore and re-verify the exact source image before continuing.",
  );
}

function imageRecord(input: Readonly<{
  assetId: string;
  sha256: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  blobPathname: string;
}>): StudioAtelierProductionImageRecord {
  if (
    !input.assetId
    || !/^[a-f0-9]{64}$/.test(input.sha256)
    || !Number.isSafeInteger(input.byteSize)
    || input.byteSize <= 0
    || !input.blobPathname
  ) {
    return invalidAsset(
      "A private Atelier source manifest tuple is incomplete.",
      "Restore the exact content-addressed source record before continuing.",
    );
  }
  return Object.freeze({
    assetId: input.assetId,
    sha256: input.sha256,
    mimeType: safeMimeType(input.mimeType),
    byteSize: input.byteSize,
    width: positiveInteger(input.width, "width"),
    height: positiveInteger(input.height, "height"),
    blobPathname: input.blobPathname,
  });
}

export function canonicalStudioAtelierGarmentId(wardrobeItemId: string): string {
  if (!UUID_PATTERN.test(wardrobeItemId)) {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      400,
      "The Atelier Wardrobe identity is invalid.",
      "Open the garment from the authenticated Wardrobe.",
    );
  }
  return `wardrobe:${wardrobeItemId.toLowerCase()}`;
}

function lockedParentRole(stage: AtelierStage): ParentRole | null {
  switch (stage) {
    case "GARMENT_01_FRONT": return "GARMENT_FRONT_LOCK";
    case "GARMENT_02_BACK": return "GARMENT_BACK_LOCK";
    case "GARMENT_03_MANNEQUIN": return "MANNEQUIN_FRONT_LOCK";
    case "GARMENT_04_DETAIL": return "FABRIC_DETAIL_LOCK";
    case "SUBJECT_A":
    case "SUBJECT_B": return "ACCEPTED_SUBJECT_LOCK";
    case "ROOM_FINAL_05": return "ACCEPTED_05";
    default: return null;
  }
}

function lockedImage(
  artifact: AtelierArtifactRow,
  projection: AtelierOperationProjectionRow,
): StudioAtelierProductionImageRecord {
  if (
    artifact.state !== "STORED"
    || artifact.id !== projection.lockedArtifactId
    || artifact.sha256 !== projection.lockedArtifactSha256
    || artifact.quarantineReason !== null
  ) {
    return invalidAsset(
      "A locked Atelier artifact no longer matches its durable projection.",
      "Restore the exact locked content-addressed artifact before continuing.",
    );
  }
  return imageRecord({
    assetId: projection.lockedAssetId!,
    sha256: artifact.sha256,
    mimeType: artifact.mimeType,
    byteSize: artifact.byteSize,
    width: artifact.width,
    height: artifact.height,
    blobPathname: artifact.blobPathname,
  });
}

async function defaultResolveOwnedGarment(input: Readonly<{
  operatorSubject: string;
  wardrobeItemId: string;
}>): Promise<StudioAtelierOwnedGarmentSource> {
  const wardrobe = await getOwnedWardrobeItem(input.wardrobeItemId, input.operatorSubject);
  const [intake, assets, captures] = await Promise.all([
    getOwnedIntakeRow(wardrobe.intakeId, input.operatorSubject),
    listOwnedAssets(wardrobe.intakeId, input.operatorSubject),
    listPendingProductCaptures({
      operatorSubject: input.operatorSubject,
      sku: wardrobeCaptureKey(wardrobe.id),
    }),
  ]);
  if (
    wardrobe.operatorSubject !== input.operatorSubject
    || intake.operatorSubject !== input.operatorSubject
    || intake.id !== wardrobe.intakeId
  ) {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      404,
      "That garment is not available in this operator scope.",
      "Open the garment from the authenticated Wardrobe.",
    );
  }
  const source = resolveBoundStudioSource(intake, assets);
  if (!source) {
    return invalidAsset(
      "The Wardrobe garment has no immutable direct source binding.",
      "Restore the exact original source before preparing Atelier work.",
    );
  }
  const approvedFront = assets.find((asset) =>
    asset.id === wardrobe.approvedAssetId
    && asset.role === "GARMENT_FRONT"
  );
  if (!approvedFront) {
    return invalidAsset(
      "The Wardrobe garment has no exact approved-front binding.",
      "Restore the committed approved front before preparing Atelier work.",
    );
  }
  const directCaptures = captures
    .filter((capture) => capture.origin === "DIRECT")
    .filter((capture): capture is typeof capture & {
      role: "GARMENT_BACK" | "FABRIC_DETAIL";
    } => capture.role === "GARMENT_BACK" || capture.role === "FABRIC_DETAIL")
    .map((capture) => Object.freeze({
      role: capture.role,
      image: imageRecord({
        assetId: capture.id,
        sha256: capture.sha256,
        mimeType: capture.mimeType,
        byteSize: capture.byteSize,
        width: capture.width,
        height: capture.height,
        blobPathname: capture.blobPathname,
      }),
    }));
  return Object.freeze({
    operatorSubject: input.operatorSubject,
    wardrobeItemId: wardrobe.id,
    garmentId: canonicalStudioAtelierGarmentId(wardrobe.id),
    intakeId: intake.id,
    wardrobeVersion: wardrobe.version,
    intakeVersion: intake.version,
    facts: Object.freeze({
      title: wardrobe.title,
      category: wardrobe.category,
      colour: wardrobe.colour,
      sizeLabel: wardrobe.sizeLabel,
      condition: wardrobe.condition,
    }),
    source: imageRecord({
      assetId: source.id,
      sha256: source.sha256,
      mimeType: source.mimeType,
      byteSize: source.byteSize,
      width: source.width,
      height: source.height,
      blobPathname: source.blobPathname,
    }),
    approvedFront: imageRecord({
      assetId: approvedFront.id,
      sha256: approvedFront.sha256,
      mimeType: approvedFront.mimeType,
      byteSize: approvedFront.byteSize,
      width: approvedFront.width,
      height: approvedFront.height,
      blobPathname: approvedFront.blobPathname,
    }),
    directCaptures: Object.freeze(directCaptures),
  });
}

async function defaultListLockedArtifacts(input: Readonly<{
  operatorSubject: string;
  wardrobeItemId: string;
}>): Promise<readonly StudioAtelierLockedProductionArtifact[]> {
  await getOwnedWardrobeItem(input.wardrobeItemId, input.operatorSubject);
  const rows = await (await getStudioDb()).select({
    operation: studioAtelierOperations,
    projection: studioAtelierOperationProjections,
    artifact: studioAtelierArtifacts,
  }).from(studioAtelierOperations).innerJoin(
    studioAtelierOperationProjections,
    eq(studioAtelierOperationProjections.operationId, studioAtelierOperations.id),
  ).innerJoin(
    studioAtelierArtifacts,
    eq(studioAtelierArtifacts.id, studioAtelierOperationProjections.lockedArtifactId),
  ).where(and(
    eq(studioAtelierOperations.operatorSubject, input.operatorSubject),
    eq(studioAtelierOperations.wardrobeItemId, input.wardrobeItemId),
    eq(studioAtelierOperationProjections.state, "LOCKED"),
  )).orderBy(desc(studioAtelierOperationProjections.updatedAt));

  return Object.freeze(rows.flatMap(({ operation, projection, artifact }) => {
    const canonical = atelierOperationSchema.parse(operation.canonicalOperation);
    const role = lockedParentRole(canonical.stage);
    const descriptor = projection.lockedParentDescriptor;
    if (!role) return [];
    if (
      !projection.lockedAssetId
      || !projection.lockedArtifactSha256
      || !descriptor
      || typeof descriptor.lockedLayer !== "string"
      || typeof descriptor.privacyClass !== "string"
    ) {
      return invalidAsset(
        "A locked Atelier parent descriptor is incomplete.",
        "Restore the exact durable lock projection before continuing.",
      );
    }
    const parent = parentLockSchema.parse({
      role,
      assetId: projection.lockedAssetId,
      sha256: projection.lockedArtifactSha256,
      garmentId: canonical.garmentId,
      sourceStage: canonical.stage,
      sourceView: canonical.view,
      reviewState: "LOCKED",
      lockedLayer: descriptor.lockedLayer,
      privacyClass: descriptor.privacyClass,
    });
    return [Object.freeze({
      operationId: operation.id,
      semanticHash: operation.semanticHash,
      parent: Object.freeze(parent),
      image: lockedImage(artifact, projection),
    })];
  }));
}

async function defaultResolveReviewableSubjectA(input: Readonly<{
  operatorSubject: string;
  wardrobeItemId: string;
}>): Promise<StudioAtelierReviewableProductionArtifact | null> {
  await getOwnedWardrobeItem(input.wardrobeItemId, input.operatorSubject);
  const rows = await (await getStudioDb()).select({
    operation: studioAtelierOperations,
    projection: studioAtelierOperationProjections,
    execution: studioAtelierExecutions,
    artifact: studioAtelierArtifacts,
  }).from(studioAtelierOperations).innerJoin(
    studioAtelierOperationProjections,
    eq(studioAtelierOperationProjections.operationId, studioAtelierOperations.id),
  ).innerJoin(
    studioAtelierExecutions,
    eq(studioAtelierExecutions.id, studioAtelierOperationProjections.materializedExecutionId),
  ).innerJoin(
    studioAtelierArtifacts,
    eq(studioAtelierArtifacts.id, studioAtelierOperationProjections.materializedArtifactId),
  ).where(and(
    eq(studioAtelierOperations.operatorSubject, input.operatorSubject),
    eq(studioAtelierOperations.wardrobeItemId, input.wardrobeItemId),
    eq(studioAtelierOperations.stage, "SUBJECT_A"),
    inArray(studioAtelierOperationProjections.state, ["SEMANTIC_PASS", "USER_APPROVED", "LOCKED"]),
    eq(studioAtelierExecutions.state, "COMPLETE"),
    eq(studioAtelierArtifacts.state, "STORED"),
  )).orderBy(desc(studioAtelierOperationProjections.updatedAt)).limit(1);
  const match = rows[0];
  if (!match) return null;
  const { operation, projection, artifact } = match;
  if (
    artifact.sha256 !== projection.materializedArtifactSha256
    || artifact.quarantineReason !== null
  ) {
    return invalidAsset(
      "The private Subject A donor no longer matches its semantic-pass projection.",
      "Restore the exact content-addressed semantic-pass artifact before continuing.",
    );
  }
  return Object.freeze({
    operationId: operation.id,
    semanticHash: operation.semanticHash,
    stage: "SUBJECT_A",
    reviewState: projection.state === "LOCKED" ? "LOCKED" : "GATE_PASS_PRIVATE",
    image: imageRecord({
      assetId: artifact.id,
      sha256: artifact.sha256,
      mimeType: artifact.mimeType,
      byteSize: artifact.byteSize,
      width: artifact.width,
      height: artifact.height,
      blobPathname: artifact.blobPathname,
    }),
  });
}

async function defaultResolveOperation(input: Readonly<{
  operatorSubject: string;
  operationId: string;
}>): Promise<StudioAtelierProductionOperationBundle | null> {
  const row = await getAtelierOperation(input);
  if (!row) return null;
  const [projection, events, correction] = await Promise.all([
    getAtelierOperationProjection(input),
    listAtelierOperationEvents(input),
    getAtelierCorrectionOperation(input),
  ]);
  if (!projection) {
    return invalidAsset(
      "The Atelier operation has no durable lifecycle projection.",
      "Restore the exact operation projection before continuing.",
    );
  }
  return Object.freeze({
    row,
    operation: atelierOperationSchema.parse(row.canonicalOperation),
    projection,
    events: Object.freeze(events),
    correction,
  });
}

async function defaultResolveOperationBySemanticHash(input: Readonly<{
  operatorSubject: string;
  semanticHash: string;
}>): Promise<StudioAtelierProductionOperationBundle | null> {
  if (!/^[a-f0-9]{64}$/.test(input.semanticHash)) return null;
  const [row] = await (await getStudioDb()).select({
    id: studioAtelierOperations.id,
  }).from(studioAtelierOperations).where(and(
    eq(studioAtelierOperations.operatorSubject, input.operatorSubject),
    eq(studioAtelierOperations.semanticHash, input.semanticHash),
  )).limit(1);
  return row
    ? defaultResolveOperation({
      operatorSubject: input.operatorSubject,
      operationId: row.id,
    })
    : null;
}

async function defaultReadVerifiedImage(
  image: StudioAtelierProductionImageRecord,
): Promise<Readonly<{
  bytes: Uint8Array;
  mimeType: StudioAtelierProductionImageMimeType;
}>> {
  const result = await getShopBlob("private", image.blobPathname, { useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return invalidAsset(
      "A required private Atelier source is unavailable.",
      "Restore the exact content-addressed source before continuing.",
    );
  }
  const rawBytes = new Uint8Array(await new Response(result.stream).arrayBuffer());
  const verified = verifyStudioImage(rawBytes, result.blob.contentType);
  const digest = createHash("sha256").update(verified.bytes).digest("hex");
  if (
    verified.bytes.byteLength !== image.byteSize
    || result.blob.size !== image.byteSize
    || digest !== image.sha256
    || verified.mimeType !== image.mimeType
    || verified.width !== image.width
    || verified.height !== image.height
  ) {
    return invalidAsset(
      "A required private Atelier source failed exact content-addressed readback.",
      "Restore the declared bytes, MIME type and dimensions before continuing.",
    );
  }
  return Object.freeze({
    bytes: verified.bytes,
    mimeType: image.mimeType,
  });
}

const defaultRepository: StudioAtelierProductionSourceRepository = Object.freeze({
  resolveOwnedGarment: defaultResolveOwnedGarment,
  listLockedArtifacts: defaultListLockedArtifacts,
  resolveReviewableSubjectA: defaultResolveReviewableSubjectA,
  resolveOperation: defaultResolveOperation,
  resolveOperationBySemanticHash: defaultResolveOperationBySemanticHash,
  readVerifiedImage: defaultReadVerifiedImage,
});

/**
 * Read-only, operator-scoped source composition for production Atelier ports.
 * Construction and import perform no database, Blob, provider or migration work.
 */
export function createStudioAtelierProductionSourceRepository(
  overrides: StudioAtelierProductionSourceRepositoryOverrides = {},
): StudioAtelierProductionSourceRepository {
  return Object.freeze({
    ...defaultRepository,
    ...overrides,
  });
}

export function resolveExactLockedArtifact(
  locked: readonly StudioAtelierLockedProductionArtifact[],
  expected: Readonly<{ assetId: string; sha256: string }>,
): StudioAtelierLockedProductionArtifact {
  const matches = locked.filter((candidate) =>
    candidate.parent.assetId === expected.assetId
    && candidate.parent.sha256 === expected.sha256
    && candidate.image.sha256 === expected.sha256
  );
  if (matches.length !== 1) {
    return invalidAsset(
      "The exact locked Atelier parent could not be resolved unambiguously.",
      "Restore the single matching operator-owned lock before continuing.",
    );
  }
  return matches[0]!;
}

export function resolveExactReviewableSubjectA(
  donor: StudioAtelierReviewableProductionArtifact | null,
  expected: Readonly<{ assetId: string; sha256: string }>,
): StudioAtelierReviewableProductionArtifact {
  if (
    !donor
    || donor.image.assetId !== expected.assetId
    || donor.image.sha256 !== expected.sha256
    || (donor.reviewState !== "GATE_PASS_PRIVATE" && donor.reviewState !== "LOCKED")
  ) {
    return invalidAsset(
      "The exact private Subject A donor is not eligible for refinement.",
      "Restore the matching semantic-pass Subject A artifact before continuing.",
    );
  }
  return donor;
}
