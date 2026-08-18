import { z } from "zod";
import { dismissNotification } from "../../../../../../lib/server/studio-authority-repository";
import { requireStudioOperator } from "../../../../../../lib/server/studio-operator";
import { engineErrorResponse } from "../../../../../../lib/studio/engine/errors";
import { engineJson, parseEngineJson } from "../../../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";

const dismissSchema = z.object({ action: z.literal("DISMISS") });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const [operator, { id }] = await Promise.all([requireStudioOperator(), context.params]);
    await parseEngineJson(request, dismissSchema);
    await dismissNotification(operator, decodeURIComponent(id));
    return engineJson({ dismissed: true });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
