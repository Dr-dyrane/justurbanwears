import assert from "node:assert/strict";
import test from "node:test";
import type {
  ShopApprovedModelMedia,
  ShopModelTryout,
} from "../lib/shop/domain/entities";
import {
  initialModelTryoutState,
  modelTryoutReducer,
  resolveApprovedModelTryout,
} from "../lib/shop/model-tryout.ts";

function approvedFront(): ShopApprovedModelMedia {
  return {
    id: "model-front",
    src: "/shop/products/ivory-tie-skirt/04-model-front.webp",
    alt: "Ivory Tie Skirt on the model from the front.",
    label: "On model",
    presentation: "model",
    view: "front",
    width: 971,
    height: 1619,
    modelAnchorId: "lulu-v2",
  };
}

const approvedTryout: ShopModelTryout = {
  modelStatus: "APPROVED",
  modelAnchorId: "lulu-v2",
  frame: approvedFront(),
};

test("resolves only an approved front frame on the declared model anchor", () => {
  const resolved = resolveApprovedModelTryout(approvedTryout);
  assert.ok(resolved);
  assert.equal(resolved.modelAnchorId, "lulu-v2");
  assert.equal(resolved.frame.view, "front");

  assert.equal(resolveApprovedModelTryout({ modelStatus: "PENDING" }), null);

  const wrongPresentation = {
    ...approvedTryout,
    frame: { ...approvedFront(), presentation: "garment" },
  } as unknown as ShopModelTryout;
  assert.equal(resolveApprovedModelTryout(wrongPresentation), null);

  const mismatchedAnchor = {
    ...approvedTryout,
    frame: { ...approvedFront(), modelAnchorId: "another-model" },
  } as unknown as ShopModelTryout;
  assert.equal(resolveApprovedModelTryout(mismatchedAnchor), null);
});

test("moves from loading to the approved front view and closes cleanly", () => {
  let state = modelTryoutReducer(initialModelTryoutState, { type: "OPEN" });
  assert.equal(state.phase, "loading");
  assert.equal(state.attempt, 1);

  state = modelTryoutReducer(state, {
    type: "FRAME_LOADED",
    attempt: 1,
  });
  assert.equal(state.phase, "ready");

  state = modelTryoutReducer(state, { type: "CLOSE" });
  assert.equal(state.phase, "closed");
  assert.equal(state.attempt, 1);
});

test("surfaces a load failure and ignores events from an earlier retry", () => {
  let state = modelTryoutReducer(initialModelTryoutState, { type: "OPEN" });
  state = modelTryoutReducer(state, {
    type: "FRAME_FAILED",
    attempt: 1,
  });
  assert.equal(state.phase, "error");

  state = modelTryoutReducer(state, { type: "RETRY" });
  assert.equal(state.phase, "loading");
  assert.equal(state.attempt, 2);

  const stale = modelTryoutReducer(state, {
    type: "FRAME_LOADED",
    attempt: 1,
  });
  assert.equal(stale, state);

  const ready = modelTryoutReducer(state, {
    type: "FRAME_LOADED",
    attempt: 2,
  });
  assert.equal(ready.phase, "ready");
});
