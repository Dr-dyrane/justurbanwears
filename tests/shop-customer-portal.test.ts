import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const authPage = await readFile(new URL("../app/auth/[path]/page.tsx", import.meta.url), "utf8");
const authSurface = await readFile(new URL("../components/shop/shop-auth-surface.tsx", import.meta.url), "utf8");
const accountPage = await readFile(new URL("../app/shop/account/page.tsx", import.meta.url), "utf8");
const account = await readFile(new URL("../components/shop/shop-account.tsx", import.meta.url), "utf8");
const shopLayout = await readFile(new URL("../app/shop/layout.tsx", import.meta.url), "utf8");
const shopShell = await readFile(new URL("../components/shop/shop-shell.tsx", import.meta.url), "utf8");
const mobileChrome = await readFile(new URL("../components/shop/shop-mobile-chrome.module.css", import.meta.url), "utf8");

test("guest Shop remains public while account auth is an optional managed Neon boundary", () => {
  assert.doesNotMatch(shopLayout, /requireStudioOperator|getShopCustomerSession|redirect\(/);
  assert.match(authPage, /candidate\?\.startsWith\("\/shop"\)/);
  assert.match(authPage, /ShopAuthSurface/);
  assert.match(authSurface, /PasswordlessAuthView/);
  assert.doesNotMatch(authSurface, /forgotPassword|rememberMe|type="password"/i);
  assert.match(authSurface, /Guest browsing always available/);
  assert.match(accountPage, /getShopCustomerSession/);
  assert.match(account, /Browse first\. Sign in when it helps\./);
  assert.match(account, /authClient\.signOut\(\)/);
  assert.match(account, /\/auth\/sign-in\?returnTo=\/shop\/account/);
});

test("scrolled mobile action stays between equal safe edge controls", () => {
  assert.match(shopShell, /chromeStyles\.contextAction/);
  assert.match(shopShell, /chromeStyles\.edgeAction/);
  assert.match(mobileChrome, /grid-template-columns:[\s\S]*var\(--edge-action-size\)[\s\S]*minmax\(0, 1fr\)[\s\S]*var\(--edge-action-size\)/);
  assert.match(mobileChrome, /overflow: hidden/);
  assert.match(mobileChrome, /text-overflow: ellipsis/);
  assert.match(mobileChrome, /@media \(max-width: 379px\)/);
  assert.match(shopShell, /shop-mobile-fab/);
});
