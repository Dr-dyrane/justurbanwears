import { z } from "zod";
import {
  cancelPreparedStudioAssistantOperation,
  confirmStudioAssistantOperation,
  persistReconciledStudioAssistantOperation,
  readStudioAssistantOperation,
} from "../../../../../../lib/server/studio-assistant-operation-service";
import { requireStudioOperator } from "../../../../../../lib/server/studio-operator";
import { studioAssistantOperationCommandSchema } from "../../../../../../lib/studio/assistant/tool-contracts";
import { StudioEngineError, engineErrorResponse } from "../../../../../../lib/studio/engine/errors";
import { engineJson, parseEngineJson } from "../../../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
const operationIdSchema = z.string().uuid();

async function operationId(context: RouteContext) {
  const parsed = operationIdSchema.safeParse((await context.params).id);
  if (!parsed.success) {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      400,
      "That Ask Studio operation reference is invalid.",
      "Return to the conversation and reopen the prepared change.",
    );
  }
  return parsed.data;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const [operator, id] = await Promise.all([requireStudioOperator(), operationId(context)]);
    return engineJson({ operation: await readStudioAssistantOperation(operator, id) });
  } catch (error) {
    return engineErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const [operator, id, command] = await Promise.all([
      requireStudioOperator(),
      operationId(context),
      parseEngineJson(request, studioAssistantOperationCommandSchema),
    ]);
    const operation = command.action === "CONFIRM"
      ? await confirmStudioAssistantOperation({
          command,
          expectedVersion: command.expectedVersion,
          operationId: id,
          operator,
        })
      : command.action === "RECONCILE"
        ? await persistReconciledStudioAssistantOperation({
            expectedVersion: command.expectedVersion,
            operationId: id,
            operator,
          })
        : await cancelPreparedStudioAssistantOperation({
          expectedVersion: command.expectedVersion,
          operationId: id,
          operator,
        });
    return engineJson({ operation });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
