import assert from "node:assert/strict";
import test from "node:test";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { createAgentUIStream, simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { createStudioAssistantAgent } from "../lib/ai/studio-assistant-agent";
import { projectScenarioStudioApplication } from "../lib/server/studio-application-projection";
import { studioAssistantContextFromProjection } from "../lib/studio/assistant/projection";

const query = "What needs attention?";
const prose = "One item needs attention. Open the return workspace to review it; no Studio change was applied here.";
const usage = {
  inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
  outputTokens: { reasoning: 0, text: 1, total: 1 },
};

const expectedWorkflow = {
  response: {
    blocks: [
      {
        body: "1 item need attention. Start there, or open any current state below.",
        kind: "answer",
        title: "Studio now",
      },
      {
        items: [
          { href: "/studio/operations?scenario=lifecycle", label: "Attention", value: 1 },
          {
            href: "/studio/operations?view=inventory&scenario=lifecycle",
            label: "Available",
            value: 33,
          },
          {
            href: "/studio/wardrobe?view=publishing&scenario=lifecycle",
            label: "Live",
            value: 32,
          },
          { href: "/studio/orders?scenario=lifecycle", label: "Orders", value: 2 },
        ],
        kind: "metrics",
      },
      {
        action: {
          href: "/studio/operations?view=orders&scenario=lifecycle",
          label: "Review 1 return",
        },
        body: "Resume the highest-priority open Studio work from its owning workspace.",
        consequence: "Opening the workspace does not apply a change.",
        kind: "handoff",
        risk: "R0",
        title: "Continue next",
      },
    ],
    intent: "RESOLVE",
    provenance: {
      detail: "Development simulator · isolated from connected Studio",
      generatedAt: "2026-08-26T12:00:00.000Z",
      label: "Scenario preview",
      scenario: "lifecycle",
      status: "preview",
    },
    risk: "R0",
  },
  schemaVersion: "studio-assistant-workflow/v1",
  suggestions: [
    {
      id: "studio-suggestion-16a7mft",
      label: "Choose the next task",
      prompt: "What needs attention?",
    },
    {
      id: "studio-suggestion-1gdjmkb",
      label: "Show private drafts",
      prompt: "Show private Wardrobe drafts",
    },
  ],
  taskDraft: null,
};

function isStreamChunk(chunk: unknown): chunk is Record<string, unknown> & { type: string } {
  return typeof chunk === "object"
    && chunk !== null
    && "type" in chunk
    && typeof chunk.type === "string";
}

test("Ask Studio executes its forced read-only resolver before bounded prose without a provider", async (t) => {
  let networkCalls = 0;
  t.mock.method(globalThis, "fetch", () => {
    networkCalls += 1;
    throw new Error("The deterministic Ask Studio stream proof must not access the network.");
  });

  const context = studioAssistantContextFromProjection(projectScenarioStudioApplication({
    now: "2026-08-26T12:00:00.000Z",
    operator: {
      displayName: "Lulu",
      email: "lulu@example.com",
      role: "admin",
      subject: "studio-operator",
    },
    scenario: "lifecycle",
  }));
  assert.equal("operator" in context, false);
  assert.equal("sourceRevisions" in context, false);

  const modelResponses: LanguageModelV3StreamPart[][] = [
    [
      { type: "stream-start", warnings: [] },
      {
        input: "{}",
        toolCallId: "resolve-studio-request-1",
        toolName: "resolveStudioRequest",
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
    modelId: "studio-ask-zero-provider",
    provider: "local-test",
  });
  const requestSuppliedModel = new MockLanguageModelV3({
    doStream: async () => {
      throw new Error("A request-body model must never become the Ask Studio model dependency.");
    },
    modelId: "request-body-model",
    provider: "untrusted-request",
  });

  const agent = createStudioAssistantAgent(
    { context, model: requestSuppliedModel, query },
    { model },
  );
  const stream = await createAgentUIStream({
    agent,
    sendReasoning: false,
    uiMessages: [{ id: "operator-1", parts: [{ text: query, type: "text" }], role: "user" }],
  });
  const chunks: unknown[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  const streamChunks = chunks.filter(isStreamChunk);

  assert.equal(networkCalls, 0);
  assert.equal(requestSuppliedModel.doStreamCalls.length, 0);
  assert.equal(model.doGenerateCalls.length, 0);
  assert.equal(model.doStreamCalls.length, 2);
  assert.deepEqual(model.doStreamCalls[0].toolChoice, {
    toolName: "resolveStudioRequest",
    type: "tool",
  });
  assert.deepEqual(model.doStreamCalls[1].toolChoice, { type: "none" });
  for (const call of model.doStreamCalls) {
    assert.deepEqual(call.tools?.map((candidate) => candidate.name), ["resolveStudioRequest"]);
    assert.equal(call.maxOutputTokens, 700);
  }

  const toolInputIndex = streamChunks.findIndex((chunk) => chunk.type === "tool-input-available");
  const toolOutputIndex = streamChunks.findIndex((chunk) => chunk.type === "tool-output-available");
  const textStartIndex = streamChunks.findIndex((chunk) => chunk.type === "text-start");
  assert.equal(toolInputIndex >= 0, true);
  assert.equal(toolOutputIndex > toolInputIndex, true);
  assert.equal(textStartIndex > toolOutputIndex, true);
  assert.equal(streamChunks[toolInputIndex].toolName, "resolveStudioRequest");
  assert.deepEqual(streamChunks[toolInputIndex].input, {});
  assert.deepEqual(streamChunks[toolOutputIndex].output, expectedWorkflow);

  const streamedProse = streamChunks
    .filter((chunk) => chunk.type === "text-delta")
    .map((chunk) => typeof chunk.delta === "string" ? chunk.delta : "")
    .join("");
  assert.equal(streamedProse, prose);
  assert.equal(streamedProse.length < 240, true);
  assert.equal(streamChunks.slice(0, toolOutputIndex).some((chunk) => chunk.type === "text-delta"), false);
});
