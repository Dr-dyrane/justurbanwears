import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { get, put } from "@vercel/blob";
import sharp from "sharp";
import { LULU_V4_LOCAL_SOURCES } from "../virtual-atelier/lulu-v4-local-sources.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = join(repositoryRoot, "lib/server/private-asset-manifests/lulu-v4.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const token = process.env.PRIVATE_BLOB_READ_WRITE_TOKEN;
const currentAuthorityRevision = "LULU_V4_2026-08-25.7";
const previousAuthorityRevision = "LULU_V4_2026-08-25.6";
const acceptedOperationalAuthority = "ACCEPTED_OPERATIONAL_AUTHORITY";
const lockedImmutable = "LOCKED_IMMUTABLE";

if (!token) throw new Error("Provide PRIVATE_BLOB_READ_WRITE_TOKEN.");

const assetKeys = Object.freeze([
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
]);

function failManifest(message) {
  throw new Error(`Invalid Lulu V4 authority manifest: ${message}`);
}

function validateCurrentManifest() {
  const prefix = `studio/model-authorities/lulu-v4/${currentAuthorityRevision}/`;
  const expectedIds = new Set(Object.keys(LULU_V4_LOCAL_SOURCES));
  if (
    manifest.schemaVersion !== 3
    || manifest.authorityId !== "lulu-v4"
    || manifest.authorityRevision !== currentAuthorityRevision
    || manifest.privacy !== "PRIVATE_PRODUCTION_ONLY"
    || manifest.publishable !== false
    || manifest.manifestPathname !== `${prefix}manifest.json`
    || !Array.isArray(manifest.assets)
    || manifest.assets.length !== expectedIds.size
  ) {
    failManifest("schema, revision, privacy or asset count drifted");
  }

  const seen = new Set();
  for (const asset of manifest.assets) {
    const extension = asset.mimeType === "image/png" ? "png" : asset.mimeType === "image/jpeg" ? "jpg" : null;
    const keys = asset && typeof asset === "object" ? Object.keys(asset).sort() : [];
    if (
      keys.length !== assetKeys.length
      || !keys.every((key, index) => key === assetKeys[index])
      || !expectedIds.has(asset.id)
      || seen.has(asset.id)
      || typeof asset.role !== "string"
      || asset.role.length === 0
      || !["identity", "translation", "body", "atelier"].includes(asset.authority)
      || asset.acceptance !== acceptedOperationalAuthority
      || asset.lockedStatus !== lockedImmutable
      || !/^[a-f0-9]{64}$/.test(asset.sha256)
      || extension === null
      || asset.pathname !== `${prefix}${asset.sha256}.${extension}`
      || !Number.isInteger(asset.byteSize)
      || asset.byteSize <= 0
      || !Number.isInteger(asset.width)
      || asset.width <= 0
      || !Number.isInteger(asset.height)
      || asset.height <= 0
    ) {
      failManifest(`asset contract drifted for ${asset?.id ?? "unknown asset"}`);
    }
    seen.add(asset.id);
  }
  if ([...expectedIds].some((id) => !seen.has(id))) {
    failManifest("the exact 11 operational asset IDs are not present");
  }
}

function validatePredecessorManifest(predecessor) {
  const prefix = `studio/model-authorities/lulu-v4/${previousAuthorityRevision}/`;
  if (
    !predecessor
    || typeof predecessor !== "object"
    || predecessor.schemaVersion !== 2
    || predecessor.authorityId !== "lulu-v4"
    || predecessor.authorityRevision !== previousAuthorityRevision
    || predecessor.privacy !== "PRIVATE_PRODUCTION_ONLY"
    || predecessor.publishable !== false
    || predecessor.manifestPathname !== `${prefix}manifest.json`
    || !Array.isArray(predecessor.assets)
    || predecessor.assets.length !== manifest.assets.length
  ) {
    failManifest("the immutable .6 predecessor manifest is invalid");
  }

  const predecessorById = new Map(predecessor.assets.map((asset) => [asset.id, asset]));
  for (const asset of manifest.assets) {
    const previous = predecessorById.get(asset.id);
    if (
      !previous
      || previous.pathname !== `${prefix}${basename(asset.pathname)}`
      || basename(previous.pathname) !== basename(asset.pathname)
      || previous.role !== asset.role
      || previous.authority !== asset.authority
      || previous.sha256 !== asset.sha256
      || previous.byteSize !== asset.byteSize
      || previous.width !== asset.width
      || previous.height !== asset.height
      || previous.mimeType !== asset.mimeType
    ) {
      failManifest(`asset ${asset.id} does not exactly preserve its .6 byte contract`);
    }
  }
  if (
    JSON.stringify(predecessor.viewStacks) !== JSON.stringify(manifest.viewStacks)
    || JSON.stringify(predecessor.supplementalByView) !== JSON.stringify(manifest.supplementalByView)
    || predecessor.maxPhysicalReferences !== manifest.maxPhysicalReferences
    || JSON.stringify(predecessor.operationPacks) !== JSON.stringify(manifest.operationPacks)
  ) {
    failManifest("authority stacks or operation packs drifted from .6");
  }
  return predecessorById;
}

