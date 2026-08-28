import { createHoldSchema, createManualHold } from "../../../../../lib/server/studio-authority-repository";
import { requireStudioOperator } from "../../../../../lib/server/studio-operator";
import { engineErrorResponse } from "../../../../../lib/studio/engine/errors";
import { engineJson, parseEngineJson } from "../../../../../lib/studio/engine/http";
import type { StudioAuthorityHold } from "../../../../../lib/studio/services/studio-authority-client";

export const dynamic = "force-dynamic";

export type ManualHoldCreateOutcome = "CREATED" | "REPLAYED";

type ManualHoldCreateResult =
  | StudioAuthorityHold
  | { hold: StudioAuthorityHold; outcome: ManualHoldCreateOutcome };

function normalizeCreateResult(result: ManualHoldCreateResult): {
  hold: StudioAuthorityHold;
  outcome: ManualHoldCreateOutcome;
} {
  if ("hold" in result) return result;
  // A legacy row-only result cannot prove this request performed the
  // transition. Treat it as a replay so feedback never claims a new hold.
  return { hold: result, outcome: "REPLAYED" };
}

function formattedExpiry(expiresAt: string): string {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(expiresAt));
}

export function manualHoldCreateReceipt(
  hold: Pick<StudioAuthorityHold, "customerName" | "expiresAt" | "sku" | "status">,
  outcome: ManualHoldCreateOutcome,
) {
  if (outcome === "CREATED") return {
    consequence: `${hold.sku} is held for ${hold.customerName}.`,
    customerVisible: false,
    next: `Release it or let it expire ${formattedExpiry(hold.expiresAt)}.`,
  };
  if (hold.status === "ACTIVE" && Date.parse(hold.expiresAt) <= Date.now()) return {
    consequence: `This hold request for ${hold.sku} is still active past its deadline.`,
    customerVisible: false,
    next: "Review inventory, order ownership, and physical custody before expiring or replacing it.",
  };
  if (hold.status === "ACTIVE") return {
    consequence: `The hold for ${hold.sku} is already active for ${hold.customerName}.`,
    customerVisible: false,
    next: `It remains scheduled to expire ${formattedExpiry(hold.expiresAt)}.`,
  };
  if (hold.status === "RELEASED") return {
    consequence: `This hold request for ${hold.sku} had already been released.`,
    customerVisible: false,
    next: "Review the piece before creating a new hold.",
  };
  return {
    consequence: `This hold request for ${hold.sku} had already expired.`,
    customerVisible: false,
    next: "Review the piece before creating a new hold.",
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const [operator, input] = await Promise.all([
      requireStudioOperator(),
      parseEngineJson(request, createHoldSchema),
    ]);
    const created = normalizeCreateResult(
      await createManualHold(operator, input) as ManualHoldCreateResult,
    );
    return engineJson({
      hold: created.hold,
      outcome: created.outcome,
      receipt: manualHoldCreateReceipt(created.hold, created.outcome),
    }, { status: created.outcome === "CREATED" ? 201 : 200 });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
