import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductDisplayName } from "../components/shop/product-display-name";

test("separates the repeated supporting tee without changing the canonical name", () => {
  const name = "Black Cropped Tee and Pink Distressed Shorts Set";

  const markup = renderToStaticMarkup(createElement(ProductDisplayName, { name }));
  assert.match(markup, /shop-product-name-supporting/);
  assert.match(markup, />Black Cropped Tee</);
  assert.match(markup, /class="sr-only"> and <\/span>/);
  assert.match(markup, /aria-hidden="true" class="shop-product-name-conjunction-visual"> &amp; <\/span>/);
  assert.match(markup, />Pink Distressed Shorts Set</);
});

test("uses the conjunction treatment without muting a unique product lead", () => {
  const name = "Black and Ivory Folded-Neck Column Dress";
  const markup = renderToStaticMarkup(createElement(ProductDisplayName, { name }));
  assert.doesNotMatch(markup, /shop-product-name-supporting/);
  assert.match(markup, /class="sr-only"> and <\/span>/);
});

test("leaves names without the product conjunction untouched", () => {
  const name = "Violet Beaded Ruffle Romper";

  assert.equal(renderToStaticMarkup(createElement(ProductDisplayName, { name })), name);
});
