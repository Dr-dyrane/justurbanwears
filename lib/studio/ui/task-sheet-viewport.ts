import { bindStudioVisualViewport } from "./visual-viewport";

/** Resize the mobile sheet, then reveal focus in its own scroll owner. */
export function bindStudioTaskSheetViewport(dialog: HTMLDialogElement, viewport: VisualViewport | null) {
  const view = dialog.ownerDocument.defaultView;
  if (!view || !viewport) return () => {};
  const unbindViewport = bindStudioVisualViewport(dialog, viewport);
  let frame: number | undefined;

  const revealFocus = () => {
    frame = undefined;
    if (!dialog.open || view.innerWidth > 760 || Math.abs(viewport.scale - 1) > 0.01) return;
    const active = dialog.ownerDocument.activeElement;
    if (!active?.matches("input, select, textarea, [contenteditable='true']")
      || active.closest("dialog") !== dialog) return;

    // Adaptive intake can have an inner scroll area. Never pan the document
    // or a parent sheet to reveal a control owned by a nested dialog.
    for (let owner = active.parentElement; owner && owner !== dialog; owner = owner.parentElement) {
      if (!/^(auto|scroll)$/.test(view.getComputedStyle(owner).overflowY)
        || owner.scrollHeight <= owner.clientHeight) continue;
      const bounds = owner.getBoundingClientRect();
      const field = active.getBoundingClientRect();
      const top = Math.max(bounds.top, viewport.offsetTop) + 12;
      const bottom = Math.min(bounds.bottom, viewport.offsetTop + viewport.height) - 12;
      if (bottom <= top) return;
      const delta = field.top < top
        ? field.top - top
        : field.bottom > bottom
          ? Math.min(field.top - top, field.bottom - bottom)
          : 0;
      if (Math.abs(delta) > 1) owner.scrollTop += delta;
      return;
    }
  };
  const schedule = () => {
    if (frame !== undefined) view.cancelAnimationFrame(frame);
    frame = view.requestAnimationFrame(revealFocus);
  };
  dialog.addEventListener("focusin", schedule);
  viewport.addEventListener("resize", schedule, { passive: true });
  viewport.addEventListener("scroll", schedule, { passive: true });
  schedule();
  return () => {
    if (frame !== undefined) view.cancelAnimationFrame(frame);
    dialog.removeEventListener("focusin", schedule);
    viewport.removeEventListener("resize", schedule);
    viewport.removeEventListener("scroll", schedule);
    unbindViewport();
  };
}
