import { z } from "zod";
import {
  getStudioAssistantThread,
  updateStudioAssistantThread,
} from "../../../../../../lib/server/studio-assistant-thread-repository";
import { requireStudioOperator } from "../../../../../../lib/server/studio-operator";
import { updateStudioAssistantThreadSchema } from "../../../../../../lib/studio/assistant/threads";
import { engineErrorResponse } from "../../../../../../lib/studio/engine/errors";
import { engineJson, parseEngineJson } from "../../../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
const threadIdSchema = z.string().uuid();

async function threadId(context: RouteContext) {
  return threadIdSchema.parse((await context.params).id);
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const [operator, id] = await Promise.all([requireStudioOperator(), threadId(context)]);
    return engineJson({ thread: await getStudioAssistantThread(operator, id) });
  } catch (error) {
    return engineErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const [operator, id, input] = await Promise.all([
      requireStudioOperator(),
      threadId(context),
      parseEngineJson(request, updateStudioAssistantThreadSchema),
    ]);
    const action = input.action === "RENAME"
      ? { kind: "RENAME" as const, title: input.title }
      : input.action === "SAVE_TASK"
        ? { kind: "SAVE_TASK" as const, task: input.task }
        : input.action === "SET_TASK_STATUS"
          ? { kind: "SET_TASK_STATUS" as const, status: input.status, taskId: input.taskId }
          : input.action === "DELETE_TASK"
            ? { kind: "DELETE_TASK" as const, taskId: input.taskId }
            : { kind: input.action };
    const thread = await updateStudioAssistantThread({
      action,
      expectedVersion: input.expectedVersion,
      idempotencyKey: "idempotencyKey" in input ? input.idempotencyKey : undefined,
      operator,
      threadId: id,
    });
    return engineJson({ thread });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
