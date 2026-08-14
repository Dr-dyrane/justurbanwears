import { createRequire } from "node:module";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require(process.env.JUW_SHARP_MODULE || "sharp");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsRoot = path.join(root, "docs", "order-flows");
const assetsRoot = path.join(docsRoot, "assets", "lulu-garment-intake");

function dataUri(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const [bodoni, manrope, wordmark, ...screens] = await Promise.all([
  readFile(path.join(root, "node_modules", "@fontsource-variable", "bodoni-moda", "files", "bodoni-moda-latin-wght-normal.woff2")),
  readFile(path.join(root, "node_modules", "@fontsource-variable", "manrope", "files", "manrope-latin-wght-normal.woff2")),
  readFile(path.join(root, "public", "brand", "wordmark.svg")),
  ...["01-start.png", "02-source.png", "03-confirm.png", "04-wear.png", "05-saved.png"].map((name) =>
    readFile(path.join(assetsRoot, name)),
  ),
]);

const stages = [
  {
    eyebrow: "01 · START",
    title: "Choose a source.",
    lines: ["Camera", "Photos", "Describe"],
  },
  {
    eyebrow: "02 · BUILD",
    title: "Check the piece.",
    lines: ["Use this photo?", "Build garment"],
  },
  {
    eyebrow: "03 · REVIEW",
    title: "Review details.",
    lines: ["Keep", "Edit", "Try again once"],
  },
  {
    eyebrow: "04 · WEAR",
    title: "Choose a view.",
    lines: ["Mannequin", "Lulu or a model", "Editorial"],
  },
  {
    eyebrow: "05 · FINISH",
    title: "Saved in Wardrobe.",
    lines: ["Draft · Private", "Add back + detail", "Publish later"],
  },
];

const paper = "#F4EEE6";
const white = "#FFFDFC";
const cocoa = "#3A2E25";
const coral = "#CB6A4A";
const muted = "#756A62";
const olive = "#6F7A63";

const cardWidth = 272;
const gap = 28;
const startX = 64;
const screenY = 448;
const screenWidth = 240;
const screenHeight = 520;

const cards = stages
  .map((stage, index) => {
    const x = startX + index * (cardWidth + gap);
    const screenX = x + 16;
    const lineMarkup = stage.lines
      .map(
        (line, lineIndex) =>
          `<text x="${x + 24}" y="${1098 + lineIndex * 35}" class="body">${escapeXml(line)}</text>`,
      )
      .join("\n");
    return `
    <g>
      <rect x="${x}" y="420" width="${cardWidth}" height="800" rx="32" fill="${white}" stroke="#E3D8D0"/>
      <rect x="${screenX}" y="${screenY}" width="${screenWidth}" height="${screenHeight}" rx="26" fill="#211B18"/>
      <image x="${screenX}" y="${screenY}" width="${screenWidth}" height="${screenHeight}" preserveAspectRatio="xMidYMid slice" clip-path="url(#screen-${index})" href="${dataUri(screens[index], "image/png")}"/>
      <text x="${x + 24}" y="1019" class="eyebrow">${escapeXml(stage.eyebrow)}</text>
      <text x="${x + 24}" y="1062" class="card-title">${escapeXml(stage.title)}</text>
      ${lineMarkup}
    </g>`;
  })
  .join("\n");

const clipPaths = stages
  .map((_, index) => {
    const x = startX + index * (cardWidth + gap) + 16;
    return `<clipPath id="screen-${index}"><rect x="${x}" y="${screenY}" width="${screenWidth}" height="${screenHeight}" rx="26"/></clipPath>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1450" viewBox="0 0 1600 1450" role="img" aria-labelledby="title description">
  <title id="title">Lulu's garment intake</title>
  <desc id="description">Five real mobile interface stages show Lulu how a garment moves from source to private Wardrobe draft and optional Wear views.</desc>
  <defs>
    <style>
      @font-face { font-family: "Bodoni Moda"; src: url("${dataUri(bodoni, "font/woff2")}") format("woff2"); font-weight: 400 900; }
      @font-face { font-family: "Manrope"; src: url("${dataUri(manrope, "font/woff2")}") format("woff2"); font-weight: 200 800; }
      .display { font-family: "Bodoni Moda", Georgia, serif; fill: ${cocoa}; font-weight: 500; }
      .sans { font-family: "Manrope", Arial, sans-serif; fill: ${cocoa}; }
      .eyebrow { font-family: "Manrope", Arial, sans-serif; fill: ${coral}; font-size: 15px; font-weight: 800; letter-spacing: 2.5px; }
      .card-title { font-family: "Bodoni Moda", Georgia, serif; fill: ${cocoa}; font-size: 27px; font-weight: 600; }
      .body { font-family: "Manrope", Arial, sans-serif; fill: ${muted}; font-size: 18px; font-weight: 550; }
    </style>
    <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="160%">
      <feDropShadow dx="0" dy="18" stdDeviation="26" flood-color="#3A2E25" flood-opacity="0.10"/>
    </filter>
    ${clipPaths}
  </defs>
  <rect width="1600" height="1450" fill="${paper}"/>
  <image x="64" y="58" width="260" height="60" preserveAspectRatio="xMinYMid meet" href="${dataUri(wordmark, "image/svg+xml")}"/>
  <rect x="1280" y="62" width="256" height="48" rx="24" fill="#F0D8CE"/>
  <circle cx="1311" cy="86" r="7" fill="${coral}"/>
  <text x="1330" y="93" class="sans" font-size="15" font-weight="800" letter-spacing="2">LIVE · PRIVATE</text>
  <text x="64" y="252" class="display" font-size="104">Lulu's garment intake.</text>
  <text x="68" y="324" class="sans" font-size="29" font-weight="550" fill="${muted}">Photograph. Review. Save.</text>
  <line x1="64" y1="374" x2="1536" y2="374" stroke="#D9CBC1"/>
  <g filter="url(#soft-shadow)">${cards}</g>
  <rect x="64" y="1274" width="1472" height="112" rx="28" fill="${cocoa}"/>
  <circle cx="116" cy="1330" r="25" fill="${olive}"/>
  <path d="M104 1330l8 8 16-18" fill="none" stroke="${white}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="163" y="1323" font-family="Manrope, Arial, sans-serif" font-size="23" font-weight="750" fill="${white}">Drafts stay private until you publish.</text>
  <text x="163" y="1356" font-family="Manrope, Arial, sans-serif" font-size="17" font-weight="500" fill="#D7CCC5">Missing views remain marked Missing.</text>
  <text x="64" y="1422" class="sans" font-size="14" font-weight="750" letter-spacing="3.5" fill="${muted}">JUSTURBANWEARS · STUDIO · LULU</text>
</svg>\n`;

const svgPath = path.join(docsRoot, "just-urban-wears-lulu-garment-intake.svg");
const pngPath = path.join(docsRoot, "just-urban-wears-lulu-garment-intake.png");
const publicScreensRoot = path.join(root, "public", "studio", "guides", "lulu-garment-intake");

await writeFile(svgPath, svg, "utf8");
await sharp(Buffer.from(svg), { density: 144 })
  .resize({ width: 1600 })
  .flatten({ background: paper })
  .removeAlpha()
  .png({ compressionLevel: 9 })
  .withIccProfile("srgb")
  .toFile(pngPath);

await mkdir(publicScreensRoot, { recursive: true });
await Promise.all(["01-start.png", "02-source.png", "03-confirm.png", "04-wear.png", "05-saved.png"].map((name) =>
  copyFile(path.join(assetsRoot, name), path.join(publicScreensRoot, name)),
));

console.log(`Rendered ${path.relative(root, svgPath)} and ${path.relative(root, pngPath)}.`);
