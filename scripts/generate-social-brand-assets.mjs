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
const openGraphSourcePath = path.join(publicBrandRoot, "presentation", "luxury-signage-dark.png");

const warmPaper = "#F4EEE6";
const coral = "#CB6A4A";

await Promise.all([
  mkdir(publicBrandRoot, { recursive: true }),
  mkdir(exportsRoot, { recursive: true }),
]);

const [logo, openGraph] = await Promise.all([
  readFile(logoPath),
  readFile(openGraphSourcePath),
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

function profileFrameSvg({ width, height }) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <circle cx="${width / 2}" cy="${height / 2}" r="${width * 0.438}" fill="none" stroke="${coral}" stroke-opacity="0.10" stroke-width="2"/>
    <circle cx="${width / 2}" cy="${height / 2}" r="${width * 0.414}" fill="none" stroke="${coral}" stroke-opacity="0.075" stroke-width="1"/>
  </svg>`);
}

async function buildProfile() {
  const size = 1080;
  const layer = await resizeLogo({ width: 690, height: 790 });
  const metadata = await sharp(layer).metadata();

  return pngWithProfile(
    sharp({ create: { width: size, height: size, channels: 3, background: warmPaper } }).composite([
      { input: profileFrameSvg({ width: size, height: size }), left: 0, top: 0 },
      {
        input: layer,
        left: Math.round((size - metadata.width) / 2),
        top: Math.round((size - metadata.height) / 2),
      },
    ]).flatten({ background: warmPaper }).removeAlpha(),
  );
}

const profile = await buildProfile();

await Promise.all([
  writeFile(path.join(publicBrandRoot, "social-profile.png"), profile),
  writeFile(path.join(publicBrandRoot, "social-og.png"), openGraph),
  writeFile(path.join(publicRoot, "og.png"), openGraph),
  writeFile(path.join(exportsRoot, "social-profile-1080.png"), profile),
  writeFile(path.join(exportsRoot, "social-og-1122x1402.png"), openGraph),
]);

console.log("Generated the JustUrbanWears social profile and copied the owner-selected signage Open Graph asset exactly.");
