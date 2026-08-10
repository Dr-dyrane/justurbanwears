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
 * The main product gallery may show the same cleared model front as the
 * focused tryout sheet. Pending or malformed model media never enters it.
 */
export function selectProductGalleryMedia(
  product: Pick<ShopProduct, "media" | "modelTryout">,
): readonly ShopProductMedia[] {
  const productMedia = product.media ?? [];
  const approved = resolveApprovedModelTryout(product.modelTryout);

  if (!approved || productMedia.some((item) => item.src === approved.frame.src)) {
    return productMedia;
  }

  return [...productMedia, approved.frame];
}
