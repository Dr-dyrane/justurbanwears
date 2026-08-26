import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const home = readFileSync(`${root}/components/studio/studio-home.tsx`, "utf8");
const wardrobe = readFileSync(`${root}/components/studio/wardrobe-workbench.tsx`, "utf8");

test("Home keeps one primary recommendation and exposes concise direct paths", () => {
  assert.match(home, /aria-label="More recommendations"/);
  assert.match(home, /label: "Change price"/);
  assert.match(home, /garment\.state !== "CANCELLED"/);
  assert.match(home, /garment\.availability !== "ARCHIVED"/);
  assert.match(home, /\?action=price#garment-lifecycle/);
  assert.match(home, /label: "Browse drops"/);
  assert.match(home, /\/studio\/wardrobe\?collection=choose/);
  assert.match(home, /label: "Add piece"/);
  assert.match(home, /\/studio\/wardrobe\?intake=1/);
  assert.match(home, /label: "Review Shop"/);
  assert.doesNotMatch(home, /label: "(?:Change|Switch) drop"/);
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
