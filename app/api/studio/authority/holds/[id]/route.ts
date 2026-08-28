import { z } from "zod";
import { releaseManualHold } from "../../../../../../lib/server/studio-authority-repository";
import { requireStudioOperator } from "../../../../../../lib/server/studio-operator";
import { engineErrorResponse, StudioEngineError } from "../../../../../../lib/studio/engine/errors";
import { engineJson, parseEngineJson } from "../../../../../../lib/studio/engine/http";
import type { StudioAuthorityHold } from "../../../../../../lib/studio/services/studio-authority-client";

export const dynamic = "force-dynamic";

const releaseSchema = z.object({ action: z.literal("RELEASE") });
const releaseParamsSchema = z.object({ id: z.string().uuid() });

export type ManualHoldReleaseOutcome = "RELEASED" | "ALREADY_RELEASED" | "ALREADY_EXPIRED";

type ManualHoldReleaseResult =
  | StudioAuthorityHold
  | { hold: StudioAuthorityHold; outcome: ManualHoldReleaseOutcome };

function normalizeReleaseResult(result: ManualHoldReleaseResult): {
  hold: StudioAuthorityHold;
  outcome: ManualHoldReleaseOutcome;
} {
  if ("hold" in result) return result;
  return {
    hold: result,
    // The legacy repository result cannot prove that this request performed
    // the transition. Treat terminal rows as replays so the receipt never
    // claims that inventory became available now.
    outcome: result.status === "EXPIRED" ? "ALREADY_EXPIRED" : "ALREADY_RELEASED",
  };
}

export function manualHoldReleaseReceipt(
  hold: Pick<StudioAuthorityHold, "sku">,
  outcome: ManualHoldReleaseOutcome,
) {
  if (outcome === "RELEASED") return {
    consequence: `${hold.sku} is available again.`,
    customerVisible: true,
    next: "No customer order was created.",
  };
  if (outcome === "ALREADY_EXPIRED") return {
    consequence: `The hold for ${hold.sku} had already expired.`,
    customerVisible: false,
    next: "Review the piece before promising its availability.",
  };
  return {
    consequence: `The hold for ${hold.sku} had already been released.`,
    customerVisible: false,
    next: "Review the piece before promising its availability.",
  };
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const [operator, rawParams] = await Promise.all([requireStudioOperator(), context.params]);
    const params = releaseParamsSchema.safeParse(rawParams);
    if (!params.success) {
      throw new StudioEngineError(
        "INVALID_REQUEST",
        400,
        "That hold reference is invalid.",
        "Reload Operations and choose the hold again.",
      );
    }
    await parseEngineJson(request, releaseSchema);
    const released = normalizeReleaseResult(
      await releaseManualHold(operator, params.data.id) as ManualHoldReleaseResult,
    );
    return engineJson({
      hold: released.hold,
      outcome: released.outcome,
      receipt: manualHoldReleaseReceipt(released.hold, released.outcome),
    });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
