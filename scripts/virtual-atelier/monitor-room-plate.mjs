import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import sharp from "sharp";

const REQUIRED_WIDTH = 1024;
const REQUIRED_HEIGHT = 1280;

const REGIONS = {
  icon: { x: 165, y: 45, width: 185, height: 225, maxMae: 0.1, minSsim: 0.9999 },
  vaseBranches: { x: 0, y: 180, width: 205, height: 780, maxMae: 0.5, minSsim: 0.999 },
  railGarments: { x: 728, y: 90, width: 296, height: 850, maxMae: 1.0, minSsim: 0.995 },
  ottoman: { x: 735, y: 720, width: 289, height: 400, maxMae: 1.0, minSsim: 0.995 },
  rug: { x: 615, y: 970, width: 409, height: 310, maxMae: 1.0, minSsim: 0.995 },
};

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    args[key] = value;
    index += 1;
  }
  for (const required of ["source", "candidate", "roundtrip", "report"]) {
    if (!args[required]) throw new Error(`Required argument missing: --${required}`);
  }
  return args;
}

async function loadRgb(path) {
  const image = sharp(path).removeAlpha().toColourspace("srgb");
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) throw new Error(`${path}: expected three RGB channels, received ${info.channels}`);
  return { path, data, width: info.width, height: info.height, channels: info.channels };
}

function indexOf(image, x, y, channel) {
  return (y * image.width + x) * image.channels + channel;
}

function regionSamples(image, region) {
  const samples = new Float64Array(region.width * region.height * 3);
  let cursor = 0;
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        samples[cursor] = image.data[indexOf(image, x, y, channel)];
        cursor += 1;
      }
    }
  }
  return samples;
}

function mean(values) {
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

function variance(values, average) {
  let total = 0;
  for (const value of values) {
    const delta = value - average;
    total += delta * delta;
  }
  return total / values.length;
}

function compareRegion(source, candidate, region) {
  const a = regionSamples(source, region);
  const b = regionSamples(candidate, region);
  let absolute = 0;
  let squared = 0;
  let covarianceTotal = 0;
  const meanA = mean(a);
  const meanB = mean(b);
  const varianceA = variance(a, meanA);
  const varianceB = variance(b, meanB);

  for (let index = 0; index < a.length; index += 1) {
    const delta = a[index] - b[index];
    absolute += Math.abs(delta);
    squared += delta * delta;
    covarianceTotal += (a[index] - meanA) * (b[index] - meanB);
  }

  const mae = absolute / a.length;
  const rmse = Math.sqrt(squared / a.length);
  const covariance = covarianceTotal / a.length;
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  const ssim = ((2 * meanA * meanB + c1) * (2 * covariance + c2)) /
    ((meanA ** 2 + meanB ** 2 + c1) * (varianceA + varianceB + c2));

  return { mae, rmse, ssim };
}

function compareWholeImage(source, candidate) {
  if (source.data.length !== candidate.data.length) throw new Error("Roundtrip and source buffers differ in length");
  let absolute = 0;
  let squared = 0;
  let maximum = 0;
  for (let index = 0; index < source.data.length; index += 1) {
    const delta = Math.abs(source.data[index] - candidate.data[index]);
    absolute += delta;
    squared += delta * delta;
    if (delta > maximum) maximum = delta;
  }
  return {
    mae: absolute / source.data.length,
    rmse: Math.sqrt(squared / source.data.length),
    maxAbsoluteDifference: maximum,
  };
}

function edgeDensity(image, region, threshold = 22) {
  let edges = 0;
  let comparisons = 0;
  const grayscale = (x, y) => {
    const red = image.data[indexOf(image, x, y, 0)];
    const green = image.data[indexOf(image, x, y, 1)];
    const blue = image.data[indexOf(image, x, y, 2)];
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };

  for (let y = region.y + 1; y < region.y + region.height - 1; y += 1) {
    for (let x = region.x + 1; x < region.x + region.width - 1; x += 1) {
      const horizontal = Math.abs(grayscale(x + 1, y) - grayscale(x - 1, y));
      const vertical = Math.abs(grayscale(x, y + 1) - grayscale(x, y - 1));
      if (horizontal + vertical > threshold) edges += 1;
      comparisons += 1;
    }
  }
  return edges / comparisons;
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function main() {
  const args = parseArgs(process.argv);
  const [source, candidate, roundtrip] = await Promise.all([
    loadRgb(args.source),
    loadRgb(args.candidate),
    loadRgb(args.roundtrip),
  ]);

  const dimensionsPass = candidate.width === REQUIRED_WIDTH && candidate.height === REQUIRED_HEIGHT;
  if (source.width !== REQUIRED_WIDTH || source.height !== REQUIRED_HEIGHT) {
    throw new Error(`Source authority must be ${REQUIRED_WIDTH}x${REQUIRED_HEIGHT}`);
  }
  if (roundtrip.width !== source.width || roundtrip.height !== source.height) {
    throw new Error("Roundtrip dimensions must equal source authority dimensions");
  }

  const protectedRegions = {};
  for (const [name, region] of Object.entries(REGIONS)) {
    const metrics = compareRegion(source, candidate, region);
    protectedRegions[name] = {
      ...metrics,
      thresholds: { maxMae: region.maxMae, minSsim: region.minSsim },
      pass: metrics.mae <= region.maxMae && metrics.ssim >= region.minSsim,
    };
  }

  const roundtripMetrics = compareWholeImage(source, roundtrip);
  const wallEdgeDensity = edgeDensity(candidate, { x: 350, y: 50, width: 350, height: 800 });
  const floorEdgeDensity = edgeDensity(candidate, { x: 300, y: 900, width: 310, height: 380 });
  const edgePass = wallEdgeDensity <= 0.003 && floorEdgeDensity <= 0.003;
  const roundtripPass = roundtripMetrics.mae < 2;
  const protectedPass = Object.values(protectedRegions).every((region) => region.pass);
  const pass = dimensionsPass && protectedPass && roundtripPass && edgePass;

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: { path: args.source, sha256: await sha256(args.source) },
    candidate: {
      path: args.candidate,
      sha256: await sha256(args.candidate),
      dimensions: { width: candidate.width, height: candidate.height },
    },
    roundtrip: { path: args.roundtrip, sha256: await sha256(args.roundtrip), ...roundtripMetrics, pass: roundtripPass },
    requiredDimensions: { width: REQUIRED_WIDTH, height: REQUIRED_HEIGHT, pass: dimensionsPass },
    protectedRegions,
    emptyCentre: {
      wallEdgeDensity,
      floorEdgeDensity,
      maxEdgeDensity: 0.003,
      pass: edgePass,
    },
    status: pass ? "MONITOR_PASS" : "MONITOR_FAIL",
  };

  await writeFile(args.report, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!pass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
