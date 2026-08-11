"use client";

/* Native images keep approved catalogue frames portable across both hosts. */
/* eslint-disable @next/next/no-img-element */

import {
  Check,
  Heart,
  ImageOff,
  RotateCcw,
  ShoppingBag,
  WifiOff,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import type { ShopAvailability } from "../../lib/shop/domain/entities";
import type {
  HydrationState,
  PersistenceState,
} from "../../lib/shop/domain/state";
import {
  initialModelTryoutState,
  modelTryoutReducer,
  type ApprovedModelTryout,
} from "../../lib/shop/model-tryout";
import { ShopActionButton, ShopActionLink } from "./atoms/action";
import {
  ShopSheet,
  ShopSheetCloseButton,
  ShopSheetHandle,
} from "./atoms/sheet";

interface ProductModelTryoutProps {
  availability: ShopAvailability;
  availabilityConfirmed: boolean;
  hydration: HydrationState;
  isInBag: boolean;
  isOnline: boolean;
  isOpen: boolean;
  isSaved: boolean;
  onAddToBag(): boolean;
  onRequestClose(): void;
  onReturnFocus(): void;
  onToggleSaved(): void;
  persistence: PersistenceState;
  productName: string;
  taggedSize: string;
  tryout: ApprovedModelTryout;
}

export function ProductModelTryout({
  availability,
  availabilityConfirmed,
  hydration,
  isInBag,
  isOnline,
  isOpen,
  isSaved,
  onAddToBag,
  onRequestClose,
  onReturnFocus,
  onToggleSaved,
  persistence,
  productName,
  taggedSize,
  tryout,
}: ProductModelTryoutProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef(onReturnFocus);
  const wasOpenRef = useRef(false);
  const [state, dispatch] = useReducer(modelTryoutReducer, initialModelTryoutState);
  const [actionNotice, setActionNotice] = useState({ attempt: 0, text: "" });

  useEffect(() => {
    returnFocusRef.current = onReturnFocus;
  }, [onReturnFocus]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      wasOpenRef.current = true;
      dispatch({ type: "OPEN" });
      if (!dialog.open) dialog.showModal();
      window.requestAnimationFrame(() => closeButtonRef.current?.focus());
      return;
    }

    if (dialog.open) dialog.close();
    dispatch({ type: "CLOSE" });
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      window.requestAnimationFrame(() => returnFocusRef.current());
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const bodyOverflow = document.body.style.overflow;
    const documentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = documentOverflow;
    };
  }, [isOpen]);

  const hasLoadedFrame = state.phase === "ready";
  const isOfflineWithoutFrame = !isOnline && !hasLoadedFrame;
  const saveIsRestoring = hydration === "idle" || hydration === "restoring";

  function requestCloseFromBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const outside = event.clientX < bounds.left
      || event.clientX > bounds.right
      || event.clientY < bounds.top
      || event.clientY > bounds.bottom;
    if (outside) onRequestClose();
  }

  function toggleSaved() {
    onToggleSaved();
    setActionNotice({
      attempt: state.attempt,
      text: isSaved
        ? "Removed from saved pieces."
        : persistence === "available"
          ? "Saved on this device."
          : "Kept for this visit.",
    });
  }

  function addToBag() {
    const added = onAddToBag();
    setActionNotice({
      attempt: state.attempt,
      text: added
        ? `${productName} is in your bag.`
        : "This piece could not be added. Try again.",
    });
  }

  const loadStatus = isOfflineWithoutFrame
    ? "Reconnect to open the model view."
    : state.phase === "loading"
      ? "Opening the model view."
      : state.phase === "error"
        ? "The model view did not load."
        : state.phase === "ready"
          ? "Model front shown."
          : "";

  return (
    <ShopSheet
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-modal="true"
      className="shop-model-tryout-sheet"
      data-state={isOfflineWithoutFrame ? "offline" : state.phase}
      onCancel={(event) => {
        event.preventDefault();
        onRequestClose();
      }}
      onClick={requestCloseFromBackdrop}
      onClose={() => {
        if (isOpen) onRequestClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        onRequestClose();
      }}
      ref={dialogRef}
    >
      <ShopSheetHandle />
      <header className="shop-model-tryout-header">
        <div>
          <p className="shop-kicker">On model</p>
          <h2 id={titleId}>{productName}</h2>
          <p id={descriptionId}>Front view · {taggedSize}</p>
        </div>
        <ShopSheetCloseButton
          aria-label="Close model view"
          className="shop-model-tryout-close"
          onClick={onRequestClose}
          ref={closeButtonRef}
        >
          <X aria-hidden="true" size={22} strokeWidth={1.7} />
        </ShopSheetCloseButton>
      </header>

      <div className="shop-model-tryout-content">
        <div
          className="shop-model-tryout-stage"
          data-model-anchor={tryout.modelAnchorId}
        >
          {isOfflineWithoutFrame ? (
            <div className="shop-model-tryout-state" role="status">
              <WifiOff aria-hidden="true" size={30} strokeWidth={1.5} />
              <strong>The model view is offline.</strong>
              <p>Reconnect to open the front view.</p>
            </div>
          ) : state.phase === "error" ? (
            <div className="shop-model-tryout-state" role="status">
              <ImageOff aria-hidden="true" size={30} strokeWidth={1.5} />
              <strong>The model view didn’t load.</strong>
              <button onClick={() => dispatch({ type: "RETRY" })} type="button">
                <RotateCcw aria-hidden="true" size={15} strokeWidth={1.8} /> Try again
              </button>
            </div>
          ) : (
            <>
              {(isOnline || hasLoadedFrame) && state.phase !== "closed" ? (
                <figure
                  className="shop-model-tryout-frame"
                  hidden={state.phase !== "ready"}
                  key={`${tryout.frame.id}-${state.attempt}`}
                >
                  <img
                    alt={tryout.frame.alt}
                    height={tryout.frame.height}
                    onError={() => dispatch({
                      type: "FRAME_FAILED",
                      attempt: state.attempt,
                    })}
                    onLoad={() => dispatch({
                      type: "FRAME_LOADED",
                      attempt: state.attempt,
                    })}
                    src={tryout.frame.src}
                    style={{ objectPosition: tryout.frame.objectPosition ?? "50% 50%" }}
                    width={tryout.frame.width}
                  />
                  <figcaption>{tryout.frame.label}</figcaption>
                </figure>
              ) : null}
              {state.phase === "loading" ? (
                <div className="shop-model-tryout-loading" aria-hidden="true">
                  <span />
                  <span />
                </div>
              ) : null}
            </>
          )}
        </div>

        <aside className="shop-model-tryout-panel">
          <p className="shop-model-view-label"><span>View</span><strong>Front</strong></p>

          <p className="shop-model-tryout-status" aria-live="polite" role="status">
            {loadStatus}
          </p>

          <p className="shop-model-tryout-fit-note">
            Check the listed measurements for fit.
          </p>

          <div className="shop-model-tryout-actions">
            <ShopActionButton
              aria-pressed={isSaved}
              disabled={saveIsRestoring}
              onClick={toggleSaved}
              tone="secondary"
            >
              <Heart aria-hidden="true" fill={isSaved ? "currentColor" : "none"} size={17} strokeWidth={1.8} />
              {saveIsRestoring ? "Restoring saves" : isSaved ? "Saved" : "Save piece"}
            </ShopActionButton>

            {availabilityConfirmed && availability === "AVAILABLE" ? (
              isInBag ? (
                <ShopActionLink href="/shop/bag">
                  <Check aria-hidden="true" size={17} strokeWidth={2} /> Review bag
                </ShopActionLink>
              ) : (
                <ShopActionButton disabled={!isOnline} onClick={addToBag}>
                  <ShoppingBag aria-hidden="true" size={17} strokeWidth={1.8} />
                  {isOnline ? "Add to bag" : "Reconnect to add"}
                </ShopActionButton>
              )
            ) : (
              <ShopActionLink href="/shop/search">Find available pieces</ShopActionLink>
            )}
          </div>

          <p className="shop-model-tryout-action-note" aria-live="polite" role="status">
            {actionNotice.attempt === state.attempt ? actionNotice.text : ""}
          </p>
        </aside>
      </div>
    </ShopSheet>
  );
}
