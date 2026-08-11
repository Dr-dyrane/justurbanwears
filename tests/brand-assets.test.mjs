import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createServer } from "vite";

const root = process.cwd();
const publicFile = (...parts) => path.join(root, "public", ...parts);
const designFile = (...parts) => path.join(root, "design", "identity-2026", ...parts);
const standardPaths = [
  "M48 88H296L176 424 80 168h56l40 96 40-116H72Z",
  "M464 88h-72l-56 160-30-114-40 98 70 192Z",
];
const microPaths = [
  "M48 88H292L176 424 76 176h56l44 100 42-132H70Z",
  "M464 88h-72l-56 160-22-116-40 104 62 188Z",
];

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

test("approved browser favicon has SVG and multi-size ICO fallbacks", async () => {
  const svg = await readFile(publicFile("favicon.svg"), "utf8");
  assert.match(svg, /viewBox="0 0 64 64"/);
  assert.match(svg, /#2a1710/i);
  assert.match(svg, /#f28a62/i);
  assert.match(svg, /transform="scale\(\.125\)"/);
  for (const geometry of microPaths) assert.ok(svg.includes(geometry), geometry);
  assert.doesNotMatch(svg, /<(?:filter|linearGradient|radialGradient|text)\b/i);

  const ico = await readFile(publicFile("favicon.ico"));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  assert.deepEqual([ico[6], ico[22], ico[38]], [16, 32, 48]);

  for (let index = 0; index < 3; index += 1) {
    const entry = 6 + index * 16;
    const size = ico[entry];
    const length = ico.readUInt32LE(entry + 8);
    const imageOffset = ico.readUInt32LE(entry + 12);
    const embedded = pngInfo(ico.subarray(imageOffset, imageOffset + length));
    assert.deepEqual([embedded.width, embedded.height], [size, size]);
    assert.deepEqual(
      ico.subarray(imageOffset, imageOffset + length),
      await readFile(designFile("exports", `favicon-${size}.png`)),
      `${size}px ICO entry must match its approved finite export`,
    );
  }
});

test("shareable wordmark is outlined and self-contained", async () => {
  const wordmark = await readFile(publicFile("brand", "logo.svg"), "utf8");
  const reverseWordmark = await readFile(publicFile("brand", "logo-white.svg"), "utf8");
  const icon = await readFile(publicFile("brand", "icon.svg"), "utf8");

  assert.match(wordmark, /viewBox="-6 -26 162 37"/);
  assert.equal(wordmark.match(/<path\b/g)?.length, 2);
  assert.match(wordmark, /Bodoni Moda 500 and Manrope 600/);
  assert.doesNotMatch(wordmark, /<(?:text|style|font-face|foreignObject)\b/i);
  assert.match(reverseWordmark, /viewBox="-6 -26 162 37"/);
  assert.equal(reverseWordmark.match(/<path\b/g)?.length, 2);
  assert.equal(reverseWordmark.match(/fill="#ffffff"/g)?.length, 2);
  assert.doesNotMatch(reverseWordmark, /<(?:text|style|font-face|foreignObject)\b/i);
  assert.match(icon, /viewBox="0 0 512 512"/);
  assert.match(icon, /#2a1710/i);
  assert.match(icon, /#f28a62/i);
  assert.match(icon, /transform="translate\(46\.08 46\.08\) scale\(\.82\)"/);
  for (const geometry of standardPaths) assert.ok(icon.includes(geometry), geometry);
  assert.doesNotMatch(icon, /<(?:filter|linearGradient|radialGradient|text)\b/i);
});

test("approved JU/W masters pin the standard, micro, and adaptive geometry", async () => {
  const [mark, micro, app, foreground, monochrome, specText] = await Promise.all([
    readFile(designFile("justurban-mark.svg"), "utf8"),
    readFile(designFile("justurban-micro.svg"), "utf8"),
    readFile(designFile("justurban-app-icon.svg"), "utf8"),
    readFile(designFile("justurban-app-foreground.svg"), "utf8"),
    readFile(designFile("justurban-app-monochrome.svg"), "utf8"),
    readFile(designFile("identity-spec.json"), "utf8"),
  ]);

  for (const geometry of standardPaths) {
    assert.ok(mark.includes(geometry), `standard master: ${geometry}`);
    assert.ok(app.includes(geometry), `app master: ${geometry}`);
    assert.ok(foreground.includes(geometry), `adaptive master: ${geometry}`);
    assert.ok(monochrome.includes(geometry), `monochrome master: ${geometry}`);
  }
  for (const geometry of microPaths) assert.ok(micro.includes(geometry), geometry);

  for (const source of [mark, micro, app, foreground, monochrome]) {
    assert.doesNotMatch(source, /<(?:filter|linearGradient|radialGradient|text)\b/i);
    assert.doesNotMatch(source, /\bstroke=/i);
  }
  assert.equal(mark.match(/<path\b/g)?.length, 2);
  assert.equal(micro.match(/<path\b/g)?.length, 2);
  assert.match(app, /transform="translate\(46\.08 46\.08\) scale\(\.82\)"/);
  assert.match(foreground, /transform="translate\(64 64\) scale\(\.75\)"/);
  assert.match(monochrome, /transform="translate\(64 64\) scale\(\.75\)"/);

  const spec = JSON.parse(specText);
  assert.equal(spec.status, "approved-production-digital");
  assert.deepEqual(spec.geometry.standardPaths, standardPaths);
  assert.deepEqual(spec.geometry.microPaths, microPaths);
  assert.equal(spec.geometry.clearSpaceUnits, 40);
  assert.equal(spec.minimumSize.standardMarkPx, 32);
  assert.deepEqual(
    [spec.minimumSize.microMarkMinimumPx, spec.minimumSize.microMarkMaximumPx],
    [16, 24],
  );
  assert.equal(spec.roles.desktopCombination, "wordmark-only");
  assert.deepEqual(spec.platform.faviconGeometryBySize, {
    16: "micro",
    32: "standard",
    48: "standard",
    scalableSvg: "micro-small-tab-priority",
  });
});

test("extensionless brand URLs serve the approved SVG bytes directly", async (t) => {
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
    ["icon", publicFile("brand", "icon.svg")],
  ];

  for (const [name, approvedPath] of endpoints) {
    const route = await vite.ssrLoadModule(`/app/${name}/route.ts`);
    const response = await route.GET(new Request(`https://www.justurbanwears.com/${name}`));

    assert.equal(response.status, 200, name);
    assert.equal(response.headers.get("location"), null, name);
    assert.match(response.headers.get("content-type") ?? "", /^image\/svg\+xml\b/i, name);
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      await readFile(approvedPath),
      `${name} body must byte-match its public master`,
    );
  }
});

test("installed-app assets are opaque RGB sRGB exports at their platform sizes", async () => {
  const expected = new Map([
    ["apple-touch-icon.png", 180],
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["icon-maskable-512.png", 512],
    ["icon-master-1024.png", 1024],
  ]);

  for (const [name, size] of expected) {
    const info = pngInfo(await readFile(publicFile("brand", name)));
    assert.deepEqual([info.width, info.height], [size, size], name);
    assert.equal(info.bitDepth, 8, name);
    assert.equal(info.colorType, 2, `${name} must be opaque RGB`);
    assert.ok(info.chunks.includes("iCCP"), `${name} must carry an sRGB ICC profile`);
  }
});

test("direct PNG share URLs use the exact approved wordmark and JU/W exports", async () => {
  const logo = pngInfo(await readFile(publicFile("logo.png")));
  assert.deepEqual([logo.width, logo.height], [1620, 370]);
  assert.equal(logo.bitDepth, 8);
  assert.equal(logo.colorType, 6, "logo.png must preserve transparent RGBA");
  assert.ok(logo.chunks.includes("iCCP"), "logo.png must carry an sRGB ICC profile");

  const icon = pngInfo(await readFile(publicFile("icon.png")));
  assert.deepEqual([icon.width, icon.height], [1024, 1024]);
  assert.equal(icon.bitDepth, 8);
  assert.equal(icon.colorType, 2, "icon.png must be opaque RGB");
  assert.ok(icon.chunks.includes("iCCP"), "icon.png must carry an sRGB ICC profile");

  assert.deepEqual(
    await readFile(publicFile("logo.png")),
    await readFile(designFile("exports", "wordmark-cocoa-1620.png")),
  );
  assert.deepEqual(
    await readFile(publicFile("icon.png")),
    await readFile(designFile("exports", "app-icon-1024.png")),
  );
});

test("public files match the approved identity exports and every live surface points at them", async () => {
  const pairs = [
    [publicFile("logo.png"), designFile("exports", "wordmark-cocoa-1620.png")],
    [publicFile("icon.png"), designFile("exports", "app-icon-1024.png")],
    [publicFile("brand", "logo.svg"), designFile("justurban-wordmark.svg")],
    [publicFile("brand", "logo-white.svg"), designFile("exports", "wordmark-white.svg")],
    [publicFile("brand", "icon.svg"), designFile("justurban-app-icon.svg")],
    [publicFile("favicon.ico"), designFile("exports", "favicon.ico")],
    [publicFile("favicon.svg"), designFile("justurban-favicon.svg")],
    [publicFile("brand", "apple-touch-icon.png"), designFile("exports", "apple-touch-icon-180.png")],
    [publicFile("brand", "icon-192.png"), designFile("exports", "app-icon-192.png")],
    [publicFile("brand", "icon-512.png"), designFile("exports", "app-icon-512.png")],
    [publicFile("brand", "icon-maskable-512.png"), designFile("exports", "app-icon-maskable-512.png")],
    [publicFile("brand", "icon-master-1024.png"), designFile("exports", "app-icon-1024.png")],
  ];

  for (const [live, approved] of pairs) {
    assert.deepEqual(await readFile(live), await readFile(approved), path.basename(live));
  }

  const [
    layout,
    manifest,
    studio,
    shop,
    brandAssets,
    brandIcon,
    brandWordmark,
    styles,
    globalStyles,
    logoRoute,
    iconRoute,
  ] = await Promise.all([
    readFile(path.join(root, "app", "layout.tsx"), "utf8"),
    readFile(path.join(root, "app", "manifest.ts"), "utf8"),
    readFile(path.join(root, "components", "studio", "app-shell.tsx"), "utf8"),
    readFile(path.join(root, "components", "shop", "shop-shell.tsx"), "utf8"),
    readFile(path.join(root, "lib", "brand", "assets.ts"), "utf8"),
    readFile(path.join(root, "components", "brand", "brand-icon.tsx"), "utf8"),
    readFile(path.join(root, "components", "brand", "brand-wordmark.tsx"), "utf8"),
    readFile(path.join(root, "app", "foundation.css"), "utf8"),
    readFile(path.join(root, "app", "globals.css"), "utf8"),
    readFile(path.join(root, "app", "logo", "route.ts"), "utf8"),
    readFile(path.join(root, "app", "icon", "route.ts"), "utf8"),
  ]);

  assert.match(layout, /import \{ BRAND_ASSETS \} from "\.\.\/lib\/brand\/assets"/);
  assert.match(layout, /url: BRAND_ASSETS\.favicon\.runtimeSvg, sizes: "any", type: "image\/svg\+xml"/);
  assert.match(layout, /url: BRAND_ASSETS\.icon\.runtimeAppleTouch/);
  assert.match(manifest, /src: BRAND_ASSETS\.icon\.runtimeMaskable512[\s\S]*purpose: "maskable"/);
  assert.doesNotMatch(layout, /BRAND_COPY/);
  assert.doesNotMatch(manifest, /BRAND_COPY/);
  assert.equal(studio.match(/<BrandIcon\b/g)?.length, 2);
  assert.equal(studio.match(/<BrandWordmark\b/g)?.length, 1);
  assert.equal(shop.match(/<BrandWordmark\b/g)?.length, 2);
  assert.doesNotMatch(studio, /src="\/brand\/icon-|<span>justurban<\/span>/);
  assert.doesNotMatch(shop, /<span>justurban<\/span>/);
  assert.match(brandIcon, /src=\{BRAND_ASSETS\.icon\.runtimeSvg\}/);
  assert.match(brandWordmark, /src=\{BRAND_ASSETS\.wordmark\.runtimeSvg\}/);
  assert.match(brandWordmark, /src=\{BRAND_ASSETS\.wordmark\.runtimeReverseSvg\}/);
  assert.doesNotMatch(brandWordmark, /<span>justurban<\/span>|<em>wears<\/em>/);
  for (const requiredPath of [
    "/brand/logo.svg",
    "/brand/logo-white.svg",
    "/logo.png",
    "/logo",
    "/brand/icon.svg",
    "/icon.png",
    "/icon",
    "/favicon.svg",
    "/favicon.ico",
    "/brand/icon-192.png",
    "/brand/icon-512.png",
    "/brand/icon-maskable-512.png",
    "/brand/apple-touch-icon.png",
  ]) assert.ok(brandAssets.includes(`"${requiredPath}"`), requiredPath);
  assert.match(brandAssets, /version: "2026\.1-juw"/);
  for (const runtimePath of [
    "/brand/logo.svg?v=2026.1-juw",
    "/brand/logo-white.svg?v=2026.1-juw",
    "/brand/icon.svg?v=2026.1-juw",
    "/brand/icon-192.png?v=2026.1-juw",
    "/brand/icon-512.png?v=2026.1-juw",
    "/brand/icon-maskable-512.png?v=2026.1-juw",
    "/brand/apple-touch-icon.png?v=2026.1-juw",
    "/favicon.svg?v=2026.1-juw",
    "/favicon.ico?v=2026.1-juw",
  ]) assert.ok(brandAssets.includes(`"${runtimePath}"`), runtimePath);
  assert.match(styles, /\.studio-shell \.studio-brand-mark \{[\s\S]*?display: none;/);
  assert.match(styles, /@media \(max-width: 820px\) \{\s*\.studio-shell \.studio-brand-mark \{ display: inline-flex; \}/);
  assert.doesNotMatch(styles, /\.shop-wordmark-lockup\s*>\s*(?:span|em)/);
  assert.doesNotMatch(styles, /\.(?:brand-lockup|brand-mark|brand-word)\b/);
  assert.doesNotMatch(globalStyles, /\.(?:brand|brand-mark|brand-word)\b/);
  assert.match(logoRoute, /justurban-wordmark\.svg\?raw/);
  assert.match(iconRoute, /justurban-app-icon\.svg\?raw/);
  assert.doesNotMatch(logoRoute, /redirect/i);
  assert.doesNotMatch(iconRoute, /redirect/i);

  await assert.rejects(access(designFile("justurban-lockup.svg")), { code: "ENOENT" });
  await assert.rejects(access(designFile("exports", "lockup-cocoa-2160.png")), { code: "ENOENT" });
  await assert.rejects(
    access(designFile("explorations", "juw-w-background-sketch.svg")),
    { code: "ENOENT" },
  );
  await assert.rejects(
    access(designFile("explorations", "juw-w-background-sketch.png")),
    { code: "ENOENT" },
  );

  const identityReadme = await readFile(designFile("README.md"), "utf8");
  assert.match(identityReadme, /The `W` is the\s+immediate read and the `JU` is the discovery/);
  assert.match(identityReadme, /Standard JU\/W: \*\*32 px minimum\*\*/);
  assert.match(identityReadme, /Clothes with a second first impression\./);
  assert.match(identityReadme, /One-off urban womenswear from Lulu’s wardrobe, ready to move\s+through the city\./);
  assert.doesNotMatch(
    identityReadme,
    /horizontal lockup|core mark and lockup|gateway gesture|one mark stroke|16[–-]32 px/i,
  );

  const requiredPacketFiles = [
    "justurban-identity-preview.png",
    "identity-spec.json",
    path.join("exports", "mark-black.svg"),
    path.join("exports", "mark-cocoa.svg"),
    path.join("exports", "mark-coral.svg"),
    path.join("exports", "mark-white.svg"),
    path.join("exports", "wordmark-black.svg"),
    path.join("exports", "wordmark-cocoa.svg"),
    path.join("exports", "wordmark-white.svg"),
    path.join("exports", "mark-black-1024.png"),
    path.join("exports", "mark-cocoa-1024.png"),
    path.join("exports", "mark-coral-1024.png"),
    path.join("exports", "mark-reverse-1024.png"),
    path.join("exports", "micro-cocoa-512.png"),
  ];
  await Promise.all(requiredPacketFiles.map((name) => access(designFile(name))));
});
