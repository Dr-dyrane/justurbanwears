"use client";

import { useEffect, useRef, useState } from "react";
import { BRAND_ASSETS } from "../../lib/brand/assets";
import type { WardrobeMotionProps } from "./wardrobe-motion.types";
import styles from "./wardrobe-motion.module.css";

const DEFAULT_LOOP = new Set(["loader", "footer", "ambient"]);

export function WardrobeMotion({
  className,
  label,
  loop,
  motion = "auto",
  polarity = "light",
  size = "md",
  variant = "loader",
}: WardrobeMotionProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(true);
  const shouldLoop = loop ?? DEFAULT_LOOP.has(variant);

  useEffect(() => {
    const element = rootRef.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting ?? true),
      { rootMargin: "80px", threshold: 0.01 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const classes = [styles.root, className].filter(Boolean).join(" ");
  const imageProps = {
    draggable: false,
    height: 1024,
    src: BRAND_ASSETS.icon.motionMaster,
    width: 1024,
  } as const;

  return (
    <span
      aria-live={label ? "polite" : undefined}
      className={classes}
      data-loop={shouldLoop ? "true" : "false"}
      data-motion={motion}
      data-polarity={polarity}
      data-variant={variant}
      data-visible={visible ? "true" : "false"}
      ref={rootRef}
      role={label ? "status" : undefined}
    >
      <span aria-hidden="true" className={styles.stage} data-size={size}>
        {/* Every moving image is the same untouched production master. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img {...imageProps} alt="" className={`${styles.layer} ${styles.base}`} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img {...imageProps} alt="" className={`${styles.layer} ${styles.leftDoor}`} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img {...imageProps} alt="" className={`${styles.layer} ${styles.rightDoor}`} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img {...imageProps} alt="" className={`${styles.layer} ${styles.leftL}`} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img {...imageProps} alt="" className={`${styles.layer} ${styles.rightL}`} />
        <span className={styles.signature} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img {...imageProps} alt="" className={`${styles.layer} ${styles.silhouette}`} />
        {/* The canonical master owns the first and final frame. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img {...imageProps} alt="" className={`${styles.layer} ${styles.master}`} />
      </span>
      {label ? <span className={styles.srOnly}>{label}</span> : null}
    </span>
  );
}
