import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const expectedNames = [
  "Blush scoop mini dress",
  "Orchid beaded column gown",
  "Sage asymmetric ruched maxi dress",
  "Magenta plunge ruched mini dress",
  "Silver off-shoulder mermaid dress",
  "Multicolor abstract strapless mini dress",
];

test("Shop renders the shared public-safe wardrobe preview without sale surfaces", async () => {
  const publicDraftModule = await import(
    new URL("../lib/wardrobe-public-view/drafts.ts", import.meta.url).href
  ) as typeof import("../lib/wardrobe-public-view/drafts");
  const { WARDROBE_PUBLIC_DRAFTS } = publicDraftModule;
  assert.deepEqual(WARDROBE_PUBLIC_DRAFTS.map((draft) => draft.name), expectedNames);

  for (const draft of WARDROBE_PUBLIC_DRAFTS) {
    assert.deepEqual(
      Object.keys(draft).sort(),
      ["colour", "cover", "name", "slug", "state"],
    );
    assert.deepEqual(Object.keys(draft.cover).sort(), ["alt", "height", "src", "width"]);
    assert.equal(draft.state, "Styling now");
    assert.match(draft.cover.src, /^\/studio\/wardrobe\/.+\/01-garment-front\.webp$/);
  }

  const publicFacts = JSON.stringify(WARDROBE_PUBLIC_DRAFTS);
  assert.doesNotMatch(
    publicFacts,
    /REVIEW-|private|operator|source\/|instagram|storage\/models|notes|references|quality/i,
  );

  const previewSource = readFileSync(
    join(process.cwd(), "components/shop/wardrobe-preview.tsx"),
    "utf8",
  );
  const shopHomeSource = readFileSync(
    join(process.cwd(), "components/shop/shop-home.tsx"),
    "utf8",
  );
  const wardrobeAuthoritySource = readFileSync(
    join(process.cwd(), "lib/studio/seeds/wardrobe-authority.ts"),
    "utf8",
  );
  const foundationCss = readFileSync(join(process.cwd(), "app/foundation.css"), "utf8");
  const previewCss = foundationCss.slice(foundationCss.lastIndexOf("/* Wardrobe preview */"));

  assert.match(previewSource, /lib\/wardrobe-public-view\/drafts/);
  assert.doesNotMatch(previewSource, /lib\/(?:studio|shop)\//);
  assert.doesNotMatch(previewSource, /\bhref\s*=|\/shop\/products\//);
  assert.match(previewSource, /From the wardrobe · Styling now/);
  assert.match(wardrobeAuthoritySource, /wardrobe-public-view\/drafts/);
  assert.match(wardrobeAuthoritySource, /title: draft\.name/);
  assert.match(wardrobeAuthoritySource, /color: draft\.colour/);
  assert.match(wardrobeAuthoritySource, /reviewCover: \{ \.\.\.draft\.cover \}/);
  for (const name of expectedNames) {
    assert.equal(wardrobeAuthoritySource.includes(name), false);
    assert.equal(previewSource.includes(name), false);
  }
  const previewPosition = shopHomeSource.indexOf("<WardrobePreview />");
  const discoveryPosition = shopHomeSource.indexOf("id=\"discover\"");
  assert.notEqual(previewPosition, -1);
  assert.notEqual(discoveryPosition, -1);
  assert.ok(previewPosition < discoveryPosition);
  assert.match(previewCss, /^\/\* Wardrobe preview \*\//);
  assert.doesNotMatch(previewCss, /(^|[;{]\s*)border\s*:/m);
});
