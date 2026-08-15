import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const experience = await readFile(new URL("../app/experience-system.css", import.meta.url), "utf8");
const sheetAtom = await readFile(new URL("../components/shop/atoms/sheet.tsx", import.meta.url), "utf8");
const filterSheet = await readFile(new URL("../components/shop/shop-filter-sheet.tsx", import.meta.url), "utf8");
const productInfo = await readFile(new URL("../components/shop/product-info-sheet.tsx", import.meta.url), "utf8");
const modelTryout = await readFile(new URL("../components/shop/product-model-tryout.tsx", import.meta.url), "utf8");
const mediaGallery = await readFile(new URL("../components/shop/product-media-gallery.tsx", import.meta.url), "utf8");
const historyHook = await readFile(new URL("../hooks/use-history-backed-dialog.ts", import.meta.url), "utf8");
const scrollHook = await readFile(new URL("../hooks/use-document-scroll-lock.ts", import.meta.url), "utf8");
const gestureHook = await readFile(new URL("../hooks/use-sheet-dismiss-gesture.ts", import.meta.url), "utf8");

test("Shop sheets expose one layer and optional handle-only dismissal grammar", () => {
  assert.match(sheetAtom, /data-experience-layer="sheet"/);
  assert.match(sheetAtom, /forwardRef<[\s\S]*HTMLDivElement[\s\S]*HTMLAttributes<HTMLDivElement>/);
  assert.match(experience, /data-sheet-gesture="dismiss"/);
  assert.match(experience, /data-sheet-dragging="true"/);
  assert.match(experience, /pointer: coarse/);
  assert.match(gestureHook, /setPointerCapture/);
  assert.match(gestureHook, /releasePointerCapture/);
  assert.match(gestureHook, /threshold/);
  assert.match(gestureHook, /prefers-reduced-motion: reduce/);
});

test("every Shop overlay keeps a non-gesture close path and restores document control", () => {
  for (const source of [filterSheet, productInfo, modelTryout]) {
    assert.match(source, /ShopSheetCloseButton/);
    assert.match(source, /onCancel=/);
    assert.match(source, /useDocumentScrollLock/);
    assert.match(source, /useSheetDismissGesture/);
  }
  assert.match(mediaGallery, /data-experience-layer="sheet"/);
  assert.match(mediaGallery, /useDocumentScrollLock/);
  assert.match(scrollHook, /activeLocks/);
  assert.match(scrollHook, /document\.body\.style\.overflow = "hidden"/);
  assert.match(scrollHook, /previousDocumentOverflow/);
});

test("product information and expanded media close on browser Back", () => {
  assert.match(historyHook, /history\.pushState/);
  assert.match(historyHook, /history\.back/);
  assert.match(historyHook, /popstate/);
  assert.match(historyHook, /window\.location\.href/);
  assert.doesNotMatch(historyHook, /pathname|searchParams/);

  for (const source of [productInfo, mediaGallery]) {
    assert.match(source, /useHistoryBackedDialog/);
    assert.match(source, /aria-controls=/);
    assert.match(source, /aria-haspopup="dialog"/);
    assert.match(source, /onCancel=/);
  }
  assert.match(productInfo, /returnFocusRef\.current\?\.focus/);
  assert.match(mediaGallery, /returnFocusRef\.current\?\.focus/);
  assert.match(mediaGallery, /className="shop-media-dialog-close"[\s\S]*onClick=\{closeViewer\}/);
});
