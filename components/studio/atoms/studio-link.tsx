"use client";

import { useState, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { assignDocumentNavigation } from "../../brand/document-navigation-loading-stage";
import { studioScenarioHref } from "../../../lib/studio/simulator";
import { useStudio } from "../studio-provider";
import { StudioDecisionSheet } from "./studio-decision-sheet";

export type StudioLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
};

/**
 * Studio navigation crosses the browser document boundary because the current
 * production adapter can intercept client links without completing the route.
 */
export function StudioLink({ children, href: requestedHref, ...props }: StudioLinkProps) {
  const { persistence, scenario } = useStudio();
  const { onClick, ...anchorProps } = props;
  const href = studioScenarioHref(requestedHref, scenario);
  const [pendingNavigation, setPendingNavigation] = useState<{ href: string; label: string }>();
  const [navigationReturnFocus, setNavigationReturnFocus] = useState<HTMLAnchorElement | null>(null);

  function follow(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) return;

    const destination = new URL(href, window.location.href);
    const samePageHash = destination.origin === window.location.origin
      && destination.pathname === window.location.pathname
      && destination.search === window.location.search
      && Boolean(destination.hash);
    if (samePageHash) return;

    if (persistence === "unavailable") {
      event.preventDefault();
      setNavigationReturnFocus(event.currentTarget);
      setPendingNavigation({
        href: destination.href,
        label: event.currentTarget.textContent?.trim() || "this page",
      });
      return;
    }

    if (destination.origin === window.location.origin) {
      event.currentTarget.dataset.pending = "true";
      event.currentTarget.setAttribute("aria-busy", "true");
    }
  }

  async function confirmNavigation() {
    if (!pendingNavigation) {
      return { error: "The navigation request is no longer current.", ok: false as const };
    }
    const trigger = navigationReturnFocus;
    trigger?.setAttribute("data-pending", "true");
    trigger?.setAttribute("aria-busy", "true");
    try {
      assignDocumentNavigation(pendingNavigation.href);
      return { ok: true as const };
    } catch {
      trigger?.removeAttribute("data-pending");
      trigger?.removeAttribute("aria-busy");
      return { error: "Studio could not open that page. Try again.", ok: false as const };
    }
  }

  function closeNavigationDecision() {
    setPendingNavigation(undefined);
    setNavigationReturnFocus(null);
  }

  return <>
    <a href={href} onClick={follow} {...anchorProps}>{children}</a>
    {pendingNavigation ? (
      <StudioDecisionSheet
        confirmLabel="Leave page"
        consequence="Studio opens the selected destination. Unsaved work on this page is not carried across."
        destructive
        eyebrow="Unsaved work"
        onConfirm={confirmNavigation}
        onDismiss={closeNavigationDecision}
        open
        receiptDetail="Studio is opening the selected page."
        receiptTitle="Leaving page"
        returnFocus={navigationReturnFocus}
        summary={`Open ${pendingNavigation.label}? This work is not saved.`}
        title="Leave this page?"
      />
    ) : null}
  </>;
}
