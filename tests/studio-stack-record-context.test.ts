import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { studioStackFallback } from "../components/studio/navigation/studio-stack-context";

const root = process.cwd();
const shell = readFileSync(`${root}/components/studio/app-shell.tsx`, "utf8");
const orders = readFileSync(`${root}/components/studio/connected-order-detail.tsx`, "utf8");
const stocktake = readFileSync(`${root}/components/studio/stocktake-workspace.tsx`, "utf8");
const media = readFileSync(`${root}/components/shoot/shoot-detail.tsx`, "utf8");

test("stack fallbacks return records to their meaningful parent and services to Home", () => {
  assert.deepEqual(studioStackFallback("/studio/orders/JUW-ORDER-1", null), {
    backHref: "/studio/orders",
    backLabel: "Orders",
    title: "Order",
  });
  assert.deepEqual(studioStackFallback("/studio/media/media-1", null), {
    backHref: "/studio/media",
    backLabel: "Atelier",
    title: "Atelier media",
  });
  assert.deepEqual(studioStackFallback("/studio/scan/JUW-001", null), {
    backHref: "/studio/stocktake",
    backLabel: "Stock count",
    title: "Scan",
  });
  assert.equal(studioStackFallback("/studio/operations", "inventory").backHref, "/studio");
});

test("record pages register concise context and do not render a second local Back", () => {
  assert.match(shell, /const stack = registered \?\? fallback/);
  assert.match(shell, /href=\{stack\.backHref\}/);
  assert.match(orders, /title: order\?\.reference \?\? reference/);
  assert.doesNotMatch(orders, /studio-connected-order-back|<ArrowLeft/);
  assert.match(stocktake, /title: mode === "scan" \? data\?\.piece\?\.sku \?\? "Scan"/);
  assert.doesNotMatch(stocktake, /studio-dossier-back|<ArrowLeft/);
  assert.match(media, /title: media\?\.sku \?\? \(media \? label\(media\.operation\) : "Atelier media"\)/);
  assert.doesNotMatch(media, /className="back-link"|shoot-titlebar/);
});

test("receipts name consequence and next destination while secondary history stays collapsed", () => {
  assert.match(orders, /Order is \$\{orderStateLabel\(body\.order\.lifecycleStatus\)\.toLowerCase\(\)\}\. Next:/);
  assert.match(orders, /<details className="studio-transition-action studio-order-timeline">/);
  assert.match(media, /View kept in the private garment record\. Next: open the piece\./);
  assert.match(media, /<summary>Generation history<span>Provenance<\/span><\/summary>/);
  assert.match(stocktake, /<summary>Recent checks<span>History<\/span><\/summary>/);
  assert.match(stocktake, /receipt\.consequence/);
  assert.match(stocktake, /receipt\.next/);
});
