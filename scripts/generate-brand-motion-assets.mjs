import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require(process.env.JUW_SHARP_MODULE || "sharp");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const masterPath = path.join(root, "public", "brand", "icon-master-1024.png");
const outputRoot = path.join(root, "public", "brand", "motion");
const master = await readFile(masterPath);
const { data, info } = await sharp(master).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const pixelCount = width * height;

if (width !== 1024 || height !== 1024 || info.channels !== 4) {
  throw new Error("Wardrobe motion requires the canonical 1024x1024 RGBA master.");
}

function isCopperSeed(offset) {
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const alpha = data[offset + 3];
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  return alpha > 32 && luminance > 112 && red > green * 1.18 && green > blue * 1.12;
}

const seed = new Uint8Array(pixelCount);
for (let index = 0; index < pixelCount; index += 1) {
  seed[index] = isCopperSeed(index * 4) ? 1 : 0;
}

const visited = new Uint8Array(pixelCount);
const components = [];
const neighbours = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

for (let start = 0; start < pixelCount; start += 1) {
  if (!seed[start] || visited[start]) continue;
  const queue = [start];
  visited[start] = 1;
  const pixels = [];
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let sumX = 0;
  let sumY = 0;

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % width;
    const y = Math.floor(index / width);
    pixels.push(index);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    sumX += x;
    sumY += y;

    for (const [dx, dy] of neighbours) {
      const nextX = x + dx;
      const nextY = y + dy;
      if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
      const next = nextY * width + nextX;
      if (!seed[next] || visited[next]) continue;
      visited[next] = 1;
      queue.push(next);
    }
  }

  if (pixels.length > 200) {
    components.push({
      pixels,
      bounds: { left: minX, top: minY, right: maxX, bottom: maxY },
      centroid: { x: sumX / pixels.length, y: sumY / pixels.length },
    });
  }
}

const artwork = components.sort((left, right) => right.pixels.length - left.pixels.length).slice(0, 4);
if (artwork.length !== 4) throw new Error(`Expected four copper identity components; found ${artwork.length}.`);

const upper = artwork.filter((component) => component.centroid.y < height * 0.58).sort((a, b) => a.centroid.x - b.centroid.x);
const lower = artwork.filter((component) => component.centroid.y >= height * 0.58).sort((a, b) => a.centroid.x - b.centroid.x);
if (upper.length !== 2 || lower.length !== 2) {
  throw new Error("Could not resolve the two wardrobe forms and two Double-L foundations from the master.");
}

const named = [
  ["left-door", upper[0]],
  ["right-door", upper[1]],
  ["left-l", lower[0]],
  ["right-l", lower[1]],
];

// A multi-source expansion keeps each component's original antialiasing and shadow
// pixels with that component. The masks remain a lossless partition of the master.
const owner = new Int8Array(pixelCount).fill(-1);
const distance = new Int16Array(pixelCount).fill(-1);
const queue = new Int32Array(pixelCount);
let queueLength = 0;

named.forEach(([, component], componentIndex) => {
  for (const index of component.pixels) {
    if (distance[index] === 0) continue;
    owner[index] = componentIndex;
    distance[index] = 0;
    queue[queueLength] = index;
    queueLength += 1;
  }
});

const shadowReach = 22;
for (let cursor = 0; cursor < queueLength; cursor += 1) {
  const index = queue[cursor];
  const currentDistance = distance[index];
  if (currentDistance >= shadowReach) continue;
  const x = index % width;
  const y = Math.floor(index / width);
  const nextIndexes = [];
  if (x > 0) nextIndexes.push(index - 1);
  if (x < width - 1) nextIndexes.push(index + 1);
  if (y > 0) nextIndexes.push(index - width);
  if (y < height - 1) nextIndexes.push(index + width);
  for (const next of nextIndexes) {
    if (distance[next] !== -1) continue;
    distance[next] = currentDistance + 1;
    owner[next] = owner[index];
    queue[queueLength] = next;
    queueLength += 1;
  }
}

