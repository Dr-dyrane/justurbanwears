import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { APICallError } from "ai";
import {
  createStudioGptImage2Adapter,
  STUDIO_GPT_IMAGE_2_MAX_REFERENCES,
  STUDIO_GPT_IMAGE_2_MODEL,
  STUDIO_GPT_IMAGE_2_SIZE,
  STUDIO_GPT_IMAGE_2_TIMEOUT_MS,
  studioGptImage2Capabilities,
  studioGptImage2InvocationSchema,
  type StudioImageGenerator,
} from "../lib/ai/studio-gpt-image-2-gateway";
import { StudioEngineError } from "../lib/studio/engine/errors";
import { StudioGatewayError } from "../lib/ai/studio-gateway";
import {
  STUDIO_GPT_IMAGE_2_COST_CAP_USD,
  studioGptImage2ProviderOptions,
} from "../lib/ai/studio-image-policy";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

test("shared Studio image policy is exact OpenAI-only with no fallback controls", () => {
  const options = studioGptImage2ProviderOptions({ tags: ["studio:test"] });
  assert.deepEqual(options.gateway.only, ["openai"]);
  assert.equal("models" in options.gateway, false);
  assert.equal("order" in options.gateway, false);
  assert.equal("sort" in options.gateway, false);
  assert.equal(options.gateway.zeroDataRetention, false);
  assert.equal(options.openai.quality, "medium");
  assert.equal(options.openai.outputFormat, "jpeg");
  assert.equal(STUDIO_GPT_IMAGE_2_COST_CAP_USD, 0.10);
});

test("full-frame Gateway capabilities exhaustively cover garment 01-04 and Subject A/B", () => {
  assert.deepEqual(studioGptImage2Capabilities.supportedStages, [
    "GARMENT_01_FRONT",
    "GARMENT_02_BACK",
    "GARMENT_03_MANNEQUIN",
    "GARMENT_04_DETAIL",
    "SUBJECT_A",
    "SUBJECT_B",
  ]);
  assert.deepEqual(studioGptImage2InvocationSchema.shape.view.options, [
    "01",
    "02",
    "03",
    "04",
    "SUBJECT",
    "05",
    "06",
    "07",
  ]);
  assert.deepEqual(studioGptImage2Capabilities.supportedOutputModes, [
    "GENERATIVE_GARMENT_MEDIA",
    "GENERATIVE_FULL_FRAME",
  ]);
  assert.deepEqual(studioGptImage2Capabilities.supportedGeneratedArtifactFormats, ["JPEG"]);
  assert.deepEqual(studioGptImage2Capabilities.supportedFinalFormats, ["JPEG"]);
  assert.equal(studioGptImage2Capabilities.supportsRequiredAlpha, false);
});

function invocation() {
  const references = [1, 2, 3, 4].map((value) => {
    const bytes = Uint8Array.from([value, value + 1, value + 2]);
    return {
      slot: `SLOT_${value}`,
      role: `ROLE_${value}`,
      assetId: `asset.${value}`,
      sha256: hash(bytes),
      bytes,
      mimeType: "image/png" as const,
    };
  });
  return {
    executionId: "2bb5c966-e2d7-4f5f-a35b-59385dc08c9a",
    garmentId: "024",
    view: "07" as const,
    operationType: "SIBLING_07_RECOVERY",
    prompt: "Preserve every named authority and create one clean image.",
    references,
    operatorSubject: "private-auth-subject",
    privacy: {
      containsPrivateIdentity: true,
      providerRetentionAcknowledged: true,
      approvalRecordedAt: "2026-08-25T19:30:00-07:00",
    },
  };
}

