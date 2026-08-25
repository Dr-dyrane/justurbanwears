import assert from "node:assert/strict";
import test from "node:test";
import { loadRenderWorker } from "./render-worker.mjs";

async function renderRoot() {
  const worker = await loadRenderWorker("brand-entrance");

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

test("sends the root directly to the canonical Shop", async () => {
  const response = await renderRoot();
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "/shop");
});
