import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Studio home resolves around one dominant task and quieter business context", async () => {
  const home = await read("components/studio/studio-home.tsx");

  assert.match(home, /studio-home-recommendation/);
  assert.match(home, /primaryTask\.label/);
  assert.match(home, /studio-home-summary/);
  assert.match(home, />Recent</);
  assert.doesNotMatch(home, /studio-queue-grid/);
  assert.doesNotMatch(home, /studio-attention-primary/);
});

test("Atelier wave finishes desktop, mobile, dark, and reduced-motion treatment", async () => {
  const [css, rootLayout, studioLayout] = await Promise.all([
    read("app/studio-atelier.css"),
    read("app/layout.tsx"),
    read("app/(studio)/layout.tsx"),
  ]);

  assert.doesNotMatch(rootLayout, /studio-atelier\.css/);
  assert.match(studioLayout, /studio-atelier\.css\?raw/);
  assert.match(studioLayout, /<style data-studio-atelier>\{studioAtelierCss\}<\/style>/);
  assert.match(css, /\.studio-attention-primary/);
  assert.match(css, /\.studio-garment-grid/);
  assert.match(css, /\.studio-model-layout/);
  assert.match(css, /\.studio-inventory-row-trigger/);
  assert.match(css, /\.studio-connected-order-card/);
  assert.match(css, /html\[data-theme="dark"\] \.studio-shell/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
