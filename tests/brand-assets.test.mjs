import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createServer } from "vite";

const root = process.cwd();
const publicFile = (...parts) => path.join(root, "public", ...parts);
const designFile = (...parts) => path.join(root, "design", "identity-2026", ...parts);

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function pngInfo(buffer) {
  assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    chunks.push(type);
    offset += 12 + length;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colorType: buffer[25],
    chunks,
  };
}

test("owner-supplied logo and icon sources are pinned exactly", async () => {
  const [logo, icon, specText] = await Promise.all([
    readFile(designFile("justurban-logo-source.png")),
    readFile(designFile("justurban-icon-source.png")),
    readFile(designFile("identity-spec.json"), "utf8"),
  ]);
  assert.deepEqual([pngInfo(logo).width, pngInfo(logo).height], [1313, 1392]);
  assert.deepEqual([pngInfo(icon).width, pngInfo(icon).height], [1024, 1536]);
  assert.equal(sha256(logo), "9990e1c587a5f12aac986329a0d9ab56b7201d8dffb0a2fdfe5aa40d6f6a1b06");
  assert.equal(sha256(icon), "b518af74bcfa3040434b3e73ff8d67a118e20c674388f1207d410ae81360d917");
  assert.deepEqual(await readFile(publicFile("logo.png")), logo);

  const spec = JSON.parse(specText);
  assert.equal(spec.status, "approved-production-owner-supplied");
  assert.equal(spec.version, "2026.2");
  assert.equal(
    spec.sources.logo.sha256,
    "9990e1c587a5f12aac986329a0d9ab56b7201d8dffb0a2fdfe5aa40d6f6a1b06",
  );
  assert.equal(
    spec.sources.icon.sha256,
    "b518af74bcfa3040434b3e73ff8d67a118e20c674388f1207d410ae81360d917",
  );
  assert.equal(spec.format.redrawApproved, false);
});

test("public logo, wordmark, and icon SVGs keep their assigned roles", async () => {
  const [logo, wordmark, reverseWordmark, icon, logoSource, iconSource] = await Promise.all([
    readFile(publicFile("brand", "logo.svg"), "utf8"),
    readFile(publicFile("brand", "wordmark.svg"), "utf8"),
    readFile(publicFile("brand", "wordmark-white.svg"), "utf8"),
    readFile(publicFile("brand", "icon.svg"), "utf8"),
    readFile(designFile("justurban-logo-source.png")),
    readFile(designFile("justurban-icon-source.png")),
  ]);

  assert.match(logo, /viewBox="0 0 1313 1392"/);
  assert.ok(logo.includes(logoSource.toString("base64")));
  assert.doesNotMatch(logo, /<(?:text|style|font-face|foreignObject)\b/i);
  assert.match(wordmark, /viewBox="-6 -26 162 37"/);
  assert.equal(wordmark.match(/<path\b/g)?.length, 2);
  assert.match(wordmark, /Bodoni Moda 500 and Manrope 600/);
  assert.doesNotMatch(wordmark, /<(?:text|style|font-face|foreignObject)\b/i);
  assert.equal(reverseWordmark.match(/fill="#ffffff"/g)?.length, 2);
  assert.match(icon, /viewBox="0 0 512 512"/);
  assert.ok(icon.includes(iconSource.toString("base64")));
  assert.doesNotMatch(icon, /<(?:text|filter|linearGradient|radialGradient)\b/i);

  assert.deepEqual(await readFile(publicFile("brand", "wordmark.svg")), await readFile(designFile("justurban-wordmark.svg")));
  assert.deepEqual(await readFile(publicFile("wordmark.png")), await readFile(designFile("exports", "wordmark-cocoa-1620.png")));
});

test("browser favicon has SVG and multi-size ICO fallbacks from the supplied icon", async () => {
  const [svg, iconSource, ico] = await Promise.all([
    readFile(publicFile("favicon.svg"), "utf8"),
    readFile(designFile("justurban-icon-source.png")),
    readFile(publicFile("favicon.ico")),
  ]);
  assert.match(svg, /viewBox="0 0 64 64"/);
  assert.ok(svg.includes(iconSource.toString("base64")));
  assert.doesNotMatch(svg, /<(?:text|filter|linearGradient|radialGradient)\b/i);
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  assert.deepEqual([ico[6], ico[22], ico[38]], [16, 32, 48]);
  for (let index = 0; index < 3; index += 1) {
    const entry = 6 + index * 16;
    const size = ico[entry];
    const length = ico.readUInt32LE(entry + 8);
    const imageOffset = ico.readUInt32LE(entry + 12);
    const embedded = ico.subarray(imageOffset, imageOffset + length);
    assert.deepEqual([pngInfo(embedded).width, pngInfo(embedded).height], [size, size]);
    assert.deepEqual(embedded, await readFile(designFile("exports", `favicon-${size}.png`)));
  }
});

