import { createHash } from "node:crypto";
import manifestJson from "./private-asset-manifests/lulu-v4.json";
import { getShopBlob } from "./vercel-blob";
import { verifyStudioImage } from "../studio/engine/assets";
import { StudioEngineError } from "../studio/engine/errors";

export type LuluV4View = "05" | "06" | "07";

type LuluV4AuthorityAsset = {
  id: string;
  role: string;
  authority: "identity" | "translation" | "body" | "atelier";
  pathname: string;
  sha256: string;
  byteSize: number;
  width: number;
  height: number;
  mimeType: "image/jpeg" | "image/png";
};

type LuluV4AuthorityManifest = {
  schemaVersion: number;
  authorityId: "lulu-v4";
  authorityRevision: string;
  privacy: "PRIVATE_PRODUCTION_ONLY";
  publishable: false;
  manifestPathname: string;
  assets: LuluV4AuthorityAsset[];
  viewStacks: Record<LuluV4View, string[]>;
  supplementalByView: Record<LuluV4View, string[]>;
};

const manifest = manifestJson as LuluV4AuthorityManifest;
const pathnamePrefix = `studio/model-authorities/lulu-v4/${manifest.authorityRevision}/`;

function invalidAuthority(message: string): never {
  throw new StudioEngineError(
    "INVALID_ASSET",
    503,
    message,
    "Restore the approved Lulu V4 private authority packet.",
  );
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalManifestBytes(): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(manifest));
}

function validateManifest(): Map<string, LuluV4AuthorityAsset> {
  if (
    manifest.schemaVersion !== 1
    || manifest.authorityId !== "lulu-v4"
    || manifest.privacy !== "PRIVATE_PRODUCTION_ONLY"
    || manifest.publishable !== false
    || manifest.manifestPathname !== `${pathnamePrefix}manifest.json`
  ) {
    return invalidAuthority("The Lulu V4 private authority manifest is invalid.");
  }
  const byId = new Map<string, LuluV4AuthorityAsset>();
  for (const asset of manifest.assets) {
    if (
      byId.has(asset.id)
      || !asset.pathname.startsWith(pathnamePrefix)
      || !/^[a-f0-9]{64}$/.test(asset.sha256)
      || !asset.pathname.includes(asset.sha256)
      || !Number.isInteger(asset.byteSize)
      || asset.byteSize <= 0
      || !Number.isInteger(asset.width)
      || !Number.isInteger(asset.height)
    ) {
      return invalidAuthority("The Lulu V4 private authority asset index is invalid.");
    }
    byId.set(asset.id, asset);
  }
  for (const view of ["05", "06", "07"] as const) {
    const stack = manifest.viewStacks[view];
    if (
      stack.length !== 4
      || new Set(stack).size !== stack.length
      || !stack.every((id) => byId.has(id))
      || !stack.includes("lulu.face.operation-board.full.v1")
      || !stack.includes("lulu.body.real.angle-contact.v4")
      || !stack.includes("juw.atelier.empty-plate.v1")
    ) {
      return invalidAuthority(`The Lulu V4 ${view} authority stack is invalid.`);
    }
    if (!manifest.supplementalByView[view].every((id) => byId.has(id))) {
      return invalidAuthority(`The Lulu V4 ${view} supplemental authority index is invalid.`);
    }
  }
  return byId;
}

const assetsById = validateManifest();

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
    }))),
    supplementalRoles: Object.freeze(manifest.supplementalByView[view].map((id) => {
      const asset = assetsById.get(id)!;
      return Object.freeze({ id: asset.id, role: asset.role, authority: asset.authority });
    })),
  });
}

async function readVerifiedBlob(asset: LuluV4AuthorityAsset) {
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
 * Server-only binary resolver for Studio generation. The returned bytes never
 * cross the operator API boundary; callers pass them directly to the image
 * provider in the declared order alongside the garment/current-view parent.
 */
export async function resolveLuluV4AuthorityStack(view: LuluV4View) {
  await verifyRemoteManifest();
  const ids = manifest.viewStacks[view];
  const assets = await Promise.all(ids.map((id) => readVerifiedBlob(assetsById.get(id)!)));
  return Object.freeze({
    authorityId: manifest.authorityId,
    revision: manifest.authorityRevision,
    view,
    assets: Object.freeze(assets),
  });
}
