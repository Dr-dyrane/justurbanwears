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

export function useHistoryBackedDialog({
  isOpen,
  marker,
  onDismiss,
}: HistoryBackedDialogOptions) {
  const dismissRef = useRef(onDismiss);
  const isOpenRef = useRef(isOpen);
  const markerRef = useRef(marker);
  const openedHereRef = useRef(false);

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
    function closeFromHistory() {
      if (!isOpenRef.current) return;
      const accepted = dismissRef.current();
      if (accepted === false) {
        window.history.pushState(
          { ...currentHistoryState(), justUrbanDialog: markerRef.current },
          "",
          window.location.href,
        );
        openedHereRef.current = true;
        return;
      }
      openedHereRef.current = false;
    }

    window.addEventListener("popstate", closeFromHistory);
    return () => window.removeEventListener("popstate", closeFromHistory);
  }, []);

  useEffect(() => {
    if (isOpen) return;
    if (
      !openedHereRef.current
      || window.history.state?.justUrbanDialog !== marker
    ) return;
    openedHereRef.current = false;
    window.history.back();
  }, [isOpen, marker]);

  const openWithHistory = useCallback(() => {
    if (window.history.state?.justUrbanDialog === marker) {
      openedHereRef.current = true;
      return;
    }
    window.history.pushState(
      { ...currentHistoryState(), justUrbanDialog: marker },
      "",
      window.location.href,
    );
    openedHereRef.current = true;
  }, [marker]);

  const requestClose = useCallback(() => {
    if (
      openedHereRef.current
      && window.history.state?.justUrbanDialog === marker
    ) {
      openedHereRef.current = false;
      window.history.back();
      return;
    }
    dismissRef.current();
  }, [marker]);

  return { openWithHistory, requestClose };
}
