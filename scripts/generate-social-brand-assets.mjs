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
const openGraphBackgroundPath = path.join(
  root,
  "design",
  "identity-2026",
  "social",
  "og-wardrobe-background-source.png",
);
const openGraphHeadlinePath = path.join(
  root,
  "design",
  "identity-2026",
  "social",
  "og-headline-bodoni-outlined.svg",
);

const warmPaper = "#F4EEE6";
const cocoa = "#3A2E25";
const coral = "#CB6A4A";

await Promise.all([
  mkdir(publicBrandRoot, { recursive: true }),
  mkdir(exportsRoot, { recursive: true }),
]);

const [logo, openGraphBackground, openGraphHeadline] = await Promise.all([
  readFile(logoPath),
  readFile(openGraphBackgroundPath),
  readFile(openGraphHeadlinePath),
]);

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
  </svg>`);
}

function openGraphCopySvg({ width, height }) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="wall-calm" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color="${warmPaper}" stop-opacity="0.16"/>
        <stop offset="0.54" stop-color="${warmPaper}" stop-opacity="0.05"/>
        <stop offset="0.64" stop-color="${warmPaper}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="760" height="${height}" fill="url(#wall-calm)"/>
    <path d="M120 450H178" stroke="${coral}" stroke-width="4"/>
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
  const layer = await resizeLogo({ width: 330, height: 350 });
  const metadata = await sharp(layer).metadata();

  return pngWithProfile(
    sharp(openGraphBackground)
      .resize({ width, height, fit: "cover", position: "center" })
      .composite([
      { input: openGraphCopySvg({ width, height }), left: 0, top: 0 },
      { input: openGraphHeadline, left: 120, top: 462 },
      {
        input: layer,
        left: Math.round(285 - metadata.width / 2),
        top: 62,
      },
    ]).flatten({ background: warmPaper }).removeAlpha(),
  );
}

const [profile, openGraph] = await Promise.all([buildProfile(), buildOpenGraph()]);

await Promise.all([
  writeFile(path.join(publicBrandRoot, "social-profile.png"), profile),
  writeFile(path.join(publicBrandRoot, "social-og.png"), openGraph),
  writeFile(path.join(publicRoot, "og.png"), openGraph),
  writeFile(path.join(exportsRoot, "social-profile-1080.png"), profile),
  writeFile(path.join(exportsRoot, "social-og-1200x630.png"), openGraph),
]);

console.log("Generated JustUrbanWears centered-logo social profile and wardrobe-reveal Open Graph assets.");
