import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readUIMessageStream } from "ai";
import { createStudioAssistantTools } from "../lib/ai/studio-assistant-agent";
import {
  createDeterministicStudioAssistantStream,
  planDeterministicStudioAssistantTool,
} from "../lib/ai/studio-assistant-deterministic-stream";
import { studioAssistantFocusSchema } from "../lib/studio/assistant/threads";
import {
  STUDIO_ASSISTANT_OPERATION_KINDS,
  STUDIO_ASSISTANT_OPERATION_STATES,
  STUDIO_ASSISTANT_TOOL_NAMES,
  studioAssistantDropMoveInputSchema,
  studioAssistantMediaInputSchema,
  studioAssistantOperationCommandSchema,
  studioAssistantPieceEditInputSchema,
  studioAssistantReferenceInputSchema,
  studioAssistantSearchInputSchema,
  studioAssistantToolNameSchema,
} from "../lib/studio/assistant/tool-contracts";

const root = process.cwd();

function source(path: string) {
  return readFileSync(`${root}/${path}`, "utf8");
}

test("Ask Studio exposes only the bounded typed tool registry and strict inputs", () => {
  const expectedTools = [
    "searchStudio",
    "getPiece",
    "getDrop",
    "getOrder",
    "getInventory",
    "getMedia",
    "getModel",
    "preparePieceEdit",
    "preparePublishRevision",
    "prepareDropMove",
    "prepareArchive",
    "preparePermanentDelete",
  ];
  assert.deepEqual([...STUDIO_ASSISTANT_TOOL_NAMES], expectedTools);
  assert.deepEqual(
    Object.keys(createStudioAssistantTools(async () => {
      throw new Error("This registry test must not execute a tool.");
    })),
    expectedTools,
  );
  assert.deepEqual([...STUDIO_ASSISTANT_OPERATION_KINDS], [
    "PIECE_EDIT",
    "PUBLISH_REVISION",
    "DROP_MOVE",
    "ARCHIVE",
    "PERMANENT_DELETE",
  ]);
  assert.deepEqual([...STUDIO_ASSISTANT_OPERATION_STATES], [
    "PREPARED",
    "EXECUTING",
    "SUCCEEDED",
    "FAILED",
    "CANCELLED",
  ]);
  assert.equal(studioAssistantToolNameSchema.safeParse("resolveStudioRequest").success, false);

  assert.equal(studioAssistantSearchInputSchema.safeParse({ query: "violet" }).success, true);
  assert.equal(studioAssistantSearchInputSchema.safeParse({ query: "violet", unsafe: true }).success, false);
  assert.equal(studioAssistantReferenceInputSchema.safeParse({}).success, true);
  assert.equal(studioAssistantReferenceInputSchema.safeParse({ reference: "" }).success, false);
  assert.equal(studioAssistantMediaInputSchema.safeParse({ pieceReference: "JUW-026" }).success, true);
  assert.equal(studioAssistantPieceEditInputSchema.safeParse({
    changes: {
      description: "A deep-violet beaded mini dress with soft flounces.",
      name: "Violet Beaded Mini Dress",
      price: 30_599,
    },
    reference: "JUW-026",
  }).success, true);
  assert.equal(studioAssistantPieceEditInputSchema.safeParse({ changes: {}, reference: "JUW-026" }).success, false);
  assert.equal(studioAssistantPieceEditInputSchema.safeParse({ changes: { price: -1 }, reference: "JUW-026" }).success, false);
  assert.equal(studioAssistantPieceEditInputSchema.safeParse({ changes: { colour: "violet" }, reference: "JUW-026" }).success, false);
  assert.equal(studioAssistantDropMoveInputSchema.safeParse({ destination: "Drop 01", pieceReference: "JUW-026" }).success, true);
  assert.equal(studioAssistantDropMoveInputSchema.safeParse({ pieceReference: "JUW-026" }).success, false);
});

