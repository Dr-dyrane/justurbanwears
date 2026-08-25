#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import sharp from "sharp";

export const SHOP_MEDIA_WIDTH = 1120;
export const SHOP_MEDIA_HEIGHT = 1400;

export const PUBLIC_MEDIA_MAPPING = Object.freeze([
  Object.freeze({ view: "01", role: "GARMENT_FRONT", output: "01-garment-front.webp" }),
  Object.freeze({ view: "02", role: "GARMENT_BACK", output: "02-garment-back.webp" }),
  Object.freeze({ view: "03", role: "MANNEQUIN_FRONT", output: "03-mannequin-front.webp" }),
  Object.freeze({ view: "05", role: "MODEL_FRONT", output: "04-model-front.webp" }),
  Object.freeze({ view: "07", role: "MODEL_REAR_THREE_QUARTER", output: "05-model-rear-three-quarter.webp" }),
  Object.freeze({ view: "04", role: "FABRIC_DETAIL", output: "06-fabric-detail.webp" }),
  Object.freeze({ view: "06", role: "MODEL_LEFT_PROFILE", output: "07-model-left-profile.webp" }),
]);

export const PARTIAL_PUBLIC_MEDIA_MAPPING = Object.freeze([
  Object.freeze({ view: "01", role: "GARMENT_FRONT", output: "01-garment-front.webp" }),
  Object.freeze({ view: "02", role: "GARMENT_BACK", output: "02-garment-back.webp" }),
  Object.freeze({ view: "03", role: "MANNEQUIN_FRONT", output: "03-mannequin-front.webp" }),
  Object.freeze({ view: "04", role: "FABRIC_DETAIL", output: "06-fabric-detail.webp" }),
]);

const PARTIAL_PUBLICATION_STATUS = "PARTIAL_01_04_USER_ACCEPTED_LOCKED_FOR_AS_IS_PUBLICATION";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function containedDimensions(sourceWidth, sourceHeight, width = SHOP_MEDIA_WIDTH, height = SHOP_MEDIA_HEIGHT) {
  if (![sourceWidth, sourceHeight, width, height].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new Error("Image dimensions must be positive integers.");
  }
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  return {
    width: Math.round(sourceWidth * scale),
    height: Math.round(sourceHeight * scale),
  };
}

export function validateLockedManifest(manifest, garmentId, { allowPartial = false } = {}) {
  if (!manifest || manifest.schemaVersion !== 1 || manifest.garmentId !== garmentId) {
    throw new Error(`Garment ${garmentId} locked manifest is missing or invalid.`);
  }
  const isComplete = /^COMPLETE_01_07_.*LOCKED$/.test(manifest.status);
  const isAuthorizedPartial = manifest.status === PARTIAL_PUBLICATION_STATUS;
  if (!isComplete && !(allowPartial && isAuthorizedPartial)) {
    throw new Error(`Garment ${garmentId} is not complete and locked through 01–07.`);
  }
  if (isAuthorizedPartial && manifest.authorization?.mode !== "USER_AUTHORIZED_AS_IS_PARTIAL_PUBLICATION") {
    throw new Error(`Garment ${garmentId} partial publication has no explicit user authorization.`);
  }
  const mappingSet = isComplete ? PUBLIC_MEDIA_MAPPING : PARTIAL_PUBLIC_MEDIA_MAPPING;
  for (const mapping of mappingSet) {
    const view = manifest.views?.[mapping.view];
    if (
      !view
      || view.role !== mapping.role
      || !view.status?.includes("USER_ACCEPTED")
      || !view.status.includes("LOCKED")
    ) {
      throw new Error(`Garment ${garmentId}/${mapping.view} is not locked as ${mapping.role}.`);
    }
    if (basename(view.path) !== view.path || !/^[a-z0-9-]+\.png$/.test(view.path)) {
      throw new Error(`Garment ${garmentId}/${mapping.view} has an unsafe locked path.`);
    }
    if (!/^[a-f0-9]{64}$/.test(view.sha256)) {
      throw new Error(`Garment ${garmentId}/${mapping.view} has no valid locked checksum.`);
    }
  }
  return manifest;
}

