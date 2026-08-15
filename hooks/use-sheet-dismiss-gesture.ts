"use client";

import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

interface SheetDismissGestureOptions {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onDismiss(): void;
}

interface GestureState {
  active: boolean;
  delta: number;
  pointerId: number;
  startedAt: number;
  startY: number;
}

const initialGesture: GestureState = {
  active: false,
  delta: 0,
  pointerId: -1,
  startedAt: 0,
  startY: 0,
};

export function useSheetDismissGesture({
  dialogRef,
  onDismiss,
}: SheetDismissGestureOptions) {
  const dismissRef = useRef(onDismiss);
  const gestureRef = useRef<GestureState>({ ...initialGesture });
  const settleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => () => {
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
    }
  }, []);

  function clearVisualState(dialog: HTMLDialogElement) {
    delete dialog.dataset.sheetDragging;
    delete dialog.dataset.sheetSettling;
    dialog.style.removeProperty("--juw-sheet-drag-y");
  }

  function settleSheet(dialog: HTMLDialogElement, target: number, dismiss: boolean) {
    delete dialog.dataset.sheetDragging;
    dialog.dataset.sheetSettling = "true";
    dialog.style.setProperty("--juw-sheet-drag-y", `${target}px`);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = reduceMotion ? 0 : dismiss ? 130 : 220;
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      if (dismiss) {
        dismissRef.current();
        settleTimerRef.current = window.setTimeout(() => {
          clearVisualState(dialog);
          settleTimerRef.current = null;
        }, 260);
        return;
      }
      clearVisualState(dialog);
      settleTimerRef.current = null;
    }, delay);
  }

  function finishGesture(
    event: ReactPointerEvent<HTMLDivElement>,
    cancelled: boolean,
  ) {
    const gesture = gestureRef.current;
    const dialog = dialogRef.current;
    if (!gesture.active || !dialog || event.pointerId !== gesture.pointerId) return;

    gesture.active = false;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Capture may already be released by the browser.
    }

    const elapsed = Math.max(1, performance.now() - gesture.startedAt);
    const velocity = gesture.delta / elapsed;
    const threshold = Math.min(120, dialog.getBoundingClientRect().height * 0.2);
    const shouldDismiss = !cancelled
      && (gesture.delta >= threshold || velocity >= 0.65);

    if (shouldDismiss) {
      settleSheet(dialog, Math.max(gesture.delta, dialog.getBoundingClientRect().height), true);
    } else {
      settleSheet(dialog, 0, false);
    }
    gestureRef.current = { ...initialGesture };
  }

  return {
    "data-sheet-gesture": "dismiss" as const,
    onPointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
      finishGesture(event, true);
    },
    onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
      if (event.pointerType === "mouse") return;
      if (!window.matchMedia("(max-width: 680px) and (pointer: coarse)").matches) return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
      clearVisualState(dialog);
      gestureRef.current = {
        active: true,
        delta: 0,
        pointerId: event.pointerId,
        startedAt: performance.now(),
        startY: event.clientY,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      dialog.dataset.sheetDragging = "true";
      dialog.style.setProperty("--juw-sheet-drag-y", "0px");
      event.preventDefault();
    },
    onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
      const gesture = gestureRef.current;
      const dialog = dialogRef.current;
      if (!gesture.active || !dialog || event.pointerId !== gesture.pointerId) return;
      gesture.delta = Math.max(0, event.clientY - gesture.startY);
      dialog.style.setProperty("--juw-sheet-drag-y", `${gesture.delta}px`);
      event.preventDefault();
    },
    onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
      finishGesture(event, false);
    },
  };
}
