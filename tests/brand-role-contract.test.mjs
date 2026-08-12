import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const publicFile = (...parts) => path.join(root, "public", ...parts);
const designFile = (...parts) => path.join(root, "design", "identity-2026", ...parts);

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

test("the 2026.2 contract assigns logo, wordmark, and icon to different jobs", async () => {
  const [specText, readme, assets, layout, logoComponent] = await Promise.all([
    readFile(designFile("identity-spec.json"), "utf8"),
    readFile(designFile("README.md"), "utf8"),
    readFile(path.join(root, "lib", "brand", "assets.ts"), "utf8"),
    readFile(path.join(root, "app", "layout.tsx"), "utf8"),
    readFile(path.join(root, "components", "brand", "brand-logo.tsx"), "utf8"),
  ]);

  const spec = JSON.parse(specText);
  assert.equal(spec.concept.name, "Wardrobe / curvy silhouette / Double-L");
  assert.equal(spec.roles.socialProfile, "logo");
  assert.equal(spec.roles.desktopCombination, "wordmark-only");
  assert.equal(spec.platform.socialProfile, "logo");
  assert.equal(spec.platform.websiteNavigation, "wordmark");
  assert.equal(spec.platform.favicon, "icon");
  assert.equal(spec.format.redrawApproved, false);

  assert.match(readme, /Lulu's wardrobe, opened for another urban woman/i);
  assert.match(readme, /not the default social-profile identity on its own/i);
  assert.match(readme, /Do not trace or redraw/i);
  assert.doesNotMatch(readme, /W is the immediate read|JU is the discovery/);

  assert.match(assets, /profile: "\/brand\/social-profile\.png"/);
  assert.match(assets, /og: "\/brand\/social-og\.png"/);
  assert.match(layout, /BRAND_ASSETS\.social\.runtimeOg/);
  assert.match(layout, /width: 1200/);
  assert.match(layout, /height: 630/);
  assert.match(logoComponent, /BRAND_ASSETS\.logo\.runtimeSvg/);
});

test("generated social assets use the name-bearing centered logo format", async () => {
  const [profile, openGraph, legacyOpenGraph, profileExport, openGraphExport] = await Promise.all([
    readFile(publicFile("brand", "social-profile.png")),
    readFile(publicFile("brand", "social-og.png")),
    readFile(publicFile("og.png")),
    readFile(designFile("exports", "social-profile-1080.png")),
    readFile(designFile("exports", "social-og-1200x630.png")),
  ]);

  const profileInfo = pngInfo(profile);
  assert.deepEqual([profileInfo.width, profileInfo.height], [1080, 1080]);
  assert.equal(profileInfo.bitDepth, 8);
  assert.ok(profileInfo.chunks.includes("iCCP"));

  const openGraphInfo = pngInfo(openGraph);
  assert.deepEqual([openGraphInfo.width, openGraphInfo.height], [1200, 630]);
  assert.equal(openGraphInfo.bitDepth, 8);
  assert.ok(openGraphInfo.chunks.includes("iCCP"));

  assert.deepEqual(profile, profileExport);
  assert.deepEqual(openGraph, openGraphExport);
  assert.deepEqual(openGraph, legacyOpenGraph);
});

test("the social generator builds from the corrected public logo rather than the compact icon", async () => {
  const [generator, outlinedHeadline] = await Promise.all([
    readFile(path.join(root, "scripts", "generate-social-brand-assets.mjs"), "utf8"),
    readFile(designFile("social", "og-headline-bodoni-outlined.svg"), "utf8"),
  ]);
  assert.match(generator, /publicRoot, "logo\.png"/);
  assert.match(generator, /og-wardrobe-background-source\.png/);
  assert.match(generator, /og-headline-bodoni-outlined\.svg/);
  assert.match(outlinedHeadline, /Clothes with a second first impression\./);
  assert.match(outlinedHeadline, /Bodoni Moda Variable at weight 500/);
  assert.match(generator, /social-profile\.png/);
  assert.match(generator, /social-og\.png/);
  assert.doesNotMatch(generator, /icon\.png|justurban-icon-source/);
});
