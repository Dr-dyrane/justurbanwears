import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("Studio route errors and unknown paths recover inside the authenticated shell", async () => {
  const [errorBoundary, notFound, unknownRoute, recovery, shell] = await Promise.all([
    readFile(path.join(root, "app/(studio)/studio/error.tsx"), "utf8"),
    readFile(path.join(root, "app/(studio)/studio/not-found.tsx"), "utf8"),
    readFile(path.join(root, "app/(studio)/studio/[...unknown]/page.tsx"), "utf8"),
    readFile(path.join(root, "components/studio/navigation/studio-route-recovery.tsx"), "utf8"),
    readFile(path.join(root, "app/(studio)/layout.tsx"), "utf8"),
  ]);

  assert.match(shell, /<AppShell/);
  assert.match(errorBoundary, /StudioRouteRecovery kind="error" onRetry=\{reset\}/);
  assert.match(notFound, /StudioRouteRecovery kind="not-found"/);
  assert.match(unknownRoute, /StudioRouteRecovery kind="not-found"/);
  assert.match(recovery, /Your Studio session is still open/);
  assert.match(recovery, /Try again/);
  assert.match(recovery, /Open Studio Home/);
  assert.doesNotMatch(recovery, /error\.message|error\.digest/);
});
