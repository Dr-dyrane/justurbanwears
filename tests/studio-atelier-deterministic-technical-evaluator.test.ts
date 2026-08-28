import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import {
  evaluateStudioAtelierDeterministicTechnicalQuality,
  normalizeStudioAtelierOpaqueReviewArtifact,
  STUDIO_ATELIER_OPAQUE_NORMALIZATION_REVISION,
  type StudioAtelierTechnicalArtifactBinding,
} from "../lib/server/studio-atelier-deterministic-technical-evaluator";
import {
  compositeStudioAtelierSubject,
  type StudioAtelierHashedImage,
  type StudioAtelierSubjectLayer,
} from "../lib/server/studio-atelier-subject-compositor";
import { evaluatorFixtureOperation } from "./helpers/studio-atelier-evaluator-fixtures";

const WIDTH = 1024;
const PROVIDER_HEIGHT = 1536;
const ROOM_HEIGHT = 1280;
const EVALUATED_AT = "2026-08-27T18:00:00.000Z";

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function binding(
  bytes: Uint8Array,
  input: Omit<StudioAtelierTechnicalArtifactBinding, "sha256" | "byteSize">,
): StudioAtelierTechnicalArtifactBinding {
  return Object.freeze({
    ...input,
    sha256: digest(bytes),
    byteSize: bytes.byteLength,
  });
}

async function opaqueSource(red = 72): Promise<Uint8Array> {
  return new Uint8Array(await sharp({
    create: {
      width: WIDTH,
      height: PROVIDER_HEIGHT,
      channels: 3,
      background: { r: red, g: 108, b: 144 },
    },
  }).jpeg({ quality: 88 }).toBuffer());
}

async function roomPlate(): Promise<StudioAtelierHashedImage> {
  const bytes = new Uint8Array(await sharp({
    create: {
      width: WIDTH,
      height: ROOM_HEIGHT,
      channels: 3,
      background: { r: 229, g: 221, b: 207 },
    },
  }).png().toBuffer());
  return Object.freeze({ bytes, mimeType: "image/png" as const, sha256: digest(bytes) });
}

