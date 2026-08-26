import { createHash } from "node:crypto";
import sharp from "sharp";
import visualDenialJson from "../../docs/virtual-atelier/g004-provider-visual-denial.v1.json";
import { canonicalStringify } from "../studio/atelier/canonical";
import {
  STUDIO_ATELIER_G004_CALIBRATION_MANIFEST,
  STUDIO_ATELIER_G004_CALIBRATION_MANIFEST_SHA256,
  STUDIO_ATELIER_G004_CALIBRATION_REVISION,
} from "../studio/atelier/g004-calibration";
import type {
  StudioAtelierVerifiedG004CalibrationAsset,
} from "./studio-atelier-g004-calibration";

export const STUDIO_ATELIER_G004_VISUAL_DENIAL_SCHEMA_VERSION =
  "juw.atelier-g004-provider-visual-denial.v1" as const;
export const STUDIO_ATELIER_G004_VISUAL_DENIAL_REVISION =
  "g004-provider-visual-denial-2026-08-26.1" as const;
export const STUDIO_ATELIER_G004_VISUAL_DENIAL_MANIFEST_SHA256 =
  "360cbf8ab42d7ca344c4296d87d28f112f809ce6952069ab664731044c0ad1d3" as const;

const GRID_WIDTH = 32;
const GRID_HEIGHT = 40;
const GRID_CHANNELS = 3;
const DENY_NCC_PPM = 970_000;
const COMBINED_NCC_PPM = 880_000;
const COMBINED_RGB_MAE_PPM = 55_000;
const SCORE_SCALE = 1_000_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const VIEWS = ["05", "06", "07"] as const;

type G004CalibrationView = typeof VIEWS[number];

type VisualDenialAsset = Readonly<{
  id: string;
  view: G004CalibrationView;
  normalizedRgbSha256: string;
}>;

type VisualDenialManifest = Readonly<{
  schemaVersion: typeof STUDIO_ATELIER_G004_VISUAL_DENIAL_SCHEMA_VERSION;
  revision: typeof STUDIO_ATELIER_G004_VISUAL_DENIAL_REVISION;
  sourceCalibrationRevision: typeof STUDIO_ATELIER_G004_CALIBRATION_REVISION;
  sourceCalibrationManifestSha256: string;
  canonicalOriginalsStatus: "UNAVAILABLE";
  role: "PROVIDER_DENIAL_ONLY";
  providerReferenceAllowed: false;
  normalization: Readonly<Record<string, unknown>>;
  comparison: Readonly<Record<string, unknown>>;
  calibrationEvidence: Readonly<Record<string, unknown>>;
  assets: readonly VisualDenialAsset[];
  nonClaim: string;
}>;

export type StudioAtelierG004VisualDenialTarget = Readonly<{
  view: G004CalibrationView;
  rgb: Uint8Array;
}>;

export type StudioAtelierG004VisualDuplicate = Readonly<{
  revision: typeof STUDIO_ATELIER_G004_VISUAL_DENIAL_REVISION;
  manifestSha256: string;
  view: G004CalibrationView;
  transform: "IDENTITY" | "HORIZONTAL_MIRROR";
  offsetX: -1 | 0 | 1;
  offsetY: -1 | 0 | 1;
  nccPpm: number;
  rgbMaePpm: number;
}>;

type G004VisualPipeline = {
  rotate(): G004VisualPipeline;
  flatten(options: Readonly<{ background: "#ffffff" }>): G004VisualPipeline;
  toColorspace(space: "srgb"): G004VisualPipeline;
  resize(
    width: number,
    height: number,
    options: Readonly<{ fit: "fill"; kernel: "lanczos3" }>,
  ): G004VisualPipeline;
  removeAlpha(): G004VisualPipeline;
  raw(): G004VisualPipeline;
  toBuffer(options: Readonly<{ resolveWithObject: true }>): Promise<Readonly<{
    data: Uint8Array;
    info: Readonly<{ width: number; height: number; channels: number }>;
  }>>;
};

