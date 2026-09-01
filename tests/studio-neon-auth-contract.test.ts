import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const operator = await readFile(new URL("../lib/server/studio-operator.ts", import.meta.url), "utf8");
const membership = await readFile(new URL("../lib/server/studio-operator-membership.ts", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/(studio)/layout.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/auth/[...path]/route.ts", import.meta.url), "utf8");
const authPage = await readFile(new URL("../components/studio/auth/studio-auth-surface.tsx", import.meta.url), "utf8");
const envTemplate = await readFile(new URL("../.env.example", import.meta.url), "utf8");
const envValidator = await readFile(new URL("../scripts/validate-release-env.mjs", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
  scripts: Record<string, string>;
};

test("production Studio uses managed Neon Auth and still enforces the operator allowlist", () => {
  assert.match(operator, /mode !== "openai-sites" && mode !== "neon-auth"/);
  assert.match(operator, /getNeonAuth\(\)\.getSession\(\)/);
  assert.match(operator, /STUDIO_OPERATOR_EMAILS/);
  assert.match(operator, /getStudioOperatorMembership/);
  assert.match(operator, /actorSubject: user\.userId/);
  assert.match(operator, /projectStudioOperator/);
  assert.match(membership, /join studio_workspaces/i);
  assert.match(membership, /workspace_id/);
  assert.match(membership, /data_subject/);
  assert.match(membership, /active = true/);
  assert.match(layout, /requireStudioOperator\(\)/);
  assert.match(layout, /redirect\(authSignInPath\(returnTo\)\)/);
  assert.match(route, /getNeonAuth\(\)\.handler\(\)/);
  assert.match(authPage, /PasswordlessAuthView/);
  assert.doesNotMatch(authPage, /forgotPassword|rememberMe|type="password"/i);
});

test("the documented local runtime check loads its pull and requires Neon Auth", () => {
  assert.equal(
    packageJson.scripts["env:check:runtime"],
    "node --env-file-if-exists=.env.local scripts/validate-release-env.mjs --runtime",
  );
  assert.equal(
    packageJson.scripts["env:check:studio"],
    "node --env-file-if-exists=.env.local scripts/validate-release-env.mjs --studio-runtime",
  );
  assert.match(envTemplate, /^NEON_AUTH_BASE_URL=$/m);
  assert.match(envTemplate, /^NEON_AUTH_COOKIE_SECRET=$/m);
  assert.match(envValidator, /toUpperCase\(\) === "\[SENSITIVE\]"/);
  assert.match(envValidator, /authMode === "neon-auth"/);
  assert.match(envValidator, /required: mode === "--studio-runtime"/);
  assert.match(envValidator, /requiredEnvironment\(\["NEON_AUTH_BASE_URL", "NEON_AUTH_COOKIE_SECRET"\]\)/);
});
