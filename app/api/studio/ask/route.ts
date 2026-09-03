import {
  consumeStream,
  createAgentUIStreamResponse,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import {
  createStudioAssistantAgent,
  studioAssistantModelName,
  type StudioAssistantUIMessage,
} from "../../../../lib/ai/studio-assistant-agent";
import {
  createDeterministicStudioAssistantStream,
  studioAssistantModelConnected,
} from "../../../../lib/ai/studio-assistant-deterministic-stream";
import { resolveStudioAssistantFocusReference } from "../../../../lib/server/studio-assistant-focus";
import {
  createScenarioStudioAssistantToolExecutor,
  createStudioAssistantToolExecutor,
} from "../../../../lib/server/studio-assistant-tool-service";
import {
  beginStudioAssistantTurn,
  getStudioAssistantThread,
  saveStudioAssistantResponse,
  studioAssistantTurnContentFingerprint,
} from "../../../../lib/server/studio-assistant-thread-repository";
import {
  getStudioApplicationProjection,
  projectScenarioStudioApplication,
} from "../../../../lib/server/studio-application-projection";
import { requireStudioOperator } from "../../../../lib/server/studio-operator";
import { studioAssistantContextFromProjection } from "../../../../lib/studio/assistant/projection";
import {
  sendStudioAssistantMessageSchema,
  type StudioAssistantStoredMessage,
  type StudioAssistantThreadDetail,
} from "../../../../lib/studio/assistant/threads";
import {
  STUDIO_ASSISTANT_TOOL_NAMES,
  studioAssistantToolOutputSchema,
  type StudioAssistantToolName,
  type StudioAssistantToolOutput,
  type StudioAssistantToolRecord,
} from "../../../../lib/studio/assistant/tool-contracts";
import { StudioEngineError, engineErrorResponse } from "../../../../lib/studio/engine/errors";
import { sha256 } from "../../../../lib/studio/engine/fingerprint";
import { noStoreJsonHeaders, parseEngineJson } from "../../../../lib/studio/engine/http";
import { isStudioScenario } from "../../../../lib/studio/simulator";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CONNECTED_AGENT_TIMEOUT = {
  firstChunkMs: 8_000,
  stepMs: 12_000,
  totalMs: 20_000,
} as const;
const EXISTING_TURN_JOIN_MS = 21_000;

const SAFE_PRIOR_TOOL_FIELDS: Readonly<Record<StudioAssistantToolRecord["type"], ReadonlySet<string>>> = {
  DROP: new Set(["State", "Pieces", "Published", "Available", "Current Shop"]),
  INVENTORY: new Set(["Availability", "Expected", "Last confirmed", "Custody", "Hold", "Location version"]),
  MEDIA: new Set(["Role", "State", "Model", "Updated"]),
  MODEL: new Set(["State", "Authority", "Confirmed", "Revision"]),
  ORDER: new Set(["Lifecycle", "Payment review", "Funds", "Fulfillment", "Total", "Version"]),
  PIECE: new Set(["Name", "Description", "Price", "Status", "Drop", "Private revision", "Media"]),
  SERVICE: new Set(),
};

function toolNameFromPart(type: string): StudioAssistantToolName | null {
  if (!type.startsWith("tool-")) return null;
  const name = type.slice("tool-".length);
  return STUDIO_ASSISTANT_TOOL_NAMES.includes(name as StudioAssistantToolName)
    ? name as StudioAssistantToolName
    : null;
}

function stripSensitiveToolKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitiveToolKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, nested]) => {
    const normalized = key.replace(/[^a-z]/gi, "").toLocaleLowerCase("en-US");
    if (
      normalized.includes("email")
      || normalized.includes("phone")
      || normalized.includes("address")
      || normalized === "contact"
      || normalized.startsWith("customer")
    ) return [];
    return [[key, stripSensitiveToolKeys(nested)]];
  }));
}

function fallbackPriorToolOutput(tool: StudioAssistantToolName): StudioAssistantToolOutput {
  return {
    actions: [],
    generatedAt: new Date(0).toISOString(),
    operation: null,
    outcome: "BLOCKED",
    records: [],
    schemaVersion: "juw.studio-assistant-tool.v1",
    summary: "Refresh this Studio fact before relying on it.",
    title: "Previous Studio result",
    tool,
  };
}

