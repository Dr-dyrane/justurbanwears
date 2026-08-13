import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const css = readFileSync(join(process.cwd(), "app/foundation.css"), "utf8");

test("Studio exposes a disciplined four-depth colour hierarchy", () => {
  for (const token of [
    "--studio-canvas:",
    "--studio-panel:",
    "--studio-panel-strong:",
    "--studio-panel-hover:",
    "--studio-selection:",
  ]) {
    assert.match(css, new RegExp(token));
  }

  assert.match(css, /\.studio-queue-card\.has-work \{\s*background: var\(--studio-selection\)/);
  assert.match(css, /\.studio-segmented-view > button\.is-active \{\s*background: var\(--studio-panel-strong\)/);
  assert.match(css, /html:has\(\.studio-shell\),\s*\.studio-shell \{/);
  assert.match(css, /html\[data-theme="dark"\]:has\(\.studio-shell\),\s*html\[data-theme="dark"\] \.studio-shell \{/);
});

test("coral owns primary action while cocoa remains structural", () => {
  for (const selector of [
    ".studio-shell .studio-mobile-fab",
    ".studio-view-action",
  ]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(css, new RegExp(`${escaped} \\{[\\s\\S]*?background: var\\(--studio-accent\\)`));
  }

  assert.match(css, /\.studio-shell \.studio-public-action \{[\s\S]*?background: var\(--studio-cocoa\)/);
  assert.match(css, /html\[data-theme="dark"\] \.studio-shell \{[\s\S]*?--studio-cocoa: var\(--dyrane-dark-surface-muted\)/);
  assert.match(css, /--studio-accent-display: var\(--dyrane-dark-accent\)/);
  assert.match(css, /--studio-accent: #b9583f/);
  assert.doesNotMatch(css, /--studio-cocoa: var\(--dyrane-dark-action\)/);
});