const createG004VisualPipeline = sharp as unknown as (
  input: Uint8Array,
  options: Readonly<{ failOn: "error" }>,
) => G004VisualPipeline;

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseManifest(value: unknown): VisualDenialManifest {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const normalization = record.normalization && typeof record.normalization === "object"
    && !Array.isArray(record.normalization)
    ? record.normalization as Record<string, unknown>
    : {};
  const comparison = record.comparison && typeof record.comparison === "object"
    && !Array.isArray(record.comparison)
    ? record.comparison as Record<string, unknown>
    : {};
  const assets = Array.isArray(record.assets) ? record.assets : [];
  const expectedAssets = STUDIO_ATELIER_G004_CALIBRATION_MANIFEST.assets;
  if (
    record.schemaVersion !== STUDIO_ATELIER_G004_VISUAL_DENIAL_SCHEMA_VERSION
    || record.revision !== STUDIO_ATELIER_G004_VISUAL_DENIAL_REVISION
    || record.sourceCalibrationRevision !== STUDIO_ATELIER_G004_CALIBRATION_REVISION
    || record.sourceCalibrationManifestSha256
      !== STUDIO_ATELIER_G004_CALIBRATION_MANIFEST_SHA256
    || record.canonicalOriginalsStatus !== "UNAVAILABLE"
    || record.role !== "PROVIDER_DENIAL_ONLY"
    || record.providerReferenceAllowed !== false
    || normalization.sharpVersion !== "0.34.5"
    || normalization.autoOrient !== true
    || normalization.alphaBackground !== "#ffffff"
    || normalization.colourSpace !== "srgb"
    || normalization.width !== GRID_WIDTH
    || normalization.height !== GRID_HEIGHT
    || normalization.channels !== GRID_CHANNELS
    || normalization.fit !== "fill"
    || normalization.kernel !== "lanczos3"
    || canonicalStringify(comparison.transforms)
      !== canonicalStringify(["IDENTITY", "HORIZONTAL_MIRROR"])
    || canonicalStringify(comparison.alignmentOffsets)
      !== canonicalStringify([-1, 0, 1])
    || canonicalStringify(comparison.luminanceWeights)
      !== canonicalStringify([54, 183, 19])
    || comparison.denyNccPpm !== DENY_NCC_PPM
    || comparison.combinedNccPpm !== COMBINED_NCC_PPM
    || comparison.combinedRgbMaePpm !== COMBINED_RGB_MAE_PPM
    || assets.length !== expectedAssets.length
    || typeof record.calibrationEvidence !== "object"
    || record.calibrationEvidence === null
    || typeof record.nonClaim !== "string"
    || record.nonClaim.length === 0
  ) {
    throw new Error("The G004 provider visual-denial manifest is invalid.");
  }
  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index];
    const expected = expectedAssets[index];
    if (
      !asset
      || typeof asset !== "object"
      || Array.isArray(asset)
      || !expected
      || (asset as Record<string, unknown>).id !== expected.id
      || (asset as Record<string, unknown>).view !== expected.view
      || typeof (asset as Record<string, unknown>).normalizedRgbSha256 !== "string"
      || !SHA256_PATTERN.test(String(
        (asset as Record<string, unknown>).normalizedRgbSha256,
      ))
      || Object.keys(asset).sort().join(",") !== "id,normalizedRgbSha256,view"
    ) {
      throw new Error("A G004 provider visual-denial target is invalid.");
    }
  }
  return value as VisualDenialManifest;
}

const rawVisualDenialManifest: unknown = visualDenialJson;
if (
  sha256(canonicalStringify(rawVisualDenialManifest))
    !== STUDIO_ATELIER_G004_VISUAL_DENIAL_MANIFEST_SHA256
) {
  throw new Error("The G004 provider visual-denial manifest hash changed.");
}
export const STUDIO_ATELIER_G004_VISUAL_DENIAL_MANIFEST = Object.freeze(
  parseManifest(rawVisualDenialManifest),
);

