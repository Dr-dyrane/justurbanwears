import process from "node:process";

const KiB = 1024;
const origin = new URL(process.argv[2] ?? "https://www.justurbanwears.com");
if (origin.protocol !== "https:" && origin.hostname !== "localhost") {
  console.error("Experience smoke requires HTTPS, except for localhost.");
  process.exit(2);
}

const routes = [
  {
    name: "Site experience",
    pathname: "/",
    maxBytes: 400 * KiB,
    assertions: [
      ["Site marker missing", (html) => html.includes('data-experience-surface="site"')],
      ["editorial tempo missing", (html) => html.includes('data-experience-tempo="editorial"')],
      ["campaign action missing", (html) => html.includes("Enter wardrobe")],
      ["hero priority contract", (html) => highPriorityImages(html) === 1],
    ],
  },
  {
    name: "Shop experience",
    pathname: "/shop",
    maxBytes: 2200 * KiB,
    assertions: [
      ["Shop marker missing", (html) => html.includes('data-experience-surface="shop"')],
      ["focus tempo missing", (html) => html.includes('data-experience-tempo="focus"')],
      ["context island missing", (html) => html.includes('data-experience-layer="island"')],
      ["hero priority contract", (html) => highPriorityImages(html) === 1],
    ],
  },
  {
    name: "Garment focus",
    pathname: "/shop/products/coral-drift-dress",
    maxBytes: 900 * KiB,
    assertions: [
      ["garment focus marker missing", (html) => html.includes('data-experience-focus="garment"')],
      ["product transition anchor missing", (html) => html.includes('data-product-transition="coral-drift-dress"')],
      ["focus priority exceeded", (html) => highPriorityImages(html) <= 1],
    ],
  },
  {
    name: "Studio boundary",
    pathname: "/studio",
    maxBytes: 350 * KiB,
    assertions: [
      ["private Studio auth missing", (html) => html.includes("Your private wardrobe desk")],
      ["Studio return path missing", (html) => html.includes("/studio")],
    ],
  },
];

function highPriorityImages(html) {
  return (html.match(/fetchpriority=["']high["']/gi) ?? []).length;
}

function imagesHaveDimensions(html) {
  const images = html.match(/<img\b[^>]*>/gi) ?? [];
  return images.length > 0 && images.every((image) => /\bwidth=["'][^"']+["']/i.test(image) && /\bheight=["'][^"']+["']/i.test(image));
}

function formatBytes(value) {
  return `${(value / KiB).toFixed(1)} KiB`;
}

async function request(pathname) {
  const url = new URL(pathname, origin);
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const started = performance.now();
    try {
      const response = await fetch(url, {
        headers: { accept: "text/html", "user-agent": "justurbanwears-experience-smoke/1.0" },
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(timer);
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
        continue;
      }
      return { response, duration: Math.round(performance.now() - started) };
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError ?? new Error(`Request failed: ${url}`);
}

const failures = [];
for (const route of routes) {
  try {
    const { response, duration } = await request(route.pathname);
    const html = await response.text();
    const bytes = Buffer.byteLength(html);
    const routeFailures = [];
    if (response.status !== 200) routeFailures.push(`status ${response.status}`);
    if (!/^text\/html\b/i.test(response.headers.get("content-type") ?? "")) routeFailures.push("not HTML");
    if (bytes > route.maxBytes) routeFailures.push(`${formatBytes(bytes)} exceeds ${formatBytes(route.maxBytes)}`);
    if (!imagesHaveDimensions(html)) routeFailures.push("image dimensions missing");
    if (html.includes("[object Object]")) routeFailures.push("malformed metadata");
    for (const [label, assertion] of route.assertions) {
      if (!assertion(html)) routeFailures.push(label);
    }
    const passed = routeFailures.length === 0;
    console.log(`${passed ? "✓" : "✗"} ${route.name} — ${formatBytes(bytes)} · ${duration} ms${passed ? "" : ` · ${routeFailures.join(", ")}`}`);
    if (!passed) failures.push(`${route.name}: ${routeFailures.join(", ")}`);
  } catch (error) {
    failures.push(`${route.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length) {
  console.error(`\nExperience production certification failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(`\n${routes.length}/${routes.length} experience production checks passed for ${origin.origin}.`);
