import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname, accept = "text/html") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept },
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

function visibleMarkup(html) {
  const bodyStart = html.indexOf("<body");
  const firstBodyScript = html.indexOf("<script", bodyStart);
  return html.slice(bodyStart, firstBodyScript === -1 ? undefined : firstBodyScript);
}

test("server-renders the public shop foundation", async () => {
  const response = await render("/shop");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /justurban wears/);
  assert.match(html, /Urban ladies/);
  assert.match(html, /Clothes with a second first impression/);
  assert.match(html, /Search the edit/);
  assert.match(html, /Quick add/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("keeps the private Studio and public shop visibly distinct", async () => {
  const response = await render("/studio");
  assert.equal(response.status, 200);

  const html = await response.text();
  const visibleBody = visibleMarkup(html);
  assert.match(html, /Operator surface/);
  assert.match(html, /From source truth to final frame/);
  assert.match(html, /Private references stay local/);
  assert.doesNotMatch(visibleBody, /Clothes with a second first impression/);
});

test("server-renders a navigable public product detail", async () => {
  const response = await render("/shop/products/coral-drift-dress");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Coral Drift Dress/);
  assert.match(html, /Available now/);
  assert.match(html, /Buy now/);
  assert.match(html, /Add to bag/);
});

test("server-renders the public commerce route grammar", async () => {
  const [search, checkout, orders, status, account] = await Promise.all([
    render("/shop/search"),
    render("/shop/checkout"),
    render("/shop/orders"),
    render("/shop/orders/JUW-NOT-ON-THIS-DEVICE"),
    render("/shop/account"),
  ]);

  for (const response of [search, checkout, orders, status, account]) {
    assert.equal(response.status, 200);
  }

  assert.match(await search.text(), /Search the whole rail/);
  assert.match(await checkout.text(), /Your bag needs a piece first/);
  assert.match(await orders.text(), /Opening your order history/);
  assert.match(await status.text(), /Opening order status/);
  assert.match(await account.text(), /Your shopping space/);
});

test("keeps prototype language out of the visible shopper journey", async () => {
  const responses = await Promise.all([
    render("/shop"),
    render("/shop/search"),
    render("/shop/products/coral-drift-dress"),
    render("/shop/bag"),
    render("/shop/checkout"),
    render("/shop/orders"),
    render("/shop/account"),
  ]);

  const visible = (await Promise.all(responses.map((response) => response.text())))
    .map(visibleMarkup)
    .join("\n");
  assert.doesNotMatch(visible, /\b(?:demo|fictional|preview|sample)\b/i);
});

test("publishes the canonical shop PWA manifest", async () => {
  const response = await render("/manifest.webmanifest", "application/manifest+json");
  assert.equal(response.status, 200);

  const manifest = await response.json();
  assert.equal(manifest.id, "/shop");
  assert.equal(manifest.start_url, "/shop");
  assert.equal(manifest.scope, "/shop");
  assert.ok(manifest.icons.some((icon) => icon.src === "/brand/icon-maskable-512.png"));
});
