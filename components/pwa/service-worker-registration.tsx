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

      if (document.readyState === "complete") {
        registerServiceWorker();
      } else {
        window.addEventListener("load", registerServiceWorker, { once: true });
        removeLoadListener = () => {
          window.removeEventListener("load", registerServiceWorker);
        };
      }
    }

    return () => {
      removeLoadListener?.();
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  return null;
}
