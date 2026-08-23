import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SERVICE_WORKER_RELEASE_SENTINEL = "__JUW_RELEASE_TOKEN__";

export function resolveServiceWorkerReleaseToken(env = process.env) {
  const token = [
    env.VERCEL_DEPLOYMENT_ID,
    env.VERCEL_GIT_COMMIT_SHA,
    env.SHOP_DB_GIT_SHA,
  ]
    .map((value) => value?.trim())
    .find(Boolean);

  if (!token) {
    throw new Error(
      "A release token is required in VERCEL_DEPLOYMENT_ID, VERCEL_GIT_COMMIT_SHA, or SHOP_DB_GIT_SHA.",
    );
  }

  return token;
}

export function stampServiceWorkerSource(source, releaseToken) {
  const sentinelLiteral = JSON.stringify(SERVICE_WORKER_RELEASE_SENTINEL);
  const matches = source.split(sentinelLiteral).length - 1;

  if (matches !== 1) {
    throw new Error(
      `Expected exactly one service-worker release sentinel; found ${matches}.`,
    );
  }

  return source.replace(sentinelLiteral, JSON.stringify(releaseToken));
}

async function main() {
  const outputPath = fileURLToPath(
    new URL("../.vercel/output/static/sw.js", import.meta.url),
  );
  const source = await readFile(outputPath, "utf8");
  const releaseToken = resolveServiceWorkerReleaseToken();
  const stamped = stampServiceWorkerSource(source, releaseToken);

  await writeFile(outputPath, stamped);
  console.log(`Stamped the production service worker for ${releaseToken}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