function sanitizePriorToolOutputForModel(
  value: unknown,
  tool: StudioAssistantToolName,
): StudioAssistantToolOutput {
  const parsed = studioAssistantToolOutputSchema.safeParse(stripSensitiveToolKeys(value));
  if (!parsed.success || parsed.data.tool !== tool) return fallbackPriorToolOutput(tool);
  const current = parsed.data;
  const records = current.records.map((record) => ({
    ...record,
    detail: [record.reference ?? record.label, record.state].filter(Boolean).join(" · "),
    fields: record.fields.flatMap((field) => {
      if (!SAFE_PRIOR_TOOL_FIELDS[record.type].has(field.label)) return [];
      if (field.label === "Hold") {
        return [{ ...field, value: /^none$/i.test(field.value.trim()) ? "None" : "Active customer hold" }];
      }
      return [field];
    }),
    media: [],
  }));
  const operation = current.operation
    ? {
        ...current.operation,
        createdBy: { displayName: "Studio operator" },
        executedBy: current.operation.executedBy ? { displayName: "Studio operator" } : null,
        lastError: current.operation.lastError
          ? {
              code: current.operation.lastError.code,
              message: "The Studio command did not reach a confirmed terminal outcome.",
              recovery: "Refresh the operation before deciding whether to retry.",
            }
          : null,
        receipt: current.operation.receipt
          ? {
              ...current.operation.receipt,
              actor: { displayName: "Studio operator" },
              detail: "The owning Studio command reached this recorded terminal outcome.",
            }
          : null,
      }
    : null;
  return {
    ...current,
    actions: current.actions.map((item) => ({ ...item, prompt: null })),
    operation,
    records,
    summary: `Previous ${tool} result with ${records.length} record${records.length === 1 ? "" : "s"}.`,
    title: records[0]?.label ?? operation?.target.label ?? "Previous Studio result",
  };
}

export function sanitizeStudioAssistantHistoryForModel(
  messages: StudioAssistantUIMessage[],
): StudioAssistantUIMessage[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => {
      const tool = toolNameFromPart(part.type);
      if (!tool || !("output" in part)) return part;
      return {
        ...part,
        output: sanitizePriorToolOutputForModel(part.output, tool),
      } as typeof part;
    }),
  }));
}

function safeUserMessage(value: unknown): StudioAssistantUIMessage {
  if (!value || typeof value !== "object") {
    throw new StudioEngineError("INVALID_REQUEST", 400, "Ask Studio needs a question.", "Enter a Studio question and try again.");
  }
  const candidate = value as { id?: unknown; parts?: unknown; role?: unknown };
  if (candidate.role !== "user" || !Array.isArray(candidate.parts)) {
    throw new StudioEngineError("INVALID_REQUEST", 400, "Ask Studio needs a question.", "Enter a Studio question and try again.");
  }
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
  if (!text) {
    throw new StudioEngineError("INVALID_REQUEST", 400, "Ask Studio needs a question.", "Enter a Studio question and try again.");
  }
  const requestedId = typeof candidate.id === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(candidate.id)
    ? candidate.id
    : crypto.randomUUID();
  return {
    id: requestedId,
    parts: [{ text, type: "text" }],
    role: "user",
  } as StudioAssistantUIMessage;
}

function messageText(message: StudioAssistantUIMessage) {
  return message.parts
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function numericUsage(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object") return null;
  const entries = Object.entries(value).filter((entry): entry is [string, number] => (
    typeof entry[1] === "number" && Number.isFinite(entry[1])
  ));
  return entries.length ? Object.fromEntries(entries) : null;
}

function mergeUsage(
  current: Record<string, number> | null,
  next: Record<string, number> | null,
) {
  if (!next) return current;
  const merged = { ...(current ?? {}) };
  for (const [key, value] of Object.entries(next)) merged[key] = (merged[key] ?? 0) + value;
  return merged;
}

function dedupedCompleteMessages(thread: StudioAssistantThreadDetail) {
  const messages = new Map<string, StudioAssistantUIMessage>();
  for (const stored of thread.messages) {
    if (stored.status !== "COMPLETE") continue;
    messages.set(stored.message.id, stored.message);
  }
  return [...messages.values()].slice(-20);
}

function storedAssistantResponse(
  thread: StudioAssistantThreadDetail,
  responseId: string,
): StudioAssistantStoredMessage | null {
  return thread.messages.find((stored) => (
    stored.message.id === responseId && stored.message.role === "assistant"
  )) ?? null;
}

function pauseForTurn(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timeout = setTimeout(done, milliseconds);
    signal.addEventListener("abort", done, { once: true });
  });
}

