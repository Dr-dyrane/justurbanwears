import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const shared = await readFile(new URL("../components/auth/passwordless-auth-view.tsx", import.meta.url), "utf8");
const studio = await readFile(new URL("../components/studio/auth/studio-auth-surface.tsx", import.meta.url), "utf8");
const shop = await readFile(new URL("../components/shop/shop-auth-surface.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/auth/[path]/page.tsx", import.meta.url), "utf8");
const operator = await readFile(new URL("../lib/server/studio-operator.ts", import.meta.url), "utf8");
const foundation = await readFile(new URL("../app/foundation.css", import.meta.url), "utf8");
const shopStyles = await readFile(new URL("../components/shop/shop-auth.module.css", import.meta.url), "utf8");

test("Studio and Shop use one native Neon email-code flow without passwords", () => {
  assert.match(shared, /emailOTP/);
  assert.match(shared, /view="EMAIL_OTP"/);
  assert.match(shared, /credentials=\{false\}/);
  assert.match(shared, /signUp=\{false\}/);
  assert.match(shared, /magicLink=\{false\}/);
  assert.match(shared, /passkey=\{false\}/);
  assert.match(shared, /social=\{\{ providers: \[\] \}\}/);
  assert.match(shared, /Send code/);
  assert.doesNotMatch(shared, /forgotPassword|rememberMe|type="password"/i);
  assert.match(studio, /PasswordlessAuthView/);
  assert.match(shop, /PasswordlessAuthView/);
  assert.doesNotMatch(studio + shop, /forgotPassword|rememberMe|SignUp|Forgot your password|type="password"/i);
});

test("passwordless auth preserves safe returns and the private operator boundary", () => {
  assert.match(route, /candidate\?\.startsWith\("\/shop"\)/);
  assert.match(route, /candidate\?\.startsWith\("\/studio"\)/);
  assert.match(operator, /STUDIO_OPERATOR_EMAILS/);
  assert.match(operator, /getStudioOperatorMembership/);
});

test("both passwordless surfaces declare light and dark semantic states", () => {
  assert.match(foundation, /--studio-auth-field/);
  assert.match(foundation, /\[data-theme="dark"\] \.studio-auth-panel/);
  assert.match(shopStyles, /--shop-auth-field/);
  assert.match(shopStyles, /:global\(html\[data-theme="dark"\]\) \.shell/);
});