test("direct SVG share routes serve logo, wordmark, and icon bytes without redirects", async (t) => {
  const vite = await createServer({
    appType: "custom",
    configFile: false,
    logLevel: "silent",
    root,
    server: { middlewareMode: true },
  });
  t.after(() => vite.close());

  const endpoints = [
    ["logo", publicFile("brand", "logo.svg")],
    ["wordmark", publicFile("brand", "wordmark.svg")],
    ["icon", publicFile("brand", "icon.svg")],
  ];
  for (const [name, approvedPath] of endpoints) {
    const route = await vite.ssrLoadModule(`/app/${name}/route.ts`);
    const response = await route.GET(new Request(`https://www.justurbanwears.com/${name}`));
    assert.equal(response.status, 200, name);
    assert.equal(response.headers.get("location"), null, name);
    assert.match(response.headers.get("content-type") ?? "", /^image\/svg\+xml\b/i, name);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(approvedPath), name);
  }
});

test("public files byte-match the regenerated identity exports", async () => {
  const pairs = [
    [publicFile("logo.png"), designFile("justurban-logo-source.png")],
    [publicFile("wordmark.png"), designFile("exports", "wordmark-cocoa-1620.png")],
    [publicFile("brand", "logo.svg"), designFile("justurban-logo.svg")],
    [publicFile("brand", "wordmark.svg"), designFile("justurban-wordmark.svg")],
    [publicFile("brand", "wordmark-white.svg"), designFile("exports", "wordmark-white.svg")],
    [publicFile("brand", "icon.svg"), designFile("justurban-app-icon.svg")],
    [publicFile("favicon.ico"), designFile("exports", "favicon.ico")],
    [publicFile("favicon.svg"), designFile("justurban-favicon.svg")],
    [publicFile("brand", "apple-touch-icon.png"), designFile("exports", "apple-touch-icon-180.png")],
    [publicFile("brand", "icon-192.png"), designFile("exports", "app-icon-192.png")],
    [publicFile("brand", "icon-512.png"), designFile("exports", "app-icon-512.png")],
    [publicFile("brand", "icon-maskable-512.png"), designFile("exports", "app-icon-maskable-512.png")],
    [publicFile("brand", "icon-master-1024.png"), designFile("exports", "app-icon-1024.png")],
    [publicFile("icon.png"), designFile("exports", "app-icon-1024.png")],
  ];
  for (const [live, approved] of pairs) {
    assert.deepEqual(await readFile(live), await readFile(approved), path.basename(live));
  }
  await assert.rejects(access(publicFile("brand", "logo-white.svg")), { code: "ENOENT" });
});

test("platform PNGs are sRGB exports at their required dimensions", async () => {
  const opaque = new Map([
    ["apple-touch-icon.png", 180],
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["icon-maskable-512.png", 512],
    ["icon-master-1024.png", 1024],
  ]);
  for (const [name, size] of opaque) {
    const info = pngInfo(await readFile(publicFile("brand", name)));
    assert.deepEqual([info.width, info.height], [size, size], name);
    assert.equal(info.bitDepth, 8, name);
    assert.equal(info.colorType, 2, `${name} must be opaque RGB`);
    assert.ok(info.chunks.includes("iCCP"), `${name} must carry an sRGB ICC profile`);
  }
  const logo = pngInfo(await readFile(publicFile("logo.png")));
  assert.deepEqual([logo.width, logo.height], [1313, 1392]);
  assert.equal(logo.colorType, 6);
  const wordmark = pngInfo(await readFile(publicFile("wordmark.png")));
  assert.deepEqual([wordmark.width, wordmark.height], [1620, 370]);
  assert.equal(wordmark.colorType, 6);
});

