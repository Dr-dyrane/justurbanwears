import { createUIMessageStream } from "ai";
import type { StudioAssistantContext } from "../studio/assistant/experience";
import { resolveStudioAssistantWorkflow } from "../studio/assistant/experience";
import type { StudioAssistantUIMessage } from "./studio-assistant-agent";

type StudioAssistantEnvironment = Partial<
  Record<"AI_GATEWAY_API_KEY" | "VERCEL_OIDC_TOKEN", string | undefined>
>;

export function studioAssistantModelConnected(
  environment: StudioAssistantEnvironment = process.env as StudioAssistantEnvironment,
) {
  return Boolean(environment.AI_GATEWAY_API_KEY || environment.VERCEL_OIDC_TOKEN);
}

export function createDeterministicStudioAssistantStream(input: {
  context: StudioAssistantContext;
  query: string;
}) {
  const output = resolveStudioAssistantWorkflow(input.query, input.context);
  const toolCallId = "resolve-studio-request";

  return createUIMessageStream<StudioAssistantUIMessage>({
    execute({ writer }) {
      writer.write({
        input: {},
        toolCallId,
        toolName: "resolveStudioRequest",
        type: "tool-input-available",
      });
      writer.write({
        output,
        toolCallId,
        type: "tool-output-available",
      });
    },
  });
}
