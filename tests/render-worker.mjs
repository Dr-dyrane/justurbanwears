import { existsSync } from "node:fs";

const renderArtifacts = [
  new URL("../.vercel/output/functions/__server.func/index.mjs", import.meta.url),
  new URL("../.output/server/index.mjs", import.meta.url),
  new URL("../dist/server/index.js", import.meta.url),
];

export async function loadRenderWorker(cacheKey) {
  const workerUrl = renderArtifacts.find((candidate) => existsSync(candidate));
  if (!workerUrl) {
    throw new Error("No rendered application artifact found. Run npm run build first.");
  }

  const importUrl = new URL(workerUrl);
  importUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${cacheKey}`);
  const { default: worker } = await import(importUrl.href);
  return worker;
}
