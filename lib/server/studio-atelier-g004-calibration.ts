import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import {
  STUDIO_ATELIER_G004_CALIBRATION_MANIFEST,
  STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT,
  type StudioAtelierG004CalibrationAsset,
  type StudioAtelierG004ReadbackReceipt,
} from "../studio/atelier/g004-calibration";
import { canonicalStringify, sha256Text } from "../studio/atelier/canonical";
import { getShopBlob } from "./vercel-blob";

type CalibrationReadResult = Readonly<{
  bytes: Uint8Array;
  mimeType: string;
}>;

export type StudioAtelierG004CalibrationAssetReader = (
  asset: StudioAtelierG004CalibrationAsset,
) => Promise<CalibrationReadResult>;

export type StudioAtelierVerifiedG004CalibrationAsset = Readonly<{
  binding: Readonly<{
    id: string;
    view: StudioAtelierG004CalibrationAsset["view"];
    mimeType: "image/webp";
    byteSize: number;
    width: 1120;
    height: 1400;
    sha256: string;
    pixelSha256: string;
    positiveTargetAxes: readonly StudioAtelierG004CalibrationAsset["positiveTargetAxes"][number][];
  }>;
  bytes: Uint8Array;
}>;

export type StudioAtelierVerifiedG004Calibration = Readonly<{
  receipt: StudioAtelierG004ReadbackReceipt;
  assets: readonly StudioAtelierVerifiedG004CalibrationAsset[];
}>;

export type StudioAtelierVerifiedG004EvaluationTarget = Readonly<{
  receipt: StudioAtelierG004ReadbackReceipt;
  target: StudioAtelierVerifiedG004CalibrationAsset;
}>;

export type StudioAtelierG004CalibrationResolver =
  () => Promise<StudioAtelierVerifiedG004Calibration>;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizedMimeType(value: string): string {
  return value.split(";", 1)[0]!.trim().toLowerCase();
}

type CalibrationImagePipeline = {
  metadata(): Promise<Readonly<{
    format?: string;
    width?: number;
    height?: number;
    pages?: number;
  }>>;
  toColorspace(space: "srgb"): CalibrationImagePipeline;
  ensureAlpha(): CalibrationImagePipeline;
  raw(): CalibrationImagePipeline;
  toBuffer(options: Readonly<{ resolveWithObject: true }>): Promise<Readonly<{
    data: Uint8Array;
    info: Readonly<{
      width: number;
      height: number;
      channels: number;
    }>;
  }>>;
};

const createCalibrationImagePipeline = sharp as unknown as (
  bytes: Uint8Array,
  options: Readonly<{ failOn: "error" }>,
) => CalibrationImagePipeline;

async function verifyAsset(
  asset: StudioAtelierG004CalibrationAsset,
  result: CalibrationReadResult,
): Promise<StudioAtelierVerifiedG004CalibrationAsset> {
  const bytes = new Uint8Array(result.bytes);
  if (
    normalizedMimeType(result.mimeType) !== asset.mimeType
    || bytes.byteLength !== asset.byteSize
    || sha256(bytes) !== asset.sha256
  ) {
    throw new Error(`G004 calibration ${asset.view} failed exact container readback.`);
  }

  const metadata = await createCalibrationImagePipeline(bytes, { failOn: "error" }).metadata();
  if (
    metadata.format !== "webp"
    || metadata.width !== asset.width
    || metadata.height !== asset.height
    || metadata.pages !== undefined && metadata.pages !== 1
  ) {
    throw new Error(`G004 calibration ${asset.view} failed decoded geometry verification.`);
  }

  const decoded = await createCalibrationImagePipeline(bytes, { failOn: "error" })
    .toColorspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (
    decoded.info.width !== asset.width
    || decoded.info.height !== asset.height
    || decoded.info.channels !== 4
    || decoded.data.byteLength !== asset.width * asset.height * 4
    || sha256(decoded.data) !== asset.pixelSha256
  ) {
    throw new Error(`G004 calibration ${asset.view} failed exact decoded-pixel readback.`);
  }

  return Object.freeze({
    binding: Object.freeze({
      id: asset.id,
      view: asset.view,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      width: asset.width,
      height: asset.height,
      sha256: asset.sha256,
      pixelSha256: asset.pixelSha256,
      positiveTargetAxes: Object.freeze([...asset.positiveTargetAxes]),
    }),
    bytes,
  });
}

function exactBinding(
  asset: StudioAtelierG004CalibrationAsset,
  binding: StudioAtelierVerifiedG004CalibrationAsset["binding"],
): boolean {
  return binding.id === asset.id
    && binding.view === asset.view
    && binding.mimeType === asset.mimeType
    && binding.byteSize === asset.byteSize
    && binding.width === asset.width
    && binding.height === asset.height
    && binding.sha256 === asset.sha256
    && binding.pixelSha256 === asset.pixelSha256
    && canonicalStringify(binding.positiveTargetAxes)
      === canonicalStringify(asset.positiveTargetAxes);
}

function exactReceipt(receipt: StudioAtelierG004ReadbackReceipt): boolean {
  return canonicalStringify(receipt)
    === canonicalStringify(STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT);
}

