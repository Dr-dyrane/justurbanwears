"use client";

import { useEffect } from "react";

let activeLocks = 0;
let previousBodyOverflow = "";
let previousDocumentOverflow = "";

function acquireScrollLock() {
  if (activeLocks === 0) {
    previousBodyOverflow = document.body.style.overflow;
    previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
  }
  activeLocks += 1;
}

function releaseScrollLock() {
  activeLocks = Math.max(0, activeLocks - 1);
  if (activeLocks !== 0) return;
  document.body.style.overflow = previousBodyOverflow;
  document.documentElement.style.overflow = previousDocumentOverflow;
}

export function useDocumentScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    acquireScrollLock();
    return releaseScrollLock;
  }, [active]);
}
