import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const sheet = readFileSync(`${root}/components/studio/collections/change-drop-sheet.tsx`, "utf8");
const wardrobe = readFileSync(`${root}/components/studio/wardrobe-workbench.tsx`, "utf8");
const lifecycle = readFileSync(`${root}/components/studio/garment-lifecycle-panel.tsx`, "utf8");
const dossier = readFileSync(`${root}/components/studio/garment-dossier.tsx`, "utf8");
const css = readFileSync(`${root}/app/studio-stack-navigation.css`, "utf8");

test("published Piece drop correction follows the existing guarded sheet grammar", () => {
  assert.match(sheet, /<StudioTaskSheet/);
  assert.match(sheet, /studio-decision-sheet studio-change-drop-sheet/);
  assert.match(sheet, /previewStudioCollection\(\{/);
  assert.match(sheet, /command: "CORRECT_PUBLISHED_COLLECTION_MEMBERSHIP"/);
  assert.match(sheet, /collectionId: selected\.id/);
  assert.match(sheet, /expectedVersion: selected\.version/);
  assert.match(sheet, /collection\.key === "drop-01" \|\| collection\.key === "drop-02"/);
  assert.match(sheet, /confirmStudioCollection\(\{ idempotencyKey, preview \}\)/);
  assert.match(sheet, /inFlightRef\.current/);
  assert.match(sheet, /getOrCreateSessionCommandKey/);
  assert.match(sheet, /StudioFeedback/);
  assert.match(sheet, /Publish drop change/);
  assert.match(sheet, /Moved to \$\{receipt\.collection\.label\}/);
  assert.match(sheet, /returnFocus=\{returnFocus\}/);
});

test("Piece exposes Change drop without bypassing Manage listing", () => {
  assert.match(wardrobe, /databaseCollectionForSku/);
  assert.match(wardrobe, /collection\.memberSkus\.includes\(sku\)/);
  assert.match(wardrobe, /!hasDatabaseCollectionProjection/);
  assert.match(wardrobe, /label: "Manage listing", detail: "Move it to another drop\."/);
  assert.match(wardrobe, /<GarmentLifecyclePanel[\s\S]*?onChangeDrop=\{canChangeDrop \? openDrop : undefined\}/);
  assert.match(wardrobe, /<ChangeDropSheet[\s\S]*?currentCollectionId=\{currentPieceCollection\?\.id \?\? null\}/);
  assert.match(lifecycle, /editable \|\| onChangeDrop/);
  assert.match(lifecycle, /onChangeDrop \? <button[\s\S]*?>Change drop<\/button>/);
  assert.match(dossier, /searchParams\.get\("action"\) === "drop" \? "drop" : undefined/);
});

test("database membership outranks the legacy compatibility projection", () => {
  assert.match(wardrobe, /if \(databaseCollection\) return \{ key: databaseCollection\.key, label: databaseCollection\.label \}/);
  assert.match(wardrobe, /if \(databaseCollection\.key !== "drop-01"\) return null/);
  assert.doesNotMatch(wardrobe, /historicalDrop01Kind\(garment\) \?\? "SOLD_OUT"/);
  assert.match(wardrobe, /pastDrop \? "Past drop" : workspace\.stageLabel/);
  assert.match(wardrobe, /resolvedCollectionForGarment\(garment, availableCollections/);
  assert.match(wardrobe, /resolvedHistoricalDrop01Kind\(garment, availableCollections\)/);
  assert.match(wardrobe, /resolvedCollectionForGarment\([\s\S]*?availableCollections/);
});

test("desktop decision sheets fill their rounded modal boundary", () => {
  assert.match(css, /body \.studio-decision-sheet\.studio-decision-sheet \{[\s\S]*?background: var\(--studio-panel-strong\);[\s\S]*?overflow: hidden;/u);
  assert.match(css, /body \.studio-decision-sheet\.studio-decision-sheet \.studio-task-sheet-frame \{[\s\S]*?height: 100%;[\s\S]*?min-height: 100%;[\s\S]*?overflow: hidden;/u);
  assert.match(css, /body \.studio-decision-sheet\.studio-decision-sheet \.studio-task-sheet-body \{[\s\S]*?flex: 1 1 auto;/u);
});
