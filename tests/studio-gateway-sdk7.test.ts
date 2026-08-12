import assert from "node:assert/strict";
import test from "node:test";
import { APICallError, InvalidPromptError } from "ai";
import {
  sanitizeStudioGatewayFailure,
  StudioGatewayError,
} from "../lib/ai/studio-gateway";

test("Studio analysis uses the AI SDK 7 file content part", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../lib/ai/studio-gateway.ts", import.meta.url), "utf8")
  );
  assert.match(source, /type: "file"/);
  assert.match(source, /mediaType,/);
  assert.match(source, /data: \{ type: "url", url: new URL\(sourceDataUrl\) \}/);
  assert.doesNotMatch(source, /type: "image", image:/);
});

test("sanitized Gateway diagnostics distinguish validation from provider failures", () => {
  const privatePrompt = "data:image/webp;base64,private-source-payload";
  const validation = sanitizeStudioGatewayFailure(
    "analysis",
    "zai/glm-4.6v-flash",
    new InvalidPromptError({ prompt: privatePrompt, message: "bad prompt" }),
  );
  assert.deepEqual(validation, {
    stage: "analysis",
    classification: "validation",
    model: "zai/glm-4.6v-flash",
    errorNames: ["AI_InvalidPromptError"],
    statusCode: null,
    gatewayType: null,
    generationId: null,
    requestId: null,
    retryable: null,
  });
  assert.doesNotMatch(JSON.stringify(validation), /private-source-payload/);

  const apiError = new APICallError({
    message: "provider rejected request",
    url: "https://ai-gateway.vercel.sh/v1/ai/language-model",
    requestBodyValues: { image: privatePrompt, authorization: "secret" },
    statusCode: 424,
    responseHeaders: {
      "x-request-id": "req_safe-123",
      authorization: "secret",
    },
    responseBody: JSON.stringify({ privatePrompt, key: "secret" }),
    isRetryable: false,
  });
  const provider = sanitizeStudioGatewayFailure("analysis", "zai/glm-4.6v-flash", apiError);
  assert.equal(provider.classification, "provider");
  assert.equal(provider.statusCode, 424);
  assert.equal(provider.requestId, "req_safe-123");
  assert.equal(provider.retryable, false);
  assert.doesNotMatch(JSON.stringify(provider), /private-source-payload|authorization|secret|responseBody/);

  const retryError = Object.assign(new Error("retry exhausted"), {
    name: "AI_RetryError",
    lastError: apiError,
    errors: [apiError],
  });
  const retriedProvider = sanitizeStudioGatewayFailure("analysis", "zai/glm-4.6v-flash", retryError);
  assert.equal(retriedProvider.classification, "provider");
  assert.equal(retriedProvider.statusCode, 424);
  assert.deepEqual(retriedProvider.errorNames, ["AI_RetryError", "AI_APICallError"]);
  assert.doesNotMatch(JSON.stringify(retriedProvider), /private-source-payload|authorization|secret|responseBody/);
});

test("Studio Gateway error keeps diagnostics off the public engine error shape", () => {
  const failure = sanitizeStudioGatewayFailure("analysis", "zai/glm-4.6v-flash", new Error("private detail"));
  const error = new StudioGatewayError("Could not read.", "Try again.", failure);
  assert.equal(error.code, "GENERATION_FAILED");
  assert.equal(error.status, 502);
  assert.equal(error.upstream.classification, "unknown");
  assert.deepEqual(
    { code: error.code, message: error.message, recovery: error.recovery },
    { code: "GENERATION_FAILED", message: "Could not read.", recovery: "Try again." },
  );
});
