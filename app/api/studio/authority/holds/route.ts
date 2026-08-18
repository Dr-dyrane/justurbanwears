import { createHoldSchema, createManualHold } from "../../../../../lib/server/studio-authority-repository";
import { requireStudioOperator } from "../../../../../lib/server/studio-operator";
import { engineErrorResponse } from "../../../../../lib/studio/engine/errors";
import { engineJson, parseEngineJson } from "../../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const [operator, input] = await Promise.all([
      requireStudioOperator(),
      parseEngineJson(request, createHoldSchema),
    ]);
    const hold = await createManualHold(operator, input);
    return engineJson({
      hold,
      receipt: {
        consequence: `${hold.sku} is held for ${hold.customerName}.`,
        customerVisible: false,
        next: `Release it or let it expire ${new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(hold.expiresAt))}.`,
      },
    }, { status: 201 });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