function alphaMask(predicate) {
  const rgba = Buffer.alloc(pixelCount * 4, 255);
  for (let index = 0; index < pixelCount; index += 1) rgba[index * 4 + 3] = predicate(index) ? 255 : 0;
  return sharp(rgba, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}

const partitionMasks = await Promise.all([
  alphaMask((index) => owner[index] === -1),
  ...named.map(([,], componentIndex) => alphaMask((index) => owner[index] === componentIndex)),
]);

const silhouetteAlpha = new Uint8Array(pixelCount);
const silhouetteShadowInset = 8;
for (let y = 0; y < height; y += 1) {
  let leftEdge = -1;
  let rightEdge = width;
  for (let x = 0; x < width; x += 1) {
    const index = y * width + x;
    const currentOwner = owner[index];
    if (distance[index] > silhouetteShadowInset) continue;
    if (currentOwner === 0) leftEdge = Math.max(leftEdge, x);
    if (currentOwner === 1) rightEdge = Math.min(rightEdge, x);
  }
  if (leftEdge >= 0 && rightEdge < width && rightEdge > leftEdge) {
    for (let x = leftEdge + 1; x < rightEdge; x += 1) silhouetteAlpha[y * width + x] = 255;
  }
}

const silhouette = await alphaMask((index) => silhouetteAlpha[index] === 255);
const files = [
  ["base-mask.png", partitionMasks[0]],
  ...named.map(([name], index) => [`${name}-mask.png`, partitionMasks[index + 1]]),
  ["silhouette-mask.png", silhouette],
];

await mkdir(outputRoot, { recursive: true });
await Promise.all(files.map(([filename, buffer]) => writeFile(path.join(outputRoot, filename), buffer)));

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const manifest = {
  schemaVersion: 1,
  source: "/brand/icon-master-1024.png",
  sourceSha256: sha256(master),
  dimensions: [width, height],
  strategy: "lossless-nearest-component-partition-from-canonical-master",
  shadowReachPx: shadowReach,
  silhouetteShadowInsetPx: silhouetteShadowInset,
  components: Object.fromEntries(named.map(([name, component], index) => [name, {
    mask: `/brand/motion/${name}-mask.png`,
    maskSha256: sha256(partitionMasks[index + 1]),
    bounds: component.bounds,
    centroid: [Number(component.centroid.x.toFixed(2)), Number(component.centroid.y.toFixed(2))],
  }])),
  base: { mask: "/brand/motion/base-mask.png", maskSha256: sha256(partitionMasks[0]) },
  silhouette: { mask: "/brand/motion/silhouette-mask.png", maskSha256: sha256(silhouette) },
};

await writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const logoSourcePath = path.join(root, "design", "identity-2026", "justurban-logo-source.png");
const logoSource = await readFile(logoSourcePath);
const { data: logoSourceData, info: logoSourceInfo } = await sharp(logoSource).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const logoScanLimit = Math.floor(logoSourceInfo.height * 0.55);
const logoBounds = { left: logoSourceInfo.width, top: logoSourceInfo.height, right: -1, bottom: -1 };

for (let y = 0; y < logoScanLimit; y += 1) {
  for (let x = 0; x < logoSourceInfo.width; x += 1) {
    if (logoSourceData[(y * logoSourceInfo.width + x) * 4 + 3] === 0) continue;
    logoBounds.left = Math.min(logoBounds.left, x);
    logoBounds.top = Math.min(logoBounds.top, y);
    logoBounds.right = Math.max(logoBounds.right, x);
    logoBounds.bottom = Math.max(logoBounds.bottom, y);
  }
}

if (logoBounds.right < logoBounds.left || logoBounds.bottom < logoBounds.top) {
  throw new Error("Could not resolve the wardrobe mark inside the approved centered logo.");
}

const logoWidth = logoBounds.right - logoBounds.left + 1;
const logoHeight = logoBounds.bottom - logoBounds.top + 1;
const logoMaster = await sharp(logoSource).extract({
  left: logoBounds.left,
  top: logoBounds.top,
  width: logoWidth,
  height: logoHeight,
}).png({ compressionLevel: 9 }).toBuffer();
const { data: logoData, info: logoInfo } = await sharp(logoMaster).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const logoPixelCount = logoInfo.width * logoInfo.height;
const logoMiddle = logoInfo.width / 2;

function logoAlphaMask(predicate) {
  const rgba = Buffer.alloc(logoPixelCount * 4, 255);
  for (let index = 0; index < logoPixelCount; index += 1) rgba[index * 4 + 3] = predicate(index) ? 255 : 0;
  return sharp(rgba, { raw: { width: logoInfo.width, height: logoInfo.height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}

const logoOwnership = new Int8Array(logoPixelCount).fill(-1);
for (let index = 0; index < logoPixelCount; index += 1) {
  if (logoData[index * 4 + 3] === 0) continue;
  logoOwnership[index] = index % logoInfo.width < logoMiddle ? 0 : 1;
}

const logoSilhouetteAlpha = new Uint8Array(logoPixelCount);
for (let y = 0; y < logoInfo.height; y += 1) {
  let leftEdge = -1;
  let rightEdge = logoInfo.width;
  for (let x = 0; x < logoInfo.width; x += 1) {
    const index = y * logoInfo.width + x;
    if (logoData[index * 4 + 3] === 0) continue;
    if (x < logoMiddle) leftEdge = Math.max(leftEdge, x);
    if (x >= logoMiddle) rightEdge = Math.min(rightEdge, x);
  }
  if (leftEdge >= 0 && rightEdge < logoInfo.width && rightEdge > leftEdge) {
    for (let x = leftEdge + 1; x < rightEdge; x += 1) logoSilhouetteAlpha[y * logoInfo.width + x] = 255;
  }
}

const logoMasks = {
  base: await logoAlphaMask((index) => logoOwnership[index] === -1),
  "left-door": await logoAlphaMask((index) => logoOwnership[index] === 0),
  "right-door": await logoAlphaMask((index) => logoOwnership[index] === 1),
  "left-l": await logoAlphaMask(() => false),
  "right-l": await logoAlphaMask(() => false),
  silhouette: await logoAlphaMask((index) => logoSilhouetteAlpha[index] === 255),
};

const logoOutputRoot = path.join(outputRoot, "logo");
await mkdir(logoOutputRoot, { recursive: true });
await Promise.all([
  writeFile(path.join(logoOutputRoot, "master.png"), logoMaster),
  ...Object.entries(logoMasks).map(([name, buffer]) => writeFile(path.join(logoOutputRoot, `${name}-mask.png`), buffer)),
]);

const logoManifest = {
  schemaVersion: 1,
  source: "design/identity-2026/justurban-logo-source.png",
  sourceSha256: sha256(logoSource),
  cropBounds: logoBounds,
  dimensions: [logoInfo.width, logoInfo.height],
  strategy: "exact-alpha-half-partition-from-approved-centered-logo",
  master: { file: "/brand/motion/logo/master.png", sha256: sha256(logoMaster) },
  masks: Object.fromEntries(Object.entries(logoMasks).map(([name, buffer]) => [name, {
    file: `/brand/motion/logo/${name}-mask.png`,
    sha256: sha256(buffer),
  }])),
};

await writeFile(path.join(logoOutputRoot, "manifest.json"), `${JSON.stringify(logoManifest, null, 2)}\n`, "utf8");
console.log(`Generated exact-master Wardrobe Motion masks from ${manifest.sourceSha256} and centered logo ${logoManifest.sourceSha256}.`);
