import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const sharp = require(process.env.JUW_SHARP_MODULE || "sharp");
const root = process.cwd();
const motionRoot = path.join(root, "public", "brand", "motion");
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function alpha(pathname) {
  const { data, info } = await sharp(pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height, info.channels], [1024, 1024, 4]);
  const channel = new Uint8Array(info.width * info.height);
  for (let index = 0; index < channel.length; index += 1) channel[index] = data[index * 4 + 3];
  return channel;
}

test("wardrobe pieces form a lossless partition of the canonical production master", async () => {
  const manifest = JSON.parse(await readFile(path.join(motionRoot, "manifest.json"), "utf8"));
  const master = await readFile(path.join(root, "public", "brand", "icon-master-1024.png"));
  assert.equal(manifest.source, "/brand/icon-master-1024.png");
  assert.equal(manifest.sourceSha256, sha256(master));
  assert.equal(manifest.strategy, "lossless-nearest-component-partition-from-canonical-master");

  const names = ["base", "left-door", "right-door", "left-l", "right-l"];
  const masks = await Promise.all(names.map((name) => alpha(path.join(motionRoot, `${name}-mask.png`))));
  for (let index = 0; index < 1024 * 1024; index += 1) {
    const sum = masks.reduce((total, mask) => total + mask[index], 0);
    assert.equal(sum, 255, `mask partition drift at pixel ${index}`);
  }

  for (const [name, component] of Object.entries(manifest.components)) {
    const bytes = await readFile(path.join(motionRoot, `${name}-mask.png`));
    assert.equal(sha256(bytes), component.maskSha256);
  }
});

test("the reveal silhouette is derived from the exact gap between the approved wardrobe forms", async () => {
  const manifest = JSON.parse(await readFile(path.join(motionRoot, "manifest.json"), "utf8"));
  const silhouetteBytes = await readFile(path.join(motionRoot, "silhouette-mask.png"));
  const silhouette = await alpha(path.join(motionRoot, "silhouette-mask.png"));
  assert.equal(sha256(silhouetteBytes), manifest.silhouette.maskSha256);
  assert.ok(silhouette.some((value) => value === 255), "silhouette mask must expose canonical negative space");
  assert.deepEqual(manifest.components["left-door"].bounds, { left: 395, top: 181, right: 496, bottom: 815 });
  assert.deepEqual(manifest.components["right-door"].bounds, { left: 527, top: 183, right: 626, bottom: 815 });
});

test("WardrobeMotion always resolves through the untouched master and complete motion fallbacks", async () => {
  const [component, styles, types, assets, preview, notFound, loader] = await Promise.all([
    readFile(path.join(root, "components", "brand", "wardrobe-motion.tsx"), "utf8"),
    readFile(path.join(root, "components", "brand", "wardrobe-motion.module.css"), "utf8"),
    readFile(path.join(root, "components", "brand", "wardrobe-motion.types.ts"), "utf8"),
    readFile(path.join(root, "lib", "brand", "assets.ts"), "utf8"),
    readFile(path.join(root, "app", "dev", "brand-motion", "page.tsx"), "utf8"),
    readFile(path.join(root, "app", "not-found.tsx"), "utf8"),
    readFile(path.join(root, "components", "shoot", "shoot-gallery.tsx"), "utf8"),
  ]);

  assert.match(assets, /motionMaster: "\/brand\/icon-master-1024\.png\?v=2026\.3-seal"/);
  assert.match(component, /src: BRAND_ASSETS\.icon\.motionMaster/);
  assert.doesNotMatch(component, /<svg|<path|canvas/i);
  assert.match(component, /IntersectionObserver/);
  assert.match(component, /observer\.disconnect\(\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.root\[data-motion="reduced"\] \.master \{ animation: none; opacity: 1; transform: none; \}/);
  for (const variant of ["loader", "footer", "404", "empty", "success", "entrance", "ambient"]) {
    assert.match(types, new RegExp(`"${variant}"`));
  }
  assert.match(preview, /process\.env\.NODE_ENV === "production"/);
  assert.match(preview, /notFound\(\)/);
  assert.match(notFound, /variant="404"/);
  assert.match(loader, /variant="loader"/);
});
