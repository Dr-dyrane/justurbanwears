import { createHash } from "node:crypto";
import manifestJson from "./private-asset-manifests/lulu-v4.json";
import { getShopBlob } from "./vercel-blob";
import { verifyStudioImage } from "../studio/engine/assets";
import { StudioEngineError } from "../studio/engine/errors";

export type LuluV4View = "05" | "06" | "07";

export const LULU_V4_AUTHORITY_ACCEPTANCE = "ACCEPTED_OPERATIONAL_AUTHORITY" as const;
export const LULU_V4_AUTHORITY_LOCKED_STATUS = "LOCKED_IMMUTABLE" as const;

const LULU_V4_CURRENT_AUTHORITY_REVISION = "LULU_V4_2026-08-25.7" as const;
const LULU_V4_AUTHORITY_ASSET_IDS = Object.freeze([
  "lulu.face.operation-board.full.v1",
  "lulu.face.v4.front.lock.v1",
  "lulu.body.canon.v4",
  "lulu.body.canon.v4.three-view",
  "lulu.body.canon.v4.front",
  "lulu.body.canon.v4.side",
  "lulu.body.canon.v4.back",
  "lulu.body.real.angle-contact.v4",
  "lulu.body.real.gym-rear-profile.v4",
  "lulu.body.rear.operation-board.full.v1",
  "juw.atelier.empty-plate.v1",
] as const);
const LULU_V4_AUTHORITY_ASSET_KEYS = Object.freeze([
  "acceptance",
  "authority",
  "byteSize",
  "height",
  "id",
  "lockedStatus",
  "mimeType",
  "pathname",
  "role",
  "sha256",
  "width",
] as const);

export type LuluV4AuthorityAsset = {
  id: string;
  role: string;
  authority: "identity" | "translation" | "body" | "atelier";
  acceptance: typeof LULU_V4_AUTHORITY_ACCEPTANCE;
  lockedStatus: typeof LULU_V4_AUTHORITY_LOCKED_STATUS;
  pathname: string;
  sha256: string;
  byteSize: number;
  width: number;
  height: number;
  mimeType: "image/jpeg" | "image/png";
};

export type LuluV4AuthorityManifest = {
  schemaVersion: 3;
  authorityId: "lulu-v4";
  authorityRevision: typeof LULU_V4_CURRENT_AUTHORITY_REVISION;
  privacy: "PRIVATE_PRODUCTION_ONLY";
  publishable: false;
  manifestPathname: string;
  assets: LuluV4AuthorityAsset[];
  viewStacks: Record<LuluV4View, string[]>;
  supplementalByView: Record<LuluV4View, string[]>;
};

export type LuluV4ResolvedAuthorityAsset = Readonly<{
  id: string;
  role: string;
  authority: LuluV4AuthorityAsset["authority"];
  acceptance: LuluV4AuthorityAsset["acceptance"];
  lockedStatus: LuluV4AuthorityAsset["lockedStatus"];
  bytes: Uint8Array;
  mimeType: LuluV4AuthorityAsset["mimeType"];
  sha256: string;
  width: number;
  height: number;
}>;

