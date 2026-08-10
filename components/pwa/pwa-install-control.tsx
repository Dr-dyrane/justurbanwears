"use client";

import { useEffect, useId, useState } from "react";
import {
  clearInstallPrompt,
  getInstallPrompt,
  isAppInstalled,
  PWA_INSTALL_STATE_EVENT,
} from "./install-prompt";

type InstallState =
  | "checking"
  | "promptable"
  | "prompting"
  | "accepted"
  | "installed"
  | "manual";

const MANUAL_INSTALL_GUIDANCE =
  "Browser menu → Install app. On iPhone or iPad: Safari → Share → Add to Home Screen.";

export function PwaInstallControl() {
  const headingId = useId();
  const [state, setState] = useState<InstallState>("checking");
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const syncInstallState = () => {
      if (isAppInstalled()) {
        setState("installed");
        return;
      }

      setState(getInstallPrompt() ? "promptable" : "manual");
    };
    const handleDisplayModeChange = () => {
      syncInstallState();
    };
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const frame = window.requestAnimationFrame(syncInstallState);

    window.addEventListener(PWA_INSTALL_STATE_EVENT, syncInstallState);
    displayMode.addEventListener("change", handleDisplayModeChange);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener(PWA_INSTALL_STATE_EVENT, syncInstallState);
      displayMode.removeEventListener("change", handleDisplayModeChange);
    };
  }, []);

  const install = async () => {
    const installPrompt = getInstallPrompt();

    if (!installPrompt) {
      setState("manual");
      setFeedback("Use your browser menu to install.");
      return;
    }

    setState("prompting");
    setFeedback(null);

    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;

      if (choice.outcome === "accepted") {
        clearInstallPrompt();
        setState("accepted");
        setFeedback("Install accepted.");
      } else {
        clearInstallPrompt();
        setState("manual");
        setFeedback("Install dismissed.");
      }
    } catch {
      clearInstallPrompt();
      setState("manual");
      setFeedback("Use your browser menu to install.");
    }
  };

  const isInstalled = state === "installed";
  const canPrompt = state === "promptable" || state === "prompting";

  return (
    <div
      className={`pwa-install-control is-${state}`}
      aria-labelledby={headingId}
    >
      <div className="pwa-install-control__copy">
        <p className="pwa-install-control__eyebrow">App access</p>
        <h3 id={headingId} className="pwa-install-control__title">
          {state === "checking"
            ? "Checking availability"
            : isInstalled
              ? "Installed"
              : state === "accepted"
                ? "Installing"
              : canPrompt
                ? "Install the app"
                : "Install from your browser"}
        </h3>
        <p className="pwa-install-control__description">
          {isInstalled
            ? "Open it from your home screen."
            : state === "accepted"
              ? "Your browser is finishing setup."
            : canPrompt
              ? "Launch justurban wears full-screen."
              : state === "checking"
                ? ""
                : MANUAL_INSTALL_GUIDANCE}
        </p>
      </div>

      {canPrompt ? (
        <button
          className="pwa-install-control__action"
          type="button"
          onClick={install}
          disabled={state === "prompting"}
        >
          {state === "prompting" ? "Opening install prompt…" : "Install app"}
        </button>
      ) : null}

      <p
        className="pwa-install-control__status"
        role="status"
        aria-live="polite"
      >
        {feedback ?? ""}
      </p>
    </div>
  );
}