test("GPT Image 2 adapter preserves four ordered references with no fallback", async () => {
  let captured: Parameters<StudioImageGenerator>[0] | undefined;
  let timeout = 0;
  const generate: StudioImageGenerator = async (request) => {
    captured = request;
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    return {
      image: { uint8Array: bytes, mediaType: "image/jpeg" },
      images: [{ uint8Array: bytes, mediaType: "image/jpeg" }],
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      warnings: [],
      responses: [{
        modelId: STUDIO_GPT_IMAGE_2_MODEL,
        timestamp: new Date("2026-08-26T02:30:00.000Z"),
        headers: { "x-request-id": "req_safe-1" },
      }],
      providerMetadata: { gateway: { cost: "0.062155" } },
    } as Awaited<ReturnType<StudioImageGenerator>>;
  };
  const adapter = createStudioGptImage2Adapter({
    generate,
    timeoutSignal: (milliseconds) => {
      timeout = milliseconds;
      return new AbortController().signal;
    },
    now: (() => {
      const values = [100, 162];
      return () => values.shift() ?? 162;
    })(),
  });
  const result = await adapter.invoke(invocation());

  assert.equal(STUDIO_GPT_IMAGE_2_MAX_REFERENCES, 4);
  assert.equal(captured?.model, STUDIO_GPT_IMAGE_2_MODEL);
  assert.equal(captured?.size, STUDIO_GPT_IMAGE_2_SIZE);
  assert.equal(captured?.aspectRatio, undefined);
  assert.equal(captured?.n, 1);
  assert.equal(captured?.maxRetries, 0);
  assert.equal(timeout, STUDIO_GPT_IMAGE_2_TIMEOUT_MS);
  assert.deepEqual(
    (captured?.prompt as { images: Uint8Array[] }).images.map((bytes) => bytes[0]),
    [1, 2, 3, 4],
  );
  const gateway = captured?.providerOptions?.gateway as Record<string, unknown>;
  assert.deepEqual(gateway.only, ["openai"]);
  assert.equal("models" in gateway, false);
  assert.equal("quotaEntityId" in gateway, false);
  assert.match(String(gateway.user), /^studio-operator:[a-f0-9]{32}$/);
  assert.notEqual(gateway.user, invocation().operatorSubject);
  assert.equal(gateway.zeroDataRetention, false);
  assert.equal((captured?.providerOptions?.openai as Record<string, unknown>).quality, "medium");
  assert.equal(result.costUsd, 0.062155);
  assert.equal(result.requestId, "req_safe-1");
  assert.equal(result.durationMs, 62);
});

test("adapter records non-ZDR capability and blocks unacknowledged private identity", async () => {
  assert.equal(studioGptImage2Capabilities.zeroDataRetention, false);
  assert.equal(studioGptImage2Capabilities.privateIdentityRequiresRecordedConsent, true);
  let called = false;
  const adapter = createStudioGptImage2Adapter({
    generate: async () => {
      called = true;
      throw new Error("should not invoke");
    },
  });
  const input = invocation();
  input.privacy.providerRetentionAcknowledged = false;
  await assert.rejects(
    () => adapter.invoke(input),
    (error: unknown) => error instanceof StudioEngineError && error.code === "INVALID_TRANSITION",
  );
  assert.equal(called, false);
});

test("adapter rejects a changed authority hash before paid invocation", async () => {
  let called = false;
  const adapter = createStudioGptImage2Adapter({
    generate: async () => {
      called = true;
      throw new Error("should not invoke");
    },
  });
  const input = invocation();
  input.references[2].sha256 = "0".repeat(64);
  await assert.rejects(
    () => adapter.invoke(input),
    (error: unknown) => error instanceof StudioEngineError && error.code === "INVALID_ASSET",
  );
  assert.equal(called, false);
});

test("adapter allowlists response metadata and redacts unsafe warnings", async () => {
  const generate: StudioImageGenerator = async () => {
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    return {
      image: { uint8Array: bytes, mediaType: "image/jpeg" },
      images: [{ uint8Array: bytes, mediaType: "image/jpeg" }],
      usage: {},
      warnings: [{ type: "unsupported-setting", setting: "aspectRatio", message: "data:image/png;base64,private" }],
      responses: [{
        modelId: STUDIO_GPT_IMAGE_2_MODEL,
        timestamp: new Date("2026-08-26T02:30:00.000Z"),
        headers: {
          "x-ai-gateway-generation-id": "gen_safe-1",
          "x-request-id": "req_safe-2",
          authorization: "secret",
        },
      }],
      providerMetadata: { gateway: { cost: 0.07, privatePrompt: "secret" } },
    } as Awaited<ReturnType<StudioImageGenerator>>;
  };
  const result = await createStudioGptImage2Adapter({ generate }).invoke(invocation());
  assert.equal(result.gatewayGenerationId, "gen_safe-1");
  assert.equal(result.warnings[0].message, null);
  assert.deepEqual(result.responses[0].headers, {
    "x-ai-gateway-generation-id": "gen_safe-1",
    "x-request-id": "req_safe-2",
  });
  assert.doesNotMatch(JSON.stringify(result), /authorization|privatePrompt|secret|base64/);
});

