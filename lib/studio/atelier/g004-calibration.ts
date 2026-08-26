import { z } from "zod";
import manifestJson from "../../../docs/virtual-atelier/g004-positive-target-calibration.v1.json" with { type: "json" };
import { canonicalStringify, sha256Text } from "./canonical";
import { sha256Schema, type AtelierStage } from "./contracts";

export const STUDIO_ATELIER_G004_CALIBRATION_SCHEMA_VERSION =
  "juw.atelier-g004-positive-target-calibration.v1" as const;
export const STUDIO_ATELIER_G004_CALIBRATION_READBACK_SCHEMA_VERSION =
  "juw.atelier-g004-positive-target-readback.v1" as const;

export const studioAtelierG004PositiveTargetAxisSchema = z.enum([
  "ROOM_LAYOUT",
  "CAMERA_FAMILY",
  "SUBJECT_SCALE",
  "FRONT_VIEW_GRAMMAR",
  "SCENE_INTEGRATION",
  "SECONDARY_IDENTITY_TRANSLATION",
  "LEFT_PROFILE_GRAMMAR",
  "HEEL_AWARE_STATURE",
  "POISE",
  "RIGHT_REAR_THREE_QUARTER_GRAMMAR",
  "LOOK_BACK_POISE",
]);

export const studioAtelierG004ProhibitedTransferScopeSchema = z.enum([
  "DIRECT_IDENTITY_TRUTH",
  "DIRECT_BODY_TRUTH",
  "CURRENT_GARMENT_CONSTRUCTION",
  "CURRENT_GARMENT_COLOUR_TEXTURE",
  "ACCESSORY_STYLING",
  "PROVIDER_REFERENCE",
  "PARENT_LOCK",
]);

const safeComponentPattern = /^[a-zA-Z0-9._:/-]+$/;
const g004ViewSchema = z.enum(["05", "06", "07"]);

export const studioAtelierG004CalibrationAssetSchema = z.object({
  id: z.string().trim().min(1).max(200).regex(safeComponentPattern),
  view: g004ViewSchema,
  recordedCanonicalAssetId: z.string().trim().min(1).max(200).regex(safeComponentPattern),
  recordedCanonicalSha256: sha256Schema,
  sourcePath: z.string().startsWith("/shop/products/").endsWith(".webp"),
  blobPathname: z.string().startsWith("shop/catalogue/").endsWith(".webp"),
  mimeType: z.literal("image/webp"),
  byteSize: z.number().int().positive(),
  width: z.literal(1120),
  height: z.literal(1400),
  sha256: sha256Schema,
  pixelSha256: sha256Schema,
  positiveTargetAxes: z.array(studioAtelierG004PositiveTargetAxisSchema).min(1),
}).strict();

export const studioAtelierG004CalibrationManifestSchema = z.object({
  schemaVersion: z.literal(STUDIO_ATELIER_G004_CALIBRATION_SCHEMA_VERSION),
  calibrationId: z.literal("G004_FOUNDING_POSITIVE_TARGET"),
  revision: z.string().trim().min(1).max(160).regex(safeComponentPattern),
  lockedOn: z.iso.date(),
  decision: z.literal("VERSION_LOCK_PUBLIC_SHOP_DERIVATIVES"),
  canonicalOriginals: z.object({
    status: z.literal("UNAVAILABLE"),
    recordedAuditScope: z.tuple([
      z.literal("CHECKOUT"),
      z.literal("GIT_HISTORY_AND_OBJECT_DATABASE"),
      z.literal("PRIVATE_BLOB_71_OBJECT_SNAPSHOT"),
    ]),
    rule: z.string().trim().min(1).max(500),
  }).strict(),
  sourceCatalogueRevision: z.string().trim().min(1).max(160).regex(safeComponentPattern),
  role: z.literal("POSITIVE_EVALUATION_TARGET"),
  authorityPrecedence: z.literal(
    "DIRECT_REAL_IDENTITY_BODY_AND_CURRENT_GARMENT_EVIDENCE_OUTRANK",
  ),
  providerReferenceAllowed: z.literal(false),
  parentLockAllowed: z.literal(false),
  pixelHashAlgorithm: z.literal("sha256-srgb-rgba-u8-row-major"),
  prohibitedTransferScopes: z.tuple([
    z.literal("DIRECT_IDENTITY_TRUTH"),
    z.literal("DIRECT_BODY_TRUTH"),
    z.literal("CURRENT_GARMENT_CONSTRUCTION"),
    z.literal("CURRENT_GARMENT_COLOUR_TEXTURE"),
    z.literal("ACCESSORY_STYLING"),
    z.literal("PROVIDER_REFERENCE"),
    z.literal("PARENT_LOCK"),
  ]),
  assets: z.array(studioAtelierG004CalibrationAssetSchema).length(3),
}).strict();

