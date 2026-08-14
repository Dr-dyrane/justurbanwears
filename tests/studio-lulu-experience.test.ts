import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Wardrobe exposes a visual next action and an in-app Lulu guide", async () => {
  const [workbench, css] = await Promise.all([
    read("components/studio/wardrobe-workbench.tsx"),
    read("app/foundation.css"),
  ]);

  assert.match(workbench, /studio-piece-next/);
  assert.match(workbench, /One piece\. One action\./);
  assert.match(workbench, /Unseen back and detail stay missing/);
  assert.match(css, /\.studio-guide-flow/);
  assert.match(css, /scroll-snap-type: x mandatory/);
});

test("Wear deduplicates editorial choices and separates rejected history", async () => {
  const wear = await read("components/studio/garment-intake/wear-sheet.tsx");
  assert.match(wear, /latestTryOnByModel/);
  assert.match(wear, /studio-wear-history/);
  assert.match(wear, /not kept/);
});

test("Lulu guide reflects the live private production contract", async () => {
  const [renderer, guide] = await Promise.all([
    read("scripts/render-lulu-garment-intake-guide.mjs"),
    read("docs/order-flows/JUST-URBAN-WEARS-ORDER-FLOWS.md"),
  ]);
  assert.match(renderer, /LIVE · PRIVATE/);
  assert.match(renderer, /Front never invents back/);
  assert.match(guide, /live private flow/);
  assert.doesNotMatch(guide, /AI intake is active/);
});