async function normalizeRgb(bytes: Uint8Array): Promise<Uint8Array> {
  const decoded = await createG004VisualPipeline(bytes, { failOn: "error" })
    .rotate()
    .flatten({ background: "#ffffff" })
    .toColorspace("srgb")
    .resize(GRID_WIDTH, GRID_HEIGHT, { fit: "fill", kernel: "lanczos3" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (
    decoded.info.width !== GRID_WIDTH
    || decoded.info.height !== GRID_HEIGHT
    || decoded.info.channels !== GRID_CHANNELS
    || decoded.data.byteLength !== GRID_WIDTH * GRID_HEIGHT * GRID_CHANNELS
  ) {
    throw new Error("The G004 visual-denial input did not decode to exact normalized RGB.");
  }
  return Uint8Array.from(decoded.data);
}

type AlignmentScore = Readonly<{
  transform: "IDENTITY" | "HORIZONTAL_MIRROR";
  offsetX: -1 | 0 | 1;
  offsetY: -1 | 0 | 1;
  nccPpm: number;
  rgbMaePpm: number;
  denied: boolean;
}>;

function alignmentScore(input: Readonly<{
  candidate: Uint8Array;
  target: Uint8Array;
  transform: AlignmentScore["transform"];
  offsetX: AlignmentScore["offsetX"];
  offsetY: AlignmentScore["offsetY"];
}>): AlignmentScore {
  let count = BigInt(0);
  let candidateSum = BigInt(0);
  let targetSum = BigInt(0);
  let candidateSquares = BigInt(0);
  let targetSquares = BigInt(0);
  let cross = BigInt(0);
  let absoluteRgbDifference = BigInt(0);

  for (let targetY = 0; targetY < GRID_HEIGHT; targetY += 1) {
    const candidateY = targetY + input.offsetY;
    if (candidateY < 0 || candidateY >= GRID_HEIGHT) continue;
    for (let targetX = 0; targetX < GRID_WIDTH; targetX += 1) {
      const alignedTargetX = input.transform === "HORIZONTAL_MIRROR"
        ? GRID_WIDTH - 1 - targetX
        : targetX;
      const candidateX = targetX + input.offsetX;
      if (candidateX < 0 || candidateX >= GRID_WIDTH) continue;
      const targetOffset = (targetY * GRID_WIDTH + alignedTargetX) * GRID_CHANNELS;
      const candidateOffset = (candidateY * GRID_WIDTH + candidateX) * GRID_CHANNELS;
      const candidateR = input.candidate[candidateOffset]!;
      const candidateG = input.candidate[candidateOffset + 1]!;
      const candidateB = input.candidate[candidateOffset + 2]!;
      const targetR = input.target[targetOffset]!;
      const targetG = input.target[targetOffset + 1]!;
      const targetB = input.target[targetOffset + 2]!;
      const candidateLuma = BigInt(54 * candidateR + 183 * candidateG + 19 * candidateB);
      const targetLuma = BigInt(54 * targetR + 183 * targetG + 19 * targetB);
      count += BigInt(1);
      candidateSum += candidateLuma;
      targetSum += targetLuma;
      candidateSquares += candidateLuma * candidateLuma;
      targetSquares += targetLuma * targetLuma;
      cross += candidateLuma * targetLuma;
      absoluteRgbDifference += BigInt(
        Math.abs(candidateR - targetR)
        + Math.abs(candidateG - targetG)
        + Math.abs(candidateB - targetB),
      );
    }
  }

  const covariance = count * cross - candidateSum * targetSum;
  const candidateVariance = count * candidateSquares - candidateSum * candidateSum;
  const targetVariance = count * targetSquares - targetSum * targetSum;
  const zero = BigInt(0);
  const validNcc = covariance > zero
    && candidateVariance > zero
    && targetVariance > zero;
  const scale = BigInt(SCORE_SCALE);
  const varianceProduct = candidateVariance * targetVariance;
  const scaledCovarianceSquared = covariance * covariance * scale * scale;
  const nccAtLeast = (threshold: number) => validNcc
    && scaledCovarianceSquared
      >= BigInt(threshold) * BigInt(threshold) * varianceProduct;
  const rgbDenominator = count * BigInt(GRID_CHANNELS * 255);
  const maeAtMostCombined = absoluteRgbDifference * scale
    <= BigInt(COMBINED_RGB_MAE_PPM) * rgbDenominator;
  const denied = nccAtLeast(DENY_NCC_PPM)
    || (nccAtLeast(COMBINED_NCC_PPM) && maeAtMostCombined);
  const ncc = validNcc
    ? Number(covariance) / Math.sqrt(Number(varianceProduct))
    : -1;
  const mae = Number(absoluteRgbDifference) / Number(rgbDenominator);
  return Object.freeze({
    transform: input.transform,
    offsetX: input.offsetX,
    offsetY: input.offsetY,
    nccPpm: Math.max(-SCORE_SCALE, Math.min(SCORE_SCALE, Math.round(ncc * SCORE_SCALE))),
    rgbMaePpm: Math.round(mae * SCORE_SCALE),
    denied,
  });
}

function bestDeniedAlignment(
  candidate: Uint8Array,
  target: Uint8Array,
): AlignmentScore | null {
  let best: AlignmentScore | null = null;
  for (const transform of ["IDENTITY", "HORIZONTAL_MIRROR"] as const) {
    for (const offsetY of [-1, 0, 1] as const) {
      for (const offsetX of [-1, 0, 1] as const) {
        const score = alignmentScore({
          candidate,
          target,
          transform,
          offsetX,
          offsetY,
        });
        if (
          score.denied
          && (!best
            || score.nccPpm > best.nccPpm
            || (score.nccPpm === best.nccPpm && score.rgbMaePpm < best.rgbMaePpm))
        ) {
          best = score;
        }
      }
    }
  }
  return best;
}

export async function verifyStudioAtelierG004VisualDenialTargets(
  targets: readonly StudioAtelierVerifiedG004CalibrationAsset[],
): Promise<readonly StudioAtelierG004VisualDenialTarget[]> {
  if (targets.length !== VIEWS.length) {
    throw new Error("The complete G004 visual-denial target set is required.");
  }
  const verified = await Promise.all(VIEWS.map(async (view, index) => {
    const target = targets.find((candidate) => candidate.binding.view === view);
    const expected = STUDIO_ATELIER_G004_VISUAL_DENIAL_MANIFEST.assets[index];
    if (!target || !expected || target.binding.id !== expected.id) {
      throw new Error(`The G004/${view} visual-denial target is missing.`);
    }
    const rgb = await normalizeRgb(target.bytes);
    if (sha256(rgb) !== expected.normalizedRgbSha256) {
      throw new Error(`The G004/${view} normalized visual-denial pixels changed.`);
    }
    return Object.freeze({ view, rgb });
  }));
  return Object.freeze(verified);
}

/**
 * Denies a full-frame visual duplicate after byte, codec, colour, orientation,
 * tiny alignment and mirror changes. It is intentionally not a subimage or
 * arbitrary-warp detector; all raw constituents must be checked before an
 * app-owned board is composed.
 */
export async function studioAtelierG004VisualDuplicate(
  bytes: Uint8Array,
  targets: readonly StudioAtelierG004VisualDenialTarget[],
): Promise<StudioAtelierG004VisualDuplicate | null> {
  const candidate = await normalizeRgb(bytes);
  let nearest: StudioAtelierG004VisualDuplicate | null = null;
  for (const target of targets) {
    const score = bestDeniedAlignment(candidate, target.rgb);
    if (
      score
      && (!nearest
        || score.nccPpm > nearest.nccPpm
        || (score.nccPpm === nearest.nccPpm && score.rgbMaePpm < nearest.rgbMaePpm))
    ) {
      nearest = Object.freeze({
        revision: STUDIO_ATELIER_G004_VISUAL_DENIAL_REVISION,
        manifestSha256: STUDIO_ATELIER_G004_VISUAL_DENIAL_MANIFEST_SHA256,
        view: target.view,
        transform: score.transform,
        offsetX: score.offsetX,
        offsetY: score.offsetY,
        nccPpm: score.nccPpm,
        rgbMaePpm: score.rgbMaePpm,
      });
    }
  }
  return nearest;
}
