import process from "node:process";

const origin = new URL(process.argv[2] ?? "https://www.justurbanwears.com");
if (origin.protocol !== "https:" && origin.hostname !== "localhost") {
  console.error("Smoke tests require HTTPS, except for localhost.");
  process.exit(2);
}
const results = [];
async function request(pathname, init = {}) {
  const url = new URL(pathname, origin);
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const started = performance.now();
    try {
      const response = await fetch(url, { redirect: "follow", ...init, headers: { "user-agent": "justurbanwears-release-smoke/1.0", ...(init.headers ?? {}) }, signal: controller.signal });
      clearTimeout(timer);
      if ((response.status === 429 || response.status >= 500) && attempt < 3) { await new Promise((resolve) => setTimeout(resolve, attempt * 500)); continue; }
      return { response, duration: Math.round(performance.now() - started) };
    } catch (error) {
      clearTimeout(timer); lastError = error;
      if (attempt < 3) { await new Promise((resolve) => setTimeout(resolve, attempt * 500)); continue; }
    }
  }
  throw lastError ?? new Error(`Request failed: ${url}`);
}
function record(name, passed, detail) {
  results.push({ name, passed });
  console.log(`${passed ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}
function visibleMarkup(html) {
  const bodyStart = html.indexOf("<body");
  const bodyEnd = html.indexOf("</body>", bodyStart);
  return html
    .slice(bodyStart, bodyEnd === -1 ? undefined : bodyEnd)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}
function visibleText(html) {
  return visibleMarkup(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function hasMatchingDropCounts(html) {
  const text = visibleText(html);
  const hero = text.match(/(\d+) pieces\. No restocks\./);
  const discovery = text.match(/Drop 02 · (\d+) one-off pieces/);
  return Boolean(hero && discovery && hero[1] === discovery[1] && Number(hero[1]) > 0);
}
function hasNoCustomerAiCopy(html) {
  return !/\b(?:AI|provenance|AI-completed|generated evidence)\b/i.test(visibleMarkup(html));
}
async function htmlCheck(name, pathname, assertions) {
  try {
    const { response, duration } = await request(pathname, { headers: { accept: "text/html" } });
    const body = await response.text();
    const failures = [];
    if (response.status !== 200) failures.push(`status ${response.status}`);
    if (!/^text\/html\b/i.test(response.headers.get("content-type") ?? "")) failures.push("not HTML");
    for (const [label, test] of assertions) if (!test(body)) failures.push(label);
    record(name, failures.length === 0, failures.length ? failures.join(", ") : `${duration} ms`);
  } catch (error) { record(name, false, error instanceof Error ? error.message : String(error)); }
}
try {
  const { response, duration } = await request("/", {
    headers: { accept: "text/html" },
    redirect: "manual",
  });
  const location = response.headers.get("location");
  const passed = response.status === 308 && Boolean(location) && new URL(location, origin).pathname === "/shop";
  record("root to Shop", passed, `${response.status} · ${location ?? "no location"} · ${duration} ms`);
} catch (error) { record("root to Shop", false, error instanceof Error ? error.message : String(error)); }
await htmlCheck("shop shell", "/shop", [
  ["brand copy missing", (body) => body.includes("justurban wears")],
  ["Drop 02 missing", (body) => body.includes("Drop 02")],
  ["Drop 02 count missing", hasMatchingDropCounts],
  ["Drop 02 hero missing", (body) => body.includes("violet-beaded-ruffle-romper")],
  ["Drop 02 catalogue incomplete", (body) => [
    "black-cropped-tee-slim-trouser-set",
    "violet-beaded-ruffle-romper",
    "black-sweetheart-fit-flare-midi-dress",
    "black-ivory-folded-neck-column-dress",
    "indigo-seamed-denim-mini-dress",
    "black-cropped-tee-silver-ruched-skirt-set",
    "black-cropped-tee-pink-distressed-shorts-set",
    "black-cropped-tee-blue-distressed-shorts-set",
  ].every((slug) => body.includes(`/shop/products/${slug}`))],
  ["Drop 01 leaked into discovery", (body) => !visibleMarkup(body).includes("coral-drift-dress")],
  ["shop navigation missing", (body) => body.includes("Search the wardrobe")],
  ["customer-facing AI copy leaked", hasNoCustomerAiCopy],
  ["malformed metadata", (body) => !body.includes("[object Object]")],
  ["favicon metadata missing", (body) => body.includes('/favicon.ico?v=2026.3-seal')],
]);
await htmlCheck("product passport", "/shop/products/black-cropped-tee-blue-distressed-shorts-set", [
  ["product name missing", (body) => body.includes("Black Cropped Tee and Blue Distressed Shorts Set")],
  ["seven-view dossier incomplete", (body) => [
    "01-garment-front.webp",
    "02-garment-back.webp",
    "03-mannequin-front.webp",
    "04-model-front.webp",
    "05-model-rear-three-quarter.webp",
    "06-fabric-detail.webp",
    "07-model-left-profile.webp",
  ].every((file) => body.includes(file))],
  ["customer-facing AI copy leaked", hasNoCustomerAiCopy],
  ["Product JSON-LD missing", (body) => body.includes("application/ld+json") && body.includes('"@type":"Product"')],
]);
try {
  const { response, duration } = await request("/shop/products/coral-drift-dress", {
    headers: { accept: "text/html" },
  });
  const body = await response.text();
  const visible = visibleMarkup(body);
  const withdrawn = response.status === 404 || (
    response.status === 200
    && visible.includes("This find has left the rail")
    && !visible.includes("Coral Drift Dress")
    && !body.includes('"@type":"Product"')
  );
  record("Drop 01 withdrawn", withdrawn, `${response.status} · ${duration} ms`);
} catch (error) { record("Drop 01 withdrawn", false, error instanceof Error ? error.message : String(error)); }
await htmlCheck("passwordless auth", "/auth/sign-in?returnTo=%2Fshop%2Forders", [["email-code surface missing", (body) => body.includes("Email code")]]);
try {
  const { response, duration } = await request("/manifest.webmanifest", { headers: { accept: "application/manifest+json" } });
  const manifest = await response.json();
  const passed = response.status === 200 && manifest.id === "/shop" && manifest.start_url === "/shop" && Array.isArray(manifest.icons) && manifest.icons.some((icon) => icon.src?.includes("icon-maskable-512.png"));
  record("PWA manifest", passed, passed ? `${duration} ms` : `status ${response.status}`);
} catch (error) { record("PWA manifest", false, error instanceof Error ? error.message : String(error)); }
for (const [name, pathname] of [["favicon", "/favicon.ico"], ["social preview", "/brand/social-og.png"]]) {
  try {
    const { response, duration } = await request(pathname);
    const contentType = response.headers.get("content-type") ?? "";
    record(name, response.status === 200 && contentType.startsWith("image/"), `${response.status} · ${contentType || "unknown"} · ${duration} ms`);
  } catch (error) { record(name, false, error instanceof Error ? error.message : String(error)); }
}
try {
  const { response, duration } = await request("/api/shop/orders", { headers: { accept: "application/json" } });
  const body = await response.json().catch(() => null);
  record("order authorization boundary", response.status === 401 && Boolean(body?.error), `${response.status} · ${duration} ms`);
} catch (error) { record("order authorization boundary", false, error instanceof Error ? error.message : String(error)); }
try {
  const { response, duration } = await request("/api/shop/catalogue/availability", { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: "{}" });
  const body = await response.json().catch(() => null);
  record("availability validation boundary", response.status === 400 && body?.status === "CHANGED", `${response.status} · ${duration} ms`);
} catch (error) { record("availability validation boundary", false, error instanceof Error ? error.message : String(error)); }
const failures = results.filter((result) => !result.passed);
console.log(`\n${results.length - failures.length}/${results.length} production checks passed for ${origin.origin}.`);
if (failures.length) process.exit(1);