test("every live surface uses the centralized 2026.2 identity contract", async () => {
  const [layout, manifest, studio, shop, brandAssets, brandIcon, brandWordmark, styles, logoRoute, wordmarkRoute, iconRoute] = await Promise.all([
    readFile(path.join(root, "app", "layout.tsx"), "utf8"),
    readFile(path.join(root, "app", "manifest.ts"), "utf8"),
    readFile(path.join(root, "components", "studio", "app-shell.tsx"), "utf8"),
    readFile(path.join(root, "components", "shop", "shop-shell.tsx"), "utf8"),
    readFile(path.join(root, "lib", "brand", "assets.ts"), "utf8"),
    readFile(path.join(root, "components", "brand", "brand-icon.tsx"), "utf8"),
    readFile(path.join(root, "components", "brand", "brand-wordmark.tsx"), "utf8"),
    readFile(path.join(root, "app", "foundation.css"), "utf8"),
    readFile(path.join(root, "app", "logo", "route.ts"), "utf8"),
    readFile(path.join(root, "app", "wordmark", "route.ts"), "utf8"),
    readFile(path.join(root, "app", "icon", "route.ts"), "utf8"),
  ]);
  assert.match(layout, /BRAND_ASSETS\.favicon\.runtimeSvg/);
  assert.match(manifest, /BRAND_ASSETS\.icon\.runtimeMaskable512/);
  assert.equal(studio.match(/<BrandIcon\b/g)?.length, 2);
  assert.equal(studio.match(/<BrandWordmark\b/g)?.length, 1);
  assert.equal(shop.match(/<BrandWordmark\b/g)?.length, 2);
  assert.match(brandIcon, /BRAND_ASSETS\.icon\.runtimeSvg/);
  assert.match(brandWordmark, /BRAND_ASSETS\.wordmark\.runtimeSvg/);
  assert.match(brandWordmark, /BRAND_ASSETS\.wordmark\.runtimeReverseSvg/);
  for (const requiredPath of [
    "/brand/logo.svg", "/logo.png", "/logo",
    "/brand/wordmark.svg", "/brand/wordmark-white.svg", "/wordmark.png", "/wordmark",
    "/brand/icon.svg", "/icon.png", "/icon", "/favicon.svg", "/favicon.ico",
  ]) assert.ok(brandAssets.includes(`"${requiredPath}"`), requiredPath);
  assert.match(brandAssets, /version: "2026\.2-wardrobe"/);
  for (const runtimePath of [
    "/brand/logo.svg?v=2026.2-wardrobe",
    "/brand/wordmark.svg?v=2026.2-wardrobe",
    "/brand/wordmark-white.svg?v=2026.2-wardrobe",
    "/brand/icon.svg?v=2026.2-wardrobe",
    "/brand/icon-192.png?v=2026.2-wardrobe",
    "/brand/icon-512.png?v=2026.2-wardrobe",
    "/brand/icon-maskable-512.png?v=2026.2-wardrobe",
    "/brand/apple-touch-icon.png?v=2026.2-wardrobe",
    "/favicon.svg?v=2026.2-wardrobe",
    "/favicon.ico?v=2026.2-wardrobe",
  ]) assert.ok(brandAssets.includes(`"${runtimePath}"`), runtimePath);
  assert.match(styles, /@media \(max-width: 820px\) \{\s*\.studio-shell \.studio-brand-mark \{ display: inline-flex; \}/);
  assert.match(logoRoute, /justurban-logo\.svg\?raw/);
  assert.match(wordmarkRoute, /justurban-wordmark\.svg\?raw/);
  assert.match(iconRoute, /justurban-app-icon\.svg\?raw/);
  for (const route of [logoRoute, wordmarkRoute, iconRoute]) assert.doesNotMatch(route, /redirect/i);
});

test("identity packet includes the generator, source records, and no production JU/W geometry", async () => {
  const [readme, specText, generator, vercelIgnore, customerFlow, luluFlow, iconSource] = await Promise.all([
    readFile(designFile("README.md"), "utf8"),
    readFile(designFile("identity-spec.json"), "utf8"),
    readFile(path.join(root, "scripts", "generate-brand-assets.mjs"), "utf8"),
    readFile(path.join(root, ".vercelignore"), "utf8"),
    readFile(path.join(root, "docs", "order-flows", "just-urban-wears-customer-order-flow.svg"), "utf8"),
    readFile(path.join(root, "docs", "order-flows", "just-urban-wears-lulu-order-flow.svg"), "utf8"),
    readFile(designFile("justurban-icon-source.png")),
  ]);
  const iconSourceDataUri = `data:image/png;base64,${iconSource.toString("base64")}`;
  assert.match(readme, /exact owner-supplied/i);
  assert.match(readme, /Do not trace or redraw/i);
  assert.match(readme, /\/wordmark/);
  assert.doesNotMatch(readme, /W is the immediate read|JU is the discovery/);
  const spec = JSON.parse(specText);
  assert.equal(spec.public.shareLogo, "/logo");
  assert.equal(spec.public.shareWordmark, "/wordmark");
  assert.equal(spec.roles.desktopCombination, "wordmark-only");
  assert.match(generator, /justurban-logo-source\.png/);
  assert.match(generator, /justurban-icon-source\.png/);
  for (const master of ["justurban-logo.svg", "justurban-wordmark.svg", "justurban-app-icon.svg"]) {
    assert.match(vercelIgnore, new RegExp(`^!/design/identity-2026/${master.replace(".", "\\.")}$`, "m"));
  }
  for (const flow of [customerFlow, luluFlow]) {
    assert.equal(flow.match(/data-identity-source="owner-icon"/g)?.length, 2);
    assert.ok(flow.includes(iconSourceDataUri), "order-flow icon must embed the exact supplied source");
    assert.doesNotMatch(flow, /M48 88H296L176 424/);
  }
  for (const required of [
    "justurban-logo.svg", "justurban-logo-source.png", "justurban-icon-source.png",
    path.join("exports", "mark-black.svg"), path.join("exports", "mark-cocoa.svg"),
    path.join("exports", "mark-coral.svg"), path.join("exports", "mark-white.svg"),
  ]) await access(designFile(required));
});