export async function renderShopDerivative(sourceBytes) {
  const oriented = await sharp(sourceBytes).rotate().removeAlpha().toColourspace("srgb").png().toBuffer();
  const source = await sharp(oriented).metadata();
  if (!source.width || !source.height) throw new Error("Source image dimensions are unavailable.");

  const background = await sharp(oriented)
    .resize({
      width: SHOP_MEDIA_WIDTH,
      height: SHOP_MEDIA_HEIGHT,
      fit: "cover",
      position: "centre",
      kernel: sharp.kernel.lanczos3,
    })
    .blur(32)
    .modulate({ brightness: 0.82, saturation: 0.72 })
    .toBuffer();
  const expectedForeground = containedDimensions(source.width, source.height);
  let foreground = await sharp(oriented)
    .resize({
      width: expectedForeground.width,
      height: expectedForeground.height,
      fit: "fill",
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    })
    .toBuffer();

  const horizontalLetterbox = expectedForeground.width < SHOP_MEDIA_WIDTH;
  const verticalLetterbox = expectedForeground.height < SHOP_MEDIA_HEIGHT;
  if (horizontalLetterbox || verticalLetterbox) {
    const feather = 24;
    const gradient = horizontalLetterbox
      ? `<linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="white" stop-opacity="0"/><stop offset="${feather / expectedForeground.width}" stop-color="white" stop-opacity="1"/><stop offset="${1 - feather / expectedForeground.width}" stop-color="white" stop-opacity="1"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient>`
      : `<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="white" stop-opacity="0"/><stop offset="${feather / expectedForeground.height}" stop-color="white" stop-opacity="1"/><stop offset="${1 - feather / expectedForeground.height}" stop-color="white" stop-opacity="1"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient>`;
    const mask = Buffer.from(`<svg width="${expectedForeground.width}" height="${expectedForeground.height}" xmlns="http://www.w3.org/2000/svg"><defs>${gradient}</defs><rect width="100%" height="100%" fill="url(#fade)"/></svg>`);
    foreground = await sharp(foreground)
      .ensureAlpha()
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer();
  }
  const foregroundMetadata = await sharp(foreground).metadata();
  if (!foregroundMetadata.width || !foregroundMetadata.height) {
    throw new Error("Foreground dimensions are unavailable.");
  }

  if (
    foregroundMetadata.width !== expectedForeground.width
    || foregroundMetadata.height !== expectedForeground.height
  ) {
    throw new Error("Aspect-preserving foreground dimensions did not verify.");
  }

  const bytes = await sharp(background)
    .composite([{ input: foreground, gravity: "centre" }])
    .toColourspace("srgb")
    .webp({ quality: 90, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toBuffer();
  const output = await sharp(bytes).metadata();
  if (
    output.format !== "webp"
    || output.width !== SHOP_MEDIA_WIDTH
    || output.height !== SHOP_MEDIA_HEIGHT
    || output.hasAlpha
  ) {
    throw new Error("Shop derivative dimensions or format did not verify.");
  }

  return {
    bytes,
    sha256: sha256(bytes),
    width: output.width,
    height: output.height,
    sourceWidth: source.width,
    sourceHeight: source.height,
    foregroundWidth: foregroundMetadata.width,
    foregroundHeight: foregroundMetadata.height,
    sidePadding: Math.floor((SHOP_MEDIA_WIDTH - foregroundMetadata.width) / 2),
    topPadding: Math.floor((SHOP_MEDIA_HEIGHT - foregroundMetadata.height) / 2),
  };
}

async function verifiedLockedSource(lockedRoot, manifestView, garmentId, view) {
  const path = resolve(lockedRoot, manifestView.path);
  if (dirname(path) !== resolve(lockedRoot)) {
    throw new Error(`Garment ${garmentId}/${view} resolves outside its locked directory.`);
  }
  const bytes = await readFile(path);
  const metadata = await sharp(bytes).metadata();
  if (
    sha256(bytes) !== manifestView.sha256
    || bytes.byteLength !== manifestView.bytes
    || metadata.width !== manifestView.width
    || metadata.height !== manifestView.height
  ) {
    throw new Error(`Garment ${garmentId}/${view} locked bytes did not verify.`);
  }
  return { path, bytes };
}

export async function createShopMediaExport({ garmentId, slug, privateRoot, publicRoot, allowPartial = false }) {
  if (!/^\d{3}$/.test(garmentId)) throw new Error("Garment id must use three digits.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Shop slug is invalid.");
  const lockedRoot = resolve(privateRoot, garmentId, "locked");
  const outputRoot = resolve(publicRoot, slug);
  const manifest = validateLockedManifest(
    JSON.parse(await readFile(join(lockedRoot, "manifest.json"), "utf8")),
    garmentId,
    { allowPartial },
  );

  const mappingSet = /^COMPLETE_01_07_.*LOCKED$/.test(manifest.status)
    ? PUBLIC_MEDIA_MAPPING
    : PARTIAL_PUBLIC_MEDIA_MAPPING;

  const assets = [];
  for (const mapping of mappingSet) {
    const manifestView = manifest.views[mapping.view];
    const source = await verifiedLockedSource(lockedRoot, manifestView, garmentId, mapping.view);
    const derivative = await renderShopDerivative(source.bytes);
    assets.push({
      view: mapping.view,
      role: mapping.role,
      sourcePath: source.path,
      sourceSha256: manifestView.sha256,
      outputPath: join(outputRoot, mapping.output),
      outputFilename: mapping.output,
      ...derivative,
    });
  }

  return { garmentId, slug, lockedRoot, outputRoot, assets };
}

export async function writeShopMediaExport(plan) {
  for (const asset of plan.assets) {
    if (!existsSync(asset.outputPath)) continue;
    const existing = await readFile(asset.outputPath);
    if (sha256(existing) !== asset.sha256) {
      throw new Error(`Refusing to overwrite a different public asset: ${asset.outputPath}`);
    }
  }

  await mkdir(plan.outputRoot, { recursive: true });
  for (const asset of plan.assets) {
    if (!existsSync(asset.outputPath)) await writeFile(asset.outputPath, asset.bytes, { flag: "wx" });
  }
  return plan;
}

function parseArgs(argv) {
  const options = {
    privateRoot: "storage/garments/drop-02",
    publicRoot: "public/shop/products",
    write: false,
    json: false,
    allowPartial: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--garment") options.garmentId = argv[++index];
    else if (argument === "--slug") options.slug = argv[++index];
    else if (argument === "--private-root") options.privateRoot = argv[++index];
    else if (argument === "--public-root") options.publicRoot = argv[++index];
    else if (argument === "--write") options.write = true;
    else if (argument === "--json") options.json = true;
    else if (argument === "--allow-partial") options.allowPartial = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function usage() {
  return `Usage: node scripts/virtual-atelier/export-shop-media.mjs --garment 009 --slug product-slug [--write] [--json] [--allow-partial]\n\nThe exporter normally requires a complete private 01–07 lock. --allow-partial accepts only an explicitly user-authorized 01–04 as-is publication manifest and exports its four truthful roles. Every source aspect ratio is preserved. Without --write it performs a read-only render and prints the planned output.`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.garmentId || !options.slug) throw new Error("--garment and --slug are required.");
  const plan = await createShopMediaExport({
    garmentId: options.garmentId,
    slug: options.slug,
    privateRoot: resolve(options.privateRoot),
    publicRoot: resolve(options.publicRoot),
    allowPartial: options.allowPartial,
  });
  if (options.write) await writeShopMediaExport(plan);
  const summary = {
    garmentId: plan.garmentId,
    slug: plan.slug,
    mode: options.write ? "WRITE" : "DRY_RUN",
    assets: plan.assets.map((asset) => Object.fromEntries(
      Object.entries(asset).filter(([key]) => key !== "bytes"),
    )),
  };
  if (options.json) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log(`Garment ${plan.garmentId} Shop media ${options.write ? "written" : "dry run passed"}:`);
    for (const asset of summary.assets) {
      console.log(`${asset.view} ${asset.role} -> ${asset.outputFilename} ${asset.width}x${asset.height} sha256=${asset.sha256}`);
    }
  }
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
