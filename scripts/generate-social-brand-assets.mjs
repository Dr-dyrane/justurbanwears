import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require(process.env.JUW_SHARP_MODULE || "sharp");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "public");
const publicBrandRoot = path.join(publicRoot, "brand");
const exportsRoot = path.join(root, "design", "identity-2026", "exports");
const logoPath = path.join(publicRoot, "logo.png");

const warmPaper = "#F4EEE6";
const cocoa = "#3A2E25";
const coral = "#CB6A4A";

await Promise.all([
  mkdir(publicBrandRoot, { recursive: true }),
  mkdir(exportsRoot, { recursive: true }),
]);

const logo = await readFile(logoPath);

async function pngWithProfile(pipeline) {
  return pipeline.png({ compressionLevel: 9, palette: true, quality: 92 }).withIccProfile("srgb").toBuffer();
}

async function resizeLogo({ width, height }) {
  return sharp(logo)
    .resize({ width, height, fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();
}

function frameSvg({ width, height, profile = false }) {
  if (profile) {
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <circle cx="${width / 2}" cy="${height / 2}" r="${width * 0.438}" fill="none" stroke="${coral}" stroke-opacity="0.10" stroke-width="2"/>
      <circle cx="${width / 2}" cy="${height / 2}" r="${width * 0.414}" fill="none" stroke="${coral}" stroke-opacity="0.075" stroke-width="1"/>
    </svg>`);
  }

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect x="22" y="22" width="${width - 44}" height="${height - 44}" rx="3" fill="none" stroke="${cocoa}" stroke-opacity="0.24" stroke-width="1"/>
    <path d="M72 82H172" stroke="${coral}" stroke-width="3"/>
    <path d="M${width - 172} ${height - 82}H${width - 72}" stroke="${coral}" stroke-width="3"/>
    <text x="${width / 2}" y="${height - 38}" text-anchor="middle" fill="${cocoa}" fill-opacity="0.74" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="600" letter-spacing="4.6">CLOTHES WITH A SECOND FIRST IMPRESSION.</text>
  </svg>`);
}

async function buildProfile() {
  const size = 1080;
  const layer = await resizeLogo({ width: 690, height: 790 });
  const metadata = await sharp(layer).metadata();

  return pngWithProfile(
    sharp({ create: { width: size, height: size, channels: 3, background: warmPaper } }).composite([
      { input: frameSvg({ width: size, height: size, profile: true }), left: 0, top: 0 },
      {
        input: layer,
        left: Math.round((size - metadata.width) / 2),
        top: Math.round((size - metadata.height) / 2),
      },
    ]).flatten({ background: warmPaper }).removeAlpha(),
  );
}

async function buildOpenGraph() {
  const width = 1200;
  const height = 630;
  const layer = await resizeLogo({ width: 500, height: 520 });
  const metadata = await sharp(layer).metadata();

  return pngWithProfile(
    sharp({ create: { width, height, channels: 3, background: warmPaper } }).composite([
      { input: frameSvg({ width, height }), left: 0, top: 0 },
      {
        input: layer,
        left: Math.round((width - metadata.width) / 2),
        top: Math.round((height - metadata.height) / 2) - 12,
      },
    ]).flatten({ background: warmPaper }).removeAlpha(),
  );
}

const [profile, openGraph] = await Promise.all([buildProfile(), buildOpenGraph()]);

await Promise.all([
  writeFile(path.join(publicBrandRoot, "social-profile.png"), profile),
  writeFile(path.join(publicBrandRoot, "social-og.png"), openGraph),
  writeFile(path.join(exportsRoot, "social-profile-1080.png"), profile),
  writeFile(path.join(exportsRoot, "social-og-1200x630.png"), openGraph),
]);

console.log("Generated JustUrbanWears centered-logo social profile and Open Graph assets.");
