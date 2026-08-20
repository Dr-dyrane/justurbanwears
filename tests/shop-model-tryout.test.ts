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
  selectProductGalleryMedia,
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

test("keeps independently approved V2 supplemental views beside a V3 front", () => {
  const front = {
    ...approvedFront(),
    src: "/shop/products/moss-square-knit/04-model-front.webp",
    modelAnchorId: "lulu-v3" as const,
  };
  const gallery = selectProductGalleryMedia({
    modelTryout: {
      modelStatus: "APPROVED",
      modelAnchorId: "lulu-v3",
      frame: front,
    },
    media: [{
      ...approvedFront(),
      id: "model-left-profile",
      src: "/shop/products/moss-square-knit/07-model-left-profile.webp",
      view: "side",
      modelAnchorId: "lulu-v2",
    }],
  });

  assert.deepEqual(
    gallery.map(({ src, modelAnchorId }) => ({ src, modelAnchorId })),
    [
      { src: front.src, modelAnchorId: "lulu-v3" },
      {
        src: "/shop/products/moss-square-knit/07-model-left-profile.webp",
        modelAnchorId: "lulu-v2",
      },
    ],
  );
});

test("keeps independently approved V4 views in the product gallery", () => {
  const front = {
    ...approvedFront(),
    src: "/shop/products/violet-beaded-ruffle-romper/04-model-front.webp",
    modelAnchorId: "lulu-v4" as const,
  };
  const profile = {
    ...approvedFront(),
    id: "model-left-profile",
    src: "/shop/products/violet-beaded-ruffle-romper/07-model-left-profile.webp",
    view: "side" as const,
    modelAnchorId: "lulu-v4" as const,
  };
  const gallery = selectProductGalleryMedia({
    modelTryout: {
      modelStatus: "APPROVED",
      modelAnchorId: "lulu-v4",
      frame: front,
    },
    media: [profile],
  });

  assert.deepEqual(
    gallery.map(({ src, modelAnchorId }) => ({ src, modelAnchorId })),
    [
      { src: front.src, modelAnchorId: "lulu-v4" },
      { src: profile.src, modelAnchorId: "lulu-v4" },
    ],
  );
});
