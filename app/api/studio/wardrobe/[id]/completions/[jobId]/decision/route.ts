import { requireStudioOperator } from "../../../../../../../../lib/server/studio-operator";
import { mediaCompletionDecisionSchema } from "../../../../../../../../lib/studio/engine/media-completion-contracts";
import { engineErrorResponse } from "../../../../../../../../lib/studio/engine/errors";
import { engineJson, parseEngineJson } from "../../../../../../../../lib/studio/engine/http";
import { decideMediaCompletion } from "../../../../../../../../lib/studio/engine/media-completion-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; jobId: string }> },
) {
  try {
    const [operator, { id, jobId }] = await Promise.all([requireStudioOperator(), context.params]);
    const input = await parseEngineJson(request, mediaCompletionDecisionSchema);
    return engineJson(await decideMediaCompletion({
      target: { kind: "WARDROBE_ITEM", key: id },
      jobId,
      operator,
      ...input,
    }));
  } catch (error) {
    return engineErrorResponse(error);
  }
}
