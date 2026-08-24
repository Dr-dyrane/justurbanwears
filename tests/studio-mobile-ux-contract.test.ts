import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const shell = readFileSync(`${root}/components/studio/app-shell.tsx`, "utf8");
const settings = readFileSync(`${root}/components/studio/settings/studio-settings-center.tsx`, "utf8");
const commandCenter = readFileSync(`${root}/components/studio/navigation/studio-command-center.tsx`, "utf8");
const stackContext = readFileSync(`${root}/components/studio/navigation/studio-stack-context.tsx`, "utf8");
const serviceList = readFileSync(`${root}/components/studio/navigation/studio-service-list.tsx`, "utf8");
const serviceRegistry = readFileSync(`${root}/lib/studio/service-registry.ts`, "utf8");
const serviceOrder = readFileSync(`${root}/hooks/studio/use-studio-service-order.ts`, "utf8");
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
const stackCss = readFileSync(`${root}/app/studio-stack-navigation.css`, "utf8");
const wardrobeMobileCss = readFileSync(`${root}/app/studio-mobile-wardrobe.css`, "utf8");
const rootLayout = readFileSync(`${root}/app/layout.tsx`, "utf8");

test("Studio uses Home-owned navigation and one shell-owned stack header", () => {
  assert.match(shell, /data-studio-page=\{isHome \? "home" : "stack"\}/);
  assert.match(shell, /studio-command-nav glass-surface/);
  assert.match(shell, /<StudioSettingsCenter operator=\{operator\}/);
  assert.match(shell, /<StudioCommandCenter showSearch=\{isHome\} \/>/);
  assert.match(shell, /aria-label=\{`Back to \$\{stack\.backLabel\}`\}/);
  assert.match(shell, /className="studio-command-page-title"/);
  assert.match(stackContext, /view === "publishing"\) return \{ backHref: "\/studio", backLabel: "Studio Home", title: "Shop" \}/);
  assert.match(stackContext, /view === "inventory"\) return \{ backHref: "\/studio", backLabel: "Studio Home", title: "Inventory" \}/);
  assert.match(stackContext, /view === "orders"\) return \{ backHref: "\/studio", backLabel: "Studio Home", title: "Orders" \}/);
  assert.match(commandCenter, /aria-label="Search anything in Studio"/);
  assert.match(commandCenter, /aria-label="Ask Studio"/);
  assert.match(commandCenter, /showSearch \? <button/);
  assert.match(commandCenter, /href="\/studio\/ask"/);
  assert.doesNotMatch(commandCenter, /aria-label="Ask Studio mode"|Read-only agent/);
  assert.match(stackContext, /pathname\.startsWith\("\/studio\/ask"\).*title: "Ask Studio"/);
  assert.doesNotMatch(shell, /studio-stack-nav-wrap|studio-stack-nav|registeredAction/);
  assert.doesNotMatch(dossier, /studio-dossier-back/);
  assert.doesNotMatch(shell, /mobileNavigation|studio-mobile-tabs|studio-mobile-shell|studio-mobile-fab/);
  assert.doesNotMatch(shell, /studio-nav-links|StudioNotificationCenter/);
  assert.match(settings, /studio-profile-orb/);
  assert.match(stackCss, /\.studio-command-nav\.is-stack \{[\s\S]*?grid-template-columns: 48px minmax\(0, 1fr\) 48px/);
  assert.match(stackCss, /\.studio-command-header \{[\s\S]*?z-index: var\(--z-header\)/);
  assert.doesNotMatch(stackCss, /\.studio-stack-nav/);
  assert.match(stackCss, /@media \(max-width: 680px\)[\s\S]*?grid-template-columns: 44px minmax\(0, 1fr\) 44px/);
  assert.match(stackCss, /padding-bottom: max\(36px, env\(safe-area-inset-bottom, 0px\)\)/);
  assert.doesNotMatch(mobileCss, /\.shop-shell > main,\s*\.studio-shell \.page-canvas/);
  assert.match(rootLayout, /studio-stack-navigation\.css/);
  assert.match(rootLayout, /const renderedMobileExperienceCss = mobileExperienceCss;/);
  assert.match(rootLayout, /control-refinement\.css/);
});

