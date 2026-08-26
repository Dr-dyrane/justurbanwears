import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("Studio Home keeps garment status compact, semantic, and motion-aware", async () => {
  const [home, meta, styles] = await Promise.all([
    readFile(path.join(root, "components", "studio", "studio-home.tsx"), "utf8"),
    readFile(path.join(root, "components", "studio", "atoms", "lifecycle-meta.tsx"), "utf8"),
    readFile(path.join(root, "app", "studio-stack-navigation.css"), "utf8"),
  ]);

  assert.doesNotMatch(home, /LifecycleBadge/);
  assert.match(home, /STUDIO_LIFECYCLE_PRESENTATION/);
  assert.match(meta, /Record<StudioLifecycleState/);
  assert.match(meta, /Needs attention/);
  assert.match(home, /data-state-tone=\{status\.tone\}/);
  assert.match(home, /LifecycleMeta className="studio-recent-status"/);
  assert.match(home, /className="studio-recent-disclosure"/);
  assert.match(home, /artwork="logo" className="studio-home-signoff-mark" polarity="auto" size="sm" variant="footer"/);

  assert.match(styles, /grid-template-columns: 86px minmax\(0, 1fr\) 20px/);
  assert.match(styles, /grid-template-columns: 78px minmax\(0, 1fr\) 18px/);
  assert.match(styles, /\.studio-recent-row\[data-state-tone="positive"\]/);
  assert.match(styles, /\.studio-recent-row\[data-state-tone="caution"\]/);
  assert.match(styles, /\.studio-recent-row\[data-state-tone="critical"\]/);
  assert.match(styles, /background: color-mix\(in srgb, var\(--studio-recent-tone\) 5%, var\(--studio-home-sheet\)\)/);
  assert.match(styles, /prefers-reduced-motion: reduce[\s\S]*?\.studio-home-sheet \.studio-recent-status > svg/);
});

test("Studio stack lists share one near-black, metadata-first row grammar", async () => {
  const [operations, orders, wardrobe, models, styles, atelier] = await Promise.all([
    readFile(path.join(root, "components", "studio", "operations-desk.tsx"), "utf8"),
    readFile(path.join(root, "components", "studio", "connected-order-inbox.tsx"), "utf8"),
    readFile(path.join(root, "components", "studio", "wardrobe-workbench.tsx"), "utf8"),
    readFile(path.join(root, "components", "studio", "model-atelier.tsx"), "utf8"),
    readFile(path.join(root, "app", "studio-stack-navigation.css"), "utf8"),
    readFile(path.join(root, "app", "studio-atelier.css"), "utf8"),
  ]);

  assert.match(operations, /studio-inventory-meta/);
  assert.doesNotMatch(operations, /studio-inventory-action"><LifecycleBadge/);
  assert.match(operations, /studio-operation-card studio-compact-row/);
  assert.match(orders, /studio-connected-order-card studio-compact-row/);
  assert.match(wardrobe, /studio-publishing-row studio-compact-row/);
  assert.match(wardrobe, /const cover = studioGarmentCover\(garment, listing\)/);
  assert.match(wardrobe, /className=\{`studio-publishing-media\$\{cover \? " is-photo" : ""\}`\}/);
  assert.match(wardrobe, /className="studio-publishing-copy"/);
  assert.match(models, /studio-model-option[\s\S]*?<LifecycleMeta state="READY"/);

  assert.match(styles, /html\[data-theme="dark"\] \.studio-stack-shell \{/);
  assert.match(styles, /--studio-canvas: var\(--dyrane-dark-canvas\)/);
  assert.match(styles, /\.studio-compact-row\[data-state-tone="critical"\]/);
  assert.match(styles, /\.studio-inventory-row-trigger[\s\S]*?grid-template-columns: 74px minmax\(0, 1fr\) minmax\(116px, \.55fr\) 20px/);
  assert.match(styles, /grid-template-columns: 78px minmax\(0, 1fr\) 18px/);
  assert.match(styles, /\.studio-publishing-media[\s\S]*?object-position: center top/);
  assert.match(styles, /\.studio-connected-order-card[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 20px/);
  assert.match(styles, /prefers-reduced-motion: reduce[\s\S]*?\.studio-compact-row/);

  assert.match(atelier, /--atelier-canvas: var\(--dyrane-dark-canvas\)/);
  assert.match(atelier, /--atelier-panel-strong: var\(--dyrane-dark-surface-strong\)/);
});
