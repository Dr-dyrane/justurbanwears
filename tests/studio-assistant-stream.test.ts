import assert from "node:assert/strict";
import test from "node:test";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { createAgentUIStream, readUIMessageStream, simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { createStudioAssistantAgent } from "../lib/ai/studio-assistant-agent";
import {
  createDeterministicStudioAssistantStream,
  planDeterministicStudioAssistantTool,
  studioAssistantModelConnected,
} from "../lib/ai/studio-assistant-deterministic-stream";
import {
  STUDIO_ASSISTANT_TOOL_NAMES,
  type StudioAssistantToolName,
  type StudioAssistantToolOutput,
} from "../lib/studio/assistant/tool-contracts";

const query = "What's JUW-026's description?";
const prose = "JUW-026 is a deep-violet beaded mini dress with soft flounces.";
const pieceOutput = {
  actions: [],
  generatedAt: "2026-09-02T00:00:00.000Z",
  operation: null,
  outcome: "OK",
  records: [{
    detail: "A deep-violet beaded mini dress with soft flounces.",
    fields: [{
      label: "Description",
      value: "A deep-violet beaded mini dress with soft flounces.",
    }],
    href: "/studio/wardrobe/wardrobe-seed-juw-026",
    id: "wardrobe-seed-juw-026",
    label: "Violet Beaded Mini Dress",
    media: [],
    reference: "JUW-026",
    state: "AVAILABLE",
    type: "PIECE",
  }],
  schemaVersion: "juw.studio-assistant-tool.v1",
  summary: "JUW-026's current Studio description was refreshed.",
  title: "Violet Beaded Mini Dress",
  tool: "getPiece",
} satisfies StudioAssistantToolOutput;
const usage = {
  inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
  outputTokens: { reasoning: 0, text: 1, total: 1 },
};

function isStreamChunk(chunk: unknown): chunk is Record<string, unknown> & { type: string } {
  return typeof chunk === "object"
    && chunk !== null
    && "type" in chunk
    && typeof chunk.type === "string";
}

test("Ask Studio streams one model-selected typed tool result before bounded prose", async () => {
  const modelResponses: LanguageModelV3StreamPart[][] = [
    [
      { type: "stream-start", warnings: [] },
      {
        input: JSON.stringify({ reference: "JUW-026" }),
        toolCallId: "get-piece-1",
        toolName: "getPiece",
        type: "tool-call",
      },
      {
        finishReason: { raw: "tool_calls", unified: "tool-calls" },
        type: "finish",
        usage,
      },
    ],
    [
      { type: "stream-start", warnings: [] },
      { id: "answer-1", type: "text-start" },
      { delta: prose, id: "answer-1", type: "text-delta" },
      { id: "answer-1", type: "text-end" },
      {
        finishReason: { raw: "stop", unified: "stop" },
        type: "finish",
        usage,
      },
    ],
  ];
  let responseIndex = 0;
  const model = new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream<LanguageModelV3StreamPart>({
        chunkDelayInMs: null,
        chunks: modelResponses[responseIndex++] ?? [],
        initialDelayInMs: null,
      }),
    }),
    modelId: "studio-typed-tools-proof",
    provider: "local-test",
  });
  const executed: Array<{ input: unknown; tool: StudioAssistantToolName }> = [];
  const agent = createStudioAssistantAgent(
    { focusEntityType: null, focusReference: null, query },
    {
      executeTool: async (tool, input) => {
        executed.push({ input, tool });
        return pieceOutput;
      },
      model,
    },
  );
  const stream = await createAgentUIStream({
    agent,
    sendReasoning: false,
    uiMessages: [{ id: "operator-1", parts: [{ text: query, type: "text" }], role: "user" }],
  });
  const chunks: unknown[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  const streamChunks = chunks.filter(isStreamChunk);

  assert.equal(model.doGenerateCalls.length, 0);
  assert.equal(model.doStreamCalls.length, 2);
  assert.deepEqual(model.doStreamCalls[0].toolChoice, { type: "required" });
  assert.deepEqual(model.doStreamCalls[1].toolChoice, { type: "none" });
  for (const call of model.doStreamCalls) {
    assert.deepEqual(call.tools?.map((candidate) => candidate.name), [...STUDIO_ASSISTANT_TOOL_NAMES]);
    assert.equal(call.maxOutputTokens, 420);
  }
  assert.deepEqual(executed, [{ input: { reference: "JUW-026" }, tool: "getPiece" }]);

  const toolInputIndex = streamChunks.findIndex((chunk) => chunk.type === "tool-input-available");
  const toolOutputIndex = streamChunks.findIndex((chunk) => chunk.type === "tool-output-available");
  const textStartIndex = streamChunks.findIndex((chunk) => chunk.type === "text-start");
  assert.equal(toolInputIndex >= 0, true);
  assert.equal(toolOutputIndex > toolInputIndex, true);
  assert.equal(textStartIndex > toolOutputIndex, true);
  assert.equal(streamChunks[toolInputIndex].toolName, "getPiece");
  assert.deepEqual(streamChunks[toolInputIndex].input, { reference: "JUW-026" });
  assert.deepEqual(streamChunks[toolOutputIndex].output, pieceOutput);
  assert.equal(streamChunks.slice(0, toolOutputIndex).some((chunk) => chunk.type === "text-delta"), false);

  const streamedProse = streamChunks
    .filter((chunk) => chunk.type === "text-delta")
    .map((chunk) => typeof chunk.delta === "string" ? chunk.delta : "")
    .join("");
  assert.equal(streamedProse, prose);
  assert.equal(streamedProse.length < 240, true);
});

