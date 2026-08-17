import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const authPage = await readFile(new URL("../app/auth/[path]/page.tsx", import.meta.url), "utf8");
const authSurface = await readFile(new URL("../components/shop/shop-auth-surface.tsx", import.meta.url), "utf8");
const accountPage = await readFile(new URL("../app/shop/account/page.tsx", import.meta.url), "utf8");
const account = await readFile(new URL("../components/shop/shop-account.tsx", import.meta.url), "utf8");
const shopLayout = await readFile(new URL("../app/shop/layout.tsx", import.meta.url), "utf8");
const shopShell = await readFile(new URL("../components/shop/shop-shell.tsx", import.meta.url), "utf8");
const shopBag = await readFile(new URL("../components/shop/shop-bag.tsx", import.meta.url), "utf8");
const shopCheckout = await readFile(new URL("../components/shop/shop-checkout.tsx", import.meta.url), "utf8");
const mobileBars = await readFile(new URL("../app/apple-mobile-bars.css", import.meta.url), "utf8");
const foundation = await readFile(new URL("../app/foundation.css", import.meta.url), "utf8");
const editorialHero = await readFile(new URL("../app/shop-editorial-hero.css", import.meta.url), "utf8");

test("guest Shop remains public while account auth is an optional managed Neon boundary", () => {
  assert.doesNotMatch(shopLayout, /requireStudioOperator|getShopCustomerSession|redirect\(/);
  assert.match(authPage, /candidate\?\.startsWith\("\/shop"\)/);
  assert.match(authPage, /ShopAuthSurface/);
  assert.match(authSurface, /PasswordlessAuthView/);
  assert.doesNotMatch(authSurface, /forgotPassword|rememberMe|type="password"/i);
  assert.match(authSurface, /Guest browsing always available/);
  assert.match(accountPage, /getShopCustomerSession/);
  assert.match(account, /Browse first\. Sign in when it helps\./);
  assert.match(account, /Your orders/);
  assert.match(account, /authClient\.signOut\(\)/);
});

test("mobile Shop separates visible navigation from the contextual action accessory", () => {
  for (const label of ["Home", "Search", "Saved", "Orders", "Bag"]) assert.match(shopShell, new RegExp(`label:\\?\"${label}\\?\"|>${label}<`));
  assert.match(shopShell, /aria-label="Shop tabs"/);
  assert.match(shopShell, /shop-mobile-context shop-dock-lens/);
  assert.match(shopShell, /useFragmentTargetVisible/);
  assert.match(mobileBars, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(mobileBars, /min-width:44px/);
  assert.match(mobileBars, /font-size:11px/);
  assert.doesNotMatch(shopShell, /shop-mobile-fab/);
  assert.doesNotMatch(shopShell, /shop-mobile-nav-reveal/);
});

test("bag, checkout, and mobile chrome share the same fail-closed availability decision", () => {
  for (const source of [shopShell, shopBag, shopCheckout]) assert.match(source, /isBagCheckoutAvailable/);
  assert.match(shopCheckout, /if \(!checkoutAvailable\)/);
});

test("mobile discovery stays compact and functional microcopy has a 12px floor", () => {
  assert.match(foundation, /--shop-browse-surface: #f5ebe3/);
  assert.match(foundation, /@media \(max-width: 460px\)[\s\S]*?\.shop-discovery > \.shop-product-grid[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(foundation, /\/\* Readable Shop microcopy contract\. \*\/[\s\S]*?font-size: 12px/);
  assert.doesNotMatch(editorialHero, /font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px/);
});
