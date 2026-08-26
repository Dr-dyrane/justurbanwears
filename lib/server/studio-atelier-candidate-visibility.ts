export const STUDIO_ATELIER_REVIEWABLE_STATES = Object.freeze([
  "SEMANTIC_PASS",
  "USER_APPROVED",
  "LOCKED",
] as const);

export type StudioAtelierReviewableState =
  (typeof STUDIO_ATELIER_REVIEWABLE_STATES)[number];

export type StudioAtelierCandidateVisibility = "HIDDEN" | "REVIEWABLE";

const REVIEWABLE_STATE_SET = new Set<string>(STUDIO_ATELIER_REVIEWABLE_STATES);

/**
 * Candidate disclosure is derived exclusively from the durable server
 * lifecycle. Materialization, technical QA, failed QA and rejected history
 * never make private image bytes reviewable.
 */
export function studioAtelierCandidateVisibility(
  state: string,
): StudioAtelierCandidateVisibility {
  return REVIEWABLE_STATE_SET.has(state) ? "REVIEWABLE" : "HIDDEN";
}

export function isStudioAtelierReviewableState(
  state: string,
): state is StudioAtelierReviewableState {
  return REVIEWABLE_STATE_SET.has(state);
}
