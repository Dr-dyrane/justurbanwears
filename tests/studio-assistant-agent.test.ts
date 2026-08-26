import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createStudioAssistantAgent } from "../lib/ai/studio-assistant-agent";
import { studioAssistantContextFromProjection } from "../lib/studio/assistant/projection";
import type { StudioApplicationProjection } from "../lib/studio/application/contracts";

const root = process.cwd();

const projection: StudioApplicationProjection = {
  capabilities: [
    { id: "PROJECTION", state: "AVAILABLE" },
    { id: "ASK_READ", state: "AVAILABLE" },
  ],
  collectionScopes: [],
  continueAction: {
    href: "/studio/wardrobe/private-001",
    id: "continue:piece",
    label: "Continue Coral Drift Dress",
    openCount: 1,
    source: "CONNECTED",
  },
  degradedSources: [],
  generatedAt: "2026-08-26T12:00:00.000Z",
  mode: { kind: "CONNECTED" },
  operator: {
    displayName: "Studio operator",
    role: "operator",
    storageScope: "1000000000000000000000000000000000000000000000000000000000000000",
  },
  projectionVersion: "studio-application/v1",
  searchDocuments: [{
    aliases: ["JUW-001"],
    id: "piece:piece-001",
    kind: "PIECE",
    lifecycleState: "PRIVATE",
    primaryLabel: "Coral Drift Dress",
    route: "/studio/wardrobe/private-001",
    secondaryLabel: "Dress · Coral",
  }],
  sourceRevisions: [],
  summary: {
    attention: { asOf: null, source: "CONNECTED", value: 1 },
    available: { asOf: null, source: "CONNECTED", value: 0 },
    live: { asOf: null, source: "CONNECTED", value: 0 },
    orders: { asOf: null, source: "CONNECTED", value: 0 },
  },
};

test("the assistant context is a sanitized projection with canonical media targets", () => {
  const context = studioAssistantContextFromProjection(projection);
  assert.equal(context.provenance.status, "connected");
  assert.equal(context.continueAction?.href, "/studio/wardrobe/private-001");
  assert.equal(context.documents[0].mediaTargetId, "private-001");
  assert.equal(context.documents[0].identifiers.includes("JUW-001"), true);
  assert.equal("operator" in context, false);
  assert.equal("sourceRevisions" in context, false);
  assert.equal("degradedSources" in context, false);
});

test("the per-request agent exposes only the read-only Studio resolver", () => {
  const context = studioAssistantContextFromProjection(projection);
  const agent = createStudioAssistantAgent({ context, query: "What needs attention?" });
  const settings = agent as unknown as { tools: Record<string, unknown> };
  assert.deepEqual(Object.keys(settings.tools), ["resolveStudioRequest"]);
});

test("the Ask route owns auth, projection, sanitization and stream bounds", () => {
  const route = readFileSync(`${root}/app/api/studio/ask/route.ts`, "utf8");
  const agent = readFileSync(`${root}/lib/ai/studio-assistant-agent.ts`, "utf8");
  const surface = readFileSync(`${root}/components/studio/navigation/studio-ask-surface.tsx`, "utf8");

  assert.match(route, /requireStudioOperator\(\)/);
  assert.match(route, /getStudioApplicationProjection\(operator\)/);
  assert.match(route, /projectScenarioStudioApplication/);
  assert.match(route, /\.strict\(\)/);
  assert.match(route, /safeTextMessage/);
  assert.match(route, /\.slice\(-8\)/);
  assert.match(route, /\.slice\(0, 1_200\)/);
  assert.match(route, /sendReasoning: false/);
  assert.match(route, /totalMs: 30_000/);
  assert.doesNotMatch(route, /input\.context|body\.context/);

  assert.match(agent, /process\.env\.STUDIO_ASK_MODEL \|\| "openai\/gpt-5\.4"/);
  assert.match(agent, /stepNumber === 0/);
  assert.match(agent, /toolName: "resolveStudioRequest"/);
  assert.match(agent, /stopWhen: isStepCount\(3\)/);
  assert.doesNotMatch(agent, /\bgenerateImage\s*\(|\bgenerateText\s*\(|\bcommitIntake\s*\(|\bapplyCommand\s*\(/);

  assert.match(surface, /requestTextMessages\(messages\)/);
  assert.match(surface, /part\.type === "text"/);
  assert.match(surface, /part\.type !== "tool-resolveStudioRequest"/);
  assert.match(surface, /pendingRef/);
  assert.match(surface, /flightRef/);
});
