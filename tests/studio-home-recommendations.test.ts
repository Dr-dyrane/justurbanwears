import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const home = readFileSync(`${root}/components/studio/studio-home.tsx`, "utf8");
const wardrobe = readFileSync(`${root}/components/studio/wardrobe-workbench.tsx`, "utf8");

test("Home keeps one primary recommendation and exposes concise direct paths", () => {
  assert.match(home, /aria-expanded=\{sheetRaised\}/);
  assert.match(
    home,
    /aria-label=\{sheetRaised \? "Show Studio recommendation" : "Show Studio services"\}/,
  );
  assert.match(home, /onPointerDown=\{/);
  assert.match(home, /onPointerUp=\{/);
  assert.doesNotMatch(home, /onScroll=\{/);
  assert.doesNotMatch(home, /sheetScrollTopRef/);
  assert.match(home, /historicalDrop01Kind\(garment\) === null/);
  assert.match(home, /projectStudioDropScopes\(garments, listings\)/);
  assert.match(home, /const scenarioTasks = \[/);
  assert.match(home, /\/studio\/orders\?filter=RETURNS/);
  assert.match(home, /\/studio\/orders/);
  assert.match(home, /\/studio\/wardrobe/);
  assert.match(home, /label: "Add the next piece"/);
  assert.match(home, /\/studio\/wardrobe\?intake=1/);
  assert.match(home, /projected\?\.continueAction/);
  assert.match(home, /primaryOpenCount/);
  assert.match(home, /scenario \? scenarioPrimaryTask\.count/);
  assert.match(home, /selectStudioHomeGate/);
  assert.match(home, /Studio could not open/);
  assert.match(home, /data-experience-action="primary"/);
  assert.doesNotMatch(home, /href: "\/studio"/);
});

test("the drop recommendation opens the existing collection sheet", () => {
  assert.match(wardrobe, /searchParams\.get\("collection"\) === "choose"/);
  assert.match(wardrobe, /setCollectionOpen\(true\)/);
  assert.match(wardrobe, /onDismiss=\{dismissCollection\}/);
  assert.match(wardrobe, /<StudioDropSheet/);
  assert.match(wardrobe, /dropAction/);
  assert.match(wardrobe, /initialAction/);
  assert.match(wardrobe, /onApplied/);
  assert.match(wardrobe, /"drop-01"/);
  assert.match(wardrobe, /"drop-02"/);
});
