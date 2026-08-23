import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  SERVICE_WORKER_RELEASE_SENTINEL,
  resolveServiceWorkerReleaseToken,
  stampServiceWorkerSource,
} from "../scripts/stamp-service-worker.mjs";

const serviceWorkerSource = await readFile(
  new URL("../public/sw.js", import.meta.url),
  "utf8",
);

test("service-worker release token resolution uses the strongest available authority", () => {
  assert.equal(
    resolveServiceWorkerReleaseToken({
      VERCEL_DEPLOYMENT_ID: "dpl_release",
      VERCEL_GIT_COMMIT_SHA: "git_release",
      SHOP_DB_GIT_SHA: "shop_release",
    }),
    "dpl_release",
  );
  assert.equal(
    resolveServiceWorkerReleaseToken({ VERCEL_GIT_COMMIT_SHA: "git_release" }),
    "git_release",
  );
  assert.throws(() => resolveServiceWorkerReleaseToken({}), /release token is required/i);
});

test("each release produces a distinct service worker without leaving the sentinel", () => {
  const first = stampServiceWorkerSource(serviceWorkerSource, "release-one");
  const second = stampServiceWorkerSource(serviceWorkerSource, "release-two");
  const digest = (value) => createHash("sha256").update(value).digest("hex");
  const cacheName = (value) => {
    const header = value.split("\n").slice(0, 2).join("\n");
    return Function(`${header}\nreturn SHELL_CACHE;`)();
  };

  assert.doesNotMatch(first, new RegExp(SERVICE_WORKER_RELEASE_SENTINEL));
  assert.equal(cacheName(first), "justurban-wears-public-shell-release-one");
  assert.equal(cacheName(second), "justurban-wears-public-shell-release-two");
  assert.notEqual(digest(first), digest(second));
});

test("stamping fails closed when the source contract changes", () => {
  assert.throws(
    () => stampServiceWorkerSource("const value = 'missing';", "release"),
    /exactly one service-worker release sentinel/i,
  );
});
