import { createHash } from "node:crypto";
import sharp from "sharp";
import { canonicalStringify, sha256Text } from "../studio/atelier/canonical";
import { atelierOperationSchema, type AtelierOperation } from "../studio/atelier/contracts";
import { resolveStudioAtelierRoomCanvasProfile } from "../studio/atelier/canvas-policy";
import {
  compositeStudioAtelierSubject,
  inspectStudioAtelierSubjectLayer,
  type StudioAtelierHashedImage,
  type StudioAtelierSubjectLayer,
} from "./studio-atelier-subject-compositor";

export const STUDIO_ATELIER_DETERMINISTIC_TECHNICAL_EVALUATOR_ID =
  "juw.atelier.deterministic-technical-evaluator" as const;
export const STUDIO_ATELIER_DETERMINISTIC_TECHNICAL_EVALUATOR_VERSION =
  "1.0.0" as const;
export const STUDIO_ATELIER_DETERMINISTIC_TECHNICAL_POLICY_REVISION =
  "juw.atelier.deterministic-technical-policy.v1" as const;
export const STUDIO_ATELIER_OPAQUE_NORMALIZATION_REVISION =
  "sharp-0.34.5-mozjpeg-q95-444-srgb-v1" as const;
export const STUDIO_ATELIER_DETERMINISTIC_TECHNICAL_EVIDENCE_VERSION =
  "juw.atelier.deterministic-technical-evidence.v1" as const;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PROVIDER_WIDTH = 1024;
const PROVIDER_HEIGHT = 1536;

export type StudioAtelierTechnicalCheckDecision =
  | "SATISFIED"
  | "BLOCKED"
  | "INDETERMINATE"
  | "NOT_APPLICABLE"
  | "NOT_EVALUATED";

export type StudioAtelierTechnicalCheck = Readonly<{
  decision: StudioAtelierTechnicalCheckDecision;
  code: string;
}>;

export type StudioAtelierTechnicalArtifactBinding = Readonly<{
  sha256: string;
  byteSize: number;
  kind: "NORMALIZED" | "COMPOSITE";
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
}>;

export type StudioAtelierTechnicalSourceArtifact = Readonly<{
  bytes: Uint8Array;
  sha256: string;
  byteSize: number;
  mimeType: "image/jpeg" | "image/png";
}>;

export type StudioAtelierTechnicalMaterialization =
  | Readonly<{
    kind: "OPAQUE_NORMALIZED";
    normalizationRevision: typeof STUDIO_ATELIER_OPAQUE_NORMALIZATION_REVISION;
    source: StudioAtelierTechnicalSourceArtifact;
  }>
  | Readonly<{
    kind: "DETERMINISTIC_COMPOSITE";
    room: StudioAtelierHashedImage;
    subject: StudioAtelierSubjectLayer;
  }>;

export type StudioAtelierDeterministicTechnicalEvaluationInput = Readonly<{
  evaluatedAt: string;
  operation: unknown;
  artifactBytes: Uint8Array;
  artifact: StudioAtelierTechnicalArtifactBinding;
  reviewedArtifact: StudioAtelierTechnicalArtifactBinding;
  materialization: StudioAtelierTechnicalMaterialization;
}>;

