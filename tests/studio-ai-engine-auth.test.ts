import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const operatorSource = await readFile(new URL("../lib/server/studio-operator.ts", import.meta.url), "utf8");
const engineSource = await readFile(new URL("../lib/ai/studio-gateway.ts", import.meta.url), "utf8");
const imagePolicySource = await readFile(new URL("../lib/ai/studio-image-policy.ts", import.meta.url), "utf8");
const intakeServiceSource = await readFile(new URL("../lib/studio/engine/service.ts", import.meta.url), "utf8");
const wearServiceSource = await readFile(new URL("../lib/studio/engine/wear-service.ts", import.meta.url), "utf8");

test("Studio operator auth is disabled by default and allowlisted server-side", () => {
  assert.match(operatorSource, /mode !== "openai-sites" && mode !== "neon-auth"/);
  assert.match(operatorSource, /process\.env\.NODE_ENV === "development"/);
  assert.match(operatorSource, /docs\/operations\/LOCAL-ACCESS\.md/);
  assert.doesNotMatch(operatorSource, /approved Studio workspace/i);
  assert.match(operatorSource, /getChatGPTUser\(\)/);
  assert.match(operatorSource, /getNeonAuth\(\)\.getSession\(\)/);
  assert.match(operatorSource, /STUDIO_OPERATOR_EMAILS/);
  assert.doesNotMatch(operatorSource, /request\.headers|get\("x-user|authorization.*Bearer/);
});

test("legacy and media-completion image policies stay isolated and bounded", () => {
  const garmentGeneration = engineSource.slice(
    engineSource.indexOf("export async function generateGarmentFront"),
    engineSource.indexOf("export function buildMediaCompletionPrompt"),
  );
  const mediaCompletionGeneration = engineSource.slice(
    engineSource.indexOf("export async function generateMediaCompletionImage"),
    engineSource.indexOf("export function buildWearPrompt"),
  );
  const wearGeneration = engineSource.slice(
    engineSource.indexOf("export async function generateWearImage"),
  );

  assert.match(engineSource, /google\/gemini-2\.5-flash-lite/);
  assert.match(engineSource, /STUDIO_AI_IMAGE_COST_CAP_USD/);
  assert.match(engineSource, /Output\.object\(\{ schema: intakeFactsSchema/);
  assert.match(engineSource, /caching: "auto"/);
  assert.match(engineSource, /type: "file"/);
  assert.doesNotMatch(engineSource, /type: "image", image:/);

  assert.match(imagePolicySource, /STUDIO_GPT_IMAGE_2_MODEL = "openai\/gpt-image-2"/);
  assert.match(imagePolicySource, /STUDIO_GPT_IMAGE_2_SIZE = "1024x1536"/);
  assert.match(imagePolicySource, /STUDIO_GPT_IMAGE_2_COST_CAP_USD = 0\.10/);
  assert.match(imagePolicySource, /only: \["openai"\]/);
  assert.match(imagePolicySource, /STUDIO_MEDIA_COMPLETION_IMAGE_MODEL = "bfl\/flux-2-klein-4b"/);
  assert.match(imagePolicySource, /STUDIO_MEDIA_COMPLETION_IMAGE_ASPECT_RATIO = "4:5"/);
  assert.match(imagePolicySource, /STUDIO_MEDIA_COMPLETION_IMAGE_COST_CAP_USD = 0\.025/);
  assert.match(imagePolicySource, /STUDIO_MEDIA_COMPLETION_IMAGE_TIMEOUT_MS = 60_000/);
  assert.match(imagePolicySource, /sort: "cost"/);

  for (const legacyGeneration of [garmentGeneration, wearGeneration]) {
    assert.match(legacyGeneration, /model: studioGatewayPolicy\.legacyImageModel/);
    assert.match(legacyGeneration, /size: studioGatewayPolicy\.legacyImageSize/);
    assert.match(legacyGeneration, /maxRetries: 0/);
    assert.match(legacyGeneration, /studioGptImage2ProviderOptions/);
    assert.doesNotMatch(legacyGeneration, /models:\s*\[/);
    assert.doesNotMatch(legacyGeneration, /aspectRatio|studioMediaCompletionProviderOptions/);
  }

  assert.match(mediaCompletionGeneration, /model: studioGatewayPolicy\.imageModel/);
  assert.match(mediaCompletionGeneration, /aspectRatio: studioGatewayPolicy\.imageAspectRatio/);
  assert.match(mediaCompletionGeneration, /maxRetries: 0/);
  assert.match(mediaCompletionGeneration, /AbortSignal\.timeout\(studioGatewayPolicy\.imageTimeoutMs\)/);
  assert.match(mediaCompletionGeneration, /studioMediaCompletionProviderOptions\(\)/);
  assert.doesNotMatch(mediaCompletionGeneration, /legacyImage|studioGptImage2ProviderOptions|size:/);

  for (const legacyService of [intakeServiceSource, wearServiceSource]) {
    assert.match(legacyService, /studioGatewayPolicy\.legacyImageModel/);
    assert.match(legacyService, /studioGatewayPolicy\.legacyImageCostCapUsd/);
    assert.match(legacyService, /studioGatewayPolicy\.legacyImageSize/);
    assert.doesNotMatch(
      legacyService,
      /studioGatewayPolicy\.image(?:Model|CostCapUsd|Size)\b/,
    );
  }
});
