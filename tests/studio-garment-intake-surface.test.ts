import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const sheet = readFileSync(`${root}/components/studio/garment-intake/garment-intake-sheet.tsx`, "utf8");
const client = readFileSync(`${root}/components/studio/garment-intake/engine-client.ts`, "utf8");
const workbench = readFileSync(`${root}/components/studio/wardrobe-workbench.tsx`, "utf8");
const wardrobePage = readFileSync(`${root}/app/(studio)/studio/wardrobe/page.tsx`, "utf8");
const localIntake = readFileSync(`${root}/components/studio/garment-intake/local-garment-intake-dialog.tsx`, "utf8");
const css = readFileSync(`${root}/app/foundation.css`, "utf8");

test("garment intake is one progressive mounted sheet with no select controls", () => {
  for (const step of ["start", "source", "build", "confirm", "edit", "wear", "receipt"]) {
    assert.match(sheet, new RegExp(`"${step}"`));
  }
  assert.match(sheet, /Camera/);
  assert.match(sheet, /Photos/);
  assert.match(sheet, /Describe/);
  assert.match(sheet, /Keep/);
  assert.match(sheet, /Try again/);
  assert.match(sheet, /Expand garment preview/);
  assert.match(sheet, /Private · not for sale/);
  assert.match(sheet, /studio-receipt-preview/);
  assert.match(sheet, /window\.addEventListener\("keydown", closePreview, \{ capture: true \}\)/);
  assert.match(sheet, /event\.key === "Tab"/);
  assert.match(sheet, /aria-modal="true"/);
  assert.doesNotMatch(sheet, /<select/);
  assert.doesNotMatch(sheet, /studio\.createGarment/);
  assert.match(workbench, /<GarmentIntakeSheet/);
  assert.doesNotMatch(workbench, /function GarmentIntakeDialog/);
});

test("hosts without trusted engine auth retain the existing local intake", () => {
  assert.match(wardrobePage, /STUDIO_AI_ENGINE_AUTH_MODE === "openai-sites"/);
  assert.match(workbench, /engineEnabled \? \(/);
  assert.match(workbench, /<LocalGarmentIntakeDialog/);
  assert.match(localIntake, /createGarment\(/);
  assert.match(localIntake, /Saved on this device/);
});

test("client keeps providers and private Blob paths behind same-origin engine routes", () => {
  assert.match(client, /\/api\/studio\/intakes/);
  assert.match(client, /credentials: "same-origin"/);
  assert.match(client, /cache: "no-store"/);
  assert.doesNotMatch(client, /VERCEL_|BLOB_|provider|modelId|blob\.vercel-storage/);
  assert.match(client, /assets\/\$\{intake\.candidate\.assetId\}/);
});

test("new sheet material follows the scoped liquid-glass and accessibility contract", () => {
  assert.match(css, /\.studio-intake-sheet \{[\s\S]*?blur\(4px\)/);
  assert.match(css, /background: rgba\(249, 247, 243, 0\.6\)/);
  assert.match(css, /html\[data-theme="dark"\] \.studio-intake-sheet \{ background: rgba\(28, 24, 22, 0\.6\)/);
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /\.studio-receipt-visual/);
  assert.match(css, /\.studio-receipt-state \.studio-lifecycle-draft \{ color: var\(--studio-ink\); \}/);
  assert.match(css, /\.studio-receipt-preview::before/);
});
