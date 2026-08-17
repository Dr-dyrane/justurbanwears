"use client";

import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { studioScenarioHref } from "../../../lib/studio/simulator";
import { useStudio } from "../studio-provider";

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

  function follow(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (
      event.defaultPrevented
      || persistence !== "unavailable"
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

    if (!window.confirm("This work is not saved. Leave this page?")) {
      event.preventDefault();
    }
  }

  return <a href={href} onClick={follow} {...anchorProps}>{children}</a>;
}