async function subjectLayer(spillOutsideGuard = false): Promise<StudioAtelierSubjectLayer> {
  const body = await sharp({
    create: {
      width: 240,
      height: 680,
      channels: 4,
      background: { r: 160, g: 36, b: 52, alpha: 1 },
    },
  }).png().toBuffer();
  const composites: sharp.OverlayOptions[] = [{ input: body, left: 392, top: 360 }];
  if (spillOutsideGuard) {
    const spill = await sharp({
      create: {
        width: 8,
        height: 16,
        channels: 4,
        background: { r: 160, g: 36, b: 52, alpha: 1 },
      },
    }).png().toBuffer();
    composites.push({ input: spill, left: 8, top: 200 });
  }
  const bytes = new Uint8Array(await sharp({
    create: {
      width: WIDTH,
      height: PROVIDER_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(composites).png().toBuffer());
  return Object.freeze({ bytes, mimeType: "image/png" as const, sha256: digest(bytes) });
}

test("opaque evaluator proves deterministic bytes but cannot manufacture technical PASS", async () => {
  const source = await opaqueSource();
  const artifactBytes = await normalizeStudioAtelierOpaqueReviewArtifact(source);
  const artifact = binding(artifactBytes, {
    kind: "NORMALIZED",
    mimeType: "image/jpeg",
    width: WIDTH,
    height: PROVIDER_HEIGHT,
  });
  const input = {
    evaluatedAt: EVALUATED_AT,
    operation: evaluatorFixtureOperation("GARMENT_01_FRONT"),
    artifactBytes,
    artifact,
    reviewedArtifact: artifact,
    materialization: {
      kind: "OPAQUE_NORMALIZED" as const,
      normalizationRevision: STUDIO_ATELIER_OPAQUE_NORMALIZATION_REVISION,
      source: {
        bytes: source,
        sha256: digest(source),
        byteSize: source.byteLength,
        mimeType: "image/jpeg" as const,
      },
    },
  };

  const first = await evaluateStudioAtelierDeterministicTechnicalQuality(input);
  const second = await evaluateStudioAtelierDeterministicTechnicalQuality(input);
  assert.equal(first.status, "INDETERMINATE");
  assert.equal(first.productionPass, false);
  assert.deepEqual(first.blockerCodes, []);
  assert.equal(first.checks.canonicalNormalization.decision, "SATISFIED");
  assert.equal(first.checks.exactByteHash.decision, "SATISFIED");
  assert.equal(first.checks.exactContainerType.decision, "SATISFIED");
  assert.equal(first.checks.exactDimensions.decision, "SATISFIED");
  assert.equal(first.checks.colourSpace.decision, "SATISFIED");
  assert.equal(first.checks.reviewedByteIdentity.decision, "SATISFIED");
  assert.equal(first.checks.renderedText.decision, "INDETERMINATE");
  assert.equal(first.checks.watermark.decision, "INDETERMINATE");
  assert.equal(first.evaluationHash, second.evaluationHash);
});

test("opaque evaluator blocks hash, size, normalization and reviewed-byte tampering", async () => {
  const source = await opaqueSource();
  const otherSource = await opaqueSource(73);
  const artifactBytes = await normalizeStudioAtelierOpaqueReviewArtifact(otherSource);
  const exact = binding(artifactBytes, {
    kind: "NORMALIZED",
    mimeType: "image/jpeg",
    width: WIDTH,
    height: PROVIDER_HEIGHT,
  });
  const evidence = await evaluateStudioAtelierDeterministicTechnicalQuality({
    evaluatedAt: EVALUATED_AT,
    operation: evaluatorFixtureOperation("GARMENT_01_FRONT"),
    artifactBytes,
    artifact: { ...exact, sha256: digest(source), byteSize: exact.byteSize + 1 },
    reviewedArtifact: exact,
    materialization: {
      kind: "OPAQUE_NORMALIZED",
      normalizationRevision: STUDIO_ATELIER_OPAQUE_NORMALIZATION_REVISION,
      source: {
        bytes: source,
        sha256: digest(source),
        byteSize: source.byteLength,
        mimeType: "image/jpeg",
      },
    },
  });
  assert.equal(evidence.status, "BLOCKED");
  assert.equal(evidence.productionPass, false);
  assert.equal(evidence.checks.exactByteHash.decision, "BLOCKED");
  assert.equal(evidence.checks.exactByteSize.decision, "BLOCKED");
  assert.equal(evidence.checks.canonicalNormalization.decision, "BLOCKED");
  assert.equal(evidence.checks.reviewedByteIdentity.decision, "BLOCKED");
});

test("opaque evaluator blocks container and decoded-dimension declaration mismatches", async () => {
  const source = await opaqueSource();
  const artifactBytes = await normalizeStudioAtelierOpaqueReviewArtifact(source);
  const lie = binding(artifactBytes, {
    kind: "NORMALIZED",
    mimeType: "image/png",
    width: WIDTH - 1,
    height: PROVIDER_HEIGHT,
  });
  const evidence = await evaluateStudioAtelierDeterministicTechnicalQuality({
    evaluatedAt: EVALUATED_AT,
    operation: evaluatorFixtureOperation("GARMENT_01_FRONT"),
    artifactBytes,
    artifact: lie,
    reviewedArtifact: lie,
    materialization: {
      kind: "OPAQUE_NORMALIZED",
      normalizationRevision: STUDIO_ATELIER_OPAQUE_NORMALIZATION_REVISION,
      source: {
        bytes: source,
        sha256: digest(source),
        byteSize: source.byteLength,
        mimeType: "image/jpeg",
      },
    },
  });
  assert.equal(evidence.status, "BLOCKED");
  assert.equal(evidence.checks.exactContainerType.decision, "BLOCKED");
  assert.equal(evidence.checks.exactDimensions.decision, "BLOCKED");
  assert.equal(evidence.checks.outputContract.decision, "BLOCKED");
});

test("composite evaluator replays exact 4:5 room bytes and guarded subject placement", async () => {
  const room = await roomPlate();
  const subject = await subjectLayer();
  const composite = await compositeStudioAtelierSubject({ room, subject });
  const artifact = binding(composite.bytes, {
    kind: "COMPOSITE",
    mimeType: "image/png",
    width: WIDTH,
    height: ROOM_HEIGHT,
  });
  const evidence = await evaluateStudioAtelierDeterministicTechnicalQuality({
    evaluatedAt: EVALUATED_AT,
    operation: evaluatorFixtureOperation("ROOM_FINAL_05"),
    artifactBytes: composite.bytes,
    artifact,
    reviewedArtifact: artifact,
    materialization: { kind: "DETERMINISTIC_COMPOSITE", room, subject },
  });
  assert.equal(evidence.status, "INDETERMINATE");
  assert.equal(evidence.productionPass, false);
  assert.equal(evidence.checks.sourceLayerAlpha.decision, "SATISFIED");
  assert.equal(evidence.checks.nativeRoomGuard.decision, "SATISFIED");
  assert.equal(evidence.checks.deterministicComposite.decision, "SATISFIED");
  assert.equal(evidence.checks.roomPreservation.decision, "SATISFIED");
  assert.equal(evidence.checks.reviewedByteIdentity.decision, "SATISFIED");
});

test("composite evaluator blocks any nonzero alpha outside the guarded native-room window", async () => {
  const room = await roomPlate();
  const subject = await subjectLayer(true);
  const safeSubject = await subjectLayer();
  const composite = await compositeStudioAtelierSubject({ room, subject: safeSubject });
  const artifact = binding(composite.bytes, {
    kind: "COMPOSITE",
    mimeType: "image/png",
    width: WIDTH,
    height: ROOM_HEIGHT,
  });
  const evidence = await evaluateStudioAtelierDeterministicTechnicalQuality({
    evaluatedAt: EVALUATED_AT,
    operation: evaluatorFixtureOperation("ROOM_FINAL_05"),
    artifactBytes: composite.bytes,
    artifact,
    reviewedArtifact: artifact,
    materialization: { kind: "DETERMINISTIC_COMPOSITE", room, subject },
  });
  assert.equal(evidence.status, "BLOCKED");
  assert.equal(evidence.checks.nativeRoomGuard.decision, "BLOCKED");
  assert.equal(evidence.checks.deterministicComposite.decision, "BLOCKED");
  assert.equal(evidence.checks.roomPreservation.decision, "BLOCKED");
});

test("composite evaluator blocks a different room or different reviewed composite", async () => {
  const room = await roomPlate();
  const differentRoomBytes = new Uint8Array(await sharp({
    create: {
      width: WIDTH,
      height: ROOM_HEIGHT,
      channels: 3,
      background: { r: 228, g: 221, b: 207 },
    },
  }).png().toBuffer());
  const differentRoom: StudioAtelierHashedImage = {
    bytes: differentRoomBytes,
    mimeType: "image/png",
    sha256: digest(differentRoomBytes),
  };
  const subject = await subjectLayer();
  const composite = await compositeStudioAtelierSubject({ room, subject });
  const artifact = binding(composite.bytes, {
    kind: "COMPOSITE",
    mimeType: "image/png",
    width: WIDTH,
    height: ROOM_HEIGHT,
  });
  const evidence = await evaluateStudioAtelierDeterministicTechnicalQuality({
    evaluatedAt: EVALUATED_AT,
    operation: evaluatorFixtureOperation("ROOM_FINAL_05"),
    artifactBytes: composite.bytes,
    artifact,
    reviewedArtifact: { ...artifact, sha256: digest(subject.bytes) },
    materialization: {
      kind: "DETERMINISTIC_COMPOSITE",
      room: differentRoom,
      subject,
    },
  });
  assert.equal(evidence.status, "BLOCKED");
  assert.equal(evidence.checks.canonicalNormalization.decision, "BLOCKED");
  assert.equal(evidence.checks.deterministicComposite.decision, "BLOCKED");
  assert.equal(evidence.checks.roomPreservation.decision, "BLOCKED");
  assert.equal(evidence.checks.reviewedByteIdentity.decision, "BLOCKED");
});
