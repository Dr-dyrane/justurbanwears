import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../app/experience-system.css", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const shopLayout = await readFile(new URL("../app/shop/layout.tsx", import.meta.url), "utf8");
const site = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const shop = await readFile(new URL("../components/shop/shop-shell.tsx", import.meta.url), "utf8");
const studio = await readFile(new URL("../components/studio/app-shell.tsx", import.meta.url), "utf8");
const studioHome = await readFile(new URL("../components/studio/studio-home.tsx", import.meta.url), "utf8");
const canon = await readFile(new URL("../docs/experience/EXPERIENCE-SYSTEM.md", import.meta.url), "utf8");

test("loads the experience layer after the mature surface styles", () => {
  const foundation = layout.indexOf('import "./foundation.css"');
  const experience = layout.indexOf('import "./experience-system.css"');

  assert.ok(foundation >= 0);
  assert.ok(experience > foundation);
  assert.match(shopLayout, /import "\.\.\/shop-editorial-hero\.css"/);
});

test("routes the retired Site entrance into Shop and keeps Shop and Studio tempos explicit", () => {
  assert.match(site, /permanentRedirect\("\/shop"\)/);
  assert.match(shop, /data-experience-surface="shop"/);
  assert.match(shop, /data-experience-tempo="focus"/);
  assert.match(studio, /data-experience-surface="studio"/);
  assert.match(studio, /data-experience-tempo="resolve"/);

  assert.match(css, /\[data-experience-surface="site"\]\[data-experience-tempo="editorial"\]/);
  assert.match(css, /\[data-experience-surface="shop"\]\[data-experience-tempo="focus"\]/);
  assert.match(css, /\[data-experience-surface="studio"\]\[data-experience-tempo="resolve"\]/);
});

test("implements the approved material, motion, spacing, and layer grammar", () => {
  for (const token of [
    "--juw-material-ink",
    "--juw-material-paper",
    "--juw-material-nude",
    "--juw-intent",
    "--juw-space-page-inset",
    "--juw-space-island-clearance",
    "--juw-motion-press",
    "--juw-motion-hover-in",
    "--juw-motion-hover-out",
    "--juw-motion-sheet",
    "--juw-motion-focus",
    "--juw-motion-editorial",
    "--juw-layer-canvas",
    "--juw-layer-content",
    "--juw-layer-elevated",
    "--juw-layer-island",
    "--juw-layer-sheet",
    "--juw-layer-critical",
  ]) {
    assert.match(css, new RegExp(`${token}:`));
  }

  assert.match(canon, /Ink\. Paper\. Skin\. Coral\./);
  assert.match(canon, /Everything responds; not everything moves/);
  assert.match(canon, /The Site invites/);
  assert.match(canon, /The Shop focuses/);
  assert.match(canon, /The Studio resolves/);
});

test("keeps the shared island contextual and the signature underlay opt-in", () => {
  assert.match(shop, /data-experience-layer="island"/);
  assert.match(studio, /data-experience-layer="island"/);
  assert.match(shop, /data-experience-action="primary"/);
  assert.match(studioHome, /data-experience-action="primary"/);
  assert.match(css, /\[data-experience-layer="island"\]/);
  assert.match(css, /\[data-experience-action="primary"\]::after/);
  assert.match(css, /translate3d\(-102%, 0, 0\)/);
  assert.doesNotMatch(css, /\.button::after/);
});

test("preserves reduced-motion, forced-colour, and non-colour focus paths", () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /outline: 2px solid currentColor/);
  assert.match(css, /outline: 2px solid Highlight/);
  assert.match(css, /box-shadow:[\s\S]*var\(--juw-material-paper\)[\s\S]*var\(--juw-material-ink\)/);
});
