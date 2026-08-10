"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const THEME_STORAGE_KEY = "justurban-wears.theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";
const THEME_EVENT = "justurban-wears:theme-change";
let volatilePreference: ThemePreference = "system";

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference(preference: ThemePreference): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : volatilePreference;
  } catch {
    return volatilePreference;
  }
}

function subscribePreference(onStoreChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) onStoreChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(THEME_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(THEME_EVENT, onStoreChange);
  };
}

function readSystemDark() {
  return window.matchMedia(DARK_QUERY).matches;
}

function subscribeSystemTheme(onStoreChange: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function applyDocumentTheme(preference: ThemePreference, resolvedTheme: ResolvedTheme) {
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolvedTheme;

  let themeColor = document.querySelector<HTMLMetaElement>("meta[data-managed-theme-color]");
  if (!themeColor) {
    themeColor = document.createElement("meta");
    themeColor.name = "theme-color";
    themeColor.dataset.managedThemeColor = "true";
    document.head.append(themeColor);
  }
  themeColor.content = resolvedTheme === "dark" ? "#050303" : "#dd6042";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const preference = useSyncExternalStore<ThemePreference>(
    subscribePreference,
    readPreference,
    () => "system" as ThemePreference,
  );
  const systemDark = useSyncExternalStore(
    subscribeSystemTheme,
    readSystemDark,
    () => false,
  );
  const resolvedTheme: ResolvedTheme = preference === "system"
    ? (systemDark ? "dark" : "light")
    : preference;

  useEffect(() => {
    applyDocumentTheme(preference, resolvedTheme);
  }, [preference, resolvedTheme]);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    volatilePreference = nextPreference;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
    } catch {
      // The selected theme still applies for the current document.
      document.documentElement.dataset.themePreference = nextPreference;
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({
    preference,
    resolvedTheme,
    setPreference,
  }), [preference, resolvedTheme, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
