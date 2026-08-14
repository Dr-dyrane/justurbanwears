import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const operator = await readFile(new URL("../lib/server/studio-operator.ts", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/(studio)/layout.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/auth/[...path]/route.ts", import.meta.url), "utf8");
const authPage = await readFile(new URL("../components/studio/auth/studio-auth-surface.tsx", import.meta.url), "utf8");

test("production Studio uses managed Neon Auth and still enforces the operator allowlist", () => {
  assert.match(operator, /mode !== "openai-sites" && mode !== "neon-auth"/);
  assert.match(operator, /getNeonAuth\(\)\.getSession\(\)/);
  assert.match(operator, /STUDIO_OPERATOR_EMAILS/);
  assert.match(operator, /getStudioOperatorMembership/);
  assert.match(layout, /requireStudioOperator\(\)/);
  assert.match(layout, /redirect\(authSignInPath\(returnTo\)\)/);
  assert.match(route, /getNeonAuth\(\)\.handler\(\)/);
  assert.match(authPage, /PasswordlessAuthView/);
  assert.doesNotMatch(authPage, /forgotPassword|rememberMe|type="password"/i);
});