test("JUW-026 follow-ups inherit focus and writes plan preparation rather than execution", () => {
  assert.deepEqual(
    planDeterministicStudioAssistantTool("What's its description?", "JUW-026"),
    { input: { reference: "JUW-026" }, toolName: "getPiece" },
  );
  assert.deepEqual(
    planDeterministicStudioAssistantTool(
      "Change its description to A deep-violet beaded mini dress with soft flounces.",
      "JUW-026",
    ),
    {
      input: {
        changes: { description: "A deep-violet beaded mini dress with soft flounces." },
        reference: "JUW-026",
      },
      toolName: "preparePieceEdit",
    },
  );
  assert.deepEqual(
    planDeterministicStudioAssistantTool("Change its price to ₦30,599", "JUW-026"),
    {
      input: { changes: { price: 30_599 }, reference: "JUW-026" },
      toolName: "preparePieceEdit",
    },
  );
  assert.deepEqual(
    planDeterministicStudioAssistantTool("Change JUW-025 name to Midnight Trouser Set", "JUW-026"),
    {
      input: { changes: { name: "Midnight Trouser Set" }, reference: "JUW-025" },
      toolName: "preparePieceEdit",
    },
  );
  assert.deepEqual(
    planDeterministicStudioAssistantTool("black cropped tee", "JUW-026"),
    { input: { query: "black cropped tee" }, toolName: "searchStudio" },
  );
  assert.deepEqual(
    planDeterministicStudioAssistantTool("What is Black Cropped Tee's price?", "JUW-026"),
    {
      input: { reference: "What is Black Cropped Tee's price?" },
      toolName: "getPiece",
    },
  );
  assert.deepEqual(
    planDeterministicStudioAssistantTool("Change Black Cropped Tee price to ₦24,500", "JUW-026"),
    {
      input: {
        changes: { price: 24_500 },
        reference: "Change Black Cropped Tee price to ₦24,500",
      },
      toolName: "preparePieceEdit",
    },
  );
  assert.deepEqual(
    planDeterministicStudioAssistantTool("Change the name to Midnight Trouser Set", "JUW-026"),
    {
      input: { changes: { name: "Midnight Trouser Set" } },
      toolName: "preparePieceEdit",
    },
  );
});

test("follow-ups retain typed focus across every read domain", () => {
  assert.deepEqual(
    planDeterministicStudioAssistantTool("What is its status?", "ORD-001", "ORDER"),
    { input: {}, toolName: "getOrder" },
  );
  assert.deepEqual(
    planDeterministicStudioAssistantTool("Tell me more about it", "drop-02", "DROP"),
    { input: {}, toolName: "getDrop" },
  );
  assert.deepEqual(
    planDeterministicStudioAssistantTool("What is its current state?", "lulu-v4", "MODEL"),
    { input: {}, toolName: "getModel" },
  );
  assert.deepEqual(
    planDeterministicStudioAssistantTool("What is its status?", "JUW-026", "INVENTORY"),
    { input: {}, toolName: "getInventory" },
  );
  assert.deepEqual(
    planDeterministicStudioAssistantTool("Tell me more about it", "media-026-front", "MEDIA"),
    { input: {}, toolName: "getMedia" },
  );
  assert.equal(studioAssistantFocusSchema.safeParse({
    canonicalId: "ORD-001",
    entityType: "ORDER",
    label: "ORD-001",
    lastKnownRevision: "4",
    reference: "ORD-001",
    route: "/studio/orders/ORD-001",
    unresolvedCandidates: [],
  }).success, true);
});

test("explicit typed references replace stale same-domain focus", () => {
  assert.deepEqual(
    planDeterministicStudioAssistantTool("Open order ORD-002", "ORD-001", "ORDER"),
    { input: { reference: "ORD-002" }, toolName: "getOrder" },
  );
  assert.deepEqual(
    planDeterministicStudioAssistantTool("Show Drop 02", "drop-01", "DROP"),
    { input: { reference: "Drop 02" }, toolName: "getDrop" },
  );
  assert.deepEqual(
    planDeterministicStudioAssistantTool("Show Lulu V4", "retired-model", "MODEL"),
    { input: { reference: "lulu v4" }, toolName: "getModel" },
  );
});

