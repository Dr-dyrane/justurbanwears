import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const dossier = readFileSync(`${root}/components/studio/garment-dossier.tsx`, "utf8");
const wardrobe = readFileSync(`${root}/components/studio/wardrobe-workbench.tsx`, "utf8");
const home = readFileSync(`${root}/components/studio/studio-home.tsx`, "utf8");
const intake = readFileSync(`${root}/components/studio/garment-intake/garment-intake-sheet.tsx`, "utf8");
const foundation = readFileSync(`${root}/app/foundation.css`, "utf8");
const atelier = readFileSync(`${root}/app/studio-atelier.css`, "utf8");
const captures = readFileSync(`${root}/components/studio/draft-direct-captures.tsx`, "utf8");
const shell = readFileSync(`${root}/components/studio/app-shell.tsx`, "utf8");

test("every garment entry point resolves to the permanent dossier route", () => {
  assert.equal(existsSync(`${root}/app/(studio)/studio/wardrobe/[id]/page.tsx`), true);
  assert.match(wardrobe, /href=\{garmentDossierHref\(garment\)\}/);
  assert.match(wardrobe, /encodeURIComponent\(garment\.id\)/);
  assert.match(home, /studio\/wardrobe\/\$\{encodeURIComponent/);
  assert.match(home, /encodeURIComponent\(garment\.id\)/);
  assert.match(intake, /studio\/wardrobe\/\$\{encodeURIComponent\(wardrobeItemId\)\}/);
});

test("the dossier reuses the canonical Piece workspace and handles cold links", () => {
  assert.match(dossier, /candidate\.id === requestedId \|\| candidate\.privateWardrobeItemId === requestedId/);
  assert.match(dossier, /<PieceWorkspaceView/);
  assert.match(dossier, /Piece not found\./);
  assert.match(dossier, /Opening piece…/);
  assert.match(dossier, /<StudioMediaViewerProvider>/);
  assert.match(dossier, /<WearSheet/);
});

test("the live Piece workspace keeps its one state-aware action inside the stack page", () => {
  assert.doesNotMatch(dossier, /useStudioMobileAction|selectPieceWorkspace/);
  assert.doesNotMatch(wardrobe, /useStudioMobileAction|invokeTargetId/);
  assert.match(wardrobe, /id="piece-primary-action"/);
  assert.match(wardrobe, /aria-label=\{`\$\{nextAction\.label\} for \$\{garment\.title\}`\}/);
  assert.match(wardrobe, /<button[\s\S]*?className="studio-piece-next"[\s\S]*?onClick=\{runNextAction\}/);
  assert.doesNotMatch(shell, /StudioMobileActionProvider|studio-mobile-fab|invokeContextAction/);
});

test("Piece work is split into concise task launchers and bounded sheets", () => {
  assert.match(wardrobe, /aria-haspopup="dialog"/);
  assert.match(wardrobe, /className="studio-service-list studio-piece-task-list"/);
  assert.match(wardrobe, /<strong>Product photos<\/strong>/);
  assert.match(wardrobe, /<strong>Facts & price<\/strong>/);
  assert.match(wardrobe, /<strong>Shop<\/strong>/);
  assert.match(wardrobe, /const hasFactsTask = Boolean\(garment\.privateWardrobeItemId \|\| listing\)/);
  assert.match(wardrobe, /<StudioTaskSheet[\s\S]*?className="studio-piece-photos-sheet"[\s\S]*?title="Product photos"/);
  assert.match(wardrobe, /<StudioTaskSheet[\s\S]*?className="studio-piece-shop-sheet"[\s\S]*?title="Shop"/);
  assert.match(wardrobe, /<StudioTaskSheet[\s\S]*?className="studio-piece-details-sheet"[\s\S]*?title="Facts & price"/);
  assert.doesNotMatch(wardrobe, /captureSectionRef/);
  assert.doesNotMatch(wardrobe, /<details[\s\S]*?studio-piece-secondary/);
});

test("the dossier keeps media controls visible and public projection readable in both themes", () => {
  assert.match(atelier, /studio-dossier-page \.studio-draft-visual \.studio-media-expand/);
  assert.doesNotMatch(foundation, /html\[data-theme="dark"\] \.studio-shell \.studio-listing-preview \{ color: #1d1512; \}/);
});

test("Magic Wand failures stay in operator language", () => {
  assert.match(captures, /async function responseJson/);
  assert.match(captures, /AI views are unavailable\. Try again\./);
  assert.doesNotMatch(captures, /studio-magic-capture-shortcut/);
  assert.equal(captures.match(/await response\.json\(\)/g)?.length, 1);
});
