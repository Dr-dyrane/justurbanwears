import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const operatorSource = await readFile(new URL("../lib/server/studio-operator.ts", import.meta.url), "utf8");
const engineSource = await readFile(new URL("../lib/ai/studio-gateway.ts", import.meta.url), "utf8");

test("Studio operator auth is disabled by default and allowlisted server-side", () => {
  assert.match(operatorSource, /STUDIO_AI_ENGINE_AUTH_MODE !== "openai-sites"/);
  assert.match(operatorSource, /getChatGPTUser\(\)/);
  assert.match(operatorSource, /STUDIO_OPERATOR_EMAILS/);
  assert.doesNotMatch(operatorSource, /request\.headers|get\("x-user|authorization.*Bearer/);
});

test("model policy stays server-owned, cost-capped and bounded", () => {
  assert.match(engineSource, /zai\/glm-4\.6v-flash/);
  assert.match(engineSource, /bfl\/flux-2-klein-4b/);
  assert.match(engineSource, /STUDIO_AI_IMAGE_COST_CAP_USD/);
  assert.match(engineSource, /APPROVED_IMAGE_MODEL_CEILINGS_USD/);
  assert.match(engineSource, /maxRetries: 0/);
  assert.match(engineSource, /gateway: \{ caching: "auto", sort: "cost" \}/);
});
