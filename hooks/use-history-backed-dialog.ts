"use client";

import { useCallback, useEffect, useRef } from "react";

interface HistoryBackedDialogOptions {
  isOpen: boolean;
  marker: string;
  onDismiss(): void;
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
  const openedHereRef = useRef(false);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    function closeFromHistory() {
      if (!isOpenRef.current) return;
      openedHereRef.current = false;
      dismissRef.current();
    }

    window.addEventListener("popstate", closeFromHistory);
    return () => window.removeEventListener("popstate", closeFromHistory);
  }, []);

  const openWithHistory = useCallback(() => {
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
