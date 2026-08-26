import assert from "node:assert/strict";
import test from "node:test";
import { verifyStudioImage } from "../lib/studio/engine/assets";
import {
  commitIntakeSchema,
  createIntakeSchema,
  decisionSchema,
  generateIntakeSchema,
} from "../lib/studio/engine/contracts";
import { StudioEngineError } from "../lib/studio/engine/errors";
import { generationExecutionFingerprint, generationFingerprint } from "../lib/studio/engine/fingerprint";
import { assertIntakeTransition } from "../lib/studio/engine/state";
import { readFile } from "node:fs/promises";

test("browser contracts reject provider, identity and blob controls", () => {
  assert.equal(createIntakeSchema.safeParse({
    kind: "GARMENT",
    sourceMode: "UPLOAD",
    idempotencyKey: "intake:0001",
    model: "paid/model",
    operatorEmail: "spoof@example.com",
    blobPath: "/private/source.png",
  }).success, true);
  const parsed = createIntakeSchema.parse({
    kind: "GARMENT",
    sourceMode: "UPLOAD",
    idempotencyKey: "intake:0001",
    model: "paid/model",
  });
  assert.equal("model" in parsed, false);

  assert.equal(generateIntakeSchema.safeParse({
    expectedVersion: 2,
    operation: "GARMENT_FRONT",
    model: "paid/model",
  }).success, true);
  assert.equal(decisionSchema.safeParse({
    expectedVersion: 3,
    generationId: "11111111-1111-4111-8111-111111111111",
    decision: "KEEP",
  }).success, true);
  assert.equal(commitIntakeSchema.safeParse({
    expectedVersion: 4,
    generationId: "11111111-1111-4111-8111-111111111111",
    facts: {
      title: "Coral shirt",
      category: "Shirt",
      colour: "Coral",
      sizeLabel: "Size on request",
      condition: "Excellent · real-worn wardrobe piece",
      price: 24500,
    },
  }).success, true);
});

test("generation fingerprints are stable, ordered and input-sensitive", () => {
  const base = {
    sourceHashes: ["b", "a"],
    facts: { colour: "coral", category: "Shirt" },
    operation: "GARMENT_FRONT",
    promptVersion: "v1",
    model: "bfl/flux-2-klein-4b",
    parameters: { aspectRatio: "4:5", attempt: 1 },
  };
  const first = generationFingerprint(base);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first, generationFingerprint({
    ...base,
    sourceHashes: ["a", "b"],
    facts: { category: "Shirt", colour: "coral" },
  }));
  assert.notEqual(first, generationFingerprint({
    ...base,
    parameters: { aspectRatio: "4:5", attempt: 2 },
  }));
});

test("execution fingerprints distinguish provider attempts under one semantic operation", () => {
  const semanticFingerprint = generationFingerprint({
    sourceHashes: ["a"],
    facts: { colour: "coral" },
    operation: "GARMENT_FRONT",
    promptVersion: "v1",
    model: "provider/model-a",
    parameters: { aspectRatio: "4:5" },
  });
  const base = {
    semanticFingerprint,
    adapterId: "gateway",
    adapterVersion: "1",
    provider: "provider-a",
    model: "model-a",
    promptHash: "b".repeat(64),
    referencePackingHash: "c".repeat(64),
    parameters: { aspectRatio: "4:5" },
    providerPolicyRevision: "1",
  };
  const first = generationExecutionFingerprint(base);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, generationExecutionFingerprint({ ...base, model: "model-b" }));
});

test("intake transitions fail closed", () => {
  assert.doesNotThrow(() => assertIntakeTransition("DRAFT", "ANALYZING"));
  assert.doesNotThrow(() => assertIntakeTransition("DECISION", "COMMITTED"));
  assert.throws(
    () => assertIntakeTransition("DRAFT", "COMMITTED"),
    (error: unknown) => error instanceof StudioEngineError && error.code === "INVALID_TRANSITION",
  );
});

test("image verifier checks bytes rather than trusting MIME", () => {
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  png.set([0, 0, 0, 32], 16);
  png.set([0, 0, 0, 40], 20);
  assert.deepEqual(verifyStudioImage(png, "image/png"), {
    bytes: png,
    mimeType: "image/png",
    extension: "png",
    width: 32,
    height: 40,
  });
  assert.throws(
    () => verifyStudioImage(png, "image/jpeg"),
    (error: unknown) => error instanceof StudioEngineError && error.code === "INVALID_ASSET",
  );
  assert.throws(() => verifyStudioImage(new TextEncoder().encode("not an image"), "image/png"));
});

test("legacy garment generation retains paid output before applying the cost policy", async () => {
  const service = await readFile(new URL("../lib/studio/engine/service.ts", import.meta.url), "utf8");
  const body = service.slice(service.indexOf("export async function generateStudioCandidate"));
  const accountingPolicy = body.indexOf("const accountingReason = studioPaidAccountingQuarantineReason");
  assert.ok(body.indexOf("persistStudioGenerationProviderResult") < accountingPolicy);
  assert.ok(body.indexOf("checkpointPaidGenerationResult") < accountingPolicy);
  assert.ok(accountingPolicy < body.indexOf("outputAssetId: output.id"));
});
