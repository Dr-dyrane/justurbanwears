"use client";

import { useCallback, useEffect, useState } from "react";

const storageKey = "justurban-wears:studio-preferences:v1";
const changeEvent = "justurban-wears:studio-preferences";

export type StudioPreferences = {
  showUpdateCount: boolean;
};

const defaults: StudioPreferences = { showUpdateCount: true };

function readPreferences(): StudioPreferences {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as Partial<StudioPreferences> | null;
    return { showUpdateCount: value?.showUpdateCount !== false };
  } catch {
    return defaults;
  }
}

export function useStudioPreferences() {
  const [preferences, setPreferences] = useState<StudioPreferences>(defaults);

  useEffect(() => {
    const sync = () => setPreferences(readPreferences());
    const frame = window.requestAnimationFrame(sync);
    window.addEventListener("storage", sync);
    window.addEventListener(changeEvent, sync);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("storage", sync);
      window.removeEventListener(changeEvent, sync);
    };
  }, []);

  const setShowUpdateCount = useCallback((showUpdateCount: boolean) => {
    const next = { ...readPreferences(), showUpdateCount };
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // The preference remains available for this mounted session.
    }
    setPreferences(next);
    window.dispatchEvent(new Event(changeEvent));
  }, []);

  return { ...preferences, setShowUpdateCount };
}
