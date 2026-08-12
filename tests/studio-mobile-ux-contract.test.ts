import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const shell = readFileSync(`${root}/components/studio/app-shell.tsx`, "utf8");
const home = readFileSync(`${root}/components/studio/studio-home.tsx`, "utf8");
const models = readFileSync(`${root}/components/studio/model-atelier.tsx`, "utf8");
const wardrobe = readFileSync(`${root}/components/studio/wardrobe-workbench.tsx`, "utf8");
const operations = readFileSync(`${root}/components/studio/operations-desk.tsx`, "utf8");
const css = readFileSync(`${root}/app/foundation.css`, "utf8");

test("Studio mobile chrome gives each workspace one contextual primary action", () => {
  assert.match(shell, /studio-mobile-fab/);
  assert.match(shell, /Add model/);
  assert.match(shell, /Intake garment/);
  assert.match(shell, /Open orders/);
  assert.doesNotMatch(shell, /className="shop-mobile-context"/);
});

test("compact records, garments, and inventory use approved media", () => {
  assert.match(home, /studioGarmentCover/);
  assert.match(home, /SquareArrowOutUpRight/);
  assert.match(wardrobe, /studioGarmentCover/);
  assert.match(operations, /studioGarmentCover/);
  assert.match(css, /\.studio-queue-grid \{ gap: 9px; grid-template-columns: repeat\(2/);
  assert.match(css, /\.studio-record-row \{ gap: 9px; grid-template-columns:/);
  assert.match(css, /\.studio-garment-card \{[\s\S]*?grid-template-columns: 82px/);
  assert.match(css, /\.studio-table-row \{ background: var\(--studio-panel\);[\s\S]*?grid-template-columns: 58px/);
});

test("model segmented content can render without the portrait obstruction", () => {
  assert.match(models, /activeView === "profile" \? <div className=/);
  assert.match(models, /is-panel-only/);
  assert.match(models, /pending=\{viewPending\}/);
});

test("documented browser evidence is complete", () => {
  for (const image of [
    "01-home.png",
    "02-records.png",
    "03-model-readiness.png",
    "04-wardrobe.png",
    "05-inventory.png",
    "06-garment-intake.png",
  ]) {
    assert.equal(existsSync(`${root}/docs/screenshots/studio-ux/${image}`), true, image);
  }
});
