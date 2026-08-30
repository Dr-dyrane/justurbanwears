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
  assert.match(gallery, /className="shoot-card-copy"><h2>\{item\.title\}<\/h2><p><span>\{privateMediaUnavailable \? "Private media unavailable" : label\(item\.operation\)\}<\/span><MediaStateMeta/);
  assert.match(gallery, /className="shoot-card-disclosure"/);
  assert.doesNotMatch(gallery, /item\.createdAt|item\.modelName|shoot-card-overlay/);
});

test("Atelier record keeps one adaptive review surface and the canonical decision grammar", () => {
  assert.equal(detail.match(/<StudioAdaptiveWorkspace/g)?.length, 1);
  assert.doesNotMatch(detail, /<aside className="review-panel"|<div className="review-workspace"/);
  assert.match(detail, />Keep<\/button>[\s\S]*?<details className="studio-transition-action review-secondary-decisions">/);
  assert.match(detail, /Fix one thing or Reject/);
  assert.match(detail, /required rows=\{3\}[\s\S]*?>Fix one thing<\/button>[\s\S]*?>Reject<\/button>/);
  assert.doesNotMatch(detail, /Retry once|Add correction|>Optional</);
  assert.match(detail, /<summary>Generation history<span>Provenance<\/span><\/summary>/);
  assert.match(detail, /Generation history[\s\S]*?media\.createdAt/);
  assert.match(detail, /<StudioFeedback detail=\{receipt\} state="success" title="Saved"/);
  assert.match(detail, /<StudioFeedback detail=\{error\} state="error" title="Couldn’t save"/);
});
