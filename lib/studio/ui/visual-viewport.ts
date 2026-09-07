/** Keep an app surface inside Safari's visible area without a React rerender. */
export function bindStudioVisualViewport(element: HTMLElement, viewport: VisualViewport | null) {
  if (!viewport) return () => {};
  const properties = ["--studio-visual-height", "--studio-visual-top"] as const;
  const previous = properties.map((name) => ({
    name,
    value: element.style.getPropertyValue(name),
    priority: element.style.getPropertyPriority(name),
  }));
  const sync = () => {
    // Pinch zoom must magnify/pan the existing layout, not reflow it.
    if (Math.abs(viewport.scale - 1) > 0.01 || viewport.height <= 0) return;
    element.style.setProperty(properties[0], `${viewport.height}px`);
    element.style.setProperty(properties[1], `${Math.max(0, viewport.offsetTop)}px`);
  };
  sync();
  viewport.addEventListener("resize", sync, { passive: true });
  viewport.addEventListener("scroll", sync, { passive: true });
  return () => {
    viewport.removeEventListener("resize", sync);
    viewport.removeEventListener("scroll", sync);
    for (const { name, value, priority } of previous) {
      if (value) element.style.setProperty(name, value, priority);
      else element.style.removeProperty(name);
    }
  };
}
