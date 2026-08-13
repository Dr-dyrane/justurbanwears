import { requireStudioOperator } from "../../../../../../../../lib/server/studio-operator";
import { wearDecisionSchema } from "../../../../../../../../lib/studio/engine/contracts";
import { engineErrorResponse } from "../../../../../../../../lib/studio/engine/errors";
import { engineJson, parseEngineJson } from "../../../../../../../../lib/studio/engine/http";
import { decideWearCandidate } from "../../../../../../../../lib/studio/engine/wear-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string; generationId: string }> }) {
  try {
    const [operator, { id, generationId }, input] = await Promise.all([
      requireStudioOperator(),
      context.params,
      parseEngineJson(request, wearDecisionSchema),
    ]);
    return engineJson({ workspace: await decideWearCandidate({ wardrobeItemId: id, generationId, operator, ...input }) });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
