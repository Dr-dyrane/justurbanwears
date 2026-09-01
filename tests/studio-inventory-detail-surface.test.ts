import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const operations = readFileSync(`${root}/components/studio/operations-desk.tsx`, "utf8");
const css = readFileSync(`${root}/app/foundation.css`, "utf8");
const nativeCss = readFileSync(`${root}/app/studio-stack-navigation.css`, "utf8");

test("inventory rows open one named detail sheet instead of mutating stock inline", () => {
  const listStart = operations.indexOf("studio-inventory-list");
  const listEnd = operations.indexOf("<StudioPager label=\"Inventory pages\"", listStart);
  const inventoryList = operations.slice(listStart, listEnd);

  assert.match(inventoryList, /aria-haspopup="dialog"/);
  assert.match(inventoryList, /openPiece/);
  assert.match(inventoryList, /studio-inventory-row-trigger/);
  assert.doesNotMatch(inventoryList, /studio\.reserveOrder/);
  assert.doesNotMatch(inventoryList, /Mark sold/);
});

test("the sheet exposes facts and only authority-backed physical actions", () => {
  assert.match(operations, /studio-inventory-detail-facts/);
  assert.match(operations, /Confirm at \$\{location\.label\}/);
  assert.match(operations, /Move to \$\{location\.label\}/);
  assert.match(operations, /Hold for customer/);
  assert.match(operations, /Release hold/);
  assert.match(operations, /Open order/);
  assert.match(operations, /Open piece/);
  assert.match(operations, /selected\.imageSrc \? <figure className="studio-inventory-detail-media is-photo"/);
  assert.doesNotMatch(operations, /: <Shirt aria-hidden="true" size=\{42\}/);
  assert.match(operations, /studio-inventory-detail-state/);
  assert.match(css, /\.studio-inventory-detail-sheet/);
  assert.match(css, /\.studio-inventory-decision-grid/);
  assert.match(nativeCss, /\.studio-inventory-detail-facts > div[\s\S]*?background: transparent;/);
  assert.match(operations, /authority\.recordLocation/);
  assert.match(operations, /confirmsExpected \? void recordLocation\(selected, location\.key, "CONFIRM"\) : openLocationMove\(selected, location, event\.currentTarget\)/);
  assert.match(operations, /setLocationMoveReview\(\{ piece, target \}\)/);
  assert.match(operations, /onConfirm=\{confirmLocationMove\}/);
  assert.match(operations, /title=\{`Move to \$\{locationMoveReview\?\.target\.label/);
  assert.match(operations, /confirmLabel="Move"/);
  assert.match(operations, /Shop and orders stay unchanged/);
  assert.doesNotMatch(operations, /window\.confirm/);
  assert.match(operations, /authority\.createHold/);
  assert.match(operations, /authority\.releaseHold/);
  assert.doesNotMatch(operations, /Reserve 1 unit|Mark sold|studio\.reserveOrder/);
});
