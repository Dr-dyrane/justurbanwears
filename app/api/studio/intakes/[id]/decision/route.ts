import { requireStudioOperator } from "../../../../../../lib/server/studio-operator";
import { decisionSchema } from "../../../../../../lib/studio/engine/contracts";
import { engineErrorResponse } from "../../../../../../lib/studio/engine/errors";
import { engineJson, parseEngineJson } from "../../../../../../lib/studio/engine/http";
import { decideStudioCandidate } from "../../../../../../lib/studio/engine/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const [operator, { id }, input] = await Promise.all([
      requireStudioOperator(),
      context.params,
      parseEngineJson(request, decisionSchema),
    ]);
    return engineJson({ intake: await decideStudioCandidate({ id, operator, ...input }) });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
