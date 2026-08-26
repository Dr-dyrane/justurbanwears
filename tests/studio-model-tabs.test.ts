import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const modelAtelier = readFileSync(`${root}/components/studio/model-atelier.tsx`, "utf8");
const segmentedView = readFileSync(`${root}/components/studio/atoms/studio-segmented-view.tsx`, "utf8");

test("Model tabs identify and label the active panel", () => {
  assert.match(segmentedView, /id=\{`studio-tab-\$\{segment\.key\}`\}/);
  assert.match(segmentedView, /aria-controls=\{active === segment\.key \? panelId : undefined\}/);
  assert.match(modelAtelier, /id=\{`studio-view-\$\{activeView\}`\}/);
  assert.match(modelAtelier, /aria-labelledby=\{`studio-tab-\$\{activeView\}`\}/);
  assert.match(modelAtelier, /role="tabpanel"/);
});

test("Model tabs retain keyboard navigation for arrows and boundaries", () => {
  for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) {
    assert.match(segmentedView, new RegExp(`event\\.key === "${key}"`));
  }
  assert.match(segmentedView, /tabIndex=\{active === segment\.key \? 0 : -1\}/);
});
