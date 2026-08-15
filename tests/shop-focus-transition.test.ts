import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const experience = await readFile(new URL("../app/experience-system.css", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const focusBootstrap = await readFile(new URL("../lib/ui/shop-focus-transition-script.ts", import.meta.url), "utf8");
const action = await readFile(new URL("../components/shop/atoms/action.tsx", import.meta.url), "utf8");
const productCard = await readFile(new URL("../components/shop/product-card.tsx", import.meta.url), "utf8");
const productDetail = await readFile(new URL("../components/shop/product-detail.tsx", import.meta.url), "utf8");
const shopHome = await readFile(new URL("../components/shop/shop-home.tsx", import.meta.url), "utf8");

test("Shop focus transitions remain same-origin, route-based, and motion-safe", () => {
  assert.match(layout, /shopFocusTransitionScript/);
  assert.match(layout, /dangerouslySetInnerHTML=\{\{ __html: shopFocusTransitionScript \}\}/);
  assert.match(focusBootstrap, /String\.raw/);
  assert.match(focusBootstrap, /pageswap/);
  assert.match(focusBootstrap, /pagereveal/);
  assert.match(focusBootstrap, /\/shop\\\/products\\\//);
  assert.match(focusBootstrap, /sessionStorage/);
  assert.match(focusBootstrap, /viewTransitionName/);
  assert.match(focusBootstrap, /skipTransition/);
  assert.doesNotMatch(focusBootstrap, /fetch\(|startViewTransition/);
  assert.match(experience, /@media \(prefers-reduced-motion: no-preference\)[\s\S]*@view-transition[\s\S]*navigation: auto/);
  assert.match(experience, /::view-transition-old\(root\)[\s\S]*animation: none/);
  assert.doesNotMatch(experience, /@media \(prefers-reduced-motion: reduce\)[\s\S]*navigation: auto/);
});

test("Discovery and garment routes expose one matching visual anchor", () => {
  assert.match(productCard, /data-product-transition=\{product\.slug\}/);
  assert.match(shopHome, /data-product-transition=\{heroProduct\?\.slug\}/);
  assert.match(productDetail, /data-product-transition=\{product\.slug\}/);
  assert.match(productDetail, /data-experience-focus="garment"/);
  assert.match(productDetail, /href="\/shop#discover"/);
  assert.doesNotMatch(productDetail, /window\.history\.pushState\([^)]*shop-product-page/);
});

test("Primary Shop actions opt into the single intent underlay", () => {
  const matches = action.match(/data-experience-action=\{tone === "primary" \? "primary" : undefined\}/g) ?? [];
  assert.equal(matches.length, 2);
});
