import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const operatorSource = await readFile(new URL("../lib/server/studio-operator.ts", import.meta.url), "utf8");
const engineSource = await readFile(new URL("../lib/ai/studio-gateway.ts", import.meta.url), "utf8");

test("Studio operator auth is disabled by default and allowlisted server-side", () => {
  assert.match(operatorSource, /mode !== "openai-sites" && mode !== "neon-auth"/);
  assert.match(operatorSource, /getChatGPTUser\(\)/);
  assert.match(operatorSource, /getNeonAuth\(\)\.getSession\(\)/);
  assert.match(operatorSource, /STUDIO_OPERATOR_EMAILS/);
  assert.doesNotMatch(operatorSource, /request\.headers|get\("x-user|authorization.*Bearer/);
});

test("model policy stays server-owned, cost-capped and bounded", () => {
  assert.match(engineSource, /google\/gemini-2\.5-flash-lite/);
  assert.match(engineSource, /google\/gemini-2\.5-flash/);
  assert.match(engineSource, /bfl\/flux-2-klein-4b/);
  assert.match(engineSource, /STUDIO_AI_IMAGE_COST_CAP_USD/);
  assert.match(engineSource, /APPROVED_IMAGE_MODEL_CEILINGS_USD/);
  assert.match(engineSource, /maxRetries: 0/);
  assert.match(engineSource, /Output\.object\(\{ schema: intakeFactsSchema/);
  assert.match(engineSource, /caching: "auto"/);
  assert.match(engineSource, /type: "file"/);
  assert.doesNotMatch(engineSource, /type: "image", image:/);
});
