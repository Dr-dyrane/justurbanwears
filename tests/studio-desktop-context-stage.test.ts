import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const shellPath = new URL("../components/studio/app-shell.tsx", import.meta.url);
const stagePath = new URL("../components/studio/navigation/studio-desktop-context-stage.tsx", import.meta.url);
const cssPath = new URL("../app/studio-stack-navigation.css", import.meta.url);

test("plain Studio services receive one shell-owned desktop context stage", async () => {
  const [shell, stage] = await Promise.all([
    readFile(shellPath, "utf8"),
    readFile(stagePath, "utf8"),
  ]);

  assert.match(shell, /<StudioDesktopContextStage title=\{stack\.title\} \/>/);
  assert.match(stage, /serviceContextKind\(pathname, selectors\.view\)/);
  assert.match(stage, /pathname === "\/studio\/wardrobe"/);
  assert.match(stage, /pathname === "\/studio\/media"/);
  assert.match(stage, /pathname === "\/studio\/media\/new"/);
  assert.match(stage, /pathname === "\/studio\/models"/);
  assert.match(stage, /pathname === "\/studio\/orders"/);
  assert.match(stage, /pathname === "\/studio\/stocktake"/);
  assert.match(stage, /scanPieceSelector\(pathname\)/);
  assert.match(stage, /pathname === "\/studio\/operations"/);
  assert.match(stage, /pathname === "\/studio\/ask"/);
  assert.doesNotMatch(stage, /pathname\.startsWith\("\/studio\/wardrobe\/"\)/);
  assert.doesNotMatch(stage, /pathname\.startsWith\("\/studio\/orders\/"\)/);
  assert.doesNotMatch(stage, /pathname\.startsWith\("\/studio\/media\/"\)/);
});

test("Create media and Scan receive exact record-aware desktop context", async () => {
  const stage = await readFile(stagePath, "utf8");

  assert.match(stage, /pathname\.match\(\/\^\\\/studio\\\/scan\\\/\(\[\^\/\]\+\)\$\/\)/);
  assert.match(stage, /piece: searchParams\.get\("piece"\) \?\? scanPieceSelector\(pathname\)/);
  assert.match(stage, /"INVENTORY", "MEDIA", "OPERATIONS"/);
});

test("Archived Wardrobe receives explicit projection-owned desktop context", async () => {
  const stage = await readFile(stagePath, "utf8");

  assert.match(stage, /function archivedWardrobeContext/);
  assert.match(stage, /subject: "Archived pieces"/);
  assert.match(stage, /state: plural\(count, "archived piece"\)/);
  assert.match(stage, /studio\.garments\.filter\(\(garment\) => garment\.state === "ARCHIVED"\)/);
  assert.match(stage, /projectedContext\(kind, studio\.application\.snapshot, selectors, archivedPieceCount\)/);
  assert.match(stage, /permanently delete it when eligible/);
});

test("Create media and Scan compact against the native island rather than the browser", async () => {
  const css = await readFile(cssPath, "utf8");

  assert.match(css, /container-name: studio-native-canvas/);
  assert.match(css, /@container studio-native-canvas \(max-width: 36rem\)/);
  assert.match(css, /\.studio-create-media-page \.composer-layout[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.studio-create-media-page \.brief-panel[\s\S]*?order: -1/);
  assert.match(css, /\.studio-scan-page \.studio-scan-piece-hero[\s\S]*?display: block/);
  assert.match(css, /\.studio-scan-page \.studio-scan-truth dl[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
});

test("context is selector-aware and never substitutes a primary record action", async () => {
  const stage = await readFile(stagePath, "utf8");

  assert.match(stage, /projection\.searchDocuments/);
  assert.match(stage, /function exactDocument/);
  assert.match(stage, /function documentValues/);
  assert.match(stage, /function exactCollection/);
  assert.match(stage, /collection: searchParams\.get\("collection"\)/);
  assert.match(stage, /piece: searchParams\.get\("piece"\)/);
  assert.match(stage, /order: searchParams\.get\("order"\)/);
  assert.match(stage, /model: searchParams\.get\("model"\)/);
  assert.match(stage, /media: searchParams\.get\("media"\)/);
  assert.match(stage, /operation: searchParams\.get\("operation"\)/);
  assert.match(stage, /view: searchParams\.get\("view"\)/);
  assert.match(stage, /Studio will not substitute another record/);
  assert.match(stage, /href: "#studio-content"/);
  assert.match(stage, /label: "Focus workspace"/);
  assert.doesNotMatch(stage, /function preferDocument/);
  assert.doesNotMatch(stage, /href: input\.document\.route/);
  assert.doesNotMatch(stage, /projection\.continueAction\.href/);
  assert.doesNotMatch(stage, /href=\{context\.action\.href\}/);
  assert.match(stage, /studio\.application\.error/);
  assert.match(stage, /onClick=\{\(\) => void studio\.application\.refresh\(\)\}/);
  assert.doesNotMatch(stage, /Math\.random|Date\.now|mock|placeholder count/i);
});

test("desktop context and service island share the canvas without changing compact layouts", async () => {
  const css = await readFile(cssPath, "utf8");

  assert.match(css, /@media \(min-width: 1100px\) and \(min-height: 600px\)[\s\S]*?workspace:has\(> \.studio-desktop-context-stage\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\) clamp\(28rem, 32vw, 32rem\)/);
  assert.match(css, /\.studio-desktop-context-stage \{\s*display: none;/);
  assert.match(css, /\.studio-desktop-context-stage \{[\s\S]*?grid-column: 1;[\s\S]*?grid-row: 2;/);
  assert.match(css, /workspace:has\(> \.studio-desktop-context-stage\) > main\.page-canvas\.studio-native-canvas \{[\s\S]*?grid-column: 2;[\s\S]*?min-width: 28rem;[\s\S]*?width: 100%;/);
  assert.match(css, /\.studio-desktop-context-action \{[\s\S]*?min-height: 46px;/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*?\.studio-desktop-context-action[\s\S]*?border: 1px solid CanvasText/);
});
