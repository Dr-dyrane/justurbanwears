type G004CalibrationView = "05" | "06" | "07";

type LockedCalibrationTarget = Readonly<{
  id: string;
  view: G004CalibrationView;
  recordedCanonicalAssetId: string;
  recordedCanonicalSha256: string;
  sha256: string;
  pixelSha256: string;
}>;

export type StudioAtelierG004ProviderDenialKind =
  | "VERSION_LOCKED_DERIVATIVE_ID"
  | "VERSION_LOCKED_DERIVATIVE_CONTAINER_SHA256"
  | "RECORDED_CANONICAL_ID"
  | "RECORDED_CANONICAL_SHA256";

export type StudioAtelierG004ProviderDenial = Readonly<{
  kind: StudioAtelierG004ProviderDenialKind;
  view: G004CalibrationView;
  field: "assetId" | "sha256";
  value: string;
}>;

export type StudioAtelierProviderAssetBinding = Readonly<{
  assetId: string;
  sha256: string;
}>;

// This is intentionally a sanitized copy rather than an import of the full
// calibration manifest: operation/compiler consumers need only evaluator-only
// identities and hashes, never Shop or Blob locators. The focused contract test
// proves this table remains exact against the version-locked manifest.
const LOCKED_CALIBRATION_TARGETS = Object.freeze([
  Object.freeze({
    id: "g004.calibration.view.05.shop-derivative.v1",
    view: "05",
    recordedCanonicalAssetId: "garment.004.view.05.accepted",
    recordedCanonicalSha256: "30b1ae108761fb238c767339ff8a6c9fc98683d573926b821ce3895dfef9b483",
    sha256: "87761a70a863246f53290bb58f31bfa252300dbbb281b3640fd1329c227d980d",
    pixelSha256: "b1693a6395fa3d6eccfcc20d6bf96023ef9051819e6656295560d8d351dee42f",
  }),
  Object.freeze({
    id: "g004.calibration.view.06.shop-derivative.v1",
    view: "06",
    recordedCanonicalAssetId: "garment.004.view.06.accepted",
    recordedCanonicalSha256: "c75814d1ba3515c771531eec23b11afaf24d4102d9988c7d7bbd1ad8f77f4205",
    sha256: "7fb2c3399598ae52b29abf66fde4942fd7f57a6b09a646f61b6e834a0fe3e5fb",
    pixelSha256: "f41a92191ffb07e7db6e4dba28a163af691df7b061a54d4c7f7240b3500a8633",
  }),
  Object.freeze({
    id: "g004.calibration.view.07.shop-derivative.v1",
    view: "07",
    recordedCanonicalAssetId: "garment.004.view.07.accepted",
    recordedCanonicalSha256: "753aac4f61bc0c603862feeadd13c51ffc1489ae524070dd338a9a56cc1b3291",
    sha256: "1af3f21b3f84eb90b95a7b5f879a8eed550dd7946b9c96c26d72d43e8f481a59",
    pixelSha256: "995602801d33eee13412f6afe5f794199edd4e38ae624f2612488ccadeeb44ab",
  }),
] as const satisfies readonly LockedCalibrationTarget[]);

export const STUDIO_ATELIER_G004_PROVIDER_DENIAL_REGISTRY = Object.freeze(
  LOCKED_CALIBRATION_TARGETS.flatMap((asset): StudioAtelierG004ProviderDenial[] => [
    Object.freeze({
      kind: "VERSION_LOCKED_DERIVATIVE_ID",
      view: asset.view,
      field: "assetId",
      value: asset.id,
    }),
    Object.freeze({
      kind: "VERSION_LOCKED_DERIVATIVE_CONTAINER_SHA256",
      view: asset.view,
      field: "sha256",
      value: asset.sha256,
    }),
    Object.freeze({
      kind: "RECORDED_CANONICAL_ID",
      view: asset.view,
      field: "assetId",
      value: asset.recordedCanonicalAssetId,
    }),
    Object.freeze({
      kind: "RECORDED_CANONICAL_SHA256",
      view: asset.view,
      field: "sha256",
      value: asset.recordedCanonicalSha256,
    }),
  ]),
);

const denialByAssetId = new Map(
  STUDIO_ATELIER_G004_PROVIDER_DENIAL_REGISTRY
    .filter((denial) => denial.field === "assetId")
    .map((denial) => [denial.value, denial] as const),
);
const denialBySha256 = new Map(
  STUDIO_ATELIER_G004_PROVIDER_DENIAL_REGISTRY
    .filter((denial) => denial.field === "sha256")
    .map((denial) => [denial.value, denial] as const),
);

export const STUDIO_ATELIER_G004_PROVIDER_DENIED_PIXEL_SHA256 = Object.freeze(
  LOCKED_CALIBRATION_TARGETS.map((asset) => asset.pixelSha256),
);
const deniedPixelSha256 = new Set<string>(
  STUDIO_ATELIER_G004_PROVIDER_DENIED_PIXEL_SHA256,
);

/**
 * G004 positive targets are evaluator inputs only. Matching either a forbidden
 * identifier or hash is sufficient to deny the binding; callers may not evade
 * the policy by pairing a known G004 identifier with a different hash (or the
 * reverse).
 */
export function studioAtelierG004ProviderDenial(
  binding: StudioAtelierProviderAssetBinding,
): StudioAtelierG004ProviderDenial | null {
  return denialByAssetId.get(binding.assetId)
    ?? denialBySha256.get(binding.sha256)
    ?? null;
}

export function isStudioAtelierG004ProviderBindingDenied(
  binding: StudioAtelierProviderAssetBinding,
): boolean {
  return studioAtelierG004ProviderDenial(binding) !== null;
}

/**
 * Denies a lossless byte-renamed copy of a locked G004 derivative. Lossy and
 * transformed visual duplicates are denied by the server-owned visual gate.
 */
export function isStudioAtelierG004ProviderPixelDenied(
  pixelSha256: string,
): boolean {
  return deniedPixelSha256.has(pixelSha256);
}
