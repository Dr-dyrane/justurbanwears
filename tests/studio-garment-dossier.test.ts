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
const mobileActions = readFileSync(`${root}/components/studio/mobile-action-context.tsx`, "utf8");

test("every garment entry point resolves to the permanent dossier route", () => {
  assert.equal(existsSync(`${root}/app/(studio)/studio/wardrobe/[id]/page.tsx`), true);
  assert.match(wardrobe, /href=\{garmentDossierHref\(garment\)\}/);
  assert.match(home, /studio\/wardrobe\/\$\{encodeURIComponent/);
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

test("the live Piece workspace registers a one-tap state-aware mobile action", () => {
  assert.doesNotMatch(dossier, /useStudioMobileAction|selectPieceWorkspace/);
  assert.match(wardrobe, /useStudioMobileAction\(mobileAction\)/);
  assert.match(wardrobe, /invokeTargetId: "piece-primary-action"/);
  assert.match(wardrobe, /id="piece-primary-action"/);
  assert.match(mobileActions, /invokeTargetId\?: string/);
  assert.match(shell, /registeredMobileAction\?\.invokeTargetId/);
  assert.match(shell, /target\.click\(\)/);
  assert.equal(shell.match(/onClick=\{invokeContextAction\}/g)?.length, 3);
});

test("the dossier keeps media controls visible and public projection readable in both themes", () => {
  assert.match(atelier, /studio-dossier-page \.studio-draft-visual \.studio-media-expand/);
  assert.doesNotMatch(foundation, /html\[data-theme="dark"\] \.studio-shell \.studio-listing-preview \{ color: #1d1512; \}/);
});

test("Magic Wand failures stay in operator language", () => {
  assert.match(captures, /async function responseJson/);
  assert.match(captures, /AI views are unavailable\. Try again\./);
  assert.equal(captures.match(/await response\.json\(\)/g)?.length, 1);
});
