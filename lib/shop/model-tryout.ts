import type {
  ShopApprovedModelMedia,
  ShopModelAnchorId,
  ShopModelTryout,
  ShopProduct,
  ShopProductMedia,
} from "./domain/entities";

export type ModelTryoutPhase = "closed" | "loading" | "ready" | "error";

export interface ApprovedModelTryout {
  modelAnchorId: ShopModelAnchorId;
  frame: ShopApprovedModelMedia;
}

export interface ModelTryoutState {
  phase: ModelTryoutPhase;
  attempt: number;
}

export type ModelTryoutAction =
  | { type: "OPEN" }
  | { type: "CLOSE" }
  | { type: "RETRY" }
  | { type: "FRAME_LOADED"; attempt: number }
  | { type: "FRAME_FAILED"; attempt: number };

export const initialModelTryoutState: ModelTryoutState = {
  phase: "closed",
  attempt: 0,
};

const supportedModelAnchorIds = new Set<ShopModelAnchorId>(["lulu-v2", "lulu-v3", "lulu-v4"]);

function freshLoadingState(attempt: number): ModelTryoutState {
  return {
    phase: "loading",
    attempt,
  };
}

export function modelTryoutReducer(
  state: ModelTryoutState,
  action: ModelTryoutAction,
): ModelTryoutState {
  switch (action.type) {
    case "OPEN":
      return state.phase === "closed"
        ? freshLoadingState(state.attempt + 1)
        : state;
    case "CLOSE":
      return {
        ...initialModelTryoutState,
        attempt: state.attempt,
      };
    case "RETRY":
      return freshLoadingState(state.attempt + 1);
    case "FRAME_LOADED":
      if (state.phase === "closed" || action.attempt !== state.attempt) return state;
      return { ...state, phase: "ready" };
    case "FRAME_FAILED":
      if (state.phase === "closed" || action.attempt !== state.attempt) return state;
      return { ...state, phase: "error" };
    default:
      return state;
  }
}

/**
 * APPROVED is necessary but not sufficient: the public front frame must stay
 * tied to the same approved model anchor.
 */
export function resolveApprovedModelTryout(
  modelTryout: ShopModelTryout,
): ApprovedModelTryout | null {
  if (modelTryout.modelStatus !== "APPROVED") return null;

  const { frame } = modelTryout;
  if (
    frame.view !== "front"
    || frame.presentation !== "model"
    || frame.modelAnchorId !== modelTryout.modelAnchorId
  ) {
    return null;
  }

  return {
    modelAnchorId: modelTryout.modelAnchorId,
    frame,
  };
}

/**
 * The main product gallery shows product-only frames first, then an approved
 * front when one exists, followed by independently approved supplemental
 * views. Supplemental views never promote a pending front tryout.
 */
export function selectProductGalleryMedia(
  product: Pick<ShopProduct, "media" | "modelTryout">,
): readonly ShopProductMedia[] {
  const productMedia = product.media ?? [];
  const approved = resolveApprovedModelTryout(product.modelTryout);
  const productOnly = productMedia.filter((item) => item.presentation !== "model");
  const additionalViews = productMedia.filter((item) =>
    item.presentation === "model"
    && item.view !== "front"
    && item.modelAnchorId !== undefined
    && supportedModelAnchorIds.has(item.modelAnchorId),
  );

  return approved
    ? [...productOnly, approved.frame, ...additionalViews]
    : [...productOnly, ...additionalViews];
}
