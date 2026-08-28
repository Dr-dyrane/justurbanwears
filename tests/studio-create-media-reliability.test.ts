import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createMediaIntent,
  createMediaIntentStorageKey,
  createMediaWearPayload,
  executeCreateMediaCommand,
  isUuid,
  persistCreateMediaIntent,
  readCreateMediaIntent,
  resolveCreateMediaModel,
  runCreateMediaSingleFlight,
} from "../components/shoot/create-media-client";
import type { WearGeneration, WearWorkspace } from "../components/studio/garment-intake/wear-client";
import { createWearGenerationSchema } from "../lib/studio/engine/contracts";

const REQUEST_ID = "10000000-0000-4000-8000-000000000001";
const MODEL_ID = "20000000-0000-4000-8000-000000000002";
const ARCHIVED_MODEL_ID = "30000000-0000-4000-8000-000000000003";
const WARDROBE_ID = "40000000-0000-4000-8000-000000000004";
const GENERATION_ID = "50000000-0000-4000-8000-000000000005";
const OPERATOR_SCOPE = "a".repeat(64);
const OTHER_OPERATOR_SCOPE = "b".repeat(64);

function generation(overrides: Partial<WearGeneration> = {}): WearGeneration {
  return {
    id: GENERATION_ID,
    requestId: REQUEST_ID,
    operation: "MODEL_TRY_ON",
    state: "PENDING",
    modelProfileId: MODEL_ID,
    parentGenerationId: null,
    outputAssetId: null,
    outputUrl: null,
    retryAvailable: false,
    requiresReconciliation: false,
    decisionReceipt: null,
    createdAt: "2026-08-26T00:00:00.000Z",
    ...overrides,
  };
}

