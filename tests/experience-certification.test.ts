import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");
const buildGate = await readFile(new URL("../scripts/verify-experience-build.mjs", import.meta.url), "utf8");
const liveGate = await readFile(new URL("../scripts/smoke-experience.mjs", import.meta.url), "utf8");
const productionWorkflow = await readFile(new URL("../.github/workflows/production-smoke.yml", import.meta.url), "utf8");
const budgets = await readFile(new URL("../docs/performance/BUDGETS.md", import.meta.url), "utf8");

test("the release gate measures the compiled experience after build", () => {
  assert.match(packageJson, /"test:experience": "node scripts\/verify-experience-build\.mjs"/);
  assert.match(packageJson, /npm run build && npm run test:experience && npm run test:rendered/);
  assert.match(buildGate, /files: 5/);
  assert.match(buildGate, /largestRaw: 475 \* KiB/);
  assert.match(buildGate, /totalRaw: 525 \* KiB/);
  assert.match(buildGate, /largestGzip: 86 \* KiB/);
  assert.match(buildGate, /totalGzip: 98 \* KiB/);
  assert.match(buildGate, /transition\\s\*:\\s\*all/);
  assert.match(buildGate, /prefers-reduced-motion/);
  assert.match(buildGate, /forced-colors/);
  assert.match(buildGate, /prefers-reduced-transparency/);
});

test("production deployment certification checks real route weight and semantics", () => {
  assert.match(packageJson, /"smoke:experience": "node scripts\/smoke-experience\.mjs/);
  assert.match(productionWorkflow, /npm run smoke:production && npm run smoke:experience/);
  assert.match(liveGate, /maxBytes: 400 \* KiB/);
  assert.match(liveGate, /maxBytes: 2200 \* KiB/);
  assert.match(liveGate, /data-experience-surface="site"/);
  assert.match(liveGate, /data-experience-layer="island"/);
  assert.match(liveGate, /data-experience-focus="garment"/);
  assert.match(liveGate, /highPriorityImages\(html\) === 1/);
  assert.match(liveGate, /imagesHaveDimensions/);
});

test("the documented budgets distinguish enforced ceilings from field targets", () => {
  assert.match(budgets, /Enforced build ceilings/);
  assert.match(budgets, /475 KiB raw/);
  assert.match(budgets, /86 KiB gzip/);
  assert.match(budgets, /2,200 KiB/);
  assert.match(budgets, /These ceilings are regression guards, not performance claims/);
});
