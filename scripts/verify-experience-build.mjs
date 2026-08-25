import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { gzipSync } from "node:zlib";

const KiB = 1024;
const budgets = {
  css: {
    files: 5,
    largestRaw: 480 * KiB,
    largestGzip: 86 * KiB,
    totalRaw: 560 * KiB,
    totalGzip: 100 * KiB,
  },
  fonts: {
    files: 10,
    largestRaw: 30 * KiB,
    totalRaw: 170 * KiB,
  },
};

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function walk(root) {
  if (!(await exists(root))) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  }));
  return nested.flat();
}

function uniqueByBasename(files) {
  const unique = new Map();
  for (const file of files) unique.set(path.basename(file), file);
  return [...unique.values()];
}

function formatBytes(value) {
  return `${(value / KiB).toFixed(2)} KiB`;
}

function assertBudget(failures, label, actual, maximum) {
  const passed = actual <= maximum;
  console.log(`${passed ? "✓" : "✗"} ${label}: ${formatBytes(actual)} / ${formatBytes(maximum)}`);
  if (!passed) failures.push(`${label} exceeded (${formatBytes(actual)} > ${formatBytes(maximum)})`);
}

const artifactFiles = [
  ...(await walk("dist")),
  ...(await walk("node_modules/.nitro/vite/services/rsc/_next/static")),
];
if (!artifactFiles.length) {
  console.error("No production build output found. Run the production build before experience certification.");
  process.exit(1);
}

const cssFiles = uniqueByBasename(
  artifactFiles.filter((file) => file.endsWith(".css") && file.includes(`${path.sep}_next${path.sep}static${path.sep}css${path.sep}`)),
);
const fontFiles = uniqueByBasename(
  artifactFiles.filter((file) => file.endsWith(".woff2") && file.includes(`${path.sep}_next${path.sep}static${path.sep}media${path.sep}`)),
);

const failures = [];
if (!cssFiles.length) failures.push("compiled CSS assets were not found");
if (cssFiles.length > budgets.css.files) failures.push(`compiled CSS file count exceeded (${cssFiles.length} > ${budgets.css.files})`);
if (fontFiles.length > budgets.fonts.files) failures.push(`font file count exceeded (${fontFiles.length} > ${budgets.fonts.files})`);

const cssMetrics = await Promise.all(cssFiles.map(async (file) => {
  const content = await readFile(file);
  return { file, raw: content.byteLength, gzip: gzipSync(content).byteLength };
}));
const fontMetrics = await Promise.all(fontFiles.map(async (file) => ({
  file,
  raw: (await stat(file)).size,
})));

const largestCssRaw = Math.max(0, ...cssMetrics.map((metric) => metric.raw));
const largestCssGzip = Math.max(0, ...cssMetrics.map((metric) => metric.gzip));
const totalCssRaw = cssMetrics.reduce((sum, metric) => sum + metric.raw, 0);
const totalCssGzip = cssMetrics.reduce((sum, metric) => sum + metric.gzip, 0);
const largestFontRaw = Math.max(0, ...fontMetrics.map((metric) => metric.raw));
const totalFontRaw = fontMetrics.reduce((sum, metric) => sum + metric.raw, 0);

console.log(`Experience build assets: ${cssFiles.length} CSS · ${fontFiles.length} fonts`);
assertBudget(failures, "largest CSS raw", largestCssRaw, budgets.css.largestRaw);
assertBudget(failures, "largest CSS gzip", largestCssGzip, budgets.css.largestGzip);
assertBudget(failures, "total CSS raw", totalCssRaw, budgets.css.totalRaw);
assertBudget(failures, "total CSS gzip", totalCssGzip, budgets.css.totalGzip);
assertBudget(failures, "largest font", largestFontRaw, budgets.fonts.largestRaw);
assertBudget(failures, "total fonts", totalFontRaw, budgets.fonts.totalRaw);

for (const metric of cssMetrics.sort((a, b) => b.raw - a.raw)) {
  console.log(`  ${path.basename(metric.file)} · ${formatBytes(metric.raw)} raw · ${formatBytes(metric.gzip)} gzip`);
}

const sourceCssFiles = [
  ...(await walk("app")),
  ...(await walk("components")),
].filter((file) => file.endsWith(".css"));
for (const file of sourceCssFiles) {
  const source = await readFile(file, "utf8");
  if (/transition\s*:\s*all\b/i.test(source)) {
    failures.push(`${file} uses transition: all`);
  }
}

const authoredCss = (await Promise.all(
  sourceCssFiles.map((file) => readFile(file, "utf8")),
)).join("\n");
for (const [label, expression] of [
  ["reduced motion", /prefers-reduced-motion:\s*reduce/],
  ["motion opt-in", /prefers-reduced-motion:\s*no-preference/],
  ["forced colours", /forced-colors:\s*active/],
  ["reduced transparency", /prefers-reduced-transparency:\s*reduce/],
  ["Studio resolve tempo", /--juw-sheet-motion:\s*var\(--juw-motion-resolve\)/],
]) {
  if (!expression.test(authoredCss)) failures.push(`authored CSS is missing ${label}`);
}

if (failures.length) {
  console.error(`\nExperience build certification failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("\nExperience build certification passed.");