validateCurrentManifest();
function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readback(pathname) {
  const result = await get(pathname, { access: "private", token, useCache: false });
  if (!result || result.statusCode !== 200) throw new Error(`Private Blob read-back failed: ${pathname}`);
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

async function putImmutable(pathname, body, contentType) {
  const existing = await get(pathname, { access: "private", token, useCache: false });
  if (!existing) {
    try {
      await put(pathname, body, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: false,
        cacheControlMaxAge: 31_536_000,
        contentType,
        token,
      });
    } catch (error) {
      const raced = await get(pathname, { access: "private", token, useCache: false });
      if (!raced) throw error;
    }
  }
  return readback(pathname);
}

const predecessorManifestPathname =
  `studio/model-authorities/lulu-v4/${previousAuthorityRevision}/manifest.json`;
let predecessorManifest;
try {
  predecessorManifest = JSON.parse((await readback(predecessorManifestPathname)).toString("utf8"));
} catch (error) {
  throw new Error("The immutable .6 predecessor manifest could not be read and parsed.", { cause: error });
}
const predecessorAssetsById = validatePredecessorManifest(predecessorManifest);
const predecessorBodiesById = new Map();
for (const asset of manifest.assets) {
  const predecessor = predecessorAssetsById.get(asset.id);
  const body = await readback(predecessor.pathname);
  const metadata = await sharp(body).metadata();
  if (
    body.byteLength !== asset.byteSize
    || sha256(body) !== asset.sha256
    || metadata.width !== asset.width
    || metadata.height !== asset.height
    || metadata.format !== (asset.mimeType === "image/png" ? "png" : "jpeg")
  ) {
    throw new Error(`Immutable .6 predecessor authority did not verify: ${asset.id}.`);
  }
  predecessorBodiesById.set(asset.id, body);
}

async function readApprovedSource(asset, relativeSource) {
  try {
    return { body: await readFile(join(repositoryRoot, relativeSource)), source: "local-approved-source" };
  } catch (error) {
    if (!(error && typeof error === "object" && error.code === "ENOENT")) throw error;
    // A schema-only revision remains restorable on a clean checkout by using
    // the already read-back and byte-verified immutable .6 predecessor.
    const body = predecessorBodiesById.get(asset.id);
    if (!body) throw new Error(`No verified predecessor authority is available for ${asset.id}.`);
    return { body, source: "verified-private-predecessor" };
  }
}

const uploaded = [];
for (const asset of manifest.assets) {
  const relativeSource = LULU_V4_LOCAL_SOURCES[asset.id];
  if (!relativeSource) throw new Error(`No approved local source is mapped for ${asset.id}.`);
  const { body, source } = await readApprovedSource(asset, relativeSource);
  const metadata = await sharp(body).metadata();
  if (
    body.byteLength !== asset.byteSize
    || sha256(body) !== asset.sha256
    || metadata.width !== asset.width
    || metadata.height !== asset.height
    || metadata.format !== (asset.mimeType === "image/png" ? "png" : "jpeg")
  ) {
    throw new Error(`Local approved authority did not verify: ${asset.id}.`);
  }
  const remote = await putImmutable(asset.pathname, body, asset.mimeType);
  if (remote.byteLength !== asset.byteSize || sha256(remote) !== asset.sha256) {
    throw new Error(`Private Blob authority did not verify: ${asset.id}.`);
  }
  uploaded.push({ id: asset.id, pathname: asset.pathname, sha256: asset.sha256, bytes: asset.byteSize, source });
}

const canonicalManifest = Buffer.from(JSON.stringify(manifest));
const remoteManifest = await putImmutable(manifest.manifestPathname, canonicalManifest, "application/json");
if (sha256(remoteManifest) !== sha256(canonicalManifest)) {
  throw new Error("The private Lulu V4 Blob manifest did not verify.");
}

console.log(JSON.stringify({
  authorityId: manifest.authorityId,
  revision: manifest.authorityRevision,
  access: "private",
  publishable: false,
  manifest: {
    pathname: manifest.manifestPathname,
    sha256: sha256(canonicalManifest),
    bytes: canonicalManifest.byteLength,
  },
  assets: uploaded,
}, null, 2));