test("explicit fact edits outrank command words inside the requested value", () => {
  assert.deepEqual(
    planDeterministicStudioAssistantTool(
      "Change JUW-026 name to Archive Night Dress",
      null,
      null,
    ),
    {
      input: {
        changes: { name: "Archive Night Dress" },
        reference: "JUW-026",
      },
      toolName: "preparePieceEdit",
    },
  );
  assert.deepEqual(
    planDeterministicStudioAssistantTool(
      "Change its description to Ready to publish after review",
      "JUW-026",
      "PIECE",
    ),
    {
      input: {
        changes: { description: "Ready to publish after review" },
        reference: "JUW-026",
      },
      toolName: "preparePieceEdit",
    },
  );
});

test("the deterministic typed stream preserves its exact plan, output and claimed response id", async () => {
  const responseId = "assistant-fixed-response-id";
  const runId = "operator-message-026";
  const executions: Array<{ input: unknown; tool: StudioAssistantToolName }> = [];
  let finalizedId = "";
  const stream = createDeterministicStudioAssistantStream({
    executeTool: async (tool, input) => {
      executions.push({ input, tool });
      return pieceOutput;
    },
    focusEntityType: "PIECE",
    focusReference: "JUW-026",
    onEnd: ({ responseMessage }) => { finalizedId = responseMessage.id; },
    originalMessages: [{
      id: "operator-1",
      parts: [{ text: "JUW-026", type: "text" }],
      role: "user",
    }],
    query: "What's its description?",
    responseMessageId: responseId,
    runId,
  });
  const [inspectionStream, clientStream] = stream.tee();
  const chunks: unknown[] = [];
  for await (const chunk of inspectionStream) chunks.push(chunk);
  const clientMessages = [];
  for await (const message of readUIMessageStream({ stream: clientStream })) clientMessages.push(message);
  const streamChunks = chunks.filter(isStreamChunk);

  assert.equal(studioAssistantModelConnected({ AI_GATEWAY_API_KEY: undefined, VERCEL_OIDC_TOKEN: undefined }), false);
  assert.equal(studioAssistantModelConnected({ AI_GATEWAY_API_KEY: "gateway-key", VERCEL_OIDC_TOKEN: undefined }), true);
  assert.deepEqual(executions, [{ input: { reference: "JUW-026" }, tool: "getPiece" }]);
  assert.deepEqual(streamChunks.map((chunk) => chunk.type), [
    "tool-input-available",
    "tool-output-available",
  ]);
  assert.equal(streamChunks[0]?.toolName, "getPiece");
  assert.equal(streamChunks[0]?.toolCallId, `studio-${runId}`);
  assert.deepEqual(streamChunks[0]?.input, { reference: "JUW-026" });
  assert.equal(streamChunks[1]?.toolCallId, `studio-${runId}`);
  assert.deepEqual(streamChunks[1]?.output, pieceOutput);

  const resolvedPart = clientMessages.at(-1)?.parts.at(-1);
  assert.equal(resolvedPart?.type, "tool-getPiece");
  assert.equal(resolvedPart?.state, "output-available");
  assert.equal(resolvedPart?.toolCallId, `studio-${runId}`);
  assert.deepEqual(resolvedPart?.input, { reference: "JUW-026" });
  assert.deepEqual(resolvedPart?.output, pieceOutput);
  assert.equal(finalizedId, responseId);
});