async function joinExistingStudioAssistantTurn(input: {
  initialThread: StudioAssistantThreadDetail;
  operator: Awaited<ReturnType<typeof requireStudioOperator>>;
  requestSignal: AbortSignal;
  responseId: string;
}) {
  let thread = input.initialThread;
  let response = storedAssistantResponse(thread, input.responseId);
  let delayMs = 160;
  const deadline = Date.now() + EXISTING_TURN_JOIN_MS;
  while (response?.status === "PENDING" && Date.now() < deadline && !input.requestSignal.aborted) {
    await pauseForTurn(Math.min(delayMs, Math.max(0, deadline - Date.now())), input.requestSignal);
    thread = await getStudioAssistantThread(input.operator, thread.id);
    response = storedAssistantResponse(thread, input.responseId);
    delayMs = Math.min(Math.ceil(delayMs * 1.7), 1_500);
  }
  return { response, thread };
}

function replayStudioAssistantResponse(message: StudioAssistantUIMessage) {
  const stream = createUIMessageStream<StudioAssistantUIMessage>({
    execute: ({ writer }) => {
      const write = (chunk: Parameters<typeof writer.write>[0]) => writer.write(chunk);
      write({ messageId: message.id, type: "start" });
      let stepOpen = false;
      for (const part of message.parts) {
        if (part.type === "step-start") {
          if (stepOpen) write({ type: "finish-step" });
          write({ type: "start-step" });
          stepOpen = true;
          continue;
        }
        if (part.type === "text") {
          const id = `${message.id}-text`;
          write({ id, type: "text-start" });
          write({ delta: part.text, id, type: "text-delta" });
          write({ id, type: "text-end" });
          continue;
        }
        const tool = toolNameFromPart(part.type);
        if (!tool || !("toolCallId" in part) || !("state" in part)) continue;
        const toolPart = part as typeof part & {
          errorText?: string;
          input?: unknown;
          output?: unknown;
          toolCallId: string;
        };
        if (toolPart.input !== undefined) {
          write({
            input: toolPart.input,
            toolCallId: toolPart.toolCallId,
            toolName: tool,
            type: "tool-input-available",
          });
        }
        if (toolPart.state === "output-available") {
          write({
            output: toolPart.output,
            toolCallId: toolPart.toolCallId,
            type: "tool-output-available",
          });
        } else if (toolPart.state === "output-error") {
          write({
            errorText: toolPart.errorText ?? "The Studio tool did not finish.",
            toolCallId: toolPart.toolCallId,
            type: "tool-output-error",
          });
        } else if (toolPart.state === "output-denied") {
          write({ toolCallId: toolPart.toolCallId, type: "tool-output-denied" });
        }
      }
      if (stepOpen) write({ type: "finish-step" });
      write({ finishReason: "stop", type: "finish" });
    },
  });
  return createUIMessageStreamResponse({
    consumeSseStream: consumeStream,
    headers: noStoreJsonHeaders,
    stream,
  });
}

function unresolvedExistingTurn(response: StudioAssistantStoredMessage | null): never {
  if (response?.status === "PENDING") {
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      "That Ask Studio reply is still running.",
      "Wait a moment, then refresh this conversation. The same turn will not be charged twice.",
    );
  }
  throw new StudioEngineError(
    "INVALID_TRANSITION",
    409,
    "That Ask Studio reply did not finish.",
    "Send the question again as a new message after reviewing this conversation.",
  );
}

