import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const operations = readFileSync(`${root}/components/studio/operations-desk.tsx`, "utf8");
const css = readFileSync(`${root}/app/foundation.css`, "utf8");

test("inventory rows open one named detail sheet instead of mutating stock inline", () => {
  const listStart = operations.indexOf("studio-inventory-list");
  const listEnd = operations.indexOf("<StudioPager label=\"Inventory pages\"", listStart);
  const inventoryList = operations.slice(listStart, listEnd);

  assert.match(inventoryList, /aria-haspopup="dialog"/);
  assert.match(inventoryList, /openInventoryDetail/);
  assert.match(inventoryList, /studio-inventory-row-trigger/);
  assert.doesNotMatch(inventoryList, /studio\.reserveOrder/);
  assert.doesNotMatch(inventoryList, /Mark sold/);
});

test("the sheet exposes facts and only lifecycle-backed actions", () => {
  assert.match(operations, /studio-inventory-detail-facts/);
  assert.match(operations, /Reserve 1 unit/);
  assert.match(operations, /Mark sold/);
  assert.match(operations, /Release reservation/);
  assert.match(operations, /Open return/);
  assert.match(operations, /Review return/);
  assert.match(operations, /View listing/);
  assert.match(css, /\.studio-inventory-detail-sheet/);
  assert.match(css, /\.studio-inventory-decision-grid/);
  assert.match(operations, /pendingInventoryDecision/);
  assert.match(operations, /confirmInventoryDecision/);
  assert.match(operations, /Reserve this piece\?/);
  assert.match(operations, /Release this reservation\?/);
  assert.match(css, /\.studio-inventory-confirmation/);
});
