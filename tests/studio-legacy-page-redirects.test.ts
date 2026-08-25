import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();

const staticRedirects = [
  ["app/(studio)/garments/page.tsx", "/studio/wardrobe"],
  ["app/(studio)/garments/new/page.tsx", "/studio/wardrobe?intake=1"],
  ["app/(studio)/konan/page.tsx", "/studio/models"],
  ["app/(studio)/shoots/page.tsx", "/studio/media"],
  ["app/(studio)/shoots/new/page.tsx", "/studio/media/new"],
] as const;

test("legacy Studio page modules redirect without mounting obsolete workspaces", () => {
  for (const [path, destination] of staticRedirects) {
    const source = readFileSync(`${root}/${path}`, "utf8");
    assert.match(source, /import \{ permanentRedirect \} from "next\/navigation";/);
    assert.ok(source.includes(`permanentRedirect("${destination}");`));
    assert.doesNotMatch(source, /components\/(?:garment|identity|shoot)/);
  }

  for (const [path, destination] of [
    ["app/(studio)/garments/[id]/page.tsx", "/studio/wardrobe/"],
    ["app/(studio)/shoots/[id]/page.tsx", "/studio/media/"],
  ] as const) {
    const source = readFileSync(`${root}/${path}`, "utf8");
    assert.match(source, /params: Promise<\{ id: string \}>;/);
    assert.match(source, /const \{ id \} = await params;/);
    assert.ok(source.includes(`permanentRedirect(\`${destination}\${encodeURIComponent(id)}\`);`));
    assert.doesNotMatch(source, /components\/(?:garment|identity|shoot)/);
  }
});
