export const MOBILE_CHROME_TOP_THRESHOLD = 12;
export const MOBILE_CHROME_DIRECTION_THRESHOLD = 6;

export interface MobileChromeVisibility {
  hidden: boolean;
  scrolled: boolean;
}

export interface MobileChromeScrollSample {
  previousScrollTop: number;
  scrollHeight: number;
  scrollTop: number;
  viewportHeight: number;
}

export type MobileChromeMode = "expanded" | "compact" | "navigation" | "suspended";

export function deriveMobileChromeVisibility(
  current: MobileChromeVisibility,
  sample: MobileChromeScrollSample,
): MobileChromeVisibility {
  const scrollTop = Math.max(0, sample.scrollTop);
  const delta = scrollTop - Math.max(0, sample.previousScrollTop);
  const scrolled = scrollTop >= MOBILE_CHROME_TOP_THRESHOLD;
  const scrollable = sample.scrollHeight > sample.viewportHeight + 4;
  let hidden = current.hidden;

  if (!scrollable || scrollTop <= MOBILE_CHROME_TOP_THRESHOLD) hidden = false;
  else if (delta > MOBILE_CHROME_DIRECTION_THRESHOLD) hidden = true;
  else if (delta < -MOBILE_CHROME_DIRECTION_THRESHOLD) hidden = false;

  if (current.hidden === hidden && current.scrolled === scrolled) return current;
  return { hidden, scrolled };
}

export function adaptiveMobileChromeMode({
  navigationRevealed,
  suspended,
}: {
  hidden: boolean;
  navigationRevealed: boolean;
  suspended: boolean;
}): MobileChromeMode {
  if (suspended) return "suspended";
  return navigationRevealed ? "navigation" : "compact";
}
