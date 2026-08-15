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

test("publishes the editorial brand entrance at the root", async () => {
  const response = await renderRoot();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /data-brand-entrance="justurbanwears"/);
  assert.match(html, /Clothes deserve/);
  assert.match(html, /more than one/);
  assert.match(html, /first impression/);
  assert.match(html, /Enter the wardrobe/);
  assert.match(html, /In this issue/);
  assert.match(html, /Curator(?:’|&#x2019;)s note/);
  assert.match(html, /Style does not expire when ownership changes/);
  assert.match(html, /One real piece/);
  assert.match(html, /A complete digital identity/);
  assert.match(html, /Capture/);
  assert.match(html, /Confirm/);
  assert.match(html, /Complete/);
  assert.match(html, /Publish/);
  assert.match(html, /Reserve/);
  assert.match(html, /Deliver/);
  assert.match(html, /Curated by/);
  assert.match(html, /Digital direction/);
  assert.match(html, /href="\/shop"/);
  assert.match(html, /href="\/shop\/products\//);
  assert.match(html, /aria-label="Primary"/);
  assert.match(html, /aria-label="Issue credits"/);
  assert.doesNotMatch(html, /NEXT_REDIRECT|url=\/shop/i);
  assert.doesNotMatch(html, /\[object Object\]/);
});