test("adapter does not invent served-model evidence when the provider omits it", async () => {
  const generate: StudioImageGenerator = async () => {
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    return {
      image: { uint8Array: bytes, mediaType: "image/jpeg" },
      images: [{ uint8Array: bytes, mediaType: "image/jpeg" }],
      usage: {},
      warnings: [],
      responses: [{
        modelId: "",
        timestamp: new Date("2026-08-26T02:30:00.000Z"),
        headers: { "x-request-id": "req_safe-3" },
      }],
      providerMetadata: { gateway: { cost: 0.07 } },
    } as Awaited<ReturnType<StudioImageGenerator>>;
  };

  const result = await createStudioGptImage2Adapter({ generate }).invoke(invocation());

  assert.deepEqual(result.servedModels, []);
  assert.equal(result.responses[0].modelId, null);
});

test("malformed ancillary timestamps cannot hide returned paid image bytes", async () => {
  const paidBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
  const generate: StudioImageGenerator = async () => ({
    image: { uint8Array: paidBytes, mediaType: "image/jpeg" },
    images: [{ uint8Array: paidBytes, mediaType: "image/jpeg" }],
    usage: { totalTokens: 1 },
    warnings: [],
    responses: [{
      modelId: STUDIO_GPT_IMAGE_2_MODEL,
      timestamp: new Date(Number.NaN),
      headers: { "x-request-id": "req_paid-invalid-time" },
    }],
    providerMetadata: { gateway: { cost: "0.07" } },
  }) as Awaited<ReturnType<StudioImageGenerator>>;

  const result = await createStudioGptImage2Adapter({ generate }).invoke(invocation());

  assert.deepEqual(result.images[0]?.bytes, paidBytes);
  assert.equal(result.responses[0]?.timestamp, null);
  assert.equal(result.requestId, "req_paid-invalid-time");
  assert.equal(result.costUsd, 0.07);
});

test("malformed ancillary collections cannot hide returned paid image bytes", async () => {
  const paidBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
  const generate: StudioImageGenerator = async () => ({
    image: { uint8Array: paidBytes, mediaType: "image/jpeg" },
    images: [{ uint8Array: paidBytes, mediaType: "image/jpeg" }],
    usage: { totalTokens: 1 },
    warnings: [null, Object.create(null)],
    responses: [null],
    providerMetadata: { gateway: { cost: "0.07" } },
  }) as Awaited<ReturnType<StudioImageGenerator>>;

  const result = await createStudioGptImage2Adapter({ generate }).invoke(invocation());

  assert.deepEqual(result.images[0]?.bytes, paidBytes);
  assert.deepEqual(result.responses, [{ modelId: null, timestamp: null, headers: {} }]);
  assert.equal(result.warnings.length, 2);
  assert.equal(result.costUsd, 0.07);
});

test("adapter does not coerce absent Gateway accounting to zero", async () => {
  for (const cost of [null, "", "  ", "not-a-cost"] as const) {
    const generate: StudioImageGenerator = async () => {
      const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
      return {
        image: { uint8Array: bytes, mediaType: "image/jpeg" },
        images: [{ uint8Array: bytes, mediaType: "image/jpeg" }],
        usage: {},
        warnings: [],
        responses: [{
          modelId: STUDIO_GPT_IMAGE_2_MODEL,
          timestamp: new Date("2026-08-26T02:30:00.000Z"),
          headers: {},
        }],
        providerMetadata: { gateway: { cost } },
      } as Awaited<ReturnType<StudioImageGenerator>>;
    };

    const result = await createStudioGptImage2Adapter({ generate }).invoke(invocation());
    assert.equal(result.costUsd, null);
  }
});

test("adapter retains sanitized failure accounting, identifiers and duration", async () => {
  const providerError = Object.assign(new Error("provider failed"), {
    name: "GatewayInternalServerError",
    type: "failed_dependency",
    generationId: "gen_failure-safe",
    usage: { inputTokens: 42 },
    providerMetadata: { gateway: { cost: "0.03125" } },
    responseHeaders: { "x-request-id": "req_failure-safe" },
  });
  const adapter = createStudioGptImage2Adapter({
    generate: async () => { throw providerError; },
    now: (() => {
      const values = [100, 175];
      return () => values.shift() ?? 175;
    })(),
  });

  await assert.rejects(
    () => adapter.invoke(invocation()),
    (error: unknown) => {
      assert.ok(error instanceof StudioGatewayError);
      assert.deepEqual(error.accounting, { usage: { inputTokens: 42 }, costUsd: 0.03125 });
      assert.equal(error.upstream.generationId, "gen_failure-safe");
      assert.equal(error.upstream.requestId, "req_failure-safe");
      assert.equal(error.durationMs, 75);
      return true;
    },
  );
});