export const STUDIO_ATELIER_G004_CALIBRATION_MANIFEST =
  studioAtelierG004CalibrationManifestSchema.parse(manifestJson);

const orderedViews = STUDIO_ATELIER_G004_CALIBRATION_MANIFEST.assets
  .map((asset) => asset.view)
  .join(",");
if (orderedViews !== "05,06,07") {
  throw new Error("The G004 positive-target manifest must contain exact ordered 05, 06 and 07 assets.");
}

export const STUDIO_ATELIER_G004_CALIBRATION_REVISION =
  STUDIO_ATELIER_G004_CALIBRATION_MANIFEST.revision;
export const STUDIO_ATELIER_G004_CALIBRATION_ASSET_COUNT = 3 as const;
export const STUDIO_ATELIER_G004_CALIBRATION_MANIFEST_SHA256 = sha256Text(
  canonicalStringify(STUDIO_ATELIER_G004_CALIBRATION_MANIFEST),
);

const expectedReadbackBody = {
  schemaVersion: STUDIO_ATELIER_G004_CALIBRATION_READBACK_SCHEMA_VERSION,
  calibrationRevision: STUDIO_ATELIER_G004_CALIBRATION_REVISION,
  manifestSha256: STUDIO_ATELIER_G004_CALIBRATION_MANIFEST_SHA256,
  canonicalOriginalsStatus: "UNAVAILABLE" as const,
  derivativeDecision: "VERSION_LOCK_PUBLIC_SHOP_DERIVATIVES" as const,
  role: "POSITIVE_EVALUATION_TARGET" as const,
  assets: STUDIO_ATELIER_G004_CALIBRATION_MANIFEST.assets.map((asset) => ({
    id: asset.id,
    view: asset.view,
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
    width: asset.width,
    height: asset.height,
    sha256: asset.sha256,
    pixelSha256: asset.pixelSha256,
  })),
};

export const STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT = Object.freeze({
  ...expectedReadbackBody,
  receiptSha256: sha256Text(canonicalStringify(expectedReadbackBody)),
});

export type StudioAtelierG004CalibrationAsset = z.infer<
  typeof studioAtelierG004CalibrationAssetSchema
>;
export type StudioAtelierG004CalibrationView = z.infer<typeof g004ViewSchema>;
export type StudioAtelierG004PositiveTargetAxis = z.infer<
  typeof studioAtelierG004PositiveTargetAxisSchema
>;
export type StudioAtelierG004ProhibitedTransferScope = z.infer<
  typeof studioAtelierG004ProhibitedTransferScopeSchema
>;
export type StudioAtelierG004ReadbackReceipt =
  typeof STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT;

const stageTargetView = Object.freeze({
  GARMENT_01_FRONT: null,
  GARMENT_02_BACK: null,
  GARMENT_03_MANNEQUIN: null,
  GARMENT_04_DETAIL: null,
  SUBJECT_A: "05",
  SUBJECT_B: "05",
  ROOM_FINAL_05: "05",
  SIBLING_06: "06",
  SIBLING_07_CORE: "07",
  SIBLING_07_RECOVERY: "07",
} as const satisfies Record<AtelierStage, StudioAtelierG004CalibrationView | null>);

export function studioAtelierG004CalibrationViewForStage(
  stage: AtelierStage,
): StudioAtelierG004CalibrationView | null {
  return stageTargetView[stage];
}

export function studioAtelierG004CalibrationTargetForStage(
  stage: AtelierStage,
): StudioAtelierG004CalibrationAsset | null {
  const view = studioAtelierG004CalibrationViewForStage(stage);
  if (!view) return null;
  return STUDIO_ATELIER_G004_CALIBRATION_MANIFEST.assets.find(
    (asset) => asset.view === view,
  ) ?? null;
}
