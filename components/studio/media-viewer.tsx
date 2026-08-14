"use client";

/* Studio media may come from authenticated same-origin routes. */
/* eslint-disable @next/next/no-img-element */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";

export type StudioMediaItem = {
  alt: string;
  label: string;
  src: string;
};

type ViewerState = { items: readonly StudioMediaItem[]; index: number; origin: HTMLElement | null };
type ViewerContext = { open(items: readonly StudioMediaItem[], index: number, origin: HTMLElement): void };

const MediaViewerContext = createContext<ViewerContext | null>(null);
const subscribeToClientReady = () => () => {};
const getClientReady = () => true;
const getServerReady = () => false;

export function StudioMediaViewerProvider({ children }: { children: React.ReactNode }) {
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const historyTokenRef = useRef<string | null>(null);
  const titleId = useId();
  const mounted = useSyncExternalStore(subscribeToClientReady, getClientReady, getServerReady);

  const finishClose = useCallback(() => {
    setViewer((current) => {
      const origin = current?.origin;
      requestAnimationFrame(() => origin?.focus({ preventScroll: true }));
      return null;
    });
    historyTokenRef.current = null;
  }, []);

  const close = useCallback(() => {
    const token = historyTokenRef.current;
    if (token && window.history.state?.studioMediaViewer === token) {
      window.history.back();
      return;
    }
    finishClose();
  }, [finishClose]);

  const open = useCallback((items: readonly StudioMediaItem[], index: number, origin: HTMLElement) => {
    if (!items.length) return;
    const token = crypto.randomUUID();
    historyTokenRef.current = token;
    window.history.pushState({ ...window.history.state, studioMediaViewer: token }, "");
    setViewer({ items, index: Math.max(0, Math.min(index, items.length - 1)), origin });
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!viewer) {
      if (dialog.open) dialog.close();
      return;
    }
    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
  }, [viewer]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !viewer) return;
    const onBackdrop = (event: MouseEvent) => {
      if (event.target === dialog) close();
    };
    dialog.addEventListener("click", onBackdrop);
    return () => dialog.removeEventListener("click", onBackdrop);
  }, [close, viewer]);

  useEffect(() => {
    const onPopState = () => {
      if (viewer) finishClose();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [finishClose, viewer]);

  useEffect(() => {
    if (!viewer) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    window.addEventListener("keydown", onEscape, true);
    return () => window.removeEventListener("keydown", onEscape, true);
  }, [close, viewer]);

  const move = useCallback((offset: number) => {
    setViewer((current) => current ? {
      ...current,
      index: (current.index + offset + current.items.length) % current.items.length,
    } : null);
  }, []);

  const item = viewer?.items[viewer.index];

  return (
    <MediaViewerContext.Provider value={{ open }}>
      {children}
      {mounted ? createPortal(
        <dialog
          aria-labelledby={titleId}
          className="studio-media-viewer"
          onCancel={(event) => { event.preventDefault(); close(); }}
          ref={dialogRef}
        >
          {item ? (
            <div className="studio-media-viewer-frame">
              <header>
                <div><small>Preview</small><strong id={titleId}>{item.label}</strong></div>
                <button aria-label="Close preview" onClick={close} ref={closeRef} type="button"><X aria-hidden="true" size={20} /></button>
              </header>
              <div className="studio-media-viewer-stage">
                {viewer && viewer.items.length > 1 ? <button aria-label="Previous image" onClick={() => move(-1)} type="button"><ChevronLeft aria-hidden="true" size={24} /></button> : null}
                <img alt={item.alt} src={item.src} />
                {viewer && viewer.items.length > 1 ? <button aria-label="Next image" onClick={() => move(1)} type="button"><ChevronRight aria-hidden="true" size={24} /></button> : null}
              </div>
              {viewer && viewer.items.length > 1 ? <p>{viewer.index + 1} of {viewer.items.length}</p> : null}
            </div>
          ) : null}
        </dialog>,
        document.body,
      ) : null}
    </MediaViewerContext.Provider>
  );
}

export function StudioMediaButton({
  children,
  className = "",
  index = 0,
  items,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  index?: number;
  items: readonly StudioMediaItem[];
  label: string;
}) {
  const viewer = useContext(MediaViewerContext);
  if (!viewer) throw new Error("StudioMediaButton must be used within StudioMediaViewerProvider");
  return (
    <button
      aria-label={label}
      className={`studio-media-button ${className}`.trim()}
      onClick={(event) => viewer.open(items, index, event.currentTarget)}
      type="button"
    >
      {children}
      <span aria-hidden="true" className="studio-media-expand"><Expand size={15} /></span>
    </button>
  );
}