/**
 * Re-verifies an injected resolver result at the durable-engine trust boundary.
 * A matching receipt or binding is not enough: every returned container is
 * decoded and checked against the version-locked pixel digest again.
 */
export async function verifyStudioAtelierG004Calibration(
  calibration: StudioAtelierVerifiedG004Calibration,
): Promise<StudioAtelierVerifiedG004Calibration> {
  if (
    !exactReceipt(calibration.receipt)
    || calibration.assets.length !== STUDIO_ATELIER_G004_CALIBRATION_MANIFEST.assets.length
  ) {
    throw new Error("G004 calibration result does not match the version-locked receipt.");
  }

  const assets: StudioAtelierVerifiedG004CalibrationAsset[] = [];
  for (const [index, expected] of STUDIO_ATELIER_G004_CALIBRATION_MANIFEST.assets.entries()) {
    const actual = calibration.assets[index];
    if (!actual || !exactBinding(expected, actual.binding)) {
      throw new Error(`G004 calibration ${expected.view} binding is substituted or out of order.`);
    }
    assets.push(await verifyAsset(expected, {
      bytes: actual.bytes,
      mimeType: actual.binding.mimeType,
    }));
  }

  return Object.freeze({
    receipt: STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT,
    assets: Object.freeze(assets),
  });
}

/**
 * Gives the evaluator exactly one stage-scoped frame and provides the same
 * verification primitive for the post-evaluation mutation check.
 */
export async function verifyStudioAtelierG004EvaluationTarget(
  value: StudioAtelierVerifiedG004EvaluationTarget,
  expected: StudioAtelierG004CalibrationAsset,
): Promise<StudioAtelierVerifiedG004EvaluationTarget> {
  if (!exactReceipt(value.receipt) || !exactBinding(expected, value.target.binding)) {
    throw new Error(`G004 calibration ${expected.view} evaluator target is substituted.`);
  }
  const target = await verifyAsset(expected, {
    bytes: value.target.bytes,
    mimeType: value.target.binding.mimeType,
  });
  return Object.freeze({
    receipt: STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT,
    target,
  });
}

function deriveReadbackReceipt(
  assets: readonly StudioAtelierVerifiedG004CalibrationAsset[],
): StudioAtelierG004ReadbackReceipt {
  const body = {
    schemaVersion: STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT.schemaVersion,
    calibrationRevision: STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT.calibrationRevision,
    manifestSha256: STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT.manifestSha256,
    canonicalOriginalsStatus: "UNAVAILABLE" as const,
    derivativeDecision: "VERSION_LOCK_PUBLIC_SHOP_DERIVATIVES" as const,
    role: "POSITIVE_EVALUATION_TARGET" as const,
    assets: assets.map(({ binding }) => ({
      id: binding.id,
      view: binding.view,
      mimeType: binding.mimeType,
      byteSize: binding.byteSize,
      width: binding.width,
      height: binding.height,
      sha256: binding.sha256,
      pixelSha256: binding.pixelSha256,
    })),
  };
  return Object.freeze({
    ...body,
    receiptSha256: sha256Text(canonicalStringify(body)),
  });
}

async function readPublicCalibrationAsset(
  asset: StudioAtelierG004CalibrationAsset,
): Promise<CalibrationReadResult> {
  if (process.env.NODE_ENV !== "production") {
    return Object.freeze({
      bytes: new Uint8Array(await readFile(resolve(
        process.cwd(),
        "public",
        asset.sourcePath.slice(1),
      ))),
      mimeType: asset.mimeType,
    });
  }
  const result = await getShopBlob("public", asset.blobPathname, { useCache: false });
  if (
    !result
    || result.statusCode !== 200
    || !result.stream
    || result.blob.pathname !== asset.blobPathname
    || result.blob.size !== asset.byteSize
  ) {
    throw new Error(`G004 calibration ${asset.view} is unavailable from content-addressed Blob.`);
  }
  return Object.freeze({
    bytes: new Uint8Array(await new Response(result.stream).arrayBuffer()),
    mimeType: result.blob.contentType,
  });
}

export function createStudioAtelierG004CalibrationResolver(
  readAsset: StudioAtelierG004CalibrationAssetReader = readPublicCalibrationAsset,
): StudioAtelierG004CalibrationResolver {
  let inFlight: Promise<StudioAtelierVerifiedG004Calibration> | null = null;

  return async () => {
    if (inFlight) return inFlight;
    const task = (async () => {
        const assets = await Promise.all(
          STUDIO_ATELIER_G004_CALIBRATION_MANIFEST.assets.map(async (asset) =>
            verifyAsset(asset, await readAsset(asset))
          ),
        );
        const receipt = deriveReadbackReceipt(assets);
        if (
          canonicalStringify(receipt)
          !== canonicalStringify(STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT)
        ) {
          throw new Error("G004 calibration readback does not match the version-locked receipt.");
        }
        return Object.freeze({ receipt, assets: Object.freeze(assets) });
      })();
    inFlight = task;
    try {
      return await task;
    } finally {
      if (inFlight === task) inFlight = null;
    }
  };
}

export const resolveStudioAtelierG004Calibration =
  createStudioAtelierG004CalibrationResolver();
