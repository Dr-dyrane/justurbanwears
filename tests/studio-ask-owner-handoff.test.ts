import assert from "node:assert/strict";
import test from "node:test";
import type { StudioApplicationProjection } from "../lib/studio/application/contracts";
import { resolveStudioAssistantWorkflow } from "../lib/studio/assistant/experience";
import { studioAssistantContextFromProjection } from "../lib/studio/assistant/projection";
import { resolveExactOrderHandoffPiece } from "../lib/studio/orders/ask-order-handoff";

const generatedAt = "2026-08-27T12:00:00.000Z";

const projection: StudioApplicationProjection = {
  projectionVersion: "studio-application/v1",
  generatedAt,
  mode: { kind: "CONNECTED" },
  operator: {
    displayName: "Lulu",
    role: "admin",
    storageScope: "operator-test-scope",
  },
  sourceRevisions: [],
  summary: {
    attention: { value: 0, asOf: generatedAt, source: "CONNECTED" },
    available: { value: 1, asOf: generatedAt, source: "CONNECTED" },
    drafts: { value: 0, asOf: generatedAt, source: "CONNECTED" },
    live: { value: 1, asOf: generatedAt, source: "CONNECTED" },
    orders: { value: 0, asOf: generatedAt, source: "CONNECTED" },
  },
  continueAction: null,
  collectionScopes: [],
  searchDocuments: [{
    availableActions: ["CREATE_ORDER"],
    aliases: ["JUW-001", "coral-drift-dress"],
    id: "sku:JUW-001",
    kind: "PIECE",
    lifecycleState: "READY",
    primaryLabel: "Coral Drift Dress",
    route: "/studio/wardrobe/coral-drift-dress",
    secondaryLabel: "Available for a customer order",
  }],
  capabilities: [
    { id: "PROJECTION", state: "AVAILABLE" },
    { id: "SEARCH", state: "AVAILABLE" },
    { id: "ASK_READ", state: "AVAILABLE" },
    { id: "ORDERS_READ", state: "AVAILABLE" },
    { id: "ORDERS_CREATE", state: "AVAILABLE" },
  ],
  degradedSources: [],
};

const orderableProducts = Object.freeze([
  Object.freeze({ slug: "coral-drift-dress", sku: "JUW-001", name: "Coral Drift Dress" }),
  Object.freeze({ slug: "indigo-wrap-dress", sku: "JUW-002", name: "Indigo Wrap Dress" }),
]);

test("Ask order CTA resolves the exact owning product from a sanitized projection", () => {
  const context = studioAssistantContextFromProjection(projection);
  const workflow = resolveStudioAssistantWorkflow(
    "Create a customer order for JUW-001",
    context,
  );
  const handoff = workflow.response.blocks.find((block) => block.kind === "handoff");

  assert.ok(handoff && handoff.kind === "handoff");
  const target = new URL(handoff.action.href, "https://studio.invalid");
  assert.equal(target.pathname, "/studio/orders");
  assert.equal(target.searchParams.get("action"), "create");
  assert.equal(target.searchParams.get("piece"), "JUW-001");
  assert.equal(
    resolveExactOrderHandoffPiece(orderableProducts, target.searchParams.get("piece")),
    orderableProducts[0],
  );
});

test("exact order handoff matching trims and compares slug or SKU case-insensitively", () => {
  assert.equal(resolveExactOrderHandoffPiece(orderableProducts, "  juw-001  "), orderableProducts[0]);
  assert.equal(
    resolveExactOrderHandoffPiece(orderableProducts, " CORAL-DRIFT-DRESS "),
    orderableProducts[0],
  );
});

test("unknown or ambiguous Ask order targets fail closed without mutating products", () => {
  const ambiguous = Object.freeze([
    Object.freeze({ slug: "coral-drift-dress", sku: "JUW-001" }),
    Object.freeze({ slug: "juw-001", sku: "JUW-099" }),
  ]);
  const original = JSON.stringify(ambiguous);

  assert.equal(resolveExactOrderHandoffPiece(orderableProducts, "JUW-999"), null);
  assert.equal(resolveExactOrderHandoffPiece(orderableProducts, "   "), null);
  assert.equal(resolveExactOrderHandoffPiece(ambiguous, "JUW-001"), null);
  assert.equal(JSON.stringify(ambiguous), original);
});
