import { locationCommandSchema, recordPieceLocation } from "../../../../../lib/server/studio-authority-repository";
import { requireStudioOperator } from "../../../../../lib/server/studio-operator";
import { engineErrorResponse } from "../../../../../lib/studio/engine/errors";
import { engineJson, parseEngineJson } from "../../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const [operator, input] = await Promise.all([
      requireStudioOperator(),
      parseEngineJson(request, locationCommandSchema),
    ]);
    const result = await recordPieceLocation(operator, input);
    return engineJson({
      command: result.command,
      receipt: {
        consequence: result.command === "MOVE"
          ? `${result.previousLocationLabel} → ${result.locationLabel}`
          : result.mismatch
            ? `Last seen at ${result.locationLabel}; expected ${result.expectedLocationLabel}.`
            : `${result.locationLabel} is confirmed.`,
        customerVisible: false,
        next: result.command === "MOVE"
          ? "Availability did not change."
          : result.mismatch
            ? result.orderReference ? "Review the linked order." : "Move the piece or check again."
            : "No other action is needed.",
      },
    }, { status: 201 });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
