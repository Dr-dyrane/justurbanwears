import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const routeLinkConsumers = [
  "components/studio/app-shell.tsx",
  "components/studio/studio-home.tsx",
  "components/studio/operations-desk.tsx",
  "components/garment/garment-library.tsx",
  "components/garment/garment-detail.tsx",
  "components/shoot/shoot-gallery.tsx",
  "components/shoot/shoot-detail.tsx",
] as const;

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("Studio route links use the reliable native document boundary", () => {
  for (const path of routeLinkConsumers) {
    const contents = source(path);
    assert.doesNotMatch(contents, /next\/link/u, `${path} must not use intercepted client links`);
    assert.match(contents, /StudioLink as Link/u, `${path} must use StudioLink`);
  }

  const link = source("components/studio/atoms/studio-link.tsx");
  assert.match(link, /return <a href=\{href\}/u);
  assert.match(link, /event\.defaultPrevented/u);
  assert.match(link, /event\.metaKey/u);
  assert.match(link, /event\.ctrlKey/u);
  assert.match(link, /samePageHash/u);
  assert.match(link, /This work is not saved\. Leave this page\?/u);
});
