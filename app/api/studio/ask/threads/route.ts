import {
  createStudioAssistantThread,
  listStudioAssistantThreads,
} from "../../../../../lib/server/studio-assistant-thread-repository";
import { resolveStudioAssistantFocusReference } from "../../../../../lib/server/studio-assistant-focus";
import { getStudioApplicationProjection } from "../../../../../lib/server/studio-application-projection";
import { requireStudioOperator } from "../../../../../lib/server/studio-operator";
import { studioAssistantContextFromProjection } from "../../../../../lib/studio/assistant/projection";
import { createStudioAssistantThreadSchema } from "../../../../../lib/studio/assistant/threads";
import { StudioEngineError, engineErrorResponse } from "../../../../../lib/studio/engine/errors";
import { engineJson, parseEngineJson } from "../../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const operator = await requireStudioOperator();
    return engineJson({ threads: await listStudioAssistantThreads(operator) });
  } catch (error) {
    return engineErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const [operator, input] = await Promise.all([
      requireStudioOperator(),
      parseEngineJson(request, createStudioAssistantThreadSchema),
    ]);
    let focus = null;
    const focusReference = input.focusReference ?? input.pieceReference;
    if (focusReference) {
      const projection = await getStudioApplicationProjection(operator);
      focus = resolveStudioAssistantFocusReference(
        studioAssistantContextFromProjection(projection),
        focusReference,
      );
      if (!focus) {
        throw new StudioEngineError(
          "INVALID_REQUEST",
          400,
          "That Studio record is not available to Ask Studio.",
          "Open the current record and try Ask Studio again.",
        );
      }
    }
    const thread = await createStudioAssistantThread({
      focus,
      idempotencyKey: input.idempotencyKey,
      operator,
      title: input.title,
    });
    return engineJson({ thread }, { status: 201 });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
