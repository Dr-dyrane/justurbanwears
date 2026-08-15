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
await htmlCheck("brand entrance", "/", [
  ["brand entrance missing", (body) => body.includes('data-brand-entrance="justurbanwears"')],
  ["brand proposition missing", (body) => body.includes("Clothes deserve") && body.includes("more than one")],
  ["wardrobe handoff missing", (body) => body.includes('href="/shop"') && body.includes("Enter the wardrobe")],
  ["garment truth story missing", (body) => body.includes("A complete digital identity") && body.includes("Human reviewed")],
  ["malformed metadata", (body) => !body.includes("[object Object]")],
]);
await htmlCheck("shop shell", "/shop", [
  ["brand copy missing", (body) => body.includes("justurban wears")],
  ["Drop 01 missing", (body) => body.includes("Drop 01")],
  ["shop navigation missing", (body) => body.includes("Search the wardrobe")],
  ["malformed metadata", (body) => !body.includes("[object Object]")],
  ["favicon metadata missing", (body) => body.includes('/favicon.ico?v=2026.3-seal')],
]);
await htmlCheck("product passport", "/shop/products/coral-drift-dress", [
  ["product name missing", (body) => body.includes("Coral Drift Dress")],
  ["Product JSON-LD missing", (body) => body.includes("application/ld+json") && body.includes('"@type":"Product"')],
]);
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
