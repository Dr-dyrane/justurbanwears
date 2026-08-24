"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  adaptiveMobileChromeMode,
  deriveMobileChromeVisibility,
  MOBILE_CHROME_TOP_THRESHOLD,
  type MobileChromeVisibility,
} from "../lib/ui/mobile-chrome-state";

const NAVIGATION_RESET_HOLD_MS = 350;
const SOFT_KEYBOARD_OCCLUSION_PX = 140;
const MOBILE_CHROME_MEDIA_QUERY = "(max-width: 680px)";

function subscribeToMobileViewport(onStoreChange: () => void) {
  const query = window.matchMedia(MOBILE_CHROME_MEDIA_QUERY);
  query.addEventListener("change", onStoreChange);
  return () => query.removeEventListener("change", onStoreChange);
}

function getMobileViewportSnapshot() {
  return window.matchMedia(MOBILE_CHROME_MEDIA_QUERY).matches;
}

function getServerMobileViewportSnapshot() {
  return false;
}

export function useMobileChrome(routeKey: string) {
  const keepsHeaderVisible = routeKey === "/studio" || routeKey.startsWith("/studio/");
  const mobileViewport = useSyncExternalStore(
    subscribeToMobileViewport,
    getMobileViewportSnapshot,
    getServerMobileViewportSnapshot,
  );
  const navigationRef = useRef<HTMLElement>(null);
  const previousScrollTop = useRef(0);
  const resetHoldUntil = useRef(0);
  const suspendedRef = useRef(false);
  const initialVisibility: MobileChromeVisibility = {
    hidden: false,
    scrolled: false,
  };
  const visibilityRef = useRef(initialVisibility);
  const [visibility, setVisibility] = useState<MobileChromeVisibility>(initialVisibility);
  const [navigationRevealed, setNavigationRevealed] = useState(false);
  const [suspended, setSuspended] = useState(false);

  const resetChrome = useCallback((hold = true) => {
    previousScrollTop.current = Math.max(0, window.scrollY);
    resetHoldUntil.current = hold ? performance.now() + NAVIGATION_RESET_HOLD_MS : 0;
    setNavigationRevealed(false);
    const nextVisibility = {
      hidden: false,
      scrolled: window.scrollY >= MOBILE_CHROME_TOP_THRESHOLD,
    };
    visibilityRef.current = nextVisibility;
    setVisibility(nextVisibility);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => resetChrome());
    return () => window.cancelAnimationFrame(frame);
  }, [mobileViewport, resetChrome, routeKey]);

  useEffect(() => {
    let frame = 0;

    function syncScroll() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const scrollTop = Math.max(0, window.scrollY);
        if (!mobileViewport || suspended || performance.now() < resetHoldUntil.current) {
          previousScrollTop.current = scrollTop;
          return;
        }
        const nextVisibility = deriveMobileChromeVisibility(visibilityRef.current, {
          previousScrollTop: previousScrollTop.current,
          scrollHeight: document.documentElement.scrollHeight,
          scrollTop,
          viewportHeight: window.innerHeight,
        });
        if (nextVisibility !== visibilityRef.current) {
          visibilityRef.current = nextVisibility;
          setVisibility(nextVisibility);
        }
        if (!nextVisibility.hidden) setNavigationRevealed(false);
        previousScrollTop.current = scrollTop;
      });
    }

    function resetForNavigation() {
      resetChrome();
    }

    window.addEventListener("hashchange", resetForNavigation);
    window.addEventListener("popstate", resetForNavigation);
    window.addEventListener("scroll", syncScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", resetForNavigation);
      window.removeEventListener("popstate", resetForNavigation);
      window.removeEventListener("scroll", syncScroll);
    };
  }, [mobileViewport, resetChrome, suspended]);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    let initialFrame = 0;

    function syncSuspension() {
      const dialogOpen = Boolean(document.querySelector("dialog[open]"));
      const keyboardOccluded = Boolean(
        visualViewport
        && window.innerHeight - visualViewport.height > SOFT_KEYBOARD_OCCLUSION_PX,
      );
      const nextSuspended = dialogOpen || keyboardOccluded;
      if (suspendedRef.current && !nextSuspended) resetChrome();
      suspendedRef.current = nextSuspended;
      setSuspended(nextSuspended);
    }

    const observer = new MutationObserver(syncSuspension);
    observer.observe(document.body, {
      attributeFilter: ["open"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    visualViewport?.addEventListener("resize", syncSuspension);
    initialFrame = window.requestAnimationFrame(syncSuspension);
    return () => {
      window.cancelAnimationFrame(initialFrame);
      observer.disconnect();
      visualViewport?.removeEventListener("resize", syncSuspension);
    };
  }, [resetChrome]);

  const mobileChromeSuspended = mobileViewport && suspended;
  const mobileChromeHidden = !keepsHeaderVisible && mobileViewport && visibility.hidden;
  const mode = useMemo(() => adaptiveMobileChromeMode({
    hidden: mobileChromeHidden,
    navigationRevealed,
    suspended: mobileChromeSuspended,
  }), [mobileChromeHidden, mobileChromeSuspended, navigationRevealed]);

  useEffect(() => {
    if (mode !== "navigation") return;
    const frame = window.requestAnimationFrame(() => {
      const navigation = navigationRef.current;
      const destination = navigation?.querySelector<HTMLAnchorElement>('a[aria-current="page"]')
        ?? navigation?.querySelector<HTMLAnchorElement>("a");
      destination?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mode]);

  return {
    chromeHidden: mobileChromeHidden,
    chromeScrolled: visibility.scrolled,
    closeNavigation: () => setNavigationRevealed(false),
    mode,
    navigationRef,
    revealNavigation: () => setNavigationRevealed(true),
    suspended: mobileChromeSuspended,
  };
}
