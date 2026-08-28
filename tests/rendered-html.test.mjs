import assert from "node:assert/strict";
import test from "node:test";
import { loadRenderWorker } from "./render-worker.mjs";

async function render(pathname, accept = "text/html") {
  const worker = await loadRenderWorker(pathname);

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
  const visibleBody = visibleMarkup(html);
  const copy = visibleCopy(html);
  assert.match(html, /justurban wears/);
  assert.match(visibleBody, /Drop 02/);
  assert.match(visibleBody, /34 pieces\. No restocks\./);
  assert.match(copy, /33 more one-off pieces/);
  assert.match(visibleBody, /violet-beaded-ruffle-romper/);
  assert.match(html, /Search the wardrobe/);
  assert.match(html, /Live availability is temporarily unavailable/);
  assert.match(html, /data-mobile-chrome-mode="compact"/);
  assert.match(html, /aria-label="Show navigation\. Home selected"/);
  assert.match(html, /id="shop-mobile-navigation"/);
  assert.doesNotMatch(visibleBody, /\b(?:AI|provenance|AI-completed|generated evidence)\b/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("publishes the Violet romper hero and the exact thirty-four-piece Drop 02", async () => {
  const response = await render("/shop");
  assert.equal(response.status, 200);

  const html = await response.text();
  const visibleBody = visibleMarkup(html);
  assert.match(visibleBody, /\/products\/violet-beaded-ruffle-romper\/04-model-front\.webp/);
  assert.match(visibleBody, /data-model-anchor="lulu-v4"/);
  assert.match(visibleBody, /On Lulu/);
  assert.match(visibleBody, /Violet Beaded Ruffle Romper/);
  assert.doesNotMatch(visibleBody, /Approved studio identity|not shop merchandise/);
  assert.match(visibleBody, /aria-haspopup="dialog"/);
  assert.match(visibleBody, /class="[^"]*shop-filter-sheet/);
  assert.doesNotMatch(visibleBody, /shop-filter-row|availability-filter|shop-desktop-search-panel/);

  const releasedProducts = [
    ["Black Cropped Tee and Slim Trouser Set", "black-cropped-tee-slim-trouser-set"],
    ["Violet Beaded Ruffle Romper", "violet-beaded-ruffle-romper"],
    ["Black Sweetheart Fit-and-Flare Midi Dress", "black-sweetheart-fit-flare-midi-dress"],
    ["Black and Ivory Folded-Neck Column Dress", "black-ivory-folded-neck-column-dress"],
    ["Indigo Seamed Denim Mini Dress", "indigo-seamed-denim-mini-dress"],
    ["Black Cropped Tee and Silver Ruched Skirt Set", "black-cropped-tee-silver-ruched-skirt-set"],
    ["Black Cropped Tee and Pink Distressed Shorts Set", "black-cropped-tee-pink-distressed-shorts-set"],
    ["Black Cropped Tee and Blue Distressed Shorts Set", "black-cropped-tee-blue-distressed-shorts-set"],
    ["Black Cropped Tee and Charcoal Cut-Off Shorts Set", "black-cropped-tee-charcoal-cutoff-shorts-set"],
    ["Black Cropped Tee and Mid-Thigh Black Cut-Off Shorts Set", "black-cropped-tee-mid-thigh-black-cutoff-shorts-set"],
    ["Black Cropped Tee and Light-Wash Snap-Panel Trousers Set", "black-cropped-tee-light-wash-snap-panel-trousers-set"],
    ["Black Cropped Tee and Blue-Wash Drawstring Barrel Trousers Set", "black-cropped-tee-blue-wash-drawstring-barrel-trousers-set"],
    ["Black Cropped Tee and Charcoal-Wash Wide-Leg Cargo Jeans Set", "black-cropped-tee-charcoal-wash-wide-leg-cargo-jeans-set"],
    ["Black Cropped Tee and Dark Indigo Wide-Leg Cargo Jeans Set", "black-cropped-tee-dark-indigo-wide-leg-cargo-jeans-set"],
    ["Black Cropped Tee and Washed Black Wide-Leg Cargo Jeans Set", "black-cropped-tee-washed-black-wide-leg-cargo-jeans-set"],
    ["Plum Sparkle Cowl-Neck Jumpsuit", "plum-sparkle-cowl-neck-jumpsuit"],
    ["Gunmetal Sparkle Open-Back Long-Sleeve Mini Dress", "gunmetal-sparkle-open-back-long-sleeve-mini-dress"],
    ["Fuchsia Strapless Ruched Cascade-Ruffle Mini Dress", "fuchsia-strapless-ruched-cascade-ruffle-mini-dress"],
    ["Charcoal Wrap-Front Ruched Slit Midi Dress", "charcoal-wrap-front-ruched-slit-midi-dress"],
    ["Marigold Sculptural Rosette Strapless Mini Dress", "marigold-sculptural-rosette-strapless-mini-dress"],
    ["Scarlet Rosette Halter Cutout Ruched Mini Dress", "scarlet-rosette-halter-cutout-ruched-mini-dress"],
    ["Crimson Asymmetric Draped Satin Maxi Dress", "crimson-asymmetric-draped-satin-maxi-dress"],
    ["Scarlet Asymmetric Cascade Ruched Mini Dress", "scarlet-asymmetric-cascade-ruched-mini-dress"],
    ["Black Asymmetric Sculpted-Shoulder Mini Dress", "black-asymmetric-sculpted-shoulder-mini-dress"],
    ["Dark Navy Draped Cowl-Neck Side-Cascade Maxi Dress", "dark-navy-draped-cowl-neck-side-cascade-maxi-dress"],
    ["Neon Chartreuse Asymmetric Ruched-Knot Maxi Dress", "neon-chartreuse-asymmetric-ruched-knot-maxi-dress"],
    ["Camel Ribbed Deep-Plunge Short-Sleeve Mini Dress", "camel-ribbed-deep-plunge-short-sleeve-mini-dress"],
    ["Scarlet Long-Sleeve Layered-Cutout Ruched Mini Dress", "scarlet-long-sleeve-layered-cutout-ruched-mini-dress"],
    ["Red Lace-Cup Long-Sleeve Satin-Look Mini Dress", "red-lace-cup-long-sleeve-satin-look-mini-dress"],
    ["Orange Halter Tie-Front Gathered Wrap Mini Dress", "orange-halter-tie-front-gathered-wrap-mini-dress"],
    ["Cobalt Long-Sleeve Crossover Cutout Mini Dress", "cobalt-long-sleeve-crossover-cutout-mini-dress"],
    ["Mauve Architectural Cutout Open-Back Mini Dress", "mauve-architectural-cutout-open-back-mini-dress"],
    ["Near-Black Open-Back Structured-Shoulder Midi Dress", "near-black-open-back-structured-shoulder-midi-dress"],
    ["Lime One-Shoulder Rosette Ruched Mini Dress", "lime-one-shoulder-rosette-ruched-mini-dress"],
  ];

  for (const [name, slug] of releasedProducts) {
    assert.match(visibleBody, new RegExp(`href="/shop/products/${slug}"`));
    assert.match(visibleBody, new RegExp(name));
  }

  // The lead product is rendered once as the editorial hero; the remaining
  // thirty-three products retain the standard catalogue-card contract.
  assert.equal((visibleBody.match(/class="shop-product-card"/g) ?? []).length, 33);
  assert.doesNotMatch(visibleBody, /shop-release-index|shop-wardrobe-preview|shop-editorial-rail|shop-values/);
  assert.doesNotMatch(visibleBody, /GARMENT STUDY|(?:DYN-0(?:8[1-9]|9[0-2])|JUW-0(?:0[1-9]|1[0-2]))|Six dresses from Lulu’s wardrobe|Warm colour\. Clean movement/);
  assert.doesNotMatch(visibleBody, /Coral Drift Dress|Indigo Workshirt|Ivory Tie Skirt/);
  assert.doesNotMatch(visibleBody, /\b(?:AI|provenance|AI-completed|generated evidence)\b/i);
});

test("keeps the private Studio and public shop visibly distinct", async () => {
  const response = await render("/studio");
  assert.equal(response.status, 200);

  const html = await response.text();
  const visibleBody = visibleMarkup(html);
  assert.match(visibleBody, /Opening Lulu Studio/);
  assert.match(visibleBody, /data-experience-layer="island"/);
  assert.match(visibleBody, /aria-label="Studio Home controls"/);
  assert.match(visibleBody, /aria-label="Profile &amp; settings — Lulu’s Studio spaces"/);
  assert.match(visibleBody, /src="\/api\/studio\/profile\/avatar"/);
  assert.doesNotMatch(visibleBody, /src="\/lulu\.png"/);
  assert.match(visibleBody, /aria-label="Find a Studio service or piece"/);
  assert.match(visibleBody, /Ask Studio/);
  assert.doesNotMatch(visibleBody, /aria-label="Studio tabs"|studio-mobile-tabs|shop-dock-lens/);
  assert.doesNotMatch(visibleBody, /Show navigation|id="studio-mobile-navigation"/);
  assert.doesNotMatch(visibleBody, /Clothes with a second first impression/);
});

test("server-renders a navigable public product detail", async () => {
  const response = await render("/shop/products/violet-beaded-ruffle-romper");
  assert.equal(response.status, 200);

  const html = await response.text();
  const visibleBody = visibleMarkup(html);
  assert.match(visibleBody, /Violet Beaded Ruffle Romper/);
  assert.match(html, /Live availability is unavailable/);
  assert.match(html, /Availability temporarily unavailable/);
  assert.doesNotMatch(html, /Buy now|Add to bag/);
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
  assert.doesNotMatch(visibleBody, /<details\b/i);
  assert.doesNotMatch(html, /Sold by|Following/);
  assert.match(html, /data-model-anchor="lulu-v4"/);
  for (const file of [
    "01-garment-front.webp",
    "02-garment-back.webp",
    "03-mannequin-front.webp",
    "04-model-front.webp",
    "05-model-rear-three-quarter.webp",
    "06-fabric-detail.webp",
    "07-model-left-profile.webp",
  ]) {
    assert.match(html, new RegExp(`/products/violet-beaded-ruffle-romper/${file.replace(".", "\\.")}`));
  }
  assert.match(html, /application\/ld\+json/);
  assert.doesNotMatch(visibleBody, /\b(?:AI|provenance|AI-completed|generated evidence)\b/i);
});

test("server-renders every approved view for each Drop 02 product", async () => {
  const slugs = [
    "black-cropped-tee-slim-trouser-set",
    "violet-beaded-ruffle-romper",
    "black-sweetheart-fit-flare-midi-dress",
    "black-ivory-folded-neck-column-dress",
    "indigo-seamed-denim-mini-dress",
    "black-cropped-tee-silver-ruched-skirt-set",
    "black-cropped-tee-pink-distressed-shorts-set",
    "black-cropped-tee-blue-distressed-shorts-set",
    "black-cropped-tee-charcoal-cutoff-shorts-set",
    "black-cropped-tee-mid-thigh-black-cutoff-shorts-set",
    "black-cropped-tee-light-wash-snap-panel-trousers-set",
    "black-cropped-tee-blue-wash-drawstring-barrel-trousers-set",
    "black-cropped-tee-charcoal-wash-wide-leg-cargo-jeans-set",
    "black-cropped-tee-dark-indigo-wide-leg-cargo-jeans-set",
    "black-cropped-tee-washed-black-wide-leg-cargo-jeans-set",
    "plum-sparkle-cowl-neck-jumpsuit",
    "gunmetal-sparkle-open-back-long-sleeve-mini-dress",
    "fuchsia-strapless-ruched-cascade-ruffle-mini-dress",
  ];
  const responses = await Promise.all(
    slugs.map((slug) => render(`/shop/products/${slug}`)),
  );

  for (const [index, response] of responses.entries()) {
    assert.equal(response.status, 200);
    const html = await response.text();
    const visibleBody = visibleMarkup(html);
    const base = `/products/${slugs[index]}`;
    const expectedFiles = slugs[index] === "gunmetal-sparkle-open-back-long-sleeve-mini-dress" ? [
      "01-garment-front.webp",
      "02-garment-back.webp",
      "03-mannequin-front.webp",
      "06-fabric-detail.webp",
    ] : [
      "01-garment-front.webp",
      "02-garment-back.webp",
      "03-mannequin-front.webp",
      "04-model-front.webp",
      "05-model-rear-three-quarter.webp",
      "06-fabric-detail.webp",
      "07-model-left-profile.webp",
    ];
    for (const file of expectedFiles) {
      assert.match(html, new RegExp(`${base}/${file.replace(".", "\\.")}`));
    }
    if (slugs[index] === "gunmetal-sparkle-open-back-long-sleeve-mini-dress") {
      // Client bundles contain the complete shared catalogue seed. The
      // rendered product surface itself must not expose substituted model
      // media for this explicitly authorized four-view release.
      assert.doesNotMatch(visibleBody, /04-model-front\.webp|05-model-rear-three-quarter\.webp|07-model-left-profile\.webp/);
      continue;
    }
    assert.match(visibleBody, /data-model-anchor="lulu-v4"/);
    assert.match(visibleBody, /class="shop-media-frame is-model is-front"[^>]*data-model-anchor="lulu-v4"/);
    assert.match(visibleBody, /On Lulu · left profile/);
    assert.match(visibleBody, /On Lulu · right rear three-quarter/);
    assert.doesNotMatch(visibleBody, /\b(?:AI|provenance|AI-completed|generated evidence)\b/i);
  }
});

test("keeps archived Drop 01 product routes out of the public catalogue", async () => {
  const response = await render("/shop/products/coral-drift-dress");
  assert.equal(response.status, 200);

  const html = await response.text();
  const visibleBody = visibleMarkup(html);
  assert.match(visibleBody, /This find has left the rail/);
  assert.doesNotMatch(visibleBody, /Coral Drift Dress/);
  assert.doesNotMatch(html, /"@type":"Product"/);
});

test("server-renders public commerce and guards customer order history", async () => {
  const [search, saved, bag, checkout, orders, status, account] = await Promise.all([
    render("/shop/search"),
    render("/shop/saved"),
    render("/shop/bag"),
    render("/shop/checkout"),
    render("/shop/orders"),
    render("/shop/orders/JUW-NOT-ON-THIS-DEVICE"),
    render("/shop/account"),
  ]);

  for (const response of [search, saved, bag, checkout, account]) {
    assert.equal(response.status, 200);
  }
  assert.equal(orders.status, 307);
  assert.equal(status.status, 307);
  assert.equal(
    orders.headers.get("location"),
    "/auth/sign-in?returnTo=%2Fshop%2Forders",
  );
  assert.equal(
    status.headers.get("location"),
    "/auth/sign-in?returnTo=%2Fshop%2Forders%2FJUW-NOT-ON-THIS-DEVICE",
  );

  const searchHtml = await search.text();
  const visibleSearch = visibleMarkup(searchHtml);
  assert.match(visibleSearch, /Find your next piece/);
  assert.match(visibleSearch, /aria-haspopup="dialog"/);
  assert.match(visibleSearch, /class="[^"]*shop-filter-sheet/);
  assert.doesNotMatch(visibleSearch, /shop-desktop-search-panel|shop-search-panel/);
  assert.match(await saved.text(), /Opening saved pieces/);
  assert.match(await bag.text(), /Opening your bag/);
  assert.match(await checkout.text(), /Opening checkout/);
  assert.match(await account.text(), /Your space/);
});