function invalidAuthority(message: string): never {
  throw new StudioEngineError(
    "INVALID_ASSET",
    503,
    message,
    "Restore the approved Lulu V4 private authority packet.",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates the checked-in manifest as a closed schema before it can resolve
 * private bytes. Schema v3 admits only operationally accepted, immutable
 * assets under the exact current revision path.
 */
export function validateLuluV4AuthorityManifest(
  candidate: unknown,
): asserts candidate is LuluV4AuthorityManifest {
  const expectedPrefix = `studio/model-authorities/lulu-v4/${LULU_V4_CURRENT_AUTHORITY_REVISION}/`;
  if (
    !isRecord(candidate)
    || candidate.schemaVersion !== 3
    || candidate.authorityId !== "lulu-v4"
    || candidate.authorityRevision !== LULU_V4_CURRENT_AUTHORITY_REVISION
    || candidate.privacy !== "PRIVATE_PRODUCTION_ONLY"
    || candidate.publishable !== false
    || candidate.manifestPathname !== `${expectedPrefix}manifest.json`
    || !Array.isArray(candidate.assets)
    || candidate.assets.length !== LULU_V4_AUTHORITY_ASSET_IDS.length
    || !isRecord(candidate.viewStacks)
    || !isRecord(candidate.supplementalByView)
  ) {
    return invalidAuthority("The Lulu V4 private authority manifest is invalid.");
  }

  const expectedIds = new Set<string>(LULU_V4_AUTHORITY_ASSET_IDS);
  const expectedAssetKeys = [...LULU_V4_AUTHORITY_ASSET_KEYS].sort();
  const byId = new Map<string, LuluV4AuthorityAsset>();
  for (const candidateAsset of candidate.assets) {
    if (!isRecord(candidateAsset)) {
      return invalidAuthority("The Lulu V4 private authority asset index is invalid.");
    }
    const keys = Object.keys(candidateAsset).sort();
    const mimeType = candidateAsset.mimeType;
    const extension = mimeType === "image/png" ? "png" : mimeType === "image/jpeg" ? "jpg" : null;
    if (
      keys.length !== expectedAssetKeys.length
      || !keys.every((key, index) => key === expectedAssetKeys[index])
      || typeof candidateAsset.id !== "string"
      || !expectedIds.has(candidateAsset.id)
      || byId.has(candidateAsset.id)
      || typeof candidateAsset.role !== "string"
      || candidateAsset.role.length === 0
      || !["identity", "translation", "body", "atelier"].includes(String(candidateAsset.authority))
      || candidateAsset.acceptance !== LULU_V4_AUTHORITY_ACCEPTANCE
      || candidateAsset.lockedStatus !== LULU_V4_AUTHORITY_LOCKED_STATUS
      || typeof candidateAsset.pathname !== "string"
      || typeof candidateAsset.sha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(candidateAsset.sha256)
      || extension === null
      || candidateAsset.pathname !== `${expectedPrefix}${candidateAsset.sha256}.${extension}`
      || typeof candidateAsset.byteSize !== "number"
      || !Number.isInteger(candidateAsset.byteSize)
      || candidateAsset.byteSize <= 0
      || typeof candidateAsset.width !== "number"
      || !Number.isInteger(candidateAsset.width)
      || candidateAsset.width <= 0
      || typeof candidateAsset.height !== "number"
      || !Number.isInteger(candidateAsset.height)
      || candidateAsset.height <= 0
    ) {
      return invalidAuthority("The Lulu V4 private authority asset index is invalid.");
    }
    byId.set(candidateAsset.id, candidateAsset as LuluV4AuthorityAsset);
  }
  if (byId.size !== expectedIds.size || [...expectedIds].some((id) => !byId.has(id))) {
    return invalidAuthority("The Lulu V4 private authority asset index is invalid.");
  }

  for (const view of ["05", "06", "07"] as const) {
    const stack = candidate.viewStacks[view];
    const supplemental = candidate.supplementalByView[view];
    if (
      !Array.isArray(stack)
      || stack.length !== 4
      || !stack.every((id): id is string => typeof id === "string")
      || new Set(stack).size !== stack.length
      || !stack.every((id) => byId.has(id))
      || !stack.includes("lulu.face.operation-board.full.v1")
      || !stack.includes("lulu.body.real.angle-contact.v4")
      || !stack.includes("juw.atelier.empty-plate.v1")
      || !Array.isArray(supplemental)
      || !supplemental.every((id): id is string => typeof id === "string" && byId.has(id))
    ) {
      return invalidAuthority(`The Lulu V4 ${view} authority stack is invalid.`);
    }
  }
}

const rawManifest: unknown = manifestJson;
validateLuluV4AuthorityManifest(rawManifest);
const manifest = rawManifest;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalManifestBytes(): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(manifest));
}

const assetsById = new Map(manifest.assets.map((asset) => [asset.id, asset]));

export const LULU_V4_AUTHORITY_REVISION = manifest.authorityRevision;

export function parseLuluV4View(value: string | null): LuluV4View {
  if (value === "05" || value === "06" || value === "07") return value;
  throw new StudioEngineError(
    "INVALID_REQUEST",
    400,
    "Choose Lulu view 05, 06 or 07.",
    "Use one canonical Atelier view number.",
  );
}

