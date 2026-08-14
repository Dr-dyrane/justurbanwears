import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const shell = readFileSync(`${root}/components/studio/app-shell.tsx`, "utf8");
const home = readFileSync(`${root}/components/studio/studio-home.tsx`, "utf8");
const models = readFileSync(`${root}/components/studio/model-atelier.tsx`, "utf8");
const wardrobe = readFileSync(`${root}/components/studio/wardrobe-workbench.tsx`, "utf8");
const directCaptures = readFileSync(`${root}/components/studio/draft-direct-captures.tsx`, "utf8");
const operations = readFileSync(`${root}/components/studio/operations-desk.tsx`, "utf8");
const css = readFileSync(`${root}/app/foundation.css`, "utf8");

test("Studio mobile chrome keeps one state-aware action between navigation and its matching FAB", () => {
  assert.match(shell, /studio-mobile-fab/);
  assert.match(shell, /Add model/);
  assert.match(shell, /Intake garment/);
  assert.match(shell, /Open inventory/);
  assert.match(shell, /Review returns/);
  assert.match(shell, /Review orders/);
  assert.match(shell, /operationsView !== "inventory"/);
  assert.match(shell, /useStudio/);
  assert.match(shell, /href=\{contextAction\.href\}/);
  assert.match(shell, /<strong>\{contextAction\.label\}<\/strong>/);
  assert.match(shell, /<ContextActionIcon aria-hidden="true"/);
  assert.match(shell, /className="shop-mobile-context shop-dock-lens studio-mobile-context"/);
  assert.match(shell, /aria-label=\{contextAction\.label\}/);
  assert.match(shell, /StudioMobileActionProvider/);
  assert.match(shell, /useRegisteredStudioMobileAction/);
  assert.doesNotMatch(shell, /className="shop-mobile-fab[\s\S]*?href="\/shop"/);
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

test("compact garment rows expose preview and one Piece workspace", () => {
  assert.match(wardrobe, /label=\{`Preview \$\{garment\.title\}`\}/);
  assert.match(wardrobe, /aria-label=\{`Open \$\{garment\.title\}`\}/);
  assert.match(wardrobe, /className="studio-garment-disclosure"/);
  assert.doesNotMatch(wardrobe, /Manage draft|Prepare listing|Open listing/);
});

test("garments open one Piece workspace with one truthful next action", () => {
  assert.match(wardrobe, /className="studio-draft-sheet studio-piece-sheet"/);
  assert.match(wardrobe, /<PieceWorkspaceView/);
  assert.match(wardrobe, /nextAction\.label/);
  assert.doesNotMatch(wardrobe, /Move to wardrobe|Clear gates|Create media/);
});

test("model segmented content can render without the portrait obstruction", () => {
  assert.match(models, /activeView === "profile" \? <div className=/);
  assert.match(models, /is-panel-only/);
  assert.match(models, /pending=\{viewPending\}/);
  assert.match(models, /studio-model-receipt-visual/);
  assert.match(models, /studio-receipt-copy/);
});

test("operator copy and recovery stay action-led", () => {
  assert.match(home, /Workspace saved/);
  assert.match(home, /wardrobe\?garment=/);
  assert.match(directCaptures, /studio-magic-capture-shortcut/);
  assert.match(directCaptures, /Magic Wand/);
  assert.match(directCaptures, /heading\.scrollIntoView/);
  assert.match(directCaptures, /prefers-reduced-motion: reduce/);
  assert.match(directCaptures, /aiFlow\.source \? <button className="button button-primary studio-ai-create" disabled=\{!aiFlow\.confirmed\}/);
  assert.doesNotMatch(directCaptures, /disabled=\{!aiFlow\.source \|\| !aiFlow\.confirmed\}/);
  assert.match(directCaptures, /Only Lulu sees this/);
  assert.doesNotMatch(wardrobe, /truth gates|catalogue projection/i);
  assert.match(operations, /Manage stock and returns\./);
  assert.match(operations, /summaryItems/);
  assert.match(operations, /studio-operation-card-trigger/);
  assert.match(operations, /setPendingInventoryDecision\("WRITE_OFF"\)/);
  assert.doesNotMatch(operations, /onClick=\{\(\) => studio\.disposeReturn/);
  assert.doesNotMatch(operations, /Listing-linked stock|named stock disposition/i);
  assert.match(css, /padding: 30px 16px calc\(104px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(css, /\.studio-lifecycle-step \+ \.studio-lifecycle-step::before \{[\s\S]*?var\(--studio-on-cocoa\) 16%/);
  assert.doesNotMatch(css, /html\[data-theme="dark"\] \.studio-shell \.studio-lifecycle-track,[\s\S]*?color: #1d1512/);
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
