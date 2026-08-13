import { createRequire } from "node:module";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require(process.env.JUW_SHARP_MODULE || "sharp");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const designRoot = path.join(root, "design", "identity-2026");
const exportsRoot = path.join(designRoot, "exports");
const publicRoot = path.join(root, "public");
const publicBrandRoot = path.join(publicRoot, "brand");

const iconSourcePath = path.join(designRoot, "justurban-seal-icon-source.png");
const flatIconSourcePath = path.join(designRoot, "justurban-icon-source.png");
const logoSourcePath = path.join(designRoot, "justurban-logo-source.png");
const wordmarkPath = path.join(designRoot, "justurban-wordmark.svg");

const flatIconSourceBounds = { left: 75, top: 157, width: 873, height: 1216 };
const warmPaper = "#F4EEE6";

await Promise.all([mkdir(exportsRoot, { recursive: true }), mkdir(publicBrandRoot, { recursive: true })]);

const [iconSource, flatIconSource, logoSource, wordmark] = await Promise.all([
  readFile(iconSourcePath),
  readFile(flatIconSourcePath),
  readFile(logoSourcePath),
  readFile(wordmarkPath),
]);

function dataUri(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function svgDocument({ title, description, viewBox, body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-labelledby="title description">
  <title id="title">${title}</title>
  <desc id="description">${description}</desc>
${body}
</svg>
`;
}

function embeddedSource({ x = 0, y = 0, width = 1254, height = 1254, href = dataUri(iconSource, "image/png") } = {}) {
  return `  <image x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" href="${href}"/>`;
}

function nestedIcon({ x, y, width, height }) {
  return `  <svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="0 0 1254 1254" overflow="visible">
${embeddedSource()}
  </svg>`;
}

async function writeText(relativePath, text) {
  await writeFile(path.join(root, relativePath), text, "utf8");
}

async function pngWithProfile(pipeline) {
  return pipeline.png({ compressionLevel: 9 }).withIccProfile("srgb").toBuffer();
}

async function iconLayer(source, size, sizeRatio) {
  const boxSize = Math.round(size * sizeRatio);
  return sharp(source)
    .resize({ width: boxSize, height: boxSize, fit: "inside" })
    .png()
    .toBuffer();
}

async function transparentIconCanvas(size, sizeRatio = 1) {
  const layer = await iconLayer(iconSource, size, sizeRatio);
  const metadata = await sharp(layer).metadata();
  return pngWithProfile(
    sharp({
      create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite([
      {
        input: layer,
        left: Math.round((size - metadata.width) / 2),
        top: Math.round((size - metadata.height) / 2),
      },
    ]),
  );
}

async function transparentFlatIconCanvas(size, heightRatio = 0.9) {
  const boxHeight = Math.round(size * heightRatio);
  const boxWidth = Math.round(boxHeight * (flatIconSourceBounds.width / flatIconSourceBounds.height));
  const layer = await sharp(flatIconSource)
    .extract(flatIconSourceBounds)
    .resize({ width: boxWidth, height: boxHeight, fit: "inside" })
    .png()
    .toBuffer();
  const metadata = await sharp(layer).metadata();
  return pngWithProfile(
    sharp({
      create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite([
      {
        input: layer,
        left: Math.round((size - metadata.width) / 2),
        top: Math.round((size - metadata.height) / 2),
      },
    ]),
  );
}

function parseHex(value) {
  const hex = value.replace("#", "");
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

async function recolorAlpha(png, color) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ink = parseHex(color);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = ink.r;
    data[offset + 1] = ink.g;
    data[offset + 2] = ink.b;
  }
  return pngWithProfile(sharp(data, { raw: info }));
}

function rasterSvg({ title, description, png, size }) {
  return svgDocument({
    title,
    description,
    viewBox: `0 0 ${size} ${size}`,
    body: `  <image width="${size}" height="${size}" href="${dataUri(png, "image/png")}"/>`,
  });
}

function makeIco(entries) {
  const headerSize = 6 + entries.length * 16;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = headerSize;

  entries.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header[entry] = size === 256 ? 0 : size;
    header[entry + 1] = size === 256 ? 0 : size;
    header[entry + 2] = 0;
    header[entry + 3] = 0;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });

  return Buffer.concat([header, ...entries.map(({ png }) => png)]);
}

const markSvg = svgDocument({
  title: "JustUrbanWears cocoa seal icon",
  description: "The owner-selected cocoa seal and copper figure icon with a transparent exterior.",
  viewBox: "0 0 1254 1254",
  body: embeddedSource(),
});

const microSvg = svgDocument({
  title: "JustUrbanWears cocoa seal micro icon",
  description: "The owner-selected cocoa seal and copper figure icon used directly for compact display.",
  viewBox: "0 0 1254 1254",
  body: embeddedSource(),
});

const faviconSvg = svgDocument({
  title: "JustUrbanWears cocoa seal favicon",
  description: "The owner-selected cocoa seal and copper figure icon on a transparent exterior.",
  viewBox: "0 0 64 64",
  body: nestedIcon({ x: 1, y: 1, width: 62, height: 62 }),
});

const appIconSvg = svgDocument({
  title: "JustUrbanWears app icon",
  description: "The owner-selected cocoa seal and copper figure icon without an added tile or border.",
  viewBox: "0 0 512 512",
  body: nestedIcon({ x: 0, y: 0, width: 512, height: 512 }),
});

const appForegroundSvg = svgDocument({
  title: "JustUrbanWears adaptive app foreground",
  description: "The owner-selected cocoa seal and copper figure icon centered inside the adaptive safe area.",
  viewBox: "0 0 512 512",
  body: nestedIcon({ x: 76, y: 76, width: 360, height: 360 }),
});

const appBackgroundSvg = svgDocument({
  title: "JustUrbanWears adaptive app background",
  description: "The warm-paper background layer for the JustUrbanWears adaptive app icon.",
  viewBox: "0 0 512 512",
  body: `  <rect width="512" height="512" fill="${warmPaper}"/>`,
});

const logoSvg = svgDocument({
  title: "JustUrbanWears centered logo",
  description: "The exact owner-supplied centered logo with wardrobe icon, justurban, wears, and BY LULU.",
  viewBox: "0 0 1313 1392",
  body: `  <image width="1313" height="1392" href="${dataUri(logoSource, "image/png")}"/>`,
});

await Promise.all([
  writeText("design/identity-2026/justurban-mark.svg", markSvg),
  writeText("design/identity-2026/justurban-micro.svg", microSvg),
  writeText("design/identity-2026/justurban-favicon.svg", faviconSvg),
  writeText("design/identity-2026/justurban-app-icon.svg", appIconSvg),
  writeText("design/identity-2026/justurban-app-foreground.svg", appForegroundSvg),
  writeText("design/identity-2026/justurban-app-background.svg", appBackgroundSvg),
  writeText("design/identity-2026/justurban-logo.svg", logoSvg),
  writeText("public/brand/icon.svg", appIconSvg),
  writeText("public/brand/logo.svg", logoSvg),
  writeText("public/favicon.svg", faviconSvg),
  copyFile(logoSourcePath, path.join(publicRoot, "logo.png")),
  copyFile(wordmarkPath, path.join(publicBrandRoot, "wordmark.svg")),
  copyFile(path.join(exportsRoot, "wordmark-white.svg"), path.join(publicBrandRoot, "wordmark-white.svg")),
  copyFile(path.join(exportsRoot, "wordmark-cocoa-1620.png"), path.join(publicRoot, "wordmark.png")),
]);

const [app1024, app512, app192, apple180, maskable512, foreground512, flatTransparent1024] = await Promise.all([
  transparentIconCanvas(1024),
  transparentIconCanvas(512),
  transparentIconCanvas(192),
  transparentIconCanvas(180),
  transparentIconCanvas(512, 0.7),
  transparentIconCanvas(512, 0.7),
  transparentFlatIconCanvas(1024, 0.9),
]);

const [markCocoa1024, markBlack1024, markWhite1024, microCocoa512, monochrome512] = await Promise.all([
  recolorAlpha(flatTransparent1024, "#3A2E25"),
  recolorAlpha(flatTransparent1024, "#000000"),
  recolorAlpha(flatTransparent1024, "#FFFFFF"),
  transparentFlatIconCanvas(512, 0.9).then((png) => recolorAlpha(png, "#3A2E25")),
  transparentFlatIconCanvas(512, 0.7).then((png) => recolorAlpha(png, "#000000")),
]);

const markCoralSvg = rasterSvg({
  title: "JustUrbanWears owner-supplied icon",
  description: "The owner-supplied icon on a transparent square canvas.",
  png: flatTransparent1024,
  size: 1024,
});
const markCocoaSvg = rasterSvg({ title: "JustUrbanWears cocoa icon", description: "Cocoa one-colour icon.", png: markCocoa1024, size: 1024 });
const markBlackSvg = rasterSvg({ title: "JustUrbanWears black icon", description: "Black one-colour icon.", png: markBlack1024, size: 1024 });
const markWhiteSvg = rasterSvg({ title: "JustUrbanWears white icon", description: "White one-colour icon.", png: markWhite1024, size: 1024 });
const monochromeSvg = rasterSvg({
  title: "JustUrbanWears monochrome adaptive icon",
  description: "Black one-colour adaptive icon foreground.",
  png: monochrome512,
  size: 512,
});

const faviconEntries = await Promise.all(
  [16, 32, 48].map(async (size) => ({ size, png: await transparentIconCanvas(size, 0.94) })),
);
const faviconIco = makeIco(faviconEntries);

await Promise.all([
  writeText("design/identity-2026/justurban-app-monochrome.svg", monochromeSvg),
  writeText("design/identity-2026/exports/mark-coral.svg", markCoralSvg),
  writeText("design/identity-2026/exports/mark-cocoa.svg", markCocoaSvg),
  writeText("design/identity-2026/exports/mark-black.svg", markBlackSvg),
  writeText("design/identity-2026/exports/mark-white.svg", markWhiteSvg),
  writeFile(path.join(exportsRoot, "app-icon-1024.png"), app1024),
  writeFile(path.join(exportsRoot, "app-icon-512.png"), app512),
  writeFile(path.join(exportsRoot, "app-icon-192.png"), app192),
  writeFile(path.join(exportsRoot, "apple-touch-icon-180.png"), apple180),
  writeFile(path.join(exportsRoot, "app-icon-maskable-512.png"), maskable512),
  writeFile(path.join(exportsRoot, "app-foreground-512.png"), foreground512),
  pngWithProfile(sharp({ create: { width: 512, height: 512, channels: 3, background: warmPaper } })).then((png) =>
    writeFile(path.join(exportsRoot, "app-background-512.png"), png),
  ),
  writeFile(path.join(exportsRoot, "app-monochrome-512.png"), monochrome512),
  writeFile(path.join(exportsRoot, "mark-coral-1024.png"), flatTransparent1024),
  writeFile(path.join(exportsRoot, "mark-cocoa-1024.png"), markCocoa1024),
  writeFile(path.join(exportsRoot, "mark-black-1024.png"), markBlack1024),
  writeFile(path.join(exportsRoot, "mark-reverse-1024.png"), markWhite1024),
  writeFile(path.join(exportsRoot, "micro-cocoa-512.png"), microCocoa512),
  ...faviconEntries.map(({ size, png }) => writeFile(path.join(exportsRoot, `favicon-${size}.png`), png)),
  writeFile(path.join(exportsRoot, "favicon.ico"), faviconIco),
  writeFile(path.join(publicRoot, "icon.png"), app1024),
  writeFile(path.join(publicBrandRoot, "icon-master-1024.png"), app1024),
  writeFile(path.join(publicBrandRoot, "icon-512.png"), app512),
  writeFile(path.join(publicBrandRoot, "icon-192.png"), app192),
  writeFile(path.join(publicBrandRoot, "icon-maskable-512.png"), maskable512),
  writeFile(path.join(publicBrandRoot, "apple-touch-icon.png"), apple180),
  writeFile(path.join(publicRoot, "favicon.ico"), faviconIco),
]);

const orderFlowFiles = [
  "docs/order-flows/just-urban-wears-customer-order-flow.svg",
  "docs/order-flows/just-urban-wears-lulu-order-flow.svg",
];

await Promise.all(
  orderFlowFiles.map(async (relativePath) => {
    const svgPath = path.join(root, relativePath);
    const source = await readFile(svgPath, "utf8");
    const embedded = source.replace(
      /(<image\b[^>]*\bdata-identity-source="owner-icon"[^>]*\bhref=")[^"]*("[^>]*\/>)/g,
      `$1${dataUri(flatIconSource, "image/png")}$2`,
    );
    if (embedded === source && !source.includes(dataUri(flatIconSource, "image/png"))) {
      throw new Error(`No owner-icon integration points found in ${relativePath}`);
    }
    await writeFile(svgPath, embedded, "utf8");
    const rendered = await pngWithProfile(
      sharp(Buffer.from(embedded), { density: 72 })
        .flatten({ background: "#ffffff" })
        .removeAlpha(),
    );
    await writeFile(svgPath.replace(/\.svg$/, ".png"), rendered);
  }),
);

const previewSvg = svgDocument({
  title: "JustUrbanWears identity preview",
  description: "The approved supplied logo, unchanged outlined wordmark, and owner-selected cocoa seal icon.",
  viewBox: "0 0 1800 1200",
  body: `  <rect width="1800" height="1200" fill="#F4EEE6"/>
  <text x="80" y="80" fill="#3A2E25" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="8">JUSTURBANWEARS / IDENTITY 2026.3</text>
  <rect x="80" y="120" width="620" height="920" rx="36" fill="#FFFFFF"/>
  <text x="120" y="178" fill="#9A4F39" font-family="Arial, sans-serif" font-size="17" font-weight="700" letter-spacing="5">PUBLIC LOGO</text>
  <image x="160" y="230" width="460" height="720" preserveAspectRatio="xMidYMid meet" href="${dataUri(logoSource, "image/png")}"/>
  <rect x="740" y="120" width="980" height="420" rx="36" fill="#FFFFFF"/>
  <text x="780" y="178" fill="#9A4F39" font-family="Arial, sans-serif" font-size="17" font-weight="700" letter-spacing="5">NAVIGATION WORDMARK / UNCHANGED</text>
  <image x="820" y="255" width="820" height="185" preserveAspectRatio="xMidYMid meet" href="${dataUri(wordmark, "image/svg+xml")}"/>
  <rect x="740" y="580" width="470" height="460" rx="36" fill="#FFFFFF"/>
  <text x="780" y="638" fill="#9A4F39" font-family="Arial, sans-serif" font-size="17" font-weight="700" letter-spacing="5">ICON</text>
  <image x="845" y="680" width="260" height="260" preserveAspectRatio="xMidYMid meet" href="${dataUri(iconSource, "image/png")}"/>
  <rect x="1250" y="580" width="470" height="460" rx="36" fill="#3A2E25"/>
  <text x="1290" y="638" fill="#F4EEE6" font-family="Arial, sans-serif" font-size="17" font-weight="700" letter-spacing="5">APP / FAVICON</text>
  <image x="1355" y="700" width="260" height="260" href="${dataUri(app512, "image/png")}"/>
  <text x="80" y="1135" fill="#75655A" font-family="Arial, sans-serif" font-size="17">Owner-supplied pixels preserved · no typography recreation · compact derivatives centralized</text>`,
});

await sharp(Buffer.from(previewSvg), { density: 144 })
  .resize({ width: 1800 })
  .png({ compressionLevel: 9 })
  .withIccProfile("srgb")
  .toFile(path.join(designRoot, "justurban-identity-preview.png"));

console.log("Generated JustUrbanWears logo, wordmark, icon, favicon, and platform derivatives.");
