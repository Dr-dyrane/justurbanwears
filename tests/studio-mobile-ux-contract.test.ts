import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const shell = readFileSync(`${root}/components/studio/app-shell.tsx`, "utf8");
const settings = readFileSync(`${root}/components/studio/settings/studio-settings-center.tsx`, "utf8");
const productCard = readFileSync(`${root}/components/shop/product-card.tsx`, "utf8");
const home = readFileSync(`${root}/components/studio/studio-home.tsx`, "utf8");
const models = readFileSync(`${root}/components/studio/model-atelier.tsx`, "utf8");
const wardrobe = readFileSync(`${root}/components/studio/wardrobe-workbench.tsx`, "utf8");
const dossier = readFileSync(`${root}/components/studio/garment-dossier.tsx`, "utf8");
const directCaptures = readFileSync(`${root}/components/studio/draft-direct-captures.tsx`, "utf8");
const operations = readFileSync(`${root}/components/studio/operations-desk.tsx`, "utf8");
const css = readFileSync(`${root}/app/foundation.css`, "utf8");
const atelierCss = readFileSync(`${root}/app/studio-atelier.css`, "utf8");
const mobileCss = readFileSync(`${root}/app/mobile-experience.css`, "utf8");
const controlCss = readFileSync(`${root}/app/control-refinement.css`, "utf8");
const wardrobeMobileCss = readFileSync(`${root}/app/studio-mobile-wardrobe.css`, "utf8");
const rootLayout = readFileSync(`${root}/app/layout.tsx`, "utf8");

