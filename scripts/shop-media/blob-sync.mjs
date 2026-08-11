import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { get, list, put } from "@vercel/blob";
import { SHOP_CATALOGUE_MANIFEST } from "../shop-db/catalogue-manifest.mjs";
import { canonicalStringify, manifestChecksum } from "../shop-db/release-core.mjs";

const repositoryRoot = join(fileURLToPath(new URL("../../", import.meta.url)));
const contentTypes = new Map([
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

function sha256(body) {
  return createHash("sha256").update(body).digest("hex");
}

export function cataloguePresentationChecksum(manifest = SHOP_CATALOGUE_MANIFEST) {
  const products = manifest.products.map((source) => {
    const product = { ...source };
    delete product.initialInventory;
    delete product.availability;
    return product;
  });
  return sha256(canonicalStringify({
    schemaVersion: manifest.schemaVersion,
    revision: manifest.revision,
    products,
  }));
}

function extension(pathname) {
  const dot = pathname.lastIndexOf(".");
  return dot === -1 ? "" : pathname.slice(dot);
}

export function approvedMediaSourcePaths() {
  const sources = SHOP_CATALOGUE_MANIFEST.products.flatMap((product) => [
    ...product.media.map((item) => item.src),
    ...(typeof product.modelAnchor.src === "string" ? [product.modelAnchor.src] : []),
  ]);
  return [...new Set(sources)].sort();
}

export async function createBlobAssetPlan(root = repositoryRoot) {
  return Promise.all(approvedMediaSourcePaths().map(async (sourcePath) => {
    if (!/^\/shop\/(?:products\/[a-z0-9-]+\/[a-z0-9-]+\.webp|model\/lulu-v2-approved\.png)$/.test(sourcePath)) {
      throw new Error(`Unapproved public media path: ${sourcePath}`);
    }

    const absolutePath = join(root, "public", sourcePath);
    const body = await readFile(absolutePath);
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) throw new Error(`Public media is not a file: ${sourcePath}`);
    const digest = sha256(body);
    const contentType = contentTypes.get(extension(sourcePath));
    if (!contentType) throw new Error(`Unsupported public media type: ${sourcePath}`);
    const relativePath = sourcePath.slice("/shop/".length);

    return {
      sourcePath,
      pathname: `shop/catalogue/${digest}/${relativePath}`,
      sha256: digest,
      size: body.byteLength,
      contentType,
      body,
    };
  }));
}

async function readPreviousManifest(root) {
  try {
    const raw = await readFile(join(root, "lib/shop/public-media-manifest.json"), "utf8");
    const value = JSON.parse(raw);
    if (value?.schemaVersion !== 1 || !Array.isArray(value.assets) || !Array.isArray(value.legacyAssets)) {
      throw new Error("The checked-in public media manifest has an unsupported shape.");
    }
    return value;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { assets: [], legacyAssets: [] };
    }
    throw error;
  }
}

export function mergeLegacyAssets(previous, active) {
  const activeBySource = new Map(active.map((asset) => [asset.sourcePath, asset]));
  const legacyByUrl = new Map();
  for (const asset of [...previous.assets, ...previous.legacyAssets]) {
    if (activeBySource.get(asset.sourcePath)?.url === asset.url) continue;
    legacyByUrl.set(asset.url, asset);
  }
  return [...legacyByUrl.values()].sort((left, right) =>
    left.sourcePath.localeCompare(right.sourcePath) || left.url.localeCompare(right.url));
}

async function readBlobSha(blob, token) {
  const result = await get(blob.url, {
    access: "public",
    token,
    useCache: false,
  });
  if (!result) throw new Error(`Uploaded Blob is not readable: ${blob.pathname}`);
  const chunks = [];
  for await (const chunk of result.stream) chunks.push(Buffer.from(chunk));
  return sha256(Buffer.concat(chunks));
}

export async function syncApprovedPublicMedia({ token, root = repositoryRoot } = {}) {
  if (!token) throw new Error("PUBLIC_BLOB_READ_WRITE_TOKEN is required.");
  const plan = await createBlobAssetPlan(root);
  const current = await list({ token, prefix: "shop/catalogue/", limit: 1000 });
  if (current.hasMore) throw new Error("The public media listing unexpectedly exceeds 1,000 entries.");
  const existingByPath = new Map(current.blobs.map((blob) => [blob.pathname, blob]));
  const previous = await readPreviousManifest(root);
  const assets = [];

  for (const asset of plan) {
    const existing = existingByPath.get(asset.pathname);
    let blob;
    if (existing) {
      if (existing.size !== asset.size) {
        throw new Error(`Existing Blob size mismatch: ${asset.pathname}`);
      }
      blob = existing;
    } else {
      blob = await put(asset.pathname, asset.body, {
        access: "public",
        token,
        addRandomSuffix: false,
        allowOverwrite: false,
        cacheControlMaxAge: 31_536_000,
        contentType: asset.contentType,
      });
    }

    const remoteSha = await readBlobSha(blob, token);
    if (remoteSha !== asset.sha256) {
      throw new Error(`Uploaded Blob checksum mismatch: ${asset.pathname}`);
    }
    assets.push({
      sourcePath: asset.sourcePath,
      pathname: asset.pathname,
      url: blob.url,
      sha256: asset.sha256,
      size: asset.size,
      contentType: asset.contentType,
    });
  }

  const legacyAssets = mergeLegacyAssets(previous, assets);
  for (const asset of legacyAssets) {
    const blob = existingByPath.get(asset.pathname);
    if (!blob || blob.url !== asset.url || blob.size !== asset.size) {
      throw new Error(`Legacy Blob is missing or changed: ${asset.pathname}`);
    }
    if (await readBlobSha(blob, token) !== asset.sha256) {
      throw new Error(`Legacy Blob checksum mismatch: ${asset.pathname}`);
    }
  }

  return {
    schemaVersion: 1,
    catalogueRevision: SHOP_CATALOGUE_MANIFEST.revision,
    catalogueChecksum: manifestChecksum(SHOP_CATALOGUE_MANIFEST),
    cataloguePresentationChecksum: cataloguePresentationChecksum(),
    legacyAssets,
    assets,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const result = await syncApprovedPublicMedia({
    token: process.env.PUBLIC_BLOB_READ_WRITE_TOKEN,
  });
  const output = process.argv.includes("--summary")
    ? {
        catalogueRevision: result.catalogueRevision,
        catalogueChecksum: result.catalogueChecksum,
        cataloguePresentationChecksum: result.cataloguePresentationChecksum,
        assetCount: result.assets.length,
        totalBytes: result.assets.reduce((total, asset) => total + asset.size, 0),
        legacyAssetCount: result.legacyAssets.length,
        hosts: [...new Set(result.assets.map((asset) => new URL(asset.url).host))],
      }
    : result;
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}
