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

async function alpha(pathname, expectedWidth = 1024, expectedHeight = 1024) {
  const { data, info } = await sharp(pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height, info.channels], [expectedWidth, expectedHeight, 4]);
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

test("the centered-logo artwork is an exact crop with a lossless motion partition", async () => {
  const logoRoot = path.join(motionRoot, "logo");
  const manifest = JSON.parse(await readFile(path.join(logoRoot, "manifest.json"), "utf8"));
  const source = await readFile(path.join(root, "design", "identity-2026", "justurban-logo-source.png"));
  const master = await readFile(path.join(logoRoot, "master.png"));
  assert.equal(manifest.sourceSha256, sha256(source));
  assert.deepEqual(manifest.cropBounds, { left: 391, top: 24, right: 921, bottom: 712 });
  assert.deepEqual(manifest.dimensions, [531, 689]);
  assert.equal(manifest.master.sha256, sha256(master));

  const expectedPixels = await sharp(source).extract({ left: 391, top: 24, width: 531, height: 689 }).ensureAlpha().raw().toBuffer();
  const masterPixels = await sharp(master).ensureAlpha().raw().toBuffer();
  assert.deepEqual(masterPixels, expectedPixels);

  const names = ["base", "left-door", "right-door", "left-l", "right-l"];
  const masks = await Promise.all(names.map((name) => alpha(path.join(logoRoot, `${name}-mask.png`), 531, 689)));
  for (let index = 0; index < 531 * 689; index += 1) {
    const sum = masks.reduce((total, mask) => total + mask[index], 0);
    assert.equal(sum, 255, `centered-logo mask partition drift at pixel ${index}`);
  }
});

test("the reveal silhouette is derived from the exact gap between the approved wardrobe forms", async () => {
  const manifest = JSON.parse(await readFile(path.join(motionRoot, "manifest.json"), "utf8"));
  const silhouetteBytes = await readFile(path.join(motionRoot, "silhouette-mask.png"));
  const silhouette = await alpha(path.join(motionRoot, "silhouette-mask.png"));
  assert.equal(sha256(silhouetteBytes), manifest.silhouette.maskSha256);
  assert.ok(silhouette.some((value) => value === 255), "silhouette mask must expose canonical negative space");
  assert.equal(manifest.silhouetteShadowInsetPx, 8);
  const populatedRows = [];
  for (let y = 0; y < 1024; y += 1) {
    if (silhouette.subarray(y * 1024, (y + 1) * 1024).some((value) => value === 255)) populatedRows.push(y);
  }
  assert.deepEqual(populatedRows, Array.from({ length: 649 }, (_, index) => index + 175));
  assert.deepEqual(manifest.components["left-door"].bounds, { left: 395, top: 181, right: 496, bottom: 815 });
  assert.deepEqual(manifest.components["right-door"].bounds, { left: 527, top: 183, right: 626, bottom: 815 });
});

test("WardrobeMotion always resolves through the untouched master and complete motion fallbacks", async () => {
  const [component, styles, types, assets, preview, notFound, loader, globalLoading, globalStage, globalStageStyles, checkout, orderPage, orderStatus, garmentReceipt, wearReceipt, useCases] = await Promise.all([
    readFile(path.join(root, "components", "brand", "wardrobe-motion.tsx"), "utf8"),
    readFile(path.join(root, "components", "brand", "wardrobe-motion.module.css"), "utf8"),
    readFile(path.join(root, "components", "brand", "wardrobe-motion.types.ts"), "utf8"),
    readFile(path.join(root, "lib", "brand", "assets.ts"), "utf8"),
    readFile(path.join(root, "app", "dev", "brand-motion", "page.tsx"), "utf8"),
    readFile(path.join(root, "app", "not-found.tsx"), "utf8"),
    readFile(path.join(root, "components", "shoot", "shoot-gallery.tsx"), "utf8"),
    readFile(path.join(root, "app", "loading.tsx"), "utf8"),
    readFile(path.join(root, "components", "brand", "global-brand-loading-stage.tsx"), "utf8"),
    readFile(path.join(root, "components", "brand", "global-brand-loading-stage.module.css"), "utf8"),
    readFile(path.join(root, "components", "shop", "shop-checkout.tsx"), "utf8"),
    readFile(path.join(root, "app", "shop", "orders", "[id]", "page.tsx"), "utf8"),
    readFile(path.join(root, "components", "shop", "order-status.tsx"), "utf8"),
    readFile(path.join(root, "components", "studio", "garment-intake", "garment-intake-sheet.tsx"), "utf8"),
    readFile(path.join(root, "components", "studio", "garment-intake", "wear-sheet.tsx"), "utf8"),
    readFile(path.join(root, "app", "dev", "brand-motion", "use-cases", "page.tsx"), "utf8"),
  ]);

  assert.match(assets, /motionMaster: "\/brand\/icon-master-1024\.png\?v=2026\.3-seal"/);
  assert.match(assets, /motionLogoMaster: "\/brand\/motion\/logo\/master\.png\?v=2026\.3-logo"/);
  assert.match(component, /BRAND_ASSETS\.icon\.motionLogoMaster/);
  assert.match(component, /BRAND_ASSETS\.icon\.motionMaster/);
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
  assert.match(notFound, /artwork="logo"/);
  assert.match(notFound, /variant="404"/);
  assert.match(loader, /variant="loader"/);
  assert.match(globalLoading, /<GlobalBrandLoadingStage \/>/);
  assert.match(globalStage, /GLOBAL_BRAND_LOADING_DELAY_MS = 420/);
  assert.match(globalStage, /window\.setTimeout\(\(\) => setRevealed\(true\), delayMs\)/);
  assert.match(globalStage, /polarity="dark" size="md" variant="loader"/);
  assert.match(globalStage, /aria-live="polite"/);
  assert.match(globalStageStyles, /position: fixed/);
  assert.match(globalStageStyles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(checkout, /\?placed=1/);
  assert.match(orderPage, /justPlaced=\{placed === "1"\}/);
  assert.match(orderStatus, /variant="empty"/);
  assert.match(orderStatus, /variant="success"/);
  assert.match(orderStatus, /url\.searchParams\.delete\("placed"\)/);
  assert.match(garmentReceipt, /className="juw-receipt-motion"/);
  assert.match(garmentReceipt, /artwork="logo" polarity="light" size="sm" variant="success"/);
  assert.match(wearReceipt, /className="juw-receipt-motion"/);
  assert.match(wearReceipt, /artwork="logo" polarity="light" size="sm" variant="success"/);
  assert.match(useCases, /Four truthful moments/);
});
