import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("metadata-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("publishes concrete icon and social metadata values", async () => {
  const response = await render("/shop");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.doesNotMatch(html, /\[object Object\]/);
  assert.match(html, /rel="shortcut icon" href="\/favicon\.ico\?v=2026\.3-seal"/);
  assert.match(html, /property="og:image" content="https:\/\/www\.justurbanwears\.com\/brand\/social-og\.png\?v=2026\.3-seal"/);
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
});
