import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const outputConfigPath = fileURLToPath(
  new URL("../.vercel/output/config.json", import.meta.url),
);
const config = JSON.parse(await readFile(outputConfigPath, "utf8"));
let normalized = false;

config.routes = config.routes.map((route) => {
  if (
    route.src === "/_next/static/(.*)"
    && route.headers
    && route.continue !== true
  ) {
    normalized = true;
    return { ...route, continue: true };
  }

  return route;
});

if (!normalized) {
  throw new Error("Expected Nitro's /_next/static header route was not found.");
}

await writeFile(outputConfigPath, `${JSON.stringify(config, null, 2)}\n`);