function workspace(generations: WearGeneration[]): WearWorkspace {
  return {
    wardrobeItemId: WARDROBE_ID,
    intakeId: "60000000-0000-4000-8000-000000000006",
    title: "Private garment",
    garmentAssetUrl: "/api/studio/private/garment",
    models: [],
    generations,
    missingViews: ["GARMENT_BACK", "FABRIC_DETAIL"],
    publicationState: "PRIVATE_DRAFT",
  };
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

test("a model deep link preserves the exact authority without promising an unavailable paid action", () => {
  const models = [
    { id: MODEL_ID, name: "Exact model", kind: "AUTHORIZED_STOCK" as const, state: "READY" as const },
    { id: ARCHIVED_MODEL_ID, name: "Archived", kind: "LULU_V3" as const, state: "ARCHIVED" as const },
  ];
  const selected = resolveCreateMediaModel(models, MODEL_ID);
  assert.equal(selected.kind, "selected");
  if (selected.kind !== "selected") return;

  const intent = createMediaIntent({
    requestId: REQUEST_ID,
    wardrobeItemId: WARDROBE_ID,
    operation: "MODEL_TRY_ON",
    modelProfileId: selected.model.id,
  });
  assert.deepEqual(createMediaWearPayload(intent), {
    requestId: REQUEST_ID,
    operation: "MODEL_TRY_ON",
    modelProfileId: MODEL_ID,
  });

  const composer = readFileSync(`${process.cwd()}/components/shoot/shoot-composer.tsx`, "utf8");
  const modelAtelier = readFileSync(`${process.cwd()}/components/studio/model-atelier.tsx`, "utf8");
  assert.match(composer, /searchParams\.get\("model"\)/);
  assert.match(composer, /setOperation\("MODEL_TRY_ON"\)[\s\S]*setModelProfileId\(requestedModel\.model\.id\)/);
  assert.match(composer, /Model<\/span><strong>\{selectedModel\?\.name/);
  assert.match(composer, /On-model photos are not available yet\. Choose On mannequin to create a garment-only view without using a private identity photo\./);
  assert.match(composer, /operation !== "MANNEQUIN_FRONT"/);
  assert.match(composer, /operation: "MANNEQUIN_FRONT"/);
  assert.match(composer, /operation === "MANNEQUIN_FRONT" \? \(/);
  assert.match(composer, /<strong>On model<\/strong><small>Not available yet<\/small>/);
  assert.doesNotMatch(composer, /onClick=\{\(\) => \{\s*setOperation\("MODEL_TRY_ON"\)/);
  assert.match(modelAtelier, /<strong>Review media readiness<\/strong>/);
  assert.match(modelAtelier, /Approved for Studio reference/);
  assert.doesNotMatch(modelAtelier, /Create with \{selected\.name\}|Ready for try-ons/);
});

test("a missing saved model intent can only be checked, never resumed into a new paid call", () => {
  const composer = readFileSync(`${process.cwd()}/components/shoot/shoot-composer.tsx`, "utf8");
  assert.match(composer, /modelIntentCannotResume = pendingIntent\?\.operation === "MODEL_TRY_ON"/);
  assert.match(composer, /busy \|\| modelIntentCannotResume \? undefined/);
  assert.match(composer, /if \(intent\.operation === "MODEL_TRY_ON"\) \{[\s\S]*MODEL_TRY_ON_ZERO_SPEND_BLOCKER[\s\S]*return;/);
  assert.match(composer, /modelIntentCannotResume \? "Model try-on unavailable"/);
});

test("unknown, malformed, and archived model links fail closed without substitution", () => {
  const models = [
    { id: MODEL_ID, name: "Ready", kind: "LULU_V3" as const, state: "READY" as const },
    { id: ARCHIVED_MODEL_ID, name: "Archived", kind: "AUTHORIZED_STOCK" as const, state: "ARCHIVED" as const },
  ];
  assert.equal(resolveCreateMediaModel(models, "not-a-uuid").kind, "invalid");
  assert.equal(resolveCreateMediaModel(models, ARCHIVED_MODEL_ID).kind, "invalid");
  assert.equal(resolveCreateMediaModel(models, "70000000-0000-4000-8000-000000000007").kind, "invalid");

  const composer = readFileSync(`${process.cwd()}/components/shoot/shoot-composer.tsx`, "utf8");
  assert.match(composer, /invalidRequestedModel/);
  assert.match(composer, /Studio did not substitute another model/);
  assert.match(composer, /disabled=\{controlsLocked/);
  assert.doesNotMatch(composer, /fetch\(/);
});

test("Create Media acquires a synchronous single-flight before the first await", async () => {
  const guard = { current: false };
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const first = runCreateMediaSingleFlight(guard, async () => {
    calls += 1;
    await gate;
    return "finished";
  });
  const duplicate = runCreateMediaSingleFlight(guard, async () => {
    calls += 1;
    return "duplicate";
  });

  assert.equal(await duplicate, undefined);
  assert.equal(calls, 1);
  release();
  assert.equal(await first, "finished");
  assert.equal(guard.current, false);
});

test("Create Media emits only schema-valid Wear payload fields", () => {
  const modelPayload = createMediaWearPayload(createMediaIntent({
    requestId: REQUEST_ID,
    wardrobeItemId: WARDROBE_ID,
    operation: "MODEL_TRY_ON",
    modelProfileId: MODEL_ID,
  }));
  const mannequinPayload = createMediaWearPayload(createMediaIntent({
    requestId: REQUEST_ID,
    wardrobeItemId: WARDROBE_ID,
    operation: "MANNEQUIN_FRONT",
    modelProfileId: MODEL_ID,
  }));

  assert.equal(createWearGenerationSchema.safeParse(modelPayload).success, true);
  assert.equal(createWearGenerationSchema.safeParse(mannequinPayload).success, true);
  assert.deepEqual(Object.keys(modelPayload).sort(), ["modelProfileId", "operation", "requestId"]);
  assert.deepEqual(Object.keys(mannequinPayload).sort(), ["operation", "requestId"]);
});

test("Create Media creates and persists its UUID intent before command dispatch", () => {
  const storage = memoryStorage();
  const intent = createMediaIntent({
    wardrobeItemId: WARDROBE_ID,
    operation: "MANNEQUIN_FRONT",
  });
  assert.equal(isUuid(intent.requestId), true);
  persistCreateMediaIntent(intent, OPERATOR_SCOPE, storage);
  assert.deepEqual(readCreateMediaIntent(OPERATOR_SCOPE, storage), intent);
  assert.equal(readCreateMediaIntent(OTHER_OPERATOR_SCOPE, storage), undefined);
  assert.match(createMediaIntentStorageKey(OPERATOR_SCOPE), new RegExp(`${OPERATOR_SCOPE}$`));

  const composer = readFileSync(`${process.cwd()}/components/shoot/shoot-composer.tsx`, "utf8");
  const submitAt = composer.indexOf("async function submit");
  const persistAt = composer.indexOf("persistCreateMediaIntent(intent, operatorScope);", submitAt);
  const dispatchAt = composer.indexOf("executeCreateMediaCommand(intent);", persistAt);
  assert.ok(submitAt >= 0);
  assert.ok(persistAt >= 0);
  assert.ok(dispatchAt > persistAt);
});

test("a lost response recovers the persisted exact intent with one command and a read-only projection check", async () => {
  const storage = memoryStorage();
  const intent = createMediaIntent({
    requestId: REQUEST_ID,
    wardrobeItemId: WARDROBE_ID,
    operation: "MODEL_TRY_ON",
    modelProfileId: MODEL_ID,
  });
  persistCreateMediaIntent(intent, OPERATOR_SCOPE, storage);
  const reloadedIntent = readCreateMediaIntent(OPERATOR_SCOPE, storage);
  assert.deepEqual(reloadedIntent, intent);

  let commandCalls = 0;
  let readCalls = 0;
  const durableWorkspace = workspace([generation()]);
  const result = await executeCreateMediaCommand(reloadedIntent!, {
    async generate(wardrobeItemId, payload) {
      commandCalls += 1;
      assert.equal(wardrobeItemId, WARDROBE_ID);
      assert.deepEqual(payload, {
        requestId: REQUEST_ID,
        operation: "MODEL_TRY_ON",
        modelProfileId: MODEL_ID,
      });
      throw Object.assign(new Error("response lost"), { status: 0 });
    },
    async read(wardrobeItemId) {
      readCalls += 1;
      assert.equal(wardrobeItemId, WARDROBE_ID);
      return { workspace: durableWorkspace };
    },
  });

  assert.equal(commandCalls, 1);
  assert.equal(readCalls, 1);
  assert.equal(result.kind, "resolved");
  if (result.kind === "resolved") {
    assert.equal(result.reconciled, true);
    assert.equal(result.generation.requestId, REQUEST_ID);
    assert.equal(result.generation.modelProfileId, MODEL_ID);
  }
});

test("an authoritative missing request remains bound to the same request key for explicit resume", async () => {
  const intent = createMediaIntent({
    requestId: REQUEST_ID,
    wardrobeItemId: WARDROBE_ID,
    operation: "MANNEQUIN_FRONT",
  });
  let commandCalls = 0;
  let readCalls = 0;
  const result = await executeCreateMediaCommand(intent, {
    async generate() {
      commandCalls += 1;
      throw Object.assign(new Error("response lost"), { status: 0 });
    },
    async read() {
      readCalls += 1;
      return { workspace: workspace([]) };
    },
  });

  assert.equal(commandCalls, 1);
  assert.equal(readCalls, 1);
  assert.equal(result.kind, "unconfirmed");
  if (result.kind === "unconfirmed") assert.equal(result.resolution, "MISSING");

  const composer = readFileSync(`${process.cwd()}/components/shoot/shoot-composer.tsx`, "utf8");
  assert.match(composer, /Resume saved request/);
  assert.match(composer, /resumeSavedIntent\(pendingIntent\)/);
  assert.doesNotMatch(composer, /clearCreateMediaIntent\(pendingIntent/);
});

test("a definitive command rejection does not add a recovery read waterfall", async () => {
  const intent = createMediaIntent({
    requestId: REQUEST_ID,
    wardrobeItemId: WARDROBE_ID,
    operation: "MANNEQUIN_FRONT",
  });
  let readCalls = 0;
  const result = await executeCreateMediaCommand(intent, {
    async generate() {
      throw Object.assign(new Error("invalid garment"), { status: 400 });
    },
    async read() {
      readCalls += 1;
      return { workspace: workspace([]) };
    },
  });

  assert.equal(result.kind, "rejected");
  assert.equal(readCalls, 0);
});