test("adapter records only coarse output-moderation evidence and keeps SDK retries disabled", async () => {
  const sensitivePrompt = "data:image/png;base64,private-model-and-garment-media";
  const sensitiveProviderMessage = "private prompt and provider explanation must not persist";
  let captured: Parameters<StudioImageGenerator>[0] | undefined;
  const providerError = new APICallError({
    message: sensitiveProviderMessage,
    url: "https://ai-gateway.vercel.sh/v1/ai/image",
    requestBodyValues: {
      prompt: sensitivePrompt,
      authorization: "Bearer private-provider-token",
    },
    statusCode: 400,
    responseHeaders: {
      "x-request-id": "req_moderation-safe-1",
      authorization: "Bearer private-provider-token",
    },
    responseBody: JSON.stringify({
      error: {
        code: "moderation_blocked",
        moderation: {
          phase: "output",
          content_filter_results: {
            sexual: { filtered: true },
            violence: { filtered: false },
            private_prompt_fragment: { filtered: true },
          },
        },
        message: sensitiveProviderMessage,
        prompt: sensitivePrompt,
      },
    }),
    data: {
      error: {
        code: "moderation_blocked",
        details: {
          stage: "output",
          categories: ["sexual", "private_prompt_fragment"],
        },
        message: sensitiveProviderMessage,
      },
    },
    isRetryable: false,
  });
  const adapter = createStudioGptImage2Adapter({
    generate: async (request) => {
      captured = request;
      throw providerError;
    },
  });

  await assert.rejects(
    () => adapter.invoke(invocation()),
    (error: unknown) => {
      assert.ok(error instanceof StudioGatewayError);
      assert.equal(error.upstream.classification, "provider");
      assert.equal(error.upstream.statusCode, 400);
      assert.equal(error.upstream.retryable, false);
      assert.equal(error.upstream.requestId, "req_moderation-safe-1");
      assert.equal(error.upstream.providerCode, "moderation_blocked");
      assert.deepEqual(error.upstream.moderation, {
        stage: "output",
        categories: ["sexual"],
        noOutput: true,
      });
      assert.doesNotMatch(
        JSON.stringify(error.upstream),
        /private-model|private prompt|provider explanation|provider-token|authorization|responseBody|private_prompt_fragment/i,
      );
      return true;
    },
  );
  assert.equal(captured?.maxRetries, 0);
});

test("moderation_blocked without details remains a sanitized known no-output result", async () => {
  const providerError = new APICallError({
    message: "sensitive provider prose",
    url: "https://ai-gateway.vercel.sh/v1/ai/image",
    requestBodyValues: { prompt: "private source prompt" },
    statusCode: 400,
    responseBody: JSON.stringify({
      error: {
        code: "moderation_blocked",
        message: "sensitive response detail",
      },
    }),
    isRetryable: false,
  });
  const adapter = createStudioGptImage2Adapter({
    generate: async () => { throw providerError; },
  });

  await assert.rejects(
    () => adapter.invoke(invocation()),
    (error: unknown) => {
      assert.ok(error instanceof StudioGatewayError);
      assert.equal(error.upstream.providerCode, "moderation_blocked");
      assert.deepEqual(error.upstream.moderation, {
        stage: "unknown",
        categories: [],
        noOutput: true,
      });
      assert.doesNotMatch(
        JSON.stringify(error.upstream),
        /sensitive|private source|response detail/i,
      );
      return true;
    },
  );
});

test("malformed provider bodies and error prose cannot impersonate moderation_blocked", async () => {
  const providerError = new APICallError({
    message: "moderation_blocked private prompt fragment",
    url: "https://ai-gateway.vercel.sh/v1/ai/image",
    requestBodyValues: { prompt: "private prompt fragment" },
    statusCode: 400,
    responseBody: '{"error":{"code":"moderation_blocked","details":',
    data: {
      error: {
        code: "content_policy_violation",
        details: { stage: "output", categories: ["sexual"] },
      },
    },
    isRetryable: false,
  });
  const adapter = createStudioGptImage2Adapter({
    generate: async () => { throw providerError; },
  });

  await assert.rejects(
    () => adapter.invoke(invocation()),
    (error: unknown) => {
      assert.ok(error instanceof StudioGatewayError);
      assert.equal(error.upstream.classification, "provider");
      assert.equal(error.upstream.statusCode, 400);
      assert.equal(error.upstream.providerCode, undefined);
      assert.equal(error.upstream.moderation, undefined);
      assert.doesNotMatch(JSON.stringify(error.upstream), /private prompt|responseBody/i);
      return true;
    },
  );
});
