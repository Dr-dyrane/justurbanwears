"use client";

import { useEffect, useRef, useState } from "react";
import { GlobalBrandLoadingStage } from "./global-brand-loading-stage";

const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

function isSameDocumentDestination(destination: URL) {
  return destination.pathname === window.location.pathname
    && destination.search === window.location.search;
}

function eligibleDestination(value: string) {
  const destination = new URL(value, window.location.href);
  return HTTP_PROTOCOLS.has(destination.protocol)
    && destination.origin === window.location.origin
    && !isSameDocumentDestination(destination);
}

function eligibleAnchor(event: MouseEvent) {
  if (
    event.defaultPrevented
    || event.button !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
    || !(event.target instanceof Element)
  ) return false;

  const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
  if (
    !anchor
    || anchor.hasAttribute("download")
    || anchor.dataset.navigationLoading === "off"
    || (anchor.target && anchor.target.toLowerCase() !== "_self")
  ) return false;

  return eligibleDestination(anchor.href);
}

function eligibleForm(event: SubmitEvent) {
  if (event.defaultPrevented || !(event.target instanceof HTMLFormElement)) return false;

  const form = event.target;
  const submitter = event.submitter instanceof HTMLButtonElement || event.submitter instanceof HTMLInputElement
    ? event.submitter
    : null;
  const target = submitter?.formTarget || form.target;
  const method = (submitter?.formMethod || form.method).toLowerCase();
  const action = submitter?.formAction || form.action || window.location.href;

  if (
    method === "dialog"
    || form.dataset.navigationLoading === "off"
    || (target && target.toLowerCase() !== "_self")
  ) return false;

  const destination = new URL(action, window.location.href);
  return HTTP_PROTOCOLS.has(destination.protocol) && destination.origin === window.location.origin;
}

export function DocumentNavigationLoadingStage() {
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);

  useEffect(() => {
    function begin() {
      if (activeRef.current) return;
      activeRef.current = true;
      setActive(true);
    }

    function reset() {
      activeRef.current = false;
      setActive(false);
    }

    function handleClick(event: MouseEvent) {
      if (eligibleAnchor(event)) begin();
    }

    function handleSubmit(event: SubmitEvent) {
      if (eligibleForm(event)) begin();
    }

    document.addEventListener("click", handleClick);
    document.addEventListener("submit", handleSubmit);
    window.addEventListener("pageshow", reset);

    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("submit", handleSubmit);
      window.removeEventListener("pageshow", reset);
    };
  }, []);

  return active ? <GlobalBrandLoadingStage /> : null;
}
