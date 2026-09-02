import {
  createAgentUIStreamResponse,
  createUIMessageStreamResponse,
} from "ai";
import { z } from "zod";
import { createStudioAssistantAgent } from "../../../../lib/ai/studio-assistant-agent";
import {
  createDeterministicStudioAssistantStream,
  studioAssistantModelConnected,
} from "../../../../lib/ai/studio-assistant-deterministic-stream";
import {
  getStudioApplicationProjection,
  projectScenarioStudioApplication,
} from "../../../../lib/server/studio-application-projection";
import { requireStudioOperator } from "../../../../lib/server/studio-operator";
import { studioAssistantContextFromProjection } from "../../../../lib/studio/assistant/projection";
import { StudioEngineError, engineErrorResponse } from "../../../../lib/studio/engine/errors";
import { noStoreJsonHeaders, parseEngineJson } from "../../../../lib/studio/engine/http";
import { isStudioScenario } from "../../../../lib/studio/simulator";
import { contextualizeStudioAssistantQuery } from "../../../../lib/studio/assistant/experience";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const askRequestSchema = z.object({
  messages: z.array(z.unknown()).min(1).max(20),
  scenario: z.string().trim().max(80).optional(),
}).strict();

type SafeTextMessage = {
  id: string;
  parts: Array<{ text: string; type: "text" }>;
  role: "assistant" | "user";
};

function safeTextMessage(value: unknown, index: number): SafeTextMessage | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { parts?: unknown; role?: unknown };
  if (candidate.role !== "user" && candidate.role !== "assistant") return null;
  if (!Array.isArray(candidate.parts)) return null;
  const text = candidate.parts
    .filter((part): part is { text: string; type: "text" } => Boolean(
      part
      && typeof part === "object"
      && (part as { type?: unknown }).type === "text"
      && typeof (part as { text?: unknown }).text === "string",
    ))
    .map((part) => part.text)
    .join("\n")
    .trim()
    .slice(0, 1_200);
  if (!text) return null;
  return {
    id: `studio-ask-input-${index}`,
    parts: [{ text, type: "text" }],
    role: candidate.role,
  };
}

function boundedTextConversation(messages: unknown[]) {
  const textMessages = messages
    .map(safeTextMessage)
    .filter((message): message is SafeTextMessage => message !== null)
    .slice(-8);
  const latestUserIndex = textMessages.findLastIndex((message) => message.role === "user");
  if (latestUserIndex < 0) {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      400,
      "Ask Studio needs a question.",
      "Enter a Studio question and try again.",
    );
  }
  return textMessages.slice(0, latestUserIndex + 1);
}

export async function POST(request: Request): Promise<Response> {
  try {
    const [operator, input] = await Promise.all([
      requireStudioOperator(),
      parseEngineJson(request, askRequestSchema),
    ]);
    const projection = input.scenario
      ? (() => {
          if (process.env.NODE_ENV !== "development" || !isStudioScenario(input.scenario!)) {
            throw new StudioEngineError(
              "INVALID_REQUEST",
              400,
              "That Studio scenario is unavailable.",
              "Return to connected Studio.",
            );
          }
          return projectScenarioStudioApplication({
            now: new Date().toISOString(),
            operator,
            scenario: input.scenario!,
          });
        })()
      : await getStudioApplicationProjection(operator);
    const askCapability = projection.capabilities.find((capability) => capability.id === "ASK_READ");
    if (!askCapability || askCapability.state === "UNAVAILABLE") {
      throw new StudioEngineError(
        "ENGINE_UNAVAILABLE",
        503,
        "Ask Studio is unavailable.",
        "Return to Studio Home and try again when connected truth is available.",
      );
    }

    const uiMessages = boundedTextConversation(input.messages);
    const context = studioAssistantContextFromProjection(projection);
    const query = contextualizeStudioAssistantQuery(
      uiMessages.map((message) => ({ role: message.role, text: message.parts[0].text })),
      context,
    );
    if (!studioAssistantModelConnected()) {
      return createUIMessageStreamResponse({
        headers: noStoreJsonHeaders,
        stream: createDeterministicStudioAssistantStream({ context, query }),
      });
    }
    const agent = createStudioAssistantAgent({ context, query });
    return await createAgentUIStreamResponse({
      abortSignal: request.signal,
      agent,
      headers: noStoreJsonHeaders,
      onError: () => "Ask Studio could not finish this reply. No Studio change was applied.",
      sendReasoning: false,
      timeout: { firstChunkMs: 15_000, stepMs: 20_000, totalMs: 30_000 },
      uiMessages,
    });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
