import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const outputConfigPath = fileURLToPath(
  new URL("../.vercel/output/config.json", import.meta.url),
);
const config = JSON.parse(await readFile(outputConfigPath, "utf8"));
const staticAssetSource = "/_next/static/(.*)";
const missingStaticAssetRoute = {
  src: staticAssetSource,
  status: 404,
  headers: {
    "cache-control": "private, no-store, max-age=0",
    "content-type": "text/plain; charset=utf-8",
  },
};
let foundStaticHeaderRoute = false;

config.routes = config.routes.map((route) => {
  if (
    route.src === staticAssetSource
    && route.headers
    && route.status === undefined
  ) {
    foundStaticHeaderRoute = true;
    return { ...route, continue: true };
  }

  return route;
});

if (!foundStaticHeaderRoute) {
  throw new Error("Expected Nitro's /_next/static header route was not found.");
}

// Existing content-hashed assets keep their immutable header and terminate at
// the filesystem handler. Missing assets fall through to this explicit 404,
// which overrides the broad immutable header so a deploy-skew miss cannot be
// cached for a year by the browser or CDN.
config.routes = config.routes.filter(
  (route) => !(route.src === staticAssetSource && route.status === 404),
);
const filesystemRouteIndex = config.routes.findIndex(
  (route) => route.handle === "filesystem",
);

if (filesystemRouteIndex === -1) {
  throw new Error("Expected Nitro's filesystem route was not found.");
}

config.routes.splice(filesystemRouteIndex + 1, 0, missingStaticAssetRoute);

await writeFile(outputConfigPath, `${JSON.stringify(config, null, 2)}\n`);
