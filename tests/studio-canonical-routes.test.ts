import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import nextConfig from "../next.config";

const root = process.cwd();

test("legacy Studio routes permanently resolve into canonical rooms", async () => {
  const redirects = await nextConfig.redirects?.();
  assert.ok(Array.isArray(redirects));
  assert.deepEqual(redirects.slice(-7), [
    { source: "/garments/new", destination: "/studio/wardrobe?intake=1", permanent: true },
    { source: "/garments/:id", destination: "/studio/wardrobe/:id", permanent: true },
    { source: "/garments", destination: "/studio/wardrobe", permanent: true },
    { source: "/konan", destination: "/studio/models", permanent: true },
    { source: "/shoots/new", destination: "/studio/media/new", permanent: true },
    { source: "/shoots/:id", destination: "/studio/media/:id", permanent: true },
    { source: "/shoots", destination: "/studio/media", permanent: true },
  ]);
});

test("the compatibility media archive stays inside the canonical namespace", () => {
  const gallery = readFileSync(`${root}/components/shoot/shoot-gallery.tsx`, "utf8");
  const composer = readFileSync(`${root}/components/shoot/shoot-composer.tsx`, "utf8");
  const detail = readFileSync(`${root}/components/shoot/shoot-detail.tsx`, "utf8");
  assert.doesNotMatch(gallery + composer + detail, /href="\/shoots|push\(`\/shoots/);
  assert.match(gallery, /\/studio\/media\/new/);
  assert.match(composer, /assignDocumentNavigation\(studioScenarioHref\(`\/studio\/media\/\$\{generation\.id\}`/);
  assert.match(detail, /Return to Media/);
});

test("Studio shell treats Media as a canonical stack destination", () => {
  const shell = readFileSync(`${root}/components/studio/app-shell.tsx`, "utf8");
  const stackContext = readFileSync(`${root}/components/studio/navigation/studio-stack-context.tsx`, "utf8");
  assert.match(stackContext, /pathname\.startsWith\("\/studio\/media"\)/);
  assert.match(stackContext, /backLabel: "Atelier"/);
  assert.match(shell, /aria-label=\{`Back to \$\{stack\.backLabel\}`\}/);
  assert.match(shell, /<StudioCommandCenter[\s\S]*?routeSearch=\{searchParams\.toString\(\)\}[\s\S]*?showAsk=\{!pathname\.startsWith\("\/studio\/ask"\)\}[\s\S]*?showSearch=\{isHome\}/);
  assert.doesNotMatch(shell, /aria-label="Media views"|studio-stack-view-nav/);
  assert.doesNotMatch(shell, /pathname\.startsWith\("\/shoots"\)|href="\/shoots"|>Shoots</);
});
