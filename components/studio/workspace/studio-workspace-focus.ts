const ENABLED_PRIMARY_SELECTOR = "[data-studio-workspace-primary='true']:not(:disabled)";
const ENABLED_CONTROL_SELECTOR = [
  "button:not(:disabled)",
  "a[href]",
  "input:not(:disabled):not([type='hidden'])",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "[tabindex]:not([tabindex='-1']):not(:disabled)",
].join(", ");

export function moveFocusFromWorkspaceGrip(
  content: HTMLElement | null,
  grip: HTMLElement | null,
  activeElement: () => Element | null = () => document.activeElement,
) {
  if (!content || activeElement() !== grip) return true;

  const target = content.querySelector<HTMLElement>(ENABLED_PRIMARY_SELECTOR)
    ?? content.querySelector<HTMLElement>(ENABLED_CONTROL_SELECTOR)
    ?? content;

  target.focus({ preventScroll: true });
  if (activeElement() === grip && target !== content) {
    content.focus({ preventScroll: true });
  }

  return activeElement() !== grip;
}