test("natural write commands target their named piece instead of stale focus", () => {
  const cases = [
    {
      expected: { input: { reference: "JUW-026" }, toolName: "preparePublishRevision" },
      query: "Publish JUW-026",
    },
    {
      expected: {
        input: {
          changes: { name: "Midnight Trouser Set" },
          reference: "Rename Black Cropped Tee and Slim Trouser Set to Midnight Trouser Set",
        },
        toolName: "preparePieceEdit",
      },
      query: "Rename Black Cropped Tee and Slim Trouser Set to Midnight Trouser Set",
    },
    {
      expected: {
        input: { reference: "Archive Black Cropped Tee and Slim Trouser Set" },
        toolName: "prepareArchive",
      },
      query: "Archive Black Cropped Tee and Slim Trouser Set",
    },
    {
      expected: {
        input: { reference: "Permanently delete Violet Beaded Mini Dress" },
        toolName: "preparePermanentDelete",
      },
      query: "Permanently delete Violet Beaded Mini Dress",
    },
    {
      expected: {
        input: {
          destination: "Drop 01",
          pieceReference: "Move Violet Beaded Mini Dress to Drop 01",
        },
        toolName: "prepareDropMove",
      },
      query: "Move Violet Beaded Mini Dress to Drop 01",
    },
  ] as const;

  for (const { expected, query } of cases) {
    assert.deepEqual(
      planDeterministicStudioAssistantTool(query, "JUW-025", "PIECE"),
      expected,
      query,
    );
  }
});

test("pronoun and generic write commands deliberately inherit trusted piece focus", () => {
  const cases = [
    ["Publish the private revision", { input: { reference: "JUW-026" }, toolName: "preparePublishRevision" }],
    ["Rename it to Midnight Trouser Set", {
      input: { changes: { name: "Midnight Trouser Set" }, reference: "JUW-026" },
      toolName: "preparePieceEdit",
    }],
    ["Archive this", { input: { reference: "JUW-026" }, toolName: "prepareArchive" }],
    ["Delete it permanently", { input: { reference: "JUW-026" }, toolName: "preparePermanentDelete" }],
    ["Move this to Drop 01", {
      input: { destination: "Drop 01", pieceReference: "JUW-026" },
      toolName: "prepareDropMove",
    }],
  ] as const;

  for (const [query, expected] of cases) {
    assert.deepEqual(
      planDeterministicStudioAssistantTool(query, "JUW-026", "PIECE"),
      expected,
      query,
    );
  }
});

test("the deterministic stream finalizes the exact claimed assistant response id", async () => {
  const responseId = "assistant-fixed-response-id";
  let finalizedId = "";
  const stream = createDeterministicStudioAssistantStream({
    executeTool: async (tool) => ({
      actions: [],
      generatedAt: "2026-09-02T00:00:00.000Z",
      operation: null,
      outcome: "OK",
      records: [],
      schemaVersion: "juw.studio-assistant-tool.v1",
      summary: "Current Studio truth refreshed.",
      title: "Studio truth",
      tool,
    }),
    onEnd: ({ responseMessage }) => { finalizedId = responseMessage.id; },
    originalMessages: [{ id: "user-1", parts: [{ text: "JUW-026", type: "text" }], role: "user" }],
    query: "JUW-026",
    responseMessageId: responseId,
  });

  for await (const message of readUIMessageStream({ stream })) {
    // Consuming the stream triggers the durable finalization callback.
    void message;
  }
  assert.equal(finalizedId, responseId);
});

test("preparation is isolated from owning-domain execution", () => {
  const agent = source("lib/ai/studio-assistant-agent.ts");
  const askRoute = source("app/api/studio/ask/route.ts");
  const toolService = source("lib/server/studio-assistant-tool-service.ts");
  const operationService = source("lib/server/studio-assistant-operation-service.ts");

  assert.match(agent, /Prepare tools may create only a durable review card; they never mutate a garment/);
  assert.match(agent, /Never say a prepared change has happened/);
  assert.match(toolService, /createOrReuseStudioAssistantOperation/);
  assert.doesNotMatch(toolService, /\brunGarmentLifecycleCommand\b/);
  assert.doesNotMatch(toolService, /\bapplyStudioCollectionCommand\b/);
  assert.doesNotMatch(toolService, /\bpermanentlyDeleteGarment\b/);

  assert.match(operationService, /\brunGarmentLifecycleCommand\b/);
  assert.match(operationService, /\bapplyStudioCollectionCommand\b/);
  assert.match(operationService, /\bpermanentlyDeleteGarment\b/);
  assert.doesNotMatch(askRoute, /confirmStudioAssistantOperation|permanentlyDeleteGarment|runGarmentLifecycleCommand/);
});

