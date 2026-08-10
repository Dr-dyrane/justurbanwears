import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptiveMobileChromeMode,
  deriveMobileChromeVisibility,
} from "../lib/ui/mobile-chrome-state";

const page = { scrollHeight: 1600, viewportHeight: 800 };

test("mobile chrome follows the proven top and direction thresholds", () => {
  const initial = { hidden: false, scrolled: false };
  assert.deepEqual(deriveMobileChromeVisibility(initial, {
    ...page,
    previousScrollTop: 0,
    scrollTop: 11,
  }), initial);

  const scrollingDown = deriveMobileChromeVisibility(initial, {
    ...page,
    previousScrollTop: 12,
    scrollTop: 19,
  });
  assert.deepEqual(scrollingDown, { hidden: true, scrolled: true });

  assert.equal(deriveMobileChromeVisibility(scrollingDown, {
    ...page,
    previousScrollTop: 19,
    scrollTop: 23,
  }), scrollingDown);

  assert.deepEqual(deriveMobileChromeVisibility(scrollingDown, {
    ...page,
    previousScrollTop: 23,
    scrollTop: 16,
  }), { hidden: false, scrolled: true });
});

test("top and short documents keep mobile chrome expanded", () => {
  const hidden = { hidden: true, scrolled: true };
  assert.deepEqual(deriveMobileChromeVisibility(hidden, {
    ...page,
    previousScrollTop: 100,
    scrollTop: 12,
  }), { hidden: false, scrolled: true });
  assert.deepEqual(deriveMobileChromeVisibility(hidden, {
    previousScrollTop: 100,
    scrollHeight: 800,
    scrollTop: 120,
    viewportHeight: 800,
  }), { hidden: false, scrolled: true });
});

test("mobile dock expands, condenses, reveals navigation, and suspends", () => {
  assert.equal(adaptiveMobileChromeMode({ hidden: false, navigationRevealed: false, suspended: false }), "expanded");
  assert.equal(adaptiveMobileChromeMode({ hidden: true, navigationRevealed: false, suspended: false }), "compact");
  assert.equal(adaptiveMobileChromeMode({ hidden: true, navigationRevealed: true, suspended: false }), "navigation");
  assert.equal(adaptiveMobileChromeMode({ hidden: false, navigationRevealed: false, suspended: true }), "suspended");
});
