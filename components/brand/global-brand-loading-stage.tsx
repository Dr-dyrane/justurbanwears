"use client";

import { useEffect, useState } from "react";
import { WardrobeMotion } from "./wardrobe-motion";
import styles from "./global-brand-loading-stage.module.css";

export const GLOBAL_BRAND_LOADING_DELAY_MS = 420;

type GlobalBrandLoadingStageProps = {
  delayMs?: number;
};

export function GlobalBrandLoadingStage({
  delayMs = GLOBAL_BRAND_LOADING_DELAY_MS,
}: GlobalBrandLoadingStageProps) {
  const [revealed, setRevealed] = useState(delayMs <= 0);

  useEffect(() => {
    if (delayMs <= 0) return;
    const timer = window.setTimeout(() => setRevealed(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  if (!revealed) return null;

  return (
    <div aria-live="polite" className={styles.stage} role="status">
      <div className={styles.content}>
        <WardrobeMotion loop polarity="dark" size="md" variant="loader" />
        <p>Opening the next view</p>
      </div>
    </div>
  );
}
