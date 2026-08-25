import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), "utf8");
const gallery = read("components/shoot/shoot-gallery.tsx");
const composer = read("components/shoot/shoot-composer.tsx");
const detail = read("components/shoot/shoot-detail.tsx");

test("Atelier routes use the shared native stack and feedback grammar", () => {
  for (const source of [gallery, composer, detail]) {
    assert.match(source, /StudioStackPage/);
    assert.match(source, /StudioStackSection/);
    assert.match(source, /StudioFeedback/);
    assert.doesNotMatch(source, /StatusPill|PageHeading/);
  }
  assert.match(gallery, /kind="service"/);
  assert.match(composer, /kind="workflow"/);
  assert.match(detail, /kind="record"/);
});

test("Atelier gallery rows keep only image, title, media state, and disclosure", () => {
  assert.match(gallery, /className="shoot-card-copy"><h2>\{item\.title\}<\/h2><p><span>\{label\(item\.operation\)\}<\/span><LifecycleMeta/);
  assert.match(gallery, /className="shoot-card-disclosure"/);
  assert.doesNotMatch(gallery, /item\.createdAt|item\.modelName|shoot-card-overlay/);
});

test("Atelier record keeps one primary decision and collapses correction and provenance", () => {
  assert.match(detail, /Keep view[\s\S]*?<details className="studio-transition-action review-secondary-decisions">/);
  assert.match(detail, /Fix or reject/);
  assert.match(detail, /Add correction[\s\S]*?Retry once/);
  assert.match(detail, /<summary>Generation history<span>Provenance<\/span><\/summary>/);
  assert.match(detail, /Generation history[\s\S]*?media\.createdAt/);
  assert.match(detail, /<StudioFeedback detail=\{receipt\} state="success" title="Saved"/);
  assert.match(detail, /<StudioFeedback detail=\{error\} state="error" title="Couldn’t save"/);
});
