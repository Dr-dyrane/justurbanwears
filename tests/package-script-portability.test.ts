import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

interface PackageManifest {
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
}

const manifest = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
) as PackageManifest;

test("Vinext lifecycle scripts set the Wrangler log path portably", () => {
  assert.equal(manifest.devDependencies["cross-env"], "7.0.3");

  for (const command of ["dev", "build", "start"] as const) {
    assert.equal(
      manifest.scripts[command],
      `cross-env WRANGLER_LOG_PATH=.wrangler/wrangler.log vinext ${command}`,
    );
  }
});
