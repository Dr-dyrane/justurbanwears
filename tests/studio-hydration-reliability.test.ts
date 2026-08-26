import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { studioReducer } from "../lib/studio/machines/studio-machine";
import { createInitialStudioState } from "../lib/studio/domain/state";

test("hydration failures retain the connected read error for a fail-closed Studio surface", () => {
  const state = studioReducer(createInitialStudioState(), {
    type: "HYDRATION_FAILED",
    message: "Connected Wardrobe is unavailable. Try again.",
  });

  assert.equal(state.hydration, "degraded");
  assert.equal(state.persistence, "unavailable");
  assert.equal(state.lastError, "Connected Wardrobe is unavailable. Try again.");
});

test("Wardrobe-dependent Studio surfaces fail closed without blocking independent operations", async () => {
  const shell = await readFile(new URL("../components/studio/app-shell.tsx", import.meta.url), "utf8");

  assert.match(shell, /pathname === "\/studio"/u);
  assert.match(shell, /pathname\.startsWith\("\/studio\/wardrobe"\)/u);
  assert.match(shell, /pathname\.startsWith\("\/studio\/ask"\)/u);
  assert.match(shell, /studio\.hydration === "degraded"/u);
  assert.match(shell, /Studio data could not be verified\./u);
  assert.match(shell, /window\.location\.reload\(\)/u);
  assert.doesNotMatch(shell, /pathname\.startsWith\("\/studio\/orders"\)/u);
  assert.doesNotMatch(shell, /pathname\.startsWith\("\/studio\/operations"\)/u);
});
