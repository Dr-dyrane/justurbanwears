import { listStudioAssistantOperations } from "../../../../../lib/server/studio-assistant-operation-repository";
import { requireStudioOperator } from "../../../../../lib/server/studio-operator";
import { studioAssistantOperationListQuerySchema } from "../../../../../lib/studio/assistant/tool-contracts";
import { StudioEngineError, engineErrorResponse } from "../../../../../lib/studio/engine/errors";
import { engineJson } from "../../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const query = studioAssistantOperationListQuerySchema.safeParse({
      threadId: new URL(request.url).searchParams.get("threadId"),
    });
    if (!query.success) {
      throw new StudioEngineError(
        "INVALID_REQUEST",
        400,
        "That Ask Studio operation request is invalid.",
        "Reload the conversation and try again.",
      );
    }
    const operator = await requireStudioOperator();
    return engineJson({
      operations: await listStudioAssistantOperations(operator, query.data.threadId),
    });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