test("the operation executor preserves each owning-domain command contract", () => {
  const operationService = source("lib/server/studio-assistant-operation-service.ts");

  assert.match(operationService, /command: "SAVE_FACTS"[\s\S]*?expectedVersion: row\.expectedVersion[\s\S]*?facts: payload\.facts[\s\S]*?idempotencyKey: row\.idempotencyKey/);
  assert.match(operationService, /command: "PUBLISH_REVISION"[\s\S]*?confirmation: confirmation\.confirmation[\s\S]*?expectedRevision: row\.expectedRevision[\s\S]*?idempotencyKey: row\.idempotencyKey[\s\S]*?publicMediaConfirmed: confirmation\.publicMediaConfirmed/);
  assert.match(operationService, /applyStudioCollectionCommand\(\{[\s\S]*?expectedRevision: row\.expectedRevision[\s\S]*?idempotencyKey: row\.idempotencyKey[\s\S]*?intent: payload\.intent/);
  assert.match(operationService, /command: "ARCHIVE"[\s\S]*?confirmation: confirmation\.confirmation[\s\S]*?expectedVersion: row\.expectedVersion[\s\S]*?idempotencyKey: row\.idempotencyKey/);
  assert.match(operationService, /permanentlyDeleteGarment\(\{[\s\S]*?confirmation: confirmation\.confirmation[\s\S]*?expectedVersion: row\.expectedVersion[\s\S]*?idempotencyKey: row\.idempotencyKey/);
  assert.match(operationService, /getGarmentLifecycleCommandReceipt/);
  assert.match(operationService, /getGarmentPublishRevisionReceipt/);
});

test("confirm and cancel are explicit version-guarded commands", () => {
  const operationRoute = source("app/api/studio/ask/operations/[id]/route.ts");
  const surface = source("components/studio/navigation/studio-ask-surface.tsx");

  assert.equal(studioAssistantOperationCommandSchema.safeParse({
    action: "CONFIRM",
    confirmation: "SAVE_PRIVATE_REVISION",
    expectedVersion: 1,
  }).success, true);
  assert.equal(studioAssistantOperationCommandSchema.safeParse({
    action: "CONFIRM",
    confirmation: "PUBLISH_REVISION",
    expectedVersion: 1,
    publicMediaConfirmed: true,
  }).success, true);
  assert.equal(studioAssistantOperationCommandSchema.safeParse({ action: "CANCEL", expectedVersion: 2 }).success, true);
  assert.equal(studioAssistantOperationCommandSchema.safeParse({ action: "RECONCILE", expectedVersion: 2 }).success, true);
  assert.equal(studioAssistantOperationCommandSchema.safeParse({ action: "CONFIRM", expectedVersion: 1 }).success, false);
  assert.equal(studioAssistantOperationCommandSchema.safeParse({ action: "EXECUTE", expectedVersion: 1 }).success, false);
  assert.equal(studioAssistantOperationCommandSchema.safeParse({ action: "CONFIRM", confirmation: "ARCHIVE", expectedVersion: 1, force: true }).success, false);

  assert.match(operationRoute, /parseEngineJson\(request, studioAssistantOperationCommandSchema\)/);
  assert.match(operationRoute, /command\.action === "CONFIRM"/);
  assert.match(operationRoute, /confirmStudioAssistantOperation/);
  assert.match(operationRoute, /cancelPreparedStudioAssistantOperation/);
  assert.match(operationRoute, /persistReconciledStudioAssistantOperation/);
  assert.match(operationRoute, /readStudioAssistantOperation/);
  assert.match(surface, /operationFlightRef\.current/);
  assert.match(surface, /action: "CANCEL",[\s\S]*?expectedVersion: current\.version/);
  assert.match(surface, /action: "RECONCILE",[\s\S]*?expectedVersion: current\.version/);
  assert.match(surface, /function confirmationForOperation/);
  assert.match(surface, /confirmation: "SAVE_PRIVATE_REVISION"/);
  assert.match(surface, /confirmation: "PUBLISH_REVISION"[\s\S]*?publicMediaConfirmed: true/);
  assert.match(surface, /confirmation: "DELETE_PERMANENTLY"/);
});

test("durable identity, single-flight execution, receipts and GET reconciliation prevent replay", () => {
  const toolService = source("lib/server/studio-assistant-tool-service.ts");
  const repository = source("lib/server/studio-assistant-operation-repository.ts");
  const operationService = source("lib/server/studio-assistant-operation-service.ts");
  const toolResult = source("components/studio/navigation/studio-assistant-tool-result.tsx");

  assert.match(toolService, /const requestFingerprint = sha256/);
  assert.match(toolService, /input\.threadId}:\$\{input\.requestMessageId}:\$\{requestFingerprint}/);
  assert.match(toolService, /idempotencyKey: `ask\.\$\{input\.kind\.toLocaleLowerCase/);

  assert.match(repository, /\.onConflictDoNothing\(\)/);
  assert.match(repository, /existing\.requestFingerprint !== input\.requestFingerprint/);
  assert.match(repository, /eq\(studioAssistantOperations\.workspaceId, input\.operator\.workspaceId\)/);
  assert.match(repository, /eq\(studioAssistantOperations\.state, "PREPARED"\)/);
  assert.match(repository, /eq\(studioAssistantOperations\.version, input\.expectedVersion\)/);
  assert.match(repository, /state: "EXECUTING"/);
  assert.match(repository, /current\.state !== "PREPARED"/);
  assert.match(repository, /state: "CANCELLED"/);

  assert.match(operationService, /if \(started\.row\.state === "EXECUTING"\)[\s\S]*?reconcileStudioAssistantOperation/);
  assert.match(operationService, /const reconciled = await inspectOperationReceipt\(started\.row, input\.operator\)/);
  assert.match(operationService, /markStudioAssistantOperationIndeterminate/);
  assert.match(operationService, /row\.state !== "EXECUTING"[\s\S]*?inspectOperationReceipt/);
  assert.match(operationService, /getGarmentLifecycleCommandReceipt/);
  assert.match(operationService, /getStudioCollectionCommandReceipt/);
  assert.match(operationService, /receiptId: row\.idempotencyKey/);
  assert.match(operationService, /outcome: "RECONCILED"/);
  assert.match(toolResult, /operation\.receipt\.receiptId/);
  assert.match(toolResult, /operation\.receipt\.outcome/);
  assert.match(toolResult, /Applying and reconciling/);
});

test("the active Ask entry points contain no legacy mega-resolver", () => {
  const activeEntryPoints = [
    source("lib/ai/studio-assistant-agent.ts"),
    source("lib/ai/studio-assistant-deterministic-stream.ts"),
    source("lib/server/studio-assistant-tool-service.ts"),
    source("app/api/studio/ask/route.ts"),
  ].join("\n");

  assert.doesNotMatch(activeEntryPoints, /resolveStudioRequest/);
  assert.doesNotMatch(activeEntryPoints, /resolveStudioAssistantWorkflow/);
  assert.doesNotMatch(activeEntryPoints, /toolName:\s*["']resolve/);
});

test("conversation history is a mobile bottom sheet and a desktop side island", () => {
  const surface = source("components/studio/navigation/studio-ask-surface.tsx");
  const css = source("app/studio-stack-navigation.css");

  assert.match(surface, /className="studio-ask-history-sheet"/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?body \.studio-ask-history-sheet\.studio-ask-history-sheet \{[\s\S]*?inset: auto 0 0;[\s\S]*?width: 100%;/);
  assert.match(css, /@media \(min-width: 761px\)[\s\S]*?body \.studio-ask-history-sheet\.studio-ask-history-sheet \{[\s\S]*?inset-inline-start:[\s\S]*?min-width: 28rem;/);
});