test("Studio mobile chrome exposes four direct tabs, one contextual FAB, and one profile-sheet entrance", () => {
  assert.match(shell, /const mobileNavigation: NavigationItem\[]/);
  for (const label of ["Home", "Wardrobe", "Orders", "Ops"]) {
    assert.match(shell, new RegExp(`mobileLabel: "${label}"`));
  }
  assert.match(shell, /className="studio-mobile-tabs shop-dock-lens"/);
  assert.match(shell, /mobileNavigation\.map/);
  assert.match(shell, /className="shop-mobile-fab shop-dock-lens studio-mobile-fab"/);
  assert.match(shell, /data-experience-action="primary"/);
  assert.match(shell, /registeredMobileAction\?\.invokeTargetId/);
  assert.match(wardrobe, /invokeTargetId: "piece-primary-action"/);
  assert.doesNotMatch(shell, /shop-mobile-nav-reveal/);
  assert.doesNotMatch(shell, /className="shop-mobile-context shop-dock-lens studio-mobile-context"/);
  assert.match(settings, /studio-profile-orb/);
  assert.match(settings, /Studio spaces and helpers/);
  assert.match(settings, /\/studio\/models/);
  assert.match(settings, /\/studio\/media/);
  assert.match(settings, /\/studio\/stocktake/);
  assert.match(controlCss, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(controlCss, /\.studio-mobile-shell \.studio-mobile-fab[\s\S]*?display: inline-flex !important/);
  assert.match(controlCss, /\.studio-mobile-tabs \{[\s\S]*?border-radius: 32px;/);
  assert.match(controlCss, /\.studio-profile-orb-mobile/);
  assert.match(controlCss, /\.studio-mobile-nav-title/);
  assert.match(controlCss, /\.studio-floating-nav \{[\s\S]*?display: flex;/);
  assert.match(rootLayout, /control-refinement\.css/);
});

test("Wardrobe mobile filters never place the result count over a status", () => {
  assert.match(wardrobeMobileCss, /#studio-view-garments > \.studio-filter-bar > span \{\s*display: none;\s*\}/);
});

test("product quick add keeps a complete circular icon and an understandable reveal", () => {
  assert.match(productCard, /className="product-card-action-icon"/);
  assert.match(controlCss, /\.product-card-action-icon[\s\S]*?border-radius: 50%/);
  assert.match(controlCss, /shop-product-card:hover \.product-card-action-row/);
  assert.match(controlCss, /@media \(hover: none\), \(pointer: coarse\)/);
});

test("task-first records, garments, and inventory use approved media", () => {
  assert.match(home, /studioGarmentCover/);
  assert.match(home, /studio-attention-primary/);
  assert.match(home, /studio-recent-row/);
  assert.match(wardrobe, /studioGarmentCover/);
  assert.match(operations, /studioGarmentCover/);
  assert.match(atelierCss, /\.studio-attention-layout/);
  assert.match(atelierCss, /\.studio-recent-row/);
  assert.match(atelierCss, /\.studio-garment-grid/);
  assert.match(atelierCss, /\.studio-inventory-row-trigger/);
  assert.match(atelierCss, /@media \(max-width: 620px\)/);
  assert.match(mobileCss, /studio-atelier-home > \.studio-atelier-hero[\s\S]*?display: none/);
});

test("compact garment rows expose preview and one Piece workspace", () => {
  assert.match(wardrobe, /label=\{`Preview \$\{garment\.title\}`\}/);
  assert.match(wardrobe, /aria-label=\{`Open \$\{garment\.title\}`\}/);
  assert.match(wardrobe, /className="studio-garment-disclosure"/);
  assert.match(wardrobe, /garmentDossierHref/);
  assert.doesNotMatch(wardrobe, /Manage draft|Prepare listing|Open listing/);
  assert.match(mobileCss, /studio-garment-disclosure > span:first-child small/);
  assert.match(mobileCss, /font-size: 10\.5px/);
});

test("garments open one Piece workspace with one truthful next action", () => {
  assert.match(wardrobe, /className="studio-draft-sheet studio-piece-sheet"/);
  assert.match(wardrobe, /<PieceWorkspaceView/);
  assert.match(wardrobe, /nextAction\.label/);
  assert.match(dossier, /<PieceWorkspaceView/);
  assert.doesNotMatch(dossier, /useStudioMobileAction|selectPieceWorkspace/);
  assert.match(wardrobe, /useStudioMobileAction\(mobileAction\)/);
  assert.match(dossier, /candidate\.privateWardrobeItemId === requestedId/);
  assert.doesNotMatch(wardrobe, /Move to wardrobe|Clear gates|Create media/);
});

test("model segmented content can render without the portrait obstruction", () => {
  assert.match(models, /activeView === "profile" \? <div className=/);
  assert.match(models, /is-panel-only/);
  assert.match(models, /pending=\{viewPending\}/);
  assert.match(models, /studio-model-receipt-visual/);
  assert.match(models, /studio-receipt-copy/);
  assert.match(atelierCss, /\.studio-model-layout/);
  assert.match(atelierCss, /\.studio-model-list[\s\S]*?scroll-snap-type: x proximity/);
});

test("operator copy and recovery stay action-led", () => {
  assert.match(home, /scenario[\s\S]*?Simulator · not saved/);
  assert.match(home, /!scenario && persistence === "available"/);
  assert.match(home, /Workspace saved/);
  assert.match(home, /studio\/wardrobe\/\$\{encodeURIComponent/);
  assert.match(directCaptures, /studio-magic-capture-shortcut/);
  assert.match(directCaptures, /Magic Wand/);
  assert.match(wardrobe, /aiSourceMode: "APPROVED_FRONT"/);
  assert.match(wardrobe, /approvedFrontUrl: garment\.reviewCover\?\.src/);
  assert.match(directCaptures, /Create from product front/);
  assert.match(directCaptures, /Create AI preview/);
  assert.match(directCaptures, /AI suggests the unseen back\. You verify it before saving\./);
  assert.match(directCaptures, /Yes, it matches/);
  assert.match(directCaptures, /truthConfirmed: true/);
  assert.match(directCaptures, /chooseDirectAlternative/);
  assert.match(directCaptures, /sourceMode === "APPROVED_FRONT"/);
  assert.match(directCaptures, /heading\.scrollIntoView/);
  assert.match(directCaptures, /prefers-reduced-motion: reduce/);
  assert.match(directCaptures, /aiFlow\.source \? <button className="button button-primary studio-ai-create" disabled=\{!aiFlow\.confirmed\}/);
  assert.doesNotMatch(directCaptures, /disabled=\{!aiFlow\.source \|\| !aiFlow\.confirmed\}/);
  assert.match(directCaptures, /Only Lulu sees this/);
  assert.doesNotMatch(wardrobe, /truth gates|catalogue projection/i);
  assert.doesNotMatch(wardrobe, /Public projection|catalogue state|model anchor|Listing readiness/);
  assert.match(wardrobe, /Shop preview/);
  assert.match(wardrobe, /Live in Shop/);
  assert.match(operations, /Manage stock and returns\./);
  assert.match(operations, /summaryItems/);
  assert.match(operations, /studio-operation-card-trigger/);
  assert.match(operations, /setPendingInventoryDecision\("WRITE_OFF"\)/);
  assert.doesNotMatch(operations, /onClick=\{\(\) => studio\.disposeReturn/);
  assert.doesNotMatch(operations, /Listing-linked stock|named stock disposition/i);
  assert.match(css, /padding: 30px 16px calc\(104px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(css, /\.studio-lifecycle-step \+ \.studio-lifecycle-step::before \{[\s\S]*?var\(--studio-on-cocoa\) 16%/);
  assert.doesNotMatch(css, /html\[data-theme="dark"\] \.studio-shell \.studio-lifecycle-track,[\s\S]*?color: #1d1512/);
  assert.match(atelierCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(mobileCss, /mask-image: linear-gradient/);
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