export function describeLuluV4Authority(view: LuluV4View) {
  const stack = manifest.viewStacks[view].map((id) => assetsById.get(id)!);
  return Object.freeze({
    authorityId: manifest.authorityId,
    revision: manifest.authorityRevision,
    view,
    privacy: manifest.privacy,
    publishable: manifest.publishable,
    assetCount: manifest.assets.length,
    stack: Object.freeze(stack.map((asset) => Object.freeze({
      id: asset.id,
      role: asset.role,
      authority: asset.authority,
      acceptance: asset.acceptance,
      lockedStatus: asset.lockedStatus,
    }))),
    supplementalRoles: Object.freeze(manifest.supplementalByView[view].map((id) => {
      const asset = assetsById.get(id)!;
      return Object.freeze({
        id: asset.id,
        role: asset.role,
        authority: asset.authority,
        acceptance: asset.acceptance,
        lockedStatus: asset.lockedStatus,
      });
    })),
  });
}

async function readVerifiedBlob(asset: LuluV4AuthorityAsset): Promise<LuluV4ResolvedAuthorityAsset> {
  const result = await getShopBlob("private", asset.pathname, { useCache: true });
  if (!result || result.statusCode !== 200) {
    return invalidAuthority(`The approved Lulu V4 authority asset ${asset.id} is unavailable.`);
  }
  const bytes = new Uint8Array(await new Response(result.stream).arrayBuffer());
  const verified = verifyStudioImage(bytes, result.blob.contentType);
  if (
    verified.bytes.byteLength !== asset.byteSize
    || sha256(verified.bytes) !== asset.sha256
    || verified.mimeType !== asset.mimeType
    || verified.width !== asset.width
    || verified.height !== asset.height
  ) {
    return invalidAuthority(`The approved Lulu V4 authority asset ${asset.id} did not verify.`);
  }
  return Object.freeze({
    id: asset.id,
    role: asset.role,
    authority: asset.authority,
    acceptance: asset.acceptance,
    lockedStatus: asset.lockedStatus,
    bytes: verified.bytes,
    mimeType: verified.mimeType,
    sha256: asset.sha256,
    width: asset.width,
    height: asset.height,
  });
}

async function verifyRemoteManifest(): Promise<void> {
  const result = await getShopBlob("private", manifest.manifestPathname, { useCache: true });
  if (!result || result.statusCode !== 200) {
    return invalidAuthority("The Lulu V4 private Blob manifest is unavailable.");
  }
  const remote = new Uint8Array(await new Response(result.stream).arrayBuffer());
  const expected = canonicalManifestBytes();
  if (remote.byteLength !== expected.byteLength || sha256(remote) !== sha256(expected)) {
    return invalidAuthority("The Lulu V4 private Blob manifest did not verify.");
  }
}

/**
 * Resolves a declared set of private authority assets and verifies both the
 * checked-in manifest and every referenced Blob before any caller can report
 * an operation ready. Results follow the caller's declared order.
 */
export async function resolveLuluV4AuthorityAssets(
  assetIds: readonly string[],
): Promise<readonly LuluV4ResolvedAuthorityAsset[]> {
  if (assetIds.length === 0 || new Set(assetIds).size !== assetIds.length) {
    return invalidAuthority("The Lulu V4 authority asset request is invalid.");
  }
  const requested = assetIds.map((id) => {
    const asset = assetsById.get(id);
    if (!asset) return invalidAuthority(`The approved Lulu V4 authority asset ${id} is not indexed.`);
    return asset;
  });
  await verifyRemoteManifest();
  const assets = await Promise.all(requested.map(readVerifiedBlob));
  return Object.freeze(assets);
}

/**
 * Server-only binary resolver for Studio generation. The returned bytes never
 * cross the operator API boundary; callers pass them directly to the image
 * provider in the declared order alongside the garment/current-view parent.
 */
export async function resolveLuluV4AuthorityStack(view: LuluV4View) {
  const stackIds = manifest.viewStacks[view];
  const supplementalIds = manifest.supplementalByView[view];
  const ids = [...stackIds, ...supplementalIds.filter((id) => !stackIds.includes(id))];
  const verified = await resolveLuluV4AuthorityAssets(ids);
  const byId = new Map(verified.map((asset) => [asset.id, asset]));
  const assets = stackIds.map((id) => byId.get(id)!);
  const supplementalAssets = supplementalIds.map((id) => byId.get(id)!);
  return Object.freeze({
    authorityId: manifest.authorityId,
    revision: manifest.authorityRevision,
    view,
    assets: Object.freeze(assets),
    supplementalAssets: Object.freeze(supplementalAssets),
    verifiedAssetCount: verified.length,
  });
}
