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
  const bodyEnd = html.indexOf("</body>", bodyStart);
  return html
    .slice(bodyStart, bodyEnd === -1 ? undefined : bodyEnd)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

function visibleCopy(html) {
  return visibleMarkup(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

test("server-renders the public shop foundation", async () => {
  const response = await render("/shop");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /justurban wears/);
  assert.match(html, /Drop 01/);
  assert.match(html, /Clothes with a second first impression/);
  assert.match(html, /Search the wardrobe/);
  assert.match(html, /Quick add/);
  assert.match(html, /data-mobile-chrome-mode="expanded"/);
  assert.match(html, /aria-label="Show navigation\. Home selected"/);
  assert.match(html, /id="shop-mobile-navigation"/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("publishes one product-led hero and one concise Drop 01 discovery grid", async () => {
  const response = await render("/shop");
  assert.equal(response.status, 200);

  const html = await response.text();
  const visibleBody = visibleMarkup(html);
  assert.match(visibleBody, /\/shop\/products\/coral-drift-dress\/04-model-front\.webp/);
  assert.match(visibleBody, /data-model-anchor="lulu-v2"/);
  assert.match(visibleBody, /On Lulu/);
  assert.match(visibleBody, /Coral Drift Dress/);
  assert.doesNotMatch(visibleBody, /Approved studio identity|not shop merchandise/);
  assert.match(visibleBody, /aria-haspopup="dialog"/);
  assert.match(visibleBody, /class="[^"]*shop-filter-sheet/);
  assert.doesNotMatch(visibleBody, /shop-filter-row|availability-filter|shop-desktop-search-panel/);

  const releasedProducts = [
    ["Coral Drift Dress", "coral-drift-dress"],
    ["Moss Square Knit", "moss-square-knit"],
    ["Cocoa Pleat Trouser", "cocoa-pleat-trouser"],
    ["Salmon Camp Shirt", "salmon-camp-shirt"],
    ["Blush Scoop Mini Dress", "blush-scoop-mini-dress"],
    ["Orchid Beaded Column Gown", "orchid-beaded-column-gown"],
    ["Sage Asymmetric Ruched Maxi Dress", "sage-asymmetric-ruched-maxi-dress"],
    ["Magenta Plunge Ruched Mini Dress", "magenta-plunge-ruched-mini-dress"],
    ["Silver Off-Shoulder Mermaid Dress", "silver-off-shoulder-mermaid-dress"],
    ["Multicolor Abstract Strapless Mini Dress", "multicolor-abstract-strapless-mini-dress"],
  ];

  for (const [name, slug] of releasedProducts) {
    assert.match(visibleBody, new RegExp(`href="/shop/products/${slug}"`));
    assert.match(visibleBody, new RegExp(name));
  }

  assert.doesNotMatch(visibleBody, /shop-release-index|shop-wardrobe-preview|shop-editorial-rail|shop-values/);
  assert.doesNotMatch(visibleBody, /GARMENT STUDY|(?:DYN-0(?:8[1-9]|9[0-2])|JUW-0(?:0[1-9]|1[0-2]))|Six dresses from Lulu’s wardrobe|Warm colour\. Clean movement/);
  assert.doesNotMatch(visibleBody, /Indigo Workshirt|Ivory Tie Skirt/);
});

test("keeps the private Studio and public shop visibly distinct", async () => {
  const response = await render("/studio");
  assert.equal(response.status, 200);

  const html = await response.text();
  const visibleBody = visibleMarkup(html);
  assert.match(visibleBody, /Studio · Lulu/);
  assert.match(visibleBody, /Business home/);
  assert.match(visibleBody, /Opening Lulu Studio/);
  assert.match(visibleBody, /href="\/studio\/models"/);
  assert.match(visibleBody, /href="\/studio\/wardrobe"/);
  assert.match(visibleBody, /href="\/studio\/operations"/);
  assert.match(visibleBody, /data-mobile-chrome-mode="expanded"/);
  assert.match(visibleBody, /aria-label="Show navigation\. Business home selected"/);
  assert.match(visibleBody, /id="studio-mobile-navigation"/);
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
  assert.match(html, /Garment front/);
  assert.match(html, /Garment back/);
  assert.match(html, /On mannequin/);
  assert.match(html, /Fabric detail/);
  assert.match(html, /On model/);
  assert.match(html, /Share/);
  assert.match(html, /Save/);
  assert.match(html, /Check the fit/);
  assert.match(html, /Fabric and finish/);
  assert.match(html, /shop-product-info-sheet/);
  assert.doesNotMatch(visibleMarkup(html), /<details\b/i);
  assert.doesNotMatch(html, /Sold by|Following/);
  assert.match(html, /data-model-anchor="lulu-v2"/);
  assert.match(html, /01-garment-front\.webp/);
  assert.match(html, /application\/ld\+json/);
});

test("server-renders product studies plus only identity-cleared model views", async () => {
  const slugs = [
    "coral-drift-dress",
    "indigo-workshirt",
    "moss-square-knit",
    "ivory-tie-skirt",
    "cocoa-pleat-trouser",
    "salmon-camp-shirt",
    "blush-scoop-mini-dress",
    "orchid-beaded-column-gown",
    "sage-asymmetric-ruched-maxi-dress",
    "magenta-plunge-ruched-mini-dress",
    "silver-off-shoulder-mermaid-dress",
    "multicolor-abstract-strapless-mini-dress",
  ];
  const responses = await Promise.all(
    slugs.map((slug) => render(`/shop/products/${slug}`)),
  );
  const approvedModelSlugs = new Set([
    "coral-drift-dress",
    "indigo-workshirt",
    "moss-square-knit",
    "ivory-tie-skirt",
    "cocoa-pleat-trouser",
    "salmon-camp-shirt",
    "blush-scoop-mini-dress",
    "orchid-beaded-column-gown",
    "multicolor-abstract-strapless-mini-dress",
  ]);
  const approvedLeftProfileSlugs = new Set([
    "coral-drift-dress",
    "moss-square-knit",
    "cocoa-pleat-trouser",
    "magenta-plunge-ruched-mini-dress",
  ]);
  const approvedRearThreeQuarterSlugs = new Set([
    ...approvedLeftProfileSlugs,
    "silver-off-shoulder-mermaid-dress",
  ]);

  for (const [index, response] of responses.entries()) {
    assert.equal(response.status, 200);
    const html = await response.text();
    const visibleBody = visibleMarkup(html);
    const base = `/shop/products/${slugs[index]}`;
    assert.match(html, new RegExp(`${base}/01-garment-front\\.webp`));
    assert.match(html, new RegExp(`${base}/02-garment-back\\.webp`));
    assert.match(html, new RegExp(`${base}/03-mannequin-front\\.webp`));
    assert.match(html, new RegExp(`${base}/06-fabric-detail\\.webp`));
    assert.doesNotMatch(html, /05-model-back\.webp/);
    const hasApprovedFront = approvedModelSlugs.has(slugs[index]);
    const expectedFrontAnchor = [
      "coral-drift-dress",
      "indigo-workshirt",
      "moss-square-knit",
      "cocoa-pleat-trouser",
    ].includes(slugs[index])
      ? "lulu-v3"
      : "lulu-v2";
    const hasApprovedLeftProfile = approvedLeftProfileSlugs.has(slugs[index]);
    const hasApprovedRearThreeQuarter = approvedRearThreeQuarterSlugs.has(slugs[index]);
    const hasApprovedSupplementalViews = hasApprovedLeftProfile || hasApprovedRearThreeQuarter;
    if (hasApprovedFront) {
      assert.match(visibleBody, new RegExp(`data-model-anchor="${expectedFrontAnchor}"`));
      assert.match(
        visibleBody,
        new RegExp(`class="shop-media-frame is-model is-front"[^>]*data-model-anchor="${expectedFrontAnchor}"`),
      );
    } else {
      assert.doesNotMatch(visibleBody, /class="shop-media-frame is-model is-front"/);
      assert.doesNotMatch(visibleBody, new RegExp(`${base}/04-model-front\\.webp`));
      if (!hasApprovedSupplementalViews) {
        assert.doesNotMatch(visibleBody, /data-model-anchor="lulu-v2"/);
        assert.doesNotMatch(visibleBody, /class="shop-media-frame is-model/);
      }
    }
    if (hasApprovedLeftProfile) {
      assert.match(visibleBody, new RegExp(`${base}/07-model-left-profile\\.webp`));
      assert.match(visibleBody, /On Lulu · left profile/);
    } else {
      assert.doesNotMatch(visibleBody, /07-model-left-profile\.webp/);
    }
    if (hasApprovedRearThreeQuarter) {
      assert.match(visibleBody, new RegExp(`${base}/05-model-rear-three-quarter\\.webp`));
      assert.match(visibleBody, /On Lulu · right rear three-quarter/);
    } else {
      assert.doesNotMatch(visibleBody, /05-model-rear-three-quarter\.webp/);
    }
  }
});

test("server-renders the public commerce route grammar", async () => {
  const [search, saved, bag, checkout, orders, status, account] = await Promise.all([
    render("/shop/search"),
    render("/shop/saved"),
    render("/shop/bag"),
    render("/shop/checkout"),
    render("/shop/orders"),
    render("/shop/orders/JUW-NOT-ON-THIS-DEVICE"),
    render("/shop/account"),
  ]);

  for (const response of [search, saved, bag, checkout, orders, status, account]) {
    assert.equal(response.status, 200);
  }

  const searchHtml = await search.text();
  const visibleSearch = visibleMarkup(searchHtml);
  assert.match(visibleSearch, /Find your next piece/);
  assert.match(visibleSearch, /aria-haspopup="dialog"/);
  assert.match(visibleSearch, /class="[^"]*shop-filter-sheet/);
  assert.doesNotMatch(visibleSearch, /shop-desktop-search-panel|shop-search-panel/);
  assert.match(await saved.text(), /Opening saved pieces/);
  assert.match(await bag.text(), /Opening your bag/);
  assert.match(await checkout.text(), /Opening checkout/);
  assert.match(await orders.text(), /Opening saved checkouts/);
  assert.match(await status.text(), /Opening checkout status/);
  assert.match(await account.text(), /Your space/);
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
    .map(visibleCopy)
    .join("\n");
  assert.doesNotMatch(visible, /\b(?:demo|fictional|preview|sample)\b/i);
  assert.doesNotMatch(visible, /Current mode|Your local activity|Preferences only|Required after save|App settings|Featured piece|More from the rail/i);
});

test("publishes the canonical shop PWA manifest", async () => {
  const response = await render("/manifest.webmanifest", "application/manifest+json");
  assert.equal(response.status, 200);

  const manifest = await response.json();
  assert.equal(manifest.id, "/shop");
  assert.equal(manifest.start_url, "/shop");
  assert.equal(manifest.scope, "/shop");
  assert.ok(manifest.icons.some((icon) => icon.src === "/brand/icon-maskable-512.png?v=2026.1-juw"));
});
