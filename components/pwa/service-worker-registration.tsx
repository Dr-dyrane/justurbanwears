"use client";

import { useEffect } from "react";
import {
  captureInstallPrompt,
  markAppInstalled,
} from "./install-prompt";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      captureInstallPrompt(event);
    };
    const handleAppInstalled = () => {
      markAppInstalled();
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    let removeLoadListener: (() => void) | undefined;

    if (
      process.env.NODE_ENV === "production" &&
      window.isSecureContext &&
      "serviceWorker" in navigator
    ) {
      let hasSeenController = Boolean(navigator.serviceWorker.controller);
      let reloadStarted = false;
      const handleControllerChange = () => {
        if (!hasSeenController) {
          // A first install may claim the current page without forcing a
          // redundant reload. Later worker takeovers must cross a clean page
          // boundary so old HTML never runs under a new worker indefinitely.
          hasSeenController = true;
          return;
        }

        if (reloadStarted) return;
        reloadStarted = true;
        window.location.reload();
      };
      const registerServiceWorker = () => {
        void navigator.serviceWorker
          .register("/sw.js", {
            scope: "/",
            updateViaCache: "none",
          })
          .catch((error: unknown) => {
            console.error("Unable to register the justurban wears service worker.", error);
          });
      };

      navigator.serviceWorker.addEventListener(
        "controllerchange",
        handleControllerChange,
      );

      if (document.readyState === "complete") {
        registerServiceWorker();
      } else {
        window.addEventListener("load", registerServiceWorker, { once: true });
        removeLoadListener = () => {
          window.removeEventListener("load", registerServiceWorker);
        };
      }

      const previousRemoveLoadListener = removeLoadListener;
      removeLoadListener = () => {
        previousRemoveLoadListener?.();
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          handleControllerChange,
        );
      };
    }

    return () => {
      removeLoadListener?.();
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  return null;
}
