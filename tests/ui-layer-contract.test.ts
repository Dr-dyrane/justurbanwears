import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const foundation = readFileSync(join(process.cwd(), "app/foundation.css"), "utf8");
const globals = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function selectorUses(source: string, selector: string, declaration: string) {
  const rules = [...source.matchAll(new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`, "g"))];
  return rules.some((match) => match[1].includes(declaration));
}

test("keeps one named cross-surface layer contract", () => {
  for (const declaration of [
    "--z-content: 1",
    "--z-route-sticky: 30",
    "--z-studio-subnav: 42",
    "--z-status: 88",
    "--z-header: 90",
    "--z-mobile-chrome: 95",
    "--z-skip-link: 120",
  ]) {
    assert.match(foundation, new RegExp(escapeRegExp(declaration)));
  }

  assert.equal(selectorUses(foundation, ".shop-shell main", "z-index: var(--z-content)"), true);
  assert.equal(selectorUses(globals, ".workspace", "z-index: var(--z-content)"), true);
  assert.equal(selectorUses(foundation, ".shop-discovery-bar", "z-index: var(--z-route-sticky)"), true);
  assert.equal(selectorUses(foundation, ".shop-search-toolbar", "z-index: var(--z-route-sticky)"), true);
  assert.equal(selectorUses(foundation, ".studio-view-nav-wrap", "z-index: var(--z-studio-subnav)"), true);
  assert.equal(selectorUses(foundation, ".shop-header", "z-index: var(--z-header)"), true);
  assert.equal(selectorUses(foundation, ".shop-mobile-shell", "z-index: var(--z-mobile-chrome)"), true);
  assert.equal(selectorUses(foundation, ".shop-skip-link", "z-index: var(--z-skip-link)"), true);
});

test("keeps the noninteractive offline status out of the hit-test path", () => {
  assert.equal(selectorUses(foundation, ".shop-offline-banner", "z-index: var(--z-status)"), true);
  assert.equal(selectorUses(foundation, ".shop-offline-banner", "pointer-events: none"), true);
});