test("Home presents four primary destinations while search retains all seven domains", () => {
  for (const key of ["wardrobe", "atelier", "shop", "orders", "inventory", "models", "operations"]) {
    assert.match(serviceRegistry, new RegExp(`key: "${key}"`));
  }
  assert.match(serviceRegistry, /STUDIO_PRIMARY_SERVICE_KEYS = \[[\s\S]*?"wardrobe",[\s\S]*?"atelier",[\s\S]*?"orders",[\s\S]*?"operations"/);
  assert.match(commandCenter, /\.\.\.STUDIO_SERVICES\.map/);
  assert.match(serviceOrder, /justurban-wears:studio-service-order:v3/);
  assert.match(serviceOrder, /legacyStorageKey = "justurban-wears:studio-service-order:v2"/);
  assert.match(serviceOrder, /normalizeOrder/);
  assert.match(serviceOrder, /STUDIO_PRIMARY_SERVICE_KEYS\.filter/);
  assert.match(serviceList, /export function StudioServiceList/);
  assert.match(serviceList, /export function ArrangeStudioHomeControl/);
  assert.match(home, /studio-home-recommendation/);
  assert.match(home, /studio-home-sheet/);
  assert.match(home, /studio-home-sheet-handle/);
  assert.match(home, /onPointerDown/);
  assert.match(home, /onPointerUp/);
  assert.match(home, /studio-home-summary/);
  assert.match(home, /Attention/);
  assert.match(home, /Available/);
  assert.match(home, /Orders/);
  assert.match(home, /className="studio-summary-orb"><strong>/);
  assert.doesNotMatch(home, /CircleAlert aria-hidden="true" size=\{15\}|PackageCheck aria-hidden="true" size=\{15\}|ShoppingBag aria-hidden="true" size=\{15\}|Store aria-hidden="true" size=\{15\}/);
  assert.match(home, /<StudioServiceList \/>/);
  assert.doesNotMatch(home, /<h2[^>]*>Studio<\/h2>/);
  assert.match(home, /studio-home-recent/);
  assert.match(home, /<ArrangeStudioHomeControl \/>/);
  assert.match(home, /src="\/logo\.png"/);
  assert.ok(home.indexOf("studio-home-recommendation") < home.indexOf("studio-home-sheet"));
  assert.ok(home.indexOf("studio-home-sheet") < home.indexOf("studio-home-summary"));
  assert.ok(home.indexOf("studio-home-summary") < home.indexOf("<StudioServiceList"));
  assert.ok(home.indexOf("<StudioServiceList") < home.indexOf("studio-home-recent"));
  assert.ok(home.indexOf("studio-home-recent") < home.indexOf("<ArrangeStudioHomeControl"));
});

test("Wardrobe mobile filters never place the result count over a status", () => {
  assert.match(wardrobeMobileCss, /#studio-view-garments > \.studio-filter-bar > span \{\s*display: none;\s*\}/);
});

test("product add-to-bag uses one compact editorial pill", () => {
  assert.match(productCard, /<Check aria-hidden="true" size=\{16\}/);
  assert.match(productCard, /<ShoppingBag aria-hidden="true" size=\{16\}/);
  assert.match(productCard, /className="product-card-action-label">\{isOnline \? "Add to bag" : "Offline"\}/);
  assert.match(productCard, /className="product-card-action-label">In bag<\/span>/);
  assert.doesNotMatch(productCard, /product-card-action-icon/);
  assert.match(controlCss, /\.product-card-action \{[\s\S]*?height: 38px;[\s\S]*?width: 38px;[\s\S]*?transition: var\(--product-action-motion\)/);
  assert.match(controlCss, /--product-action-motion:[^;]*width var\(--product-action-duration\) var\(--product-action-spring\)/);
  assert.match(controlCss, /--product-action-duration: 520ms;[\s\S]*?--product-action-spring: cubic-bezier\(0\.28, 0\.78, 0\.28, 1\.12\)/);
  assert.match(controlCss, /:is\(\.shop-home, \.shop-product-page \.shop-related\) \.product-card-action-row \{\s*min-height: 38px;/);
  assert.match(controlCss, /\.product-card-action-label \{[\s\S]*?font-size: 11px;[\s\S]*?max-width: 0;[\s\S]*?overflow: hidden;/);
  assert.match(controlCss, /:is\(\.shop-home, \.shop-related\) \.shop-product-card \.product-card-action \{[\s\S]*?background: rgba\(18, 11, 9, 0\.74\);[\s\S]*?color: #fffaf7;[\s\S]*?height: 38px;/);
  assert.match(controlCss, /\.product-card-action:is\(\.is-added, \.is-offline\) \{[\s\S]*?width: 128px;/);
  assert.match(controlCss, /\.product-card-action-row\[data-visibility="always"\] \.product-card-action,[\s\S]*?width: 128px;/);
  assert.match(controlCss, /\.product-card-action\.is-added > svg[\s\S]*?shop-confirm-settle/);
  assert.match(controlCss, /shop-product-card:hover \.product-card-action-row/);
  assert.match(controlCss, /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?height: 44px;[\s\S]*?width: 128px;/);
  assert.match(controlCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.product-card-action > svg,[\s\S]*?animation: none !important;/);
});

test("task-first records, garments, and inventory use approved media", () => {
  assert.match(home, /studioGarmentCover/);
  assert.match(home, /studio-home-recommendation/);
  assert.match(home, /studio-recent-row/);
  assert.match(wardrobe, /studioGarmentCover/);
  assert.match(operations, /piece\.imageSrc/);
  assert.match(operations, /inventory view/);
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
  assert.doesNotMatch(wardrobe, /useStudioMobileAction|invokeTargetId/);
  assert.match(wardrobe, /id="piece-primary-action"/);
  assert.match(dossier, /candidate\.privateWardrobeItemId === requestedId/);
  assert.doesNotMatch(wardrobe, /Move to wardrobe|Clear gates|Create media/);
});

test("model segmented content can render without the portrait obstruction", () => {
  assert.match(models, /activeView === "profile" \? <div className=/);
  assert.match(models, /is-panel-only/);
  assert.match(models, /pending=\{viewPending\}/);
  assert.match(models, /studio-model-approved-image/);
  assert.match(models, /studio-model-profile/);
  assert.match(atelierCss, /\.studio-model-layout/);
  assert.match(atelierCss, /\.studio-model-list[\s\S]*?scroll-snap-type: x proximity/);
});

test("operator copy and recovery stay action-led", () => {
  assert.match(home, /scenario[\s\S]*?Scenario preview/);
  assert.match(home, /projected\.degradedSources\.length \? "Studio snapshot" : "Live Studio"/);
  assert.match(home, /Live state unavailable/);
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
  assert.match(operations, /<h1 className="sr-only">Operations<\/h1>/);
  assert.doesNotMatch(operations, /Know where every piece is|Inventory, holds, orders and returns share one live record/);
  assert.match(operations, /StudioSegmentedView/);
  assert.doesNotMatch(operations, /studio-operation-summary/);
  assert.match(operations, /aria-label="Next Operations action"/);
  assert.match(operations, /useStudioSegment\(segments, "attention"\)/);
  assert.match(operations, /router\.replace\("\/studio\/orders\?filter=RETURNS"\)/);
  assert.doesNotMatch(operations, /\{ key: "orders", label: "Orders"|\{ key: "returns", label: "Returns"/);
  assert.match(operations, /studio-operation-card-trigger/);
  assert.match(operations, /authority\.createHold/);
  assert.match(operations, /authority\.recordLocation/);
  assert.doesNotMatch(operations, /studio\.reserveOrder|studio\.disposeReturn/);
  assert.doesNotMatch(operations, /Listing-linked stock|named stock disposition/i);
  assert.match(stackCss, /padding-bottom: max\(36px, env\(safe-area-inset-bottom, 0px\)\)/);
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
