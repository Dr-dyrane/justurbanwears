export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

declare global {
  interface Window {
    __justurbanPwaInstallPrompt?: BeforeInstallPromptEvent | null;
    __justurbanPwaInstalled?: boolean;
  }
}

export const PWA_INSTALL_STATE_EVENT = "justurban:pwa-install-state";

function announceInstallStateChange() {
  window.dispatchEvent(new Event(PWA_INSTALL_STATE_EVENT));
}

export function captureInstallPrompt(event: Event) {
  const installPrompt = event as BeforeInstallPromptEvent;

  installPrompt.preventDefault();
  window.__justurbanPwaInstallPrompt = installPrompt;
  announceInstallStateChange();
}

export function getInstallPrompt() {
  return window.__justurbanPwaInstallPrompt ?? null;
}

export function clearInstallPrompt() {
  window.__justurbanPwaInstallPrompt = null;
  announceInstallStateChange();
}

export function markAppInstalled() {
  window.__justurbanPwaInstalled = true;
  window.__justurbanPwaInstallPrompt = null;
  announceInstallStateChange();
}

export function isAppInstalled() {
  const iosNavigator = window.navigator as Navigator & { standalone?: boolean };

  return (
    window.__justurbanPwaInstalled === true ||
    window.matchMedia("(display-mode: standalone)").matches ||
    iosNavigator.standalone === true
  );
}
