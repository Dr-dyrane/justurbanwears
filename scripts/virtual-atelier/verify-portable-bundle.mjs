#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import sharp from "sharp";

import { validateOperationRecord } from "./validate-operation.mjs";
import { LULU_V4_LOCAL_SOURCES } from "./lulu-v4-local-sources.mjs";

const scriptRoot = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(scriptRoot, "../..");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseArgs(argv) {
  const options = { repoRoot: defaultRepoRoot, garment: null, drop: "02", coreOnly: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") options.repoRoot = resolve(argv[++index]);
    else if (arg === "--garment") options.garment = String(argv[++index]).padStart(3, "0");
    else if (arg === "--drop") options.drop = String(argv[++index]).padStart(2, "0");
    else if (arg === "--core-only") options.coreOnly = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/virtual-atelier/verify-portable-bundle.mjs [--garment 024] [--drop 02] [--core-only] [--json]");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function verifyFile(repoRoot, relativePath, expected, result) {
  const absolutePath = resolve(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    result.errors.push(`${relativePath}: missing`);
    return;
  }
  const bytes = await readFile(absolutePath);
  if (expected.sha256 && sha256(bytes) !== expected.sha256) result.errors.push(`${relativePath}: SHA-256 mismatch`);
  const expectedBytes = expected.byteSize ?? expected.bytes;
  if (expectedBytes != null && bytes.byteLength !== expectedBytes) result.errors.push(`${relativePath}: byte-size mismatch`);
  if (expected.width || expected.height || expected.mimeType) {
    const metadata = await sharp(bytes).metadata();
    if (expected.width && metadata.width !== expected.width) result.errors.push(`${relativePath}: width mismatch`);
    if (expected.height && metadata.height !== expected.height) result.errors.push(`${relativePath}: height mismatch`);
    const expectedFormat = expected.mimeType === "image/jpeg" ? "jpeg" : expected.mimeType === "image/png" ? "png" : null;
    if (expectedFormat && metadata.format !== expectedFormat) result.errors.push(`${relativePath}: format mismatch`);
  }
  result.files.push({ path: relativePath, sha256: sha256(bytes), bytes: bytes.byteLength });
}

async function verifyManifestFiles(repoRoot, manifestPath, collection, result) {
  const manifest = await readJson(manifestPath);
  for (const item of collection(manifest)) {
    await verifyFile(repoRoot, item.relativePath, item, result);
  }
  return manifest;
}

export async function verifyPortableBundle(options = {}) {
  const repoRoot = resolve(options.repoRoot || defaultRepoRoot);
  const result = { pass: false, authorityRevision: null, garment: options.garment || null, files: [], operationRecords: [], errors: [] };
  const authorityPath = join(repoRoot, "lib/server/private-asset-manifests/lulu-v4.json");
  const portablePath = join(repoRoot, "docs/virtual-atelier/portable-authority-kit.v1.json");
  const authority = await readJson(authorityPath);
  const portable = await readJson(portablePath);
  result.authorityRevision = authority.authorityRevision;
  if (portable.authorityRevision !== authority.authorityRevision) result.errors.push("portable authority revision does not match private authority manifest");
  const portableById = new Map(portable.assets.map((asset) => [asset.id, asset]));
  if (authority.assets.length !== portable.assets.length) result.errors.push("portable authority asset count does not match private authority manifest");

  for (const asset of authority.assets) {
    const portableAsset = portableById.get(asset.id);
    if (!portableAsset) {
      result.errors.push(`${asset.id}: missing from portable authority kit`);
      continue;
    }
    if (portableAsset.sha256 !== asset.sha256) result.errors.push(`${asset.id}: portable hash does not match private authority manifest`);
    if (portableAsset.acceptanceStatus !== "APPROVED" || portableAsset.lockedStatus !== "IMMUTABLE_AUTHORITY") {
      result.errors.push(`${asset.id}: approval or lock status is invalid`);
    }
    const relativePath = LULU_V4_LOCAL_SOURCES[asset.id];
    if (!relativePath) {
      result.errors.push(`${asset.id}: local restore mapping is missing`);
      continue;
    }
    await verifyFile(repoRoot, relativePath, asset, result);
  }
  for (const asset of portable.supplementalRestoreAssets || []) {
    if (asset.acceptanceStatus !== "APPROVED" || asset.lockedStatus !== "IMMUTABLE_REAL_IDENTITY_AUTHORITY") {
      result.errors.push(`${asset.id}: supplemental approval or identity lock status is invalid`);
    }
    const relativePath = LULU_V4_LOCAL_SOURCES[asset.id];
    if (!relativePath) {
      result.errors.push(`${asset.id}: supplemental local restore mapping is missing`);
      continue;
    }
    await verifyFile(repoRoot, relativePath, asset, result);
  }

  if (!options.coreOnly) {
    let garment = options.garment;
    if (!garment) {
      const state = await readJson(join(repoRoot, "docs/virtual-atelier/state/current.json"));
      garment = String(state.activeGarment || "").padStart(3, "0");
    }
    result.garment = garment;
    const root = `storage/garments/drop-${options.drop || "02"}/${garment}`;
    const sourceManifestPath = join(repoRoot, root, "source/manifest.json");
    const lockedManifestPath = join(repoRoot, root, "locked/manifest.json");
    if (!existsSync(sourceManifestPath)) result.errors.push(`${root}/source/manifest.json: missing`);
    else await verifyManifestFiles(repoRoot, sourceManifestPath, (manifest) => manifest.files.map((file) => ({ ...file, relativePath: `${root}/source/${file.path}` })), result);
    if (!existsSync(lockedManifestPath)) result.errors.push(`${root}/locked/manifest.json: missing`);
    else {
      const locked = await verifyManifestFiles(repoRoot, lockedManifestPath, (manifest) => Object.values(manifest.views).map((view) => ({ ...view, relativePath: `${root}/locked/${view.path}` })), result);
      for (const relativeRecord of locked.operationRecords || []) {
        if (relativeRecord.includes("shop-media-export")) continue;
        const operationPath = resolve(dirname(lockedManifestPath), relativeRecord);
        if (!existsSync(operationPath)) {
          result.errors.push(`${relativeRecord}: operation record is missing`);
          continue;
        }
        const operation = await readJson(operationPath);
        const validation = validateOperationRecord(operation, { operationPath, verifyFiles: true });
        result.operationRecords.push({ operationId: validation.operationId, pass: validation.pass });
        for (const error of validation.errors) result.errors.push(`${validation.operationId || relativeRecord}: ${error}`);
      }
    }
  }
  result.pass = result.errors.length === 0;
  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await verifyPortableBundle(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`JUW portable Atelier bundle ${result.pass ? "PASS" : "FAIL"}`);
    console.log(`authority: ${result.authorityRevision}`);
    console.log(`garment: ${result.garment || "core only"}`);
    console.log(`verified files: ${result.files.length}`);
    console.log(`verified operation records: ${result.operationRecords.filter((record) => record.pass).length}`);
    for (const error of result.errors) console.log(`- ${error}`);
  }
  process.exitCode = result.pass ? 0 : 1;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
