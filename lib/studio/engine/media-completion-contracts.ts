import { z } from "zod";
import { StudioEngineError } from "./errors";
import type { OperatorSafePendingCapture } from "./pending-capture-contracts";

export const mediaCompletionRoleSchema = z.enum([
  "GARMENT_FRONT",
  "GARMENT_BACK",
  "FABRIC_DETAIL",
]);

export type MediaCompletionRole = z.infer<typeof mediaCompletionRoleSchema>;
export type MediaCompletionTargetKind = "PENDING_PRODUCT" | "WARDROBE_ITEM";
export const mediaCompletionSourceModeSchema = z.enum([
  "UPLOADED_AUTHORITY",
  "APPROVED_FRONT",
]);
export type MediaCompletionSourceMode = z.infer<typeof mediaCompletionSourceModeSchema>;
export type MediaCompletionState =
  | "PENDING"
  | "RUNNING"
  | "COMPLETE"
  | "APPROVED"
  | "REJECTED"
  | "FAILED"
  | "INDETERMINATE";

export const mediaCompletionDecisionSchema = z.object({
  decision: z.enum(["KEEP", "RETRY", "REJECT"]),
  correction: z.string().trim().max(500).optional(),
  truthConfirmed: z.boolean().optional(),
});

export type MediaCompletionDecision = z.infer<typeof mediaCompletionDecisionSchema>;

export type OperatorSafeMediaCompletionJob = {
  id: string;
  role: MediaCompletionRole;
  sourceMode: MediaCompletionSourceMode;
  state: MediaCompletionState;
  assetUrl?: string;
  attempt: 1 | 2;
  canRetry: boolean;
  requiresReconciliation: boolean;
  createdAt: string;
  updatedAt: string;
  pollAfterMs?: number;
};

export type MediaCompletionWorkspace =
  | { sku: string; captures: OperatorSafePendingCapture[] }
  | { wardrobeItemId: string; captures: OperatorSafePendingCapture[] };

export type MediaCompletionResponse = {
  job: OperatorSafeMediaCompletionJob;
  workspace?: MediaCompletionWorkspace;
};

export type MediaCompletionReadResponse = {
  job: OperatorSafeMediaCompletionJob | null;
};

export function requiredAuthorityStatement(role: MediaCompletionRole): string {
  if (role === "GARMENT_FRONT") return "full front";
  if (role === "GARMENT_BACK") return "full back";
  return "fabric close-up";
}

export function assertMediaCompletionAuthority(
  role: MediaCompletionRole,
  authorityConfirmed: unknown,
): void {
  if (authorityConfirmed !== "true") {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      400,
      `Confirm that the source shows the ${requiredAuthorityStatement(role)}.`,
      "Choose a role-matching source photo.",
    );
  }
}

export function assertMediaCompletionTruthConfirmation(
  sourceMode: MediaCompletionSourceMode,
  decision: MediaCompletionDecision["decision"],
  truthConfirmed: unknown,
): void {
  if (sourceMode === "APPROVED_FRONT" && decision === "KEEP" && truthConfirmed !== true) {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      400,
      "Confirm that the AI preview matches the real garment.",
      "Compare the preview with the garment, then choose Yes, it matches.",
    );
  }
}
