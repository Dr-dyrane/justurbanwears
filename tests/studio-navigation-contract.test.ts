import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const routeLinkConsumers = [
  "components/studio/app-shell.tsx",
  "components/studio/studio-home.tsx",
  "components/studio/connected-order-inbox.tsx",
  "components/studio/connected-order-detail.tsx",
  "components/studio/operations-desk.tsx",
  "components/garment/garment-library.tsx",
  "components/garment/garment-detail.tsx",
  "components/shoot/shoot-gallery.tsx",
  "components/shoot/shoot-detail.tsx",
  "components/studio/settings/studio-settings-center.tsx",
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
  assert.match(link, /<a href=\{href\} onClick=\{follow\}/u);
  assert.match(link, /event\.defaultPrevented/u);
  assert.match(link, /event\.metaKey/u);
  assert.match(link, /event\.ctrlKey/u);
  assert.match(link, /samePageHash/u);
  assert.match(link, /This work is not saved/u);
  assert.match(link, /<StudioDecisionSheet/u);
  assert.doesNotMatch(link, /window\.confirm/u);
  assert.match(link, /assignDocumentNavigation\(pendingNavigation\.href\)/u);
  assert.match(link, /event\.currentTarget\.dataset\.pending = "true"/u);
  assert.match(link, /setAttribute\("aria-busy", "true"\)/u);
  assert.match(source("app/studio-stack-navigation.css"), /a\[data-pending="true"\]/u);
});

test("Wardrobe filter exposes its trigger with a leading filter icon", () => {
  const wardrobe = source("components/studio/wardrobe-workbench.tsx");
  const styles = source("app/studio-stack-navigation.css");

  assert.match(wardrobe, /className="studio-stack-filter-label"><SlidersHorizontal aria-hidden="true"/u);
  assert.match(wardrobe, /Filter · \{filter\.toLowerCase\(\)\}/u);
  assert.match(styles, /\.studio-stack-filter-label \{[\s\S]*?display: inline-flex;[\s\S]*?gap: 7px;/u);
});

test("Studio desktop shell uses the full canvas while compact navigation keeps its safe inset", () => {
  const styles = source("app/studio-stack-navigation.css");

  assert.doesNotMatch(styles, /--studio-stack-max/u);
  assert.match(styles, /\.studio-command-nav \{[\s\S]*?margin: 0;[\s\S]*?max-width: none;[\s\S]*?padding: 6px clamp\(14px, 2\.2vw, 40px\);[\s\S]*?width: 100%;/u);
  assert.match(styles, /\.studio-stack-shell \.page-canvas:has\(> \.studio-home-control-plane\) \{[\s\S]*?margin-inline: 0;[\s\S]*?max-width: none;[\s\S]*?width: 100%;/u);
  assert.match(styles, /@media \(max-width: 680px\) \{[\s\S]*?\.studio-command-nav \{[\s\S]*?margin: 0 auto;[\s\S]*?max-width: calc\(100vw - 16px\);[\s\S]*?padding: 6px;/u);
});
