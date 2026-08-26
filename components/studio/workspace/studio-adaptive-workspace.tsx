"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type StudioWorkspaceDetent = "peek" | "half" | "full";

interface StudioAdaptiveWorkspaceProps {
  children: ReactNode;
  className?: string;
  initialDetent?: StudioWorkspaceDetent;
  stage: ReactNode;
  surfaceLabel: string;
}

export function StudioAdaptiveWorkspace({
  children,
  className = "",
  initialDetent = "half",
  stage,
  surfaceLabel,
}: StudioAdaptiveWorkspaceProps) {
  const [detent, setDetent] = useState<StudioWorkspaceDetent>(initialDetent);
  const [sideSurface, setSideSurface] = useState(false);
  const gripButtonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const surfaceRef = useRef<HTMLElement>(null);
  const surfaceContentRef = useRef<HTMLDivElement>(null);
  const surfaceContentId = useId();
  const expanded = detent === "full";

  useLayoutEffect(() => {
    const root = rootRef.current;
    const surface = surfaceRef.current;
    if (!root || !surface || typeof ResizeObserver === "undefined") return;

    let lastSurfaceHeight = -1;
    let usesSideSurface = false;
    const publishSurfaceBounds = (entries: ResizeObserverEntry[] = []) => {
      const surfaceEntry = entries.find((entry) => entry.target === surface);
      const borderBox = surfaceEntry?.borderBoxSize?.[0];
      const surfaceHeight = Math.round(
        borderBox?.blockSize
        ?? surfaceEntry?.contentRect.height
        ?? surface.getBoundingClientRect().height,
      );
      if (surfaceHeight !== lastSurfaceHeight) {
        lastSurfaceHeight = surfaceHeight;
        root.style.setProperty("--studio-workspace-surface-height", `${surfaceHeight}px`);
      }

      const nextUsesSideSurface = root.clientWidth >= 960 && window.innerHeight >= 600;
      if (nextUsesSideSurface !== usesSideSurface) {
        if (nextUsesSideSurface && document.activeElement === gripButtonRef.current) {
          const content = surfaceContentRef.current;
          (content?.querySelector<HTMLElement>("[data-studio-workspace-primary='true']") ?? content)?.focus({ preventScroll: true });
        }
        usesSideSurface = nextUsesSideSurface;
        setSideSurface(nextUsesSideSurface);
      }
    };
    const observer = new ResizeObserver(publishSurfaceBounds);
    observer.observe(surface);
    observer.observe(root);
    publishSurfaceBounds();
    return () => observer.disconnect();
  }, []);

  return (
    <section
      className={["studio-adaptive-workspace", className].filter(Boolean).join(" ")}
      data-detent={detent}
      data-side-surface={sideSurface ? "true" : "false"}
      data-studio-adaptive-workspace="true"
      ref={rootRef}
    >
      <div className="studio-adaptive-workspace-frame">
        <div className="studio-adaptive-workspace-stage" data-studio-workspace-region="stage">
          {stage}
        </div>
        <aside
          aria-label={surfaceLabel}
          className="studio-adaptive-workspace-surface"
          data-studio-workspace-region="surface"
          ref={surfaceRef}
        >
          <div className="studio-adaptive-workspace-grip">
            <button
              aria-controls={surfaceContentId}
              aria-expanded={expanded}
              aria-label={expanded ? `Show less of ${surfaceLabel}` : `Show all of ${surfaceLabel}`}
              hidden={sideSurface}
              onClick={() => setDetent((current) => current === "full" ? "half" : "full")}
              ref={gripButtonRef}
              type="button"
            >
              <span aria-hidden="true" />
              <small>{expanded ? "Show less" : "Show more"}</small>
            </button>
          </div>
          <div
            className="studio-adaptive-workspace-scroll"
            id={surfaceContentId}
            ref={surfaceContentRef}
            tabIndex={-1}
          >
            {children}
          </div>
        </aside>
      </div>
    </section>
  );
}
