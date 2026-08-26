import assert from "node:assert/strict";
import test from "node:test";
import { selectStudioHomeGate } from "../lib/studio/application/home-gate";

const ready = {
  applicationStatus: "ready" as const,
  authorityStatus: "ready" as const,
  hydration: "ready" as const,
  scenario: false,
};

test("Studio Home waits for both connected projections before choosing an action", () => {
  assert.equal(selectStudioHomeGate({ ...ready, applicationStatus: "idle" }), "loading");
  assert.equal(selectStudioHomeGate({ ...ready, applicationStatus: "loading" }), "loading");
  assert.equal(selectStudioHomeGate({ ...ready, authorityStatus: "loading" }), "loading");
  assert.equal(selectStudioHomeGate({ ...ready, hydration: "restoring" }), "loading");
  assert.equal(selectStudioHomeGate(ready), "ready");
});

test("Studio Home makes recovery primary instead of rendering a dead self-link", () => {
  assert.equal(selectStudioHomeGate({ ...ready, applicationStatus: "error" }), "error");
  assert.equal(selectStudioHomeGate({ ...ready, authorityStatus: "error" }), "error");
  assert.equal(selectStudioHomeGate({ ...ready, applicationStatus: "error", scenario: true }), "ready");
});
