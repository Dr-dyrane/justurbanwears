import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");

test("Studio count labels name the set being counted", () => {
  const home = read("components/studio/studio-home.tsx");
  const operations = read("components/studio/operations-desk.tsx");
  const stocktake = read("components/studio/stocktake-workspace.tsx");
  const settings = read("components/studio/settings/studio-settings-center.tsx");

  assert.match(home, /<small>Available now<\/small>/);
  assert.match(operations, /\{ key: "inventory", label: "All records", count: pieces\.length \}/);
  assert.equal((stocktake.match(/expected at this location/g) ?? []).length, 2);
  assert.match(settings, /expected across Studio locations/);
  assert.match(settings, /available now/);
});

test("model authority readiness is distinct from generation capability", () => {
  const models = read("components/studio/model-atelier.tsx");
  const createMedia = read("components/shoot/shoot-composer.tsx");
  const settings = read("components/studio/settings/studio-settings-center.tsx");

  assert.match(models, /Authority approved · on-model generation not enabled/);
  assert.match(models, /approved model \$\{readyModels\.length === 1 \? "authority" : "authorities"\}/);
  assert.match(createMedia, /Model authority is approved, but on-model generation is not enabled yet/);
  assert.match(settings, /approved model \$\{readyModels === 1 \? "authority" : "authorities"\}/);
});

test("publishing stays a Wardrobe filter instead of a second Shop identity", () => {
  const stack = read("components/studio/navigation/studio-stack-context.tsx");
  const context = read("components/studio/navigation/studio-desktop-context-stage.tsx");
  const wardrobe = read("components/studio/wardrobe-workbench.tsx");

  assert.match(stack, /view === "publishing"\) return \{ backHref: "\/studio", backLabel: "Studio Home", title: "Wardrobe" \}/);
  assert.match(context, /label: "Wardrobe filter"/);
  assert.match(context, /subject: "Needs publishing"/);
  assert.match(wardrobe, /filter === "NEEDS_PUBLISHING" \? "Needs publishing"/);
  assert.doesNotMatch(wardrobe, /<StudioSegmentedView active=\{activeView\}/);
});
