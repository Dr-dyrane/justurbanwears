import assert from "node:assert/strict";
import test from "node:test";

async function renderRoot() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-brand-entrance`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("publishes the scan-first editorial brand entrance at the root", async () => {
  const response = await renderRoot();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /data-brand-entrance="justurbanwears"/);
  assert.match(html, /Clothes deserve/);
  assert.match(html, /more than one/);
  assert.match(html, /first impression/);
  assert.match(html, /Enter the wardrobe/);
  assert.match(html, /Inside/);
  assert.match(html, /Style changes hands/);
  assert.match(html, /One piece/);
  assert.match(html, /Fully seen/);
  assert.match(html, /Real garment/);
  assert.match(html, /Reviewed frames/);
  assert.match(html, /AI disclosed/);
  assert.match(html, /Capture/);
  assert.match(html, /Confirm/);
  assert.match(html, /Complete/);
  assert.match(html, /Publish/);
  assert.match(html, /Reserve/);
  assert.match(html, /Deliver/);
  assert.match(html, /Curator/);
  assert.match(html, /Direction/);
  assert.match(html, /href="\/shop"/);
  assert.match(html, /href="\/shop\/products\//);
  assert.match(html, /aria-label="Primary"/);
  assert.match(html, /aria-label="Issue credits"/);
  assert.doesNotMatch(html, /Supporting views may be completed/i);
  assert.doesNotMatch(html, /Availability remains governed/i);
  assert.doesNotMatch(html, /NEXT_REDIRECT|url=\/shop/i);
  assert.doesNotMatch(html, /\[object Object\]/);
});