export type StudioAtelierDeterministicTechnicalEvidence = Readonly<{
  schemaVersion: typeof STUDIO_ATELIER_DETERMINISTIC_TECHNICAL_EVIDENCE_VERSION;
  evaluator: Readonly<{
    id: typeof STUDIO_ATELIER_DETERMINISTIC_TECHNICAL_EVALUATOR_ID;
    version: typeof STUDIO_ATELIER_DETERMINISTIC_TECHNICAL_EVALUATOR_VERSION;
    policyRevision: typeof STUDIO_ATELIER_DETERMINISTIC_TECHNICAL_POLICY_REVISION;
    normalizationRevision: typeof STUDIO_ATELIER_OPAQUE_NORMALIZATION_REVISION;
    sharpVersion: string;
    vipsVersion: string;
  }>;
  evaluatedAt: string;
  artifact: StudioAtelierTechnicalArtifactBinding;
  status: "BLOCKED" | "INDETERMINATE";
  productionPass: false;
  blockerCodes: readonly string[];
  requiredVisualJudgments: readonly ["RENDERED_TEXT", "WATERMARK"];
  checks: Readonly<{
    canonicalOperation: StudioAtelierTechnicalCheck;
    exactByteHash: StudioAtelierTechnicalCheck;
    exactByteSize: StudioAtelierTechnicalCheck;
    decodableImage: StudioAtelierTechnicalCheck;
    exactContainerType: StudioAtelierTechnicalCheck;
    exactDimensions: StudioAtelierTechnicalCheck;
    singleFrameContainer: StudioAtelierTechnicalCheck;
    colourSpace: StudioAtelierTechnicalCheck;
    outputContract: StudioAtelierTechnicalCheck;
    canonicalNormalization: StudioAtelierTechnicalCheck;
    sourceLayerAlpha: StudioAtelierTechnicalCheck;
    nativeRoomGuard: StudioAtelierTechnicalCheck;
    deterministicComposite: StudioAtelierTechnicalCheck;
    roomPreservation: StudioAtelierTechnicalCheck;
    reviewedByteIdentity: StudioAtelierTechnicalCheck;
    renderedText: StudioAtelierTechnicalCheck;
    watermark: StudioAtelierTechnicalCheck;
  }>;
  evaluationHash: string;
}>;

type MutableCheckSet = {
  -readonly [Key in keyof StudioAtelierDeterministicTechnicalEvidence["checks"]]:
    StudioAtelierTechnicalCheck;
};

type StudioAtelierTechnicalImagePipeline = {
  rotate(): StudioAtelierTechnicalImagePipeline;
  toColorspace(space: "srgb"): StudioAtelierTechnicalImagePipeline;
  ensureAlpha(): StudioAtelierTechnicalImagePipeline;
  removeAlpha(): StudioAtelierTechnicalImagePipeline;
  jpeg(options: Readonly<{
    quality: number;
    chromaSubsampling: "4:4:4";
    mozjpeg: boolean;
  }>): StudioAtelierTechnicalImagePipeline;
  metadata(): Promise<Readonly<{
    format?: string;
    width?: number;
    height?: number;
    space?: string;
    channels?: number;
    hasAlpha?: boolean;
    pages?: number;
    orientation?: number;
  }>>;
  raw(): StudioAtelierTechnicalImagePipeline;
  toBuffer(): Promise<Uint8Array>;
  toBuffer(options: Readonly<{ resolveWithObject: true }>): Promise<Readonly<{
    data: Uint8Array;
    info: Readonly<{
      width: number;
      height: number;
      channels: number;
    }>;
  }>>;
};

type StudioAtelierSharpRuntime = Readonly<{
  versions: Readonly<{
    sharp: string;
    vips: string;
  }>;
}> & ((
  input: Uint8Array,
  options: Readonly<{ failOn: "error"; animated: false }>,
) => StudioAtelierTechnicalImagePipeline);

const technicalSharp = sharp as unknown as StudioAtelierSharpRuntime;

function decision(
  value: StudioAtelierTechnicalCheckDecision,
  code: string,
): StudioAtelierTechnicalCheck {
  return Object.freeze({ decision: value, code });
}

function satisfied(code: string): StudioAtelierTechnicalCheck {
  return decision("SATISFIED", code);
}

function blocked(code: string): StudioAtelierTechnicalCheck {
  return decision("BLOCKED", code);
}

function notApplicable(code: string): StudioAtelierTechnicalCheck {
  return decision("NOT_APPLICABLE", code);
}

function notEvaluated(code: string): StudioAtelierTechnicalCheck {
  return decision("NOT_EVALUATED", code);
}

function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function exactBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && Buffer.from(left).equals(Buffer.from(right));
}

