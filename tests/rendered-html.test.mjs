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
  assert.match(html, /Drop 01/);
  assert.match(html, /Four pieces\. One clean release/);
  assert.match(html, /Search the edit/);
  assert.match(html, /Quick add/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("publishes the approved identity hero and the four-piece Drop 01 rail", async () => {
  const response = await render("/shop");
  assert.equal(response.status, 200);

  const html = await response.text();
  const visibleBody = visibleMarkup(html);
  assert.match(visibleBody, /\/shop\/model\/lulu-v2-approved\.png/);
  assert.match(visibleBody, /data-model-anchor="lulu-v2"/);
  assert.match(visibleBody, /Approved studio identity/);
  assert.match(visibleBody, /not shop merchandise/);
  assert.match(visibleBody, /aria-pressed="true"[^>]*class="availability-filter is-active"/);

  const releasedProducts = [
    ["DYN-081", "Coral Drift Dress", "coral-drift-dress"],
    ["DYN-083", "Moss Square Knit", "moss-square-knit"],
    ["DYN-085", "Cocoa Pleat Trouser", "cocoa-pleat-trouser"],
    ["DYN-086", "Salmon Camp Shirt", "salmon-camp-shirt"],
  ];

  for (const [sku, name, slug] of releasedProducts) {
    assert.match(visibleBody, new RegExp(`data-sku="${sku}"`));
    assert.match(visibleBody, new RegExp(`href="/shop/products/${slug}"`));
    assert.match(visibleBody, new RegExp(name));
  }

  assert.doesNotMatch(visibleBody, /Indigo Workshirt|Ivory Tie Skirt/);
});

test("keeps the private Studio and public shop visibly distinct", async () => {
  const response = await render("/studio");
  assert.equal(response.status, 200);

  const html = await response.text();
  const visibleBody = visibleMarkup(html);
  assert.match(html, /Operator surface/);
  assert.match(html, /From source truth to final frame/);
  assert.match(html, /Private references stay local/);
  assert.doesNotMatch(visibleBody, /Four pieces\. One clean release/);
});

test("server-renders a navigable public product detail", async () => {
  const response = await render("/shop/products/coral-drift-dress");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Coral Drift Dress/);
  assert.match(html, /Available now/);
  assert.match(html, /Buy now/);
  assert.match(html, /Add to bag/);
  assert.match(html, /Garment front/);
  assert.match(html, /Garment back/);
  assert.match(html, /On mannequin/);
  assert.match(html, /Fabric detail/);
  assert.match(html, /01-garment-front\.webp/);
  assert.match(html, /application\/ld\+json/);
});

test("server-renders a complete product-only media study for every catalogue piece", async () => {
  const slugs = [
    "coral-drift-dress",
    "indigo-workshirt",
    "moss-square-knit",
    "ivory-tie-skirt",
    "cocoa-pleat-trouser",
    "salmon-camp-shirt",
  ];
  const responses = await Promise.all(
    slugs.map((slug) => render(`/shop/products/${slug}`)),
  );

  for (const [index, response] of responses.entries()) {
    assert.equal(response.status, 200);
    const html = await response.text();
    const base = `/shop/products/${slugs[index]}`;
    assert.match(html, new RegExp(`${base}/01-garment-front\\.webp`));
    assert.match(html, new RegExp(`${base}/02-garment-back\\.webp`));
    assert.match(html, new RegExp(`${base}/03-mannequin-front\\.webp`));
    assert.match(html, new RegExp(`${base}/06-fabric-detail\\.webp`));
    assert.doesNotMatch(html, /04-model-front\.webp/);
    assert.doesNotMatch(html, /05-model-back\.webp/);
    assert.doesNotMatch(html, /data-model-anchor="lulu-v2"/);
  }
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