test("keeps prototype language out of the visible shopper journey", async () => {
  const responses = await Promise.all([
    render("/shop"),
    render("/shop/search"),
    render("/shop/products/violet-beaded-ruffle-romper"),
    render("/shop/bag"),
    render("/shop/checkout"),
    render("/shop/orders"),
    render("/shop/account"),
  ]);

  const visible = (await Promise.all(responses.map((response) => response.text())))
    .map(visibleCopy)
    .join("\n");
  assert.doesNotMatch(visible, /\b(?:demo|fictional|preview|sample)\b/i);
  assert.doesNotMatch(visible, /\b(?:AI|provenance|AI-completed|generated evidence)\b/i);
  assert.doesNotMatch(visible, /Current mode|Your local activity|Preferences only|Required after save|App settings|Featured piece|More from the rail/i);
});

test("publishes the canonical shop PWA manifest", async () => {
  const response = await render("/manifest.webmanifest", "application/manifest+json");
  assert.equal(response.status, 200);

  const manifest = await response.json();
  assert.equal(manifest.id, "/shop");
  assert.equal(manifest.start_url, "/shop");
  assert.equal(manifest.scope, "/shop");
  assert.ok(manifest.icons.some((icon) => icon.src === "/brand/icon-maskable-512.png?v=2026.3-seal"));
});
