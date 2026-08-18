import { z } from "zod";
import { releaseManualHold } from "../../../../../../lib/server/studio-authority-repository";
import { requireStudioOperator } from "../../../../../../lib/server/studio-operator";
import { engineErrorResponse } from "../../../../../../lib/studio/engine/errors";
import { engineJson, parseEngineJson } from "../../../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";

const releaseSchema = z.object({ action: z.literal("RELEASE") });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const [operator, { id }] = await Promise.all([requireStudioOperator(), context.params]);
    await parseEngineJson(request, releaseSchema);
    const hold = await releaseManualHold(operator, id);
    return engineJson({
      hold,
      receipt: {
        consequence: `${hold.sku} is available again.`,
        customerVisible: true,
        next: "No customer order was created.",
      },
    });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
