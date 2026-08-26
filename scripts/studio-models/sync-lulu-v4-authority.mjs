import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { get, put } from "@vercel/blob";
import sharp from "sharp";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const manifestPath = join(repositoryRoot, "lib/server/private-asset-manifests/lulu-v4.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const token = process.env.PRIVATE_BLOB_READ_WRITE_TOKEN;

if (!token) throw new Error("Provide PRIVATE_BLOB_READ_WRITE_TOKEN.");
if (manifest.privacy !== "PRIVATE_PRODUCTION_ONLY" || manifest.publishable !== false) {
  throw new Error("The Lulu V4 authority manifest must remain private and non-publishable.");
}

const sourceById = Object.freeze({
  "lulu.face.operation-board.full.v1": "storage/models/konan/canon/v4/face/LULU_V4_FACE_OPERATION_BOARD_FULL.png",
  "lulu.face.v4.front.lock.v1": "storage/models/konan/canon/v4/face/candidates/LULU_V4_FACE_FRONT_CANDIDATE_v1.png",
  "lulu.body.canon.v4": "storage/models/konan/canon/v4/LULU_V4_BODY_CANON_SOURCE.png",
  "lulu.body.canon.v4.three-view": "storage/models/konan/canon/v4/LULU_V4_BODY_THREE_VIEW_CANON.png",
  "lulu.body.canon.v4.front": "storage/models/konan/canon/v4/LULU_V4_BODY_FRONT_CANON.png",
  "lulu.body.canon.v4.side": "storage/models/konan/canon/v4/LULU_V4_BODY_SIDE_CANON.png",
  "lulu.body.canon.v4.back": "storage/models/konan/canon/v4/LULU_V4_BODY_BACK_CANON.png",
  "lulu.body.real.angle-contact.v4": "storage/models/konan/canon/v4/LULU_V4_BODY_ANGLE_CONTACT.jpg",
  "lulu.body.real.gym-rear-profile.v4": "storage/models/konan/canon/v4/LULU_V4_BODY_GYM_REAR_PROFILE_EVIDENCE_UPRIGHT.jpeg",
  "lulu.body.rear.operation-board.full.v1": "storage/models/konan/canon/v4/LULU_V4_BODY_REAR_OPERATION_BOARD_FULL.png",
  "juw.atelier.empty-plate.v1": "storage/virtual-atelier/canon/juw-room-v1.png",
});

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

const uploaded = [];
for (const asset of manifest.assets) {
  const relativeSource = sourceById[asset.id];
  if (!relativeSource) throw new Error(`No approved local source is mapped for ${asset.id}.`);
  const body = await readFile(join(repositoryRoot, relativeSource));
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
  uploaded.push({ id: asset.id, pathname: asset.pathname, sha256: asset.sha256, bytes: asset.byteSize });
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
