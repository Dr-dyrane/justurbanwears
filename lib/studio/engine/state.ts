import { StudioEngineError } from "./errors";

type IntakeState = "DRAFT" | "ANALYZING" | "REVIEW" | "GENERATING" | "DECISION" | "COMMITTED" | "FAILED" | "ARCHIVED";

const transitions: Record<IntakeState, readonly IntakeState[]> = {
  DRAFT: ["ANALYZING", "ARCHIVED"],
  ANALYZING: ["REVIEW", "FAILED"],
  REVIEW: ["GENERATING", "ARCHIVED"],
  GENERATING: ["DECISION", "FAILED"],
  DECISION: ["GENERATING", "COMMITTED", "ARCHIVED"],
  COMMITTED: [],
  FAILED: ["ANALYZING", "REVIEW", "GENERATING", "ARCHIVED"],
  ARCHIVED: [],
};

export function assertIntakeTransition(from: IntakeState, to: IntakeState): void {
  if (!transitions[from].includes(to)) {
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      `This intake cannot move from ${from.toLowerCase()} to ${to.toLowerCase()}.`,
      "Return to the current step.",
    );
  }
}
