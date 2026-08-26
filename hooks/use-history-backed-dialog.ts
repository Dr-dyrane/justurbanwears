"use client";

import { useCallback, useEffect, useRef } from "react";

interface HistoryBackedDialogOptions {
  isOpen: boolean;
  marker: string;
  onDismiss(): boolean | void;
}

function currentHistoryState() {
  return window.history.state && typeof window.history.state === "object"
    ? window.history.state as Record<string, unknown>
    : {};
}

export function studioDialogStack(state: unknown): string[] {
  if (!state || typeof state !== "object") return [];
  const record = state as Record<string, unknown>;
  if (
    Array.isArray(record.justUrbanDialogStack)
    && record.justUrbanDialogStack.every((value) => typeof value === "string")
  ) {
    return [...record.justUrbanDialogStack];
  }
  return typeof record.justUrbanDialog === "string"
    ? [record.justUrbanDialog]
    : [];
}

function currentDialogStack() {
  return studioDialogStack(window.history.state);
}

export function useHistoryBackedDialog({
  isOpen,
  marker,
  onDismiss,
}: HistoryBackedDialogOptions) {
  const dismissRef = useRef(onDismiss);
  const isOpenRef = useRef(isOpen);
  const markerRef = useRef(marker);
  const openedHereRef = useRef(false);
  const traversalPendingRef = useRef(false);
  const afterCloseRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    markerRef.current = marker;
  }, [marker]);

  useEffect(() => {
    function closeFromHistory(event: PopStateEvent) {
      traversalPendingRef.current = false;
      const nextStack = studioDialogStack(event.state);
      if (nextStack.includes(markerRef.current)) {
        if (isOpenRef.current) {
          openedHereRef.current = true;
          return;
        }
        openedHereRef.current = false;
        afterCloseRef.current = null;
        if (nextStack.at(-1) === markerRef.current) {
          traversalPendingRef.current = true;
          window.history.back();
        }
        return;
      }
      if (!isOpenRef.current || !openedHereRef.current) return;
      const accepted = dismissRef.current();
      if (accepted === false) {
        afterCloseRef.current = null;
        traversalPendingRef.current = true;
        window.history.forward();
        return;
      }
      openedHereRef.current = false;
      const afterClose = afterCloseRef.current;
      afterCloseRef.current = null;
      afterClose?.();
    }

    window.addEventListener("popstate", closeFromHistory);
    return () => window.removeEventListener("popstate", closeFromHistory);
  }, []);

  useEffect(() => {
    if (isOpen) return;
    if (
      !openedHereRef.current
      || traversalPendingRef.current
    ) return;
    const stack = currentDialogStack();
    if (stack.at(-1) !== marker) return;
    openedHereRef.current = false;
    traversalPendingRef.current = true;
    window.history.back();
  }, [isOpen, marker]);

  const openWithHistory = useCallback(() => {
    const stack = currentDialogStack();
    if (stack.includes(marker)) {
      openedHereRef.current = true;
      return;
    }
    const nextStack = [...stack, marker];
    window.history.pushState(
      {
        ...currentHistoryState(),
        justUrbanDialog: marker,
        justUrbanDialogStack: nextStack,
      },
      "",
      window.location.href,
    );
    openedHereRef.current = true;
  }, [marker]);

  const beginClose = useCallback((afterClose?: () => void) => {
    if (traversalPendingRef.current) return;
    afterCloseRef.current = afterClose ?? null;
    const stack = currentDialogStack();
    if (
      openedHereRef.current
      && stack.includes(marker)
    ) {
      if (stack.at(-1) !== marker) {
        afterCloseRef.current = null;
        return;
      }
      traversalPendingRef.current = true;
      window.history.back();
      return;
    }
    const accepted = dismissRef.current();
    if (accepted === false) {
      afterCloseRef.current = null;
      return;
    }
    openedHereRef.current = false;
    afterCloseRef.current = null;
    afterClose?.();
  }, [marker]);

  const requestClose = useCallback(() => beginClose(), [beginClose]);
  const requestCloseAndThen = useCallback((afterClose: () => void) => {
    beginClose(afterClose);
  }, [beginClose]);

  return { openWithHistory, requestClose, requestCloseAndThen };
}