export async function POST(request: Request): Promise<Response> {
  try {
    const [operator, input] = await Promise.all([
      requireStudioOperator(),
      parseEngineJson(request, sendStudioAssistantMessageSchema),
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

    const incoming = safeUserMessage(input.message);
    const context = studioAssistantContextFromProjection(projection);
    if (input.scenario) {
      const query = messageText(incoming);
      return createUIMessageStreamResponse({
        consumeSseStream: consumeStream,
        headers: noStoreJsonHeaders,
        stream: createDeterministicStudioAssistantStream({
          executeTool: createScenarioStudioAssistantToolExecutor(context),
          query,
          runId: incoming.id,
        }),
      });
    }

    const thread = await getStudioAssistantThread(operator, input.threadId!);
    const query = messageText(incoming);
    const nextFocus = resolveStudioAssistantFocusReference(context, query) ?? thread.focus;
    const responseId = `assistant-${sha256(`${thread.id}:${incoming.id}`).slice(0, 48)}`;
    const modelConnected = studioAssistantModelConnected();
    const responseModel = modelConnected ? studioAssistantModelName() : "deterministic/studio-tools";
    const turn = await beginStudioAssistantTurn({
      contentFingerprint: studioAssistantTurnContentFingerprint(incoming),
      focus: nextFocus,
      message: incoming,
      model: responseModel,
      operator,
      responseId,
      threadId: thread.id,
    });
    let executionThread = await getStudioAssistantThread(operator, thread.id);
    let claimedResponse = storedAssistantResponse(executionThread, responseId);
    if (turn.kind !== "ACQUIRED") {
      if (claimedResponse?.status === "COMPLETE") {
        return replayStudioAssistantResponse(claimedResponse.message);
      }
      if (claimedResponse?.status === "PENDING") {
        const joined = await joinExistingStudioAssistantTurn({
          initialThread: executionThread,
          operator,
          requestSignal: request.signal,
          responseId,
        });
        executionThread = joined.thread;
        claimedResponse = joined.response;
        if (claimedResponse?.status === "COMPLETE") {
          return replayStudioAssistantResponse(claimedResponse.message);
        }
      }
      unresolvedExistingTurn(claimedResponse);
    }
    if (claimedResponse?.status !== "PENDING") {
      if (claimedResponse?.status === "COMPLETE") {
        return replayStudioAssistantResponse(claimedResponse.message);
      }
      unresolvedExistingTurn(claimedResponse);
    }

    const originalMessages = dedupedCompleteMessages(executionThread);
    const executeTool = createStudioAssistantToolExecutor({
      operator,
      requestMessageId: incoming.id,
      thread: executionThread,
    });

    const persistResponse = async (event: {
      isAborted: boolean;
      responseMessage: StudioAssistantUIMessage;
    }, usage: Record<string, number> | null, model: string | null, failed = false) => {
      await saveStudioAssistantResponse({
        message: event.responseMessage,
        model,
        operator,
        status: event.isAborted ? "ABORTED" : failed ? "ERROR" : "COMPLETE",
        threadId: executionThread.id,
        tokenUsage: usage,
      });
    };

    if (!modelConnected) {
      return createUIMessageStreamResponse({
        consumeSseStream: consumeStream,
        headers: noStoreJsonHeaders,
        stream: createDeterministicStudioAssistantStream({
          executeTool,
          focusEntityType: nextFocus?.entityType,
          focusReference: nextFocus?.reference,
          onEnd: (event) => persistResponse(event, null, "deterministic/studio-tools"),
          originalMessages,
          query,
          runId: incoming.id,
          responseMessageId: responseId,
        }),
      });
    }

    let usage: Record<string, number> | null = null;
    let failed = false;
    const agent = createStudioAssistantAgent(
      {
        focusEntityType: executionThread.focus?.entityType ?? null,
        focusReference: executionThread.focus?.reference ?? null,
        query,
      },
      { executeTool },
    );
    return await createAgentUIStreamResponse({
      abortSignal: request.signal,
      agent,
      consumeSseStream: consumeStream,
      headers: noStoreJsonHeaders,
      generateMessageId: () => responseId,
      onEnd: (event) => persistResponse(event, usage, studioAssistantModelName(), failed),
      onError: () => {
        failed = true;
        return "Ask Studio could not finish this reply. No unconfirmed Studio change was applied.";
      },
      onStepEnd: (event) => { usage = mergeUsage(usage, numericUsage(event.usage)); },
      originalMessages,
      sendReasoning: false,
      timeout: CONNECTED_AGENT_TIMEOUT,
      uiMessages: sanitizeStudioAssistantHistoryForModel(originalMessages),
    });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
