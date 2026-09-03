import { z } from "zod";
import { reconcileStudioAssistantReply } from "../../../../../../../../../lib/server/studio-assistant-thread-repository";
import { requireStudioOperator } from "../../../../../../../../../lib/server/studio-operator";
import { reconcileStudioAssistantReplySchema } from "../../../../../../../../../lib/studio/assistant/threads";
import { StudioEngineError, engineErrorResponse } from "../../../../../../../../../lib/studio/engine/errors";
import { engineJson, parseEngineJson } from "../../../../../../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; messageId: string }> };

const threadIdSchema = z.string().uuid();
const messageIdSchema = z.string().trim().min(1).max(160);

async function routeIds(context: RouteContext) {
  const params = await context.params;
  const thread = threadIdSchema.safeParse(params.id);
  const message = messageIdSchema.safeParse(params.messageId);
  if (!thread.success || !message.success) {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      400,
      "That Ask Studio reply reference is invalid.",
      "Refresh the conversation before checking it again.",
    );
  }
  return { messageId: message.data, threadId: thread.data };
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const [operator, ids, input] = await Promise.all([
      requireStudioOperator(),
      routeIds(context),
      parseEngineJson(request, reconcileStudioAssistantReplySchema),
    ]);
    return engineJson(await reconcileStudioAssistantReply({
      expectedThreadVersion: input.expectedThreadVersion,
      messageId: ids.messageId,
      operator,
      threadId: ids.threadId,
    }));
  } catch (error) {
    return engineErrorResponse(error);
  }
}
