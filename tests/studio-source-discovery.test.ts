import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const cloneExcludes = [
  "**/* 2.ts",
  "**/* 2.tsx",
  "**/* 2.mts",
  "**/* 3.ts",
  "**/* 3.tsx",
  "**/* 3.mts",
] as const;

function readConfig(name: string) {
  return JSON.parse(readFileSync(path.join(root, name), "utf8")) as {
    exclude?: string[];
  };
}

test("local and release TypeScript discovery exclude workstation clone families", () => {
  const localExcludes = readConfig("tsconfig.json").exclude ?? [];
  const releaseExcludes = readConfig("tsconfig.release.json").exclude ?? [];

  for (const pattern of cloneExcludes) {
    assert.ok(localExcludes.includes(pattern), `tsconfig.json must exclude ${pattern}`);
    assert.ok(
      releaseExcludes.includes(pattern),
      `tsconfig.release.json must exclude ${pattern}`,
    );
  }
});
