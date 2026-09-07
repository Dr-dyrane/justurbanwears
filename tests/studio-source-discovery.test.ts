import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { Scanner } from "@tailwindcss/oxide";

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

test("Tailwind scans runtime sources, not audit prose, tests or workstation clones", () => {
  const stylesheet = readFileSync(path.join(root, "app/globals.css"), "utf8");
  assert.match(stylesheet, /@import "tailwindcss" source\(none\);/);
  const scanner = new Scanner({
    sources: [...stylesheet.matchAll(/@source (not )?"([^"]+)";/g)].map((entry) => ({
      base: path.join(root, "app"),
      pattern: entry[2],
      negated: Boolean(entry[1]),
    })),
  });
  const candidates = scanner.scan();
  const files = scanner.files.map((file) => path.relative(root, file));
  for (const file of ["app/layout.tsx", "components/studio/app-shell.tsx", "lib/utils.ts", "hooks/studio/use-studio-service-order.ts"]) {
    assert.ok(files.includes(file), `runtime source not scanned: ${file}`);
  }
  assert.ok(files.some((file) => file.startsWith("node_modules/streamdown/dist/")));
  assert.ok(files.every((file) => /^(app|components|lib|hooks|node_modules\/streamdown\/dist)\//.test(file)));
  assert.ok(files.every((file) => !/ [23]\.[^/]+$/.test(file)));
  assert.ok(candidates.includes("antialiased"));
});
