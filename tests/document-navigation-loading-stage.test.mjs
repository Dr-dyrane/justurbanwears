import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("the root build bridges slow native document navigation into the brand stage", async () => {
  const [layout, bridge, stage, shopLink, studioLink] = await Promise.all([
    readFile(path.join(root, "app", "layout.tsx"), "utf8"),
    readFile(path.join(root, "components", "brand", "document-navigation-loading-stage.tsx"), "utf8"),
    readFile(path.join(root, "components", "brand", "global-brand-loading-stage.tsx"), "utf8"),
    readFile(path.join(root, "components", "shop", "atoms", "shop-link.tsx"), "utf8"),
    readFile(path.join(root, "components", "studio", "atoms", "studio-link.tsx"), "utf8"),
  ]);

  assert.match(layout, /<DocumentNavigationLoadingStage \/>/);
  assert.match(shopLink, /return <a href=\{href\}/);
  assert.match(studioLink, /return <a href=\{href\} onClick=\{follow\}/);
  assert.match(bridge, /document\.addEventListener\("click", handleClick\)/);
  assert.match(bridge, /document\.addEventListener\("submit", handleSubmit\)/);
  assert.match(bridge, /window\.addEventListener\("pageshow", reset\)/);
  assert.match(bridge, /anchor\.hasAttribute\("download"\)/);
  assert.match(bridge, /anchor\.dataset\.navigationLoading === "off"/);
  assert.match(bridge, /event\.defaultPrevented/);
  assert.match(bridge, /event\.button !== 0/);
  assert.match(bridge, /destination\.origin === window\.location\.origin/);
  assert.match(bridge, /isSameDocumentDestination\(destination\)/);
  assert.match(bridge, /active \? <GlobalBrandLoadingStage delayMs=\{0\} \/> : null/);
  assert.match(stage, /GLOBAL_BRAND_LOADING_DELAY_MS = 0/);
});
