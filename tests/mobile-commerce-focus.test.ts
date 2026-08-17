import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const detail = await readFile(new URL("../components/shop/product-detail.tsx", import.meta.url), "utf8");
const gallery = await readFile(new URL("../components/shop/product-media-gallery.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/mobile-experience.css", import.meta.url), "utf8");

test("mobile garment focus keeps buying truth immediately after the image", () => {
  assert.match(gallery, /role="region"[\s\S]*?tabIndex=\{0\}/);
  assert.match(detail, /<dd>\{product\.taggedSize\}<small>\{product\.fit\}<\/small><\/dd>/);
  assert.match(detail, /<dd>\{product\.colour\}<small>\{product\.condition\}<\/small><\/dd>/);
  assert.match(css, /height: min\(50svh, 430px\)/);
  assert.match(css, /shop-detail-note[\s\S]*?display: none/);
  assert.match(css, /grid-template-columns: minmax\(0, 1\.35fr\) minmax\(0, 0\.9fr\)/);
});
