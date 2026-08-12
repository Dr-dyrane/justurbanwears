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
import { generationFingerprint } from "../lib/studio/engine/fingerprint";
import { assertIntakeTransition } from "../lib/studio/engine/state";

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
  assert.equal(decisionSchema.safeParse({ expectedVersion: 3, decision: "KEEP" }).success, true);
  assert.equal(commitIntakeSchema.safeParse({
    expectedVersion: 4,
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
