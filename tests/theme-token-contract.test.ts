import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const globals = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const foundation = readFileSync(join(process.cwd(), "app/foundation.css"), "utf8");

test("shares one Dyrane dark material contract across Shop and Studio", () => {
  for (const token of [
    "--dyrane-dark-canvas",
    "--dyrane-dark-canvas-deep",
    "--dyrane-dark-floor",
    "--dyrane-dark-surface",
    "--dyrane-dark-surface-strong",
    "--dyrane-dark-surface-muted",
    "--dyrane-dark-surface-hover",
    "--dyrane-dark-ink",
    "--dyrane-dark-muted",
    "--dyrane-dark-faint",
    "--dyrane-dark-accent",
    "--dyrane-dark-action",
    "--dyrane-dark-glass",
  ]) {
    assert.match(globals, new RegExp(`${token}:`));
  }

  for (const declaration of [
    "--shop-canvas: var(--dyrane-dark-canvas)",
    "--shop-paper: var(--dyrane-dark-surface)",
    "--shop-ink: var(--dyrane-dark-ink)",
    "--shop-nav-hover: var(--dyrane-dark-surface-hover)",
    "--studio-canvas: var(--dyrane-dark-canvas)",
    "--studio-panel: var(--dyrane-dark-surface)",
    "--studio-ink: var(--dyrane-dark-ink)",
    "--studio-panel-muted: var(--dyrane-dark-surface-muted)",
  ]) {
    assert.match(foundation, new RegExp(declaration.replace(/[()]/g, "\\$&")));
  }
});

test("keeps the shopper dark theme semantic instead of a flat light inversion", () => {
  assert.match(
    foundation,
    /html\[data-theme="dark"\] \.shop-shell \{[\s\S]*?radial-gradient\(circle at 84% -2%[\s\S]*?var\(--dyrane-dark-floor\)/,
  );
  assert.doesNotMatch(foundation, /filter:\s*invert\(/);
});