function validCanonicalInstant(value: string): boolean {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function exactArtifactBinding(
  left: StudioAtelierTechnicalArtifactBinding,
  right: StudioAtelierTechnicalArtifactBinding,
): boolean {
  return canonicalStringify(left) === canonicalStringify(right);
}

function sourceBytesAreExact(source: StudioAtelierTechnicalSourceArtifact): boolean {
  return SHA256_PATTERN.test(source.sha256)
    && source.byteSize === source.bytes.byteLength
    && source.sha256 === sha256Bytes(source.bytes);
}

/**
 * The exact normalization already used by the Atelier opaque-image lane. It is
 * exported for retained-byte replay and qualification only; this release does
 * not wire it into production execution.
 */
export async function normalizeStudioAtelierOpaqueReviewArtifact(
  sourceBytes: Uint8Array,
): Promise<Uint8Array> {
  return new Uint8Array(await technicalSharp(sourceBytes, { failOn: "error", animated: false })
    .rotate()
    .toColorspace("srgb")
    .removeAlpha()
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toBuffer());
}

async function artifactMetadata(bytes: Uint8Array): Promise<Readonly<{
  format: string;
  width: number;
  height: number;
  space: string;
  channels: number;
  hasAlpha: boolean;
  pages: number;
  orientation: number | null;
  }> | null> {
  try {
    const metadata = await technicalSharp(bytes, { failOn: "error", animated: false }).metadata();
    if (
      !metadata.format
      || !metadata.width
      || !metadata.height
      || !metadata.space
      || !metadata.channels
    ) {
      return null;
    }
    const decoded = await technicalSharp(bytes, { failOn: "error", animated: false })
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (
      decoded.info.width !== metadata.width
      || decoded.info.height !== metadata.height
      || decoded.info.channels !== metadata.channels
    ) {
      return null;
    }
    return Object.freeze({
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
      space: metadata.space,
      channels: metadata.channels,
      hasAlpha: metadata.hasAlpha ?? false,
      pages: metadata.pages ?? 1,
      orientation: metadata.orientation ?? null,
    });
  } catch {
    return null;
  }
}

async function exactSubjectGuard(input: Readonly<{
  room: StudioAtelierHashedImage;
  subject: StudioAtelierSubjectLayer;
}>): Promise<boolean> {
  let roomMetadata;
  let subjectPixels;
  try {
    roomMetadata = await technicalSharp(input.room.bytes, { failOn: "error", animated: false }).metadata();
    subjectPixels = await technicalSharp(input.subject.bytes, { failOn: "error", animated: false })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    return false;
  }
  if (
    !roomMetadata.width
    || !roomMetadata.height
    || subjectPixels.info.width !== PROVIDER_WIDTH
    || subjectPixels.info.height !== PROVIDER_HEIGHT
    || subjectPixels.info.channels !== 4
  ) {
    return false;
  }
  const profile = resolveStudioAtelierRoomCanvasProfile({
    width: roomMetadata.width,
    height: roomMetadata.height,
  });
  if (!profile) return false;
  const left = profile.subjectWindow.left + profile.transparentGuardPixels;
  const top = profile.subjectWindow.top + profile.transparentGuardPixels;
  const right = profile.subjectWindow.left
    + profile.subjectWindow.width
    - profile.transparentGuardPixels;
  const bottom = profile.subjectWindow.top
    + profile.subjectWindow.height
    - profile.transparentGuardPixels;
  for (let pixel = 0; pixel < PROVIDER_WIDTH * PROVIDER_HEIGHT; pixel += 1) {
    if (subjectPixels.data[pixel * 4 + 3] === 0) continue;
    const x = pixel % PROVIDER_WIDTH;
    const y = Math.floor(pixel / PROVIDER_WIDTH);
    if (x < left || x >= right || y < top || y >= bottom) return false;
  }
  return true;
}

function expectedOutputContract(
  operation: AtelierOperation,
  artifact: StudioAtelierTechnicalArtifactBinding,
): boolean {
  const composite = operation.outputContract.mode
    === "TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE";
  if (composite) {
    return artifact.kind === "COMPOSITE"
      && artifact.mimeType === "image/png"
      && resolveStudioAtelierRoomCanvasProfile({
        width: artifact.width,
        height: artifact.height,
      }) !== null;
  }
  return artifact.kind === "NORMALIZED"
    && artifact.mimeType === "image/jpeg"
    && artifact.width === operation.outputContract.canvas.width
    && artifact.height === operation.outputContract.canvas.height;
}

function initialChecks(): MutableCheckSet {
  return {
    canonicalOperation: notEvaluated("CANONICAL_OPERATION_NOT_EVALUATED"),
    exactByteHash: notEvaluated("EXACT_BYTE_HASH_NOT_EVALUATED"),
    exactByteSize: notEvaluated("EXACT_BYTE_SIZE_NOT_EVALUATED"),
    decodableImage: notEvaluated("IMAGE_DECODE_NOT_EVALUATED"),
    exactContainerType: notEvaluated("CONTAINER_TYPE_NOT_EVALUATED"),
    exactDimensions: notEvaluated("DIMENSIONS_NOT_EVALUATED"),
    singleFrameContainer: notEvaluated("SINGLE_FRAME_NOT_EVALUATED"),
    colourSpace: notEvaluated("COLOUR_SPACE_NOT_EVALUATED"),
    outputContract: notEvaluated("OUTPUT_CONTRACT_NOT_EVALUATED"),
    canonicalNormalization: notEvaluated("NORMALIZATION_NOT_EVALUATED"),
    sourceLayerAlpha: notEvaluated("SOURCE_ALPHA_NOT_EVALUATED"),
    nativeRoomGuard: notEvaluated("NATIVE_ROOM_GUARD_NOT_EVALUATED"),
    deterministicComposite: notEvaluated("COMPOSITE_NOT_EVALUATED"),
    roomPreservation: notEvaluated("ROOM_PRESERVATION_NOT_EVALUATED"),
    reviewedByteIdentity: notEvaluated("REVIEWED_BYTE_IDENTITY_NOT_EVALUATED"),
    renderedText: decision("INDETERMINATE", "VERSION_LOCKED_TEXT_DETECTOR_REQUIRED"),
    watermark: decision("INDETERMINATE", "VERSION_LOCKED_WATERMARK_DETECTOR_REQUIRED"),
  };
}

/**
 * Evaluates only deterministic facts. It cannot return production PASS:
 * rendered text and watermark absence remain indeterminate until an exact,
 * privacy-approved detector is independently qualified and installed.
 */
export async function evaluateStudioAtelierDeterministicTechnicalQuality(
  input: StudioAtelierDeterministicTechnicalEvaluationInput,
): Promise<StudioAtelierDeterministicTechnicalEvidence> {
  const checks = initialChecks();
  const operation = atelierOperationSchema.safeParse(input.operation);
  checks.canonicalOperation = operation.success
    ? satisfied("CANONICAL_OPERATION_VERIFIED")
    : blocked("CANONICAL_OPERATION_INVALID");

  const actualHash = sha256Bytes(input.artifactBytes);
  checks.exactByteHash = SHA256_PATTERN.test(input.artifact.sha256)
    && input.artifact.sha256 === actualHash
    ? satisfied("EXACT_BYTE_HASH_VERIFIED")
    : blocked("EXACT_BYTE_HASH_MISMATCH");
  checks.exactByteSize = input.artifact.byteSize === input.artifactBytes.byteLength
    ? satisfied("EXACT_BYTE_SIZE_VERIFIED")
    : blocked("EXACT_BYTE_SIZE_MISMATCH");
  checks.reviewedByteIdentity = exactArtifactBinding(input.artifact, input.reviewedArtifact)
    ? satisfied("REVIEW_BINDS_EXACT_ARTIFACT")
    : blocked("REVIEWED_ARTIFACT_BINDING_MISMATCH");

  const metadata = await artifactMetadata(input.artifactBytes);
  if (!metadata) {
    checks.decodableImage = blocked("IMAGE_DECODE_FAILED");
    checks.exactContainerType = blocked("CONTAINER_TYPE_UNVERIFIABLE");
    checks.exactDimensions = blocked("DIMENSIONS_UNVERIFIABLE");
    checks.singleFrameContainer = blocked("SINGLE_FRAME_UNVERIFIABLE");
    checks.colourSpace = blocked("COLOUR_SPACE_UNVERIFIABLE");
  } else {
    checks.decodableImage = satisfied("IMAGE_DECODED_TO_EXACT_PIXELS");
    const expectedFormat = input.artifact.mimeType === "image/jpeg" ? "jpeg" : "png";
    checks.exactContainerType = metadata.format === expectedFormat
      ? satisfied("CONTAINER_TYPE_MATCHES_DECLARATION")
      : blocked("CONTAINER_TYPE_MISMATCH");
    checks.exactDimensions = metadata.width === input.artifact.width
      && metadata.height === input.artifact.height
      ? satisfied("DECODED_DIMENSIONS_MATCH_BINDING")
      : blocked("DECODED_DIMENSIONS_MISMATCH");
    checks.singleFrameContainer = metadata.pages === 1
      ? satisfied("SINGLE_FRAME_CONTAINER_VERIFIED")
      : blocked("MULTI_FRAME_CONTAINER_DENIED");
    checks.colourSpace = metadata.space === "srgb"
      && metadata.channels === 3
      && !metadata.hasAlpha
      && (metadata.orientation === null || metadata.orientation === 1)
      ? satisfied("OPAQUE_SRGB_WITHOUT_PENDING_ORIENTATION")
      : blocked("COLOUR_ALPHA_OR_ORIENTATION_MISMATCH");
  }

  checks.outputContract = operation.success
    && expectedOutputContract(operation.data, input.artifact)
    ? satisfied("OUTPUT_CONTRACT_MATCHES_STAGE_AND_REVIEW_ARTIFACT")
    : blocked("OUTPUT_CONTRACT_MISMATCH");

  if (input.materialization.kind === "OPAQUE_NORMALIZED") {
    checks.sourceLayerAlpha = notApplicable("OPAQUE_OUTPUT_HAS_NO_SOURCE_ALPHA_GATE");
    checks.nativeRoomGuard = notApplicable("OPAQUE_OUTPUT_HAS_NO_NATIVE_ROOM_GUARD");
    checks.deterministicComposite = notApplicable("OPAQUE_OUTPUT_HAS_NO_COMPOSITE");
    checks.roomPreservation = notApplicable("OPAQUE_OUTPUT_HAS_NO_LOCKED_ROOM_COMPOSITE");
    const correctMode = operation.success
      && operation.data.outputContract.mode !== "TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE"
      && input.artifact.kind === "NORMALIZED"
      && input.materialization.normalizationRevision
        === STUDIO_ATELIER_OPAQUE_NORMALIZATION_REVISION;
    if (!correctMode || !sourceBytesAreExact(input.materialization.source)) {
      checks.canonicalNormalization = blocked("NORMALIZATION_SOURCE_OR_REVISION_INVALID");
    } else {
      try {
        const normalized = await normalizeStudioAtelierOpaqueReviewArtifact(
          input.materialization.source.bytes,
        );
        checks.canonicalNormalization = exactBytes(normalized, input.artifactBytes)
          ? satisfied("CANONICAL_OPAQUE_NORMALIZATION_REPLAY_MATCHED")
          : blocked("CANONICAL_OPAQUE_NORMALIZATION_MISMATCH");
      } catch {
        checks.canonicalNormalization = blocked("CANONICAL_OPAQUE_NORMALIZATION_FAILED");
      }
    }
  } else {
    const correctMode = operation.success
      && operation.data.outputContract.mode
        === "TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE"
      && input.artifact.kind === "COMPOSITE";
    let subjectValid = false;
    try {
      await inspectStudioAtelierSubjectLayer(input.materialization.subject);
      subjectValid = true;
      checks.sourceLayerAlpha = satisfied("SOURCE_ALPHA_TECHNICAL_GATE_VERIFIED");
    } catch {
      checks.sourceLayerAlpha = blocked("SOURCE_ALPHA_TECHNICAL_GATE_FAILED");
    }
    const guardValid = subjectValid
      && await exactSubjectGuard(input.materialization);
    checks.nativeRoomGuard = guardValid
      ? satisfied("EVERY_NONZERO_ALPHA_PIXEL_INSIDE_NATIVE_ROOM_GUARD")
      : blocked("NATIVE_ROOM_GUARD_FAILED");
    if (!correctMode || !subjectValid || !guardValid) {
      checks.canonicalNormalization = blocked("COMPOSITE_NORMALIZATION_PREREQUISITE_FAILED");
      checks.deterministicComposite = blocked("DETERMINISTIC_COMPOSITE_PREREQUISITE_FAILED");
      checks.roomPreservation = blocked("ROOM_PRESERVATION_PREREQUISITE_FAILED");
    } else {
      try {
        const recomposed = await compositeStudioAtelierSubject({
          room: input.materialization.room,
          subject: input.materialization.subject,
        });
        const exactComposite = recomposed.sha256 === input.artifact.sha256
          && exactBytes(recomposed.bytes, input.artifactBytes);
        checks.canonicalNormalization = exactComposite
          ? satisfied("CANONICAL_COMPOSITOR_REPLAY_MATCHED")
          : blocked("CANONICAL_COMPOSITOR_REPLAY_MISMATCH");
        checks.deterministicComposite = exactComposite
          ? satisfied("EXACT_DETERMINISTIC_COMPOSITE_VERIFIED")
          : blocked("DETERMINISTIC_COMPOSITE_BYTES_MISMATCH");
        checks.roomPreservation = exactComposite
          && recomposed.preservation.unoccludedPixelsPreserved
          && recomposed.preservation.roomPixelsGenerated === 0
          ? satisfied("UNOCCLUDED_ROOM_PIXELS_PRESERVED_WITH_ZERO_GENERATED_ROOM_PIXELS")
          : blocked("ROOM_PIXEL_PRESERVATION_FAILED");
      } catch {
        checks.canonicalNormalization = blocked("CANONICAL_COMPOSITOR_REPLAY_FAILED");
        checks.deterministicComposite = blocked("DETERMINISTIC_COMPOSITE_REPLAY_FAILED");
        checks.roomPreservation = blocked("ROOM_PIXEL_PRESERVATION_UNVERIFIABLE");
      }
    }
  }

  const invalidTimestamp = !validCanonicalInstant(input.evaluatedAt);
  const blockerCodes = Object.values(checks)
    .filter((check) => check.decision === "BLOCKED")
    .map((check) => check.code);
  if (invalidTimestamp) blockerCodes.unshift("EVALUATED_AT_INVALID");
  const body = Object.freeze({
    schemaVersion: STUDIO_ATELIER_DETERMINISTIC_TECHNICAL_EVIDENCE_VERSION,
    evaluator: Object.freeze({
      id: STUDIO_ATELIER_DETERMINISTIC_TECHNICAL_EVALUATOR_ID,
      version: STUDIO_ATELIER_DETERMINISTIC_TECHNICAL_EVALUATOR_VERSION,
      policyRevision: STUDIO_ATELIER_DETERMINISTIC_TECHNICAL_POLICY_REVISION,
      normalizationRevision: STUDIO_ATELIER_OPAQUE_NORMALIZATION_REVISION,
      sharpVersion: technicalSharp.versions.sharp,
      vipsVersion: technicalSharp.versions.vips,
    }),
    evaluatedAt: input.evaluatedAt,
    artifact: Object.freeze({ ...input.artifact }),
    status: blockerCodes.length > 0 ? "BLOCKED" as const : "INDETERMINATE" as const,
    productionPass: false as const,
    blockerCodes: Object.freeze(blockerCodes),
    requiredVisualJudgments: Object.freeze([
      "RENDERED_TEXT",
      "WATERMARK",
    ] as const),
    checks: Object.freeze(checks),
  });
  return Object.freeze({
    ...body,
    evaluationHash: sha256Text(canonicalStringify(body)),
  });
}
