import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import {
  createStudioGptImage2TransparentSubjectAdapter,
  STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_ADAPTER,
  STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_ADAPTER_VERSION,
  STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE,
  studioGptImage2TransparentSubjectCapabilities,
} from "../lib/ai/studio-gpt-image-2-subject-layer";
import {
  STUDIO_GPT_IMAGE_2_MODEL,
  STUDIO_GPT_IMAGE_2_SIZE,
  STUDIO_GPT_IMAGE_2_TIMEOUT_MS,
  type StudioImageGenerator,
} from "../lib/ai/studio-gpt-image-2-gateway";
import {
  compositeStudioAtelierSubject,
  inspectStudioAtelierSubjectLayer,
  normalizeStudioAtelierSubjectLayer,
  preflightStudioAtelierSubjectComposite,
  type StudioAtelierHashedImage,
  type StudioAtelierSubjectLayer,
} from "../lib/server/studio-atelier-subject-compositor";
import { STUDIO_ATELIER_ROOM_CANVAS_POLICY_REVISION } from "../lib/studio/atelier/canvas-policy";
import { StudioGatewayError } from "../lib/ai/studio-gateway";
import { StudioEngineError } from "../lib/studio/engine/errors";

const WIDTH = 1024;
const HEIGHT = 1536;

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function invocation() {
  const bytes = Uint8Array.from([1, 2, 3, 4]);
  return {
    executionId: "00000000-0000-4000-8000-000000000091",
    garmentId: "calibration-a",
    view: "SUBJECT" as const,
    operationType: "SUBJECT_A",
    prompt: "Create only the same-canvas full-body subject layer with a transparent background.",
    references: [{
      slot: "AUTHORITY_1",
      role: "GARMENT_FRONT_LOCK",
      assetId: "garment/calibration-a/front",
      sha256: digest(bytes),
      bytes,
      mimeType: "image/png" as const,
    }],
    operatorSubject: "operator-private-test",
    privacy: {
      containsPrivateIdentity: true,
      providerRetentionAcknowledged: true,
      approvalRecordedAt: "2026-08-26T08:00:00.000Z",
    },
  };
}

async function patternedRoom(height = HEIGHT): Promise<Uint8Array> {
  const pixels = new Uint8Array(WIDTH * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const offset = (y * WIDTH + x) * 3;
      pixels[offset] = (x * 5 + y) % 256;
      pixels[offset + 1] = (x + y * 3) % 256;
      pixels[offset + 2] = (x * 2 + y * 7) % 256;
    }
  }
  return new Uint8Array(await sharp(pixels, {
    raw: { width: WIDTH, height, channels: 3 },
  }).png({ compressionLevel: 6 }).toBuffer());
}

async function subjectLayer(): Promise<Uint8Array> {
  const translucent = await sharp({
    create: {
      width: 260,
      height: 700,
      channels: 4,
      background: { r: 210, g: 32, b: 48, alpha: 0.5 },
    },
  }).png().toBuffer();
  const opaque = await sharp({
    create: {
      width: 240,
      height: 680,
      channels: 4,
      background: { r: 220, g: 30, b: 40, alpha: 1 },
    },
  }).png().toBuffer();
  return new Uint8Array(await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite([
    { input: translucent, left: 382, top: 350 },
    { input: opaque, left: 392, top: 360 },
  ]).png().toBuffer());
}

async function rectangleLayer(rectangles: Array<{
  left: number;
  top: number;
  width: number;
  height: number;
  alpha?: number;
}>): Promise<Uint8Array> {
  const overlays = await Promise.all(rectangles.map(async (rectangle) => ({
    input: await sharp({
      create: {
        width: rectangle.width,
        height: rectangle.height,
        channels: 4,
        background: { r: 220, g: 30, b: 40, alpha: rectangle.alpha ?? 1 },
      },
    }).png().toBuffer(),
    left: rectangle.left,
    top: rectangle.top,
  })));
  return new Uint8Array(await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: { r: 27, g: 91, b: 133, alpha: 0 },
    },
  }).composite(overlays).png().toBuffer());
}

async function hiddenRgbSubjectLayer(): Promise<Uint8Array> {
  const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel += 1) {
    const offset = pixel * 4;
    pixels[offset] = 27;
    pixels[offset + 1] = 91;
    pixels[offset + 2] = 133;
    pixels[offset + 3] = 0;
  }
  for (let y = 360; y < 1_040; y += 1) {
    for (let x = 392; x < 632; x += 1) {
      const offset = (y * WIDTH + x) * 4;
      pixels[offset] = 220;
      pixels[offset + 1] = 30;
      pixels[offset + 2] = 40;
      pixels[offset + 3] = 255;
    }
  }
  return new Uint8Array(await sharp(pixels, {
    raw: { width: WIDTH, height: HEIGHT, channels: 4 },
  }).png().toBuffer());
}

async function faintSceneLeakageLayer(): Promise<Uint8Array> {
  const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let y = 20; y < HEIGHT - 20; y += 1) {
    for (let x = 20; x < WIDTH - 20; x += 1) {
      const offset = (y * WIDTH + x) * 4;
      pixels[offset] = 180;
      pixels[offset + 1] = 170;
      pixels[offset + 2] = 160;
      pixels[offset + 3] = 1;
    }
  }
  for (let y = 360; y < 1_040; y += 1) {
    for (let x = 392; x < 632; x += 1) {
      const offset = (y * WIDTH + x) * 4;
      pixels[offset] = 220;
      pixels[offset + 1] = 30;
      pixels[offset + 2] = 40;
      pixels[offset + 3] = 255;
    }
  }
  return new Uint8Array(await sharp(pixels, {
    raw: { width: WIDTH, height: HEIGHT, channels: 4 },
  }).png().toBuffer());
}

function subjectCandidate(bytes: Uint8Array): StudioAtelierSubjectLayer {
  return {
    bytes,
    mimeType: "image/png",
    sha256: digest(bytes),
  };
}

function roomPlate(bytes: Uint8Array): StudioAtelierHashedImage {
  return { bytes, mimeType: "image/png", sha256: digest(bytes) };
}

test("transparent subject adapter preserves exact Gateway policy and accounting", async () => {
  let captured: Parameters<StudioImageGenerator>[0] | undefined;
  let timeout = 0;
  const generate: StudioImageGenerator = async (request) => {
    captured = request;
    const bytes = Uint8Array.from([137, 80, 78, 71]);
    return {
      image: { uint8Array: bytes, mediaType: "image/png" },
      images: [{ uint8Array: bytes, mediaType: "image/png" }],
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      warnings: [],
      responses: [{
        modelId: STUDIO_GPT_IMAGE_2_MODEL,
        timestamp: new Date("2026-08-26T08:00:01.000Z"),
        headers: { "x-request-id": "req-subject-safe" },
      }],
      providerMetadata: { gateway: { cost: "0.062155" } },
    } as Awaited<ReturnType<StudioImageGenerator>>;
  };
  const adapter = createStudioGptImage2TransparentSubjectAdapter({
    generate,
    timeoutSignal: (milliseconds) => {
      timeout = milliseconds;
      return new AbortController().signal;
    },
  });
  const result = await adapter.invoke(invocation());

  assert.equal(captured?.model, STUDIO_GPT_IMAGE_2_MODEL);
  assert.equal(captured?.size, STUDIO_GPT_IMAGE_2_SIZE);
  assert.equal(captured?.n, 1);
  assert.equal(captured?.maxRetries, 0);
  assert.equal(timeout, STUDIO_GPT_IMAGE_2_TIMEOUT_MS);
  const gateway = captured?.providerOptions?.gateway as Record<string, unknown>;
  assert.deepEqual(gateway.only, ["openai"]);
  assert.equal("models" in gateway, false);
  assert.equal("quotaEntityId" in gateway, false);
  const openai = captured?.providerOptions?.openai as Record<string, unknown>;
  assert.equal(openai.quality, "medium");
  assert.equal(openai.outputFormat, "png");
  assert.equal(openai.background, "transparent");
  assert.equal(result.costUsd, 0.062155);
  assert.equal(result.requestId, "req-subject-safe");
  assert.equal(result.images[0]?.mimeType, "image/png");
  assert.equal(adapter.outputProfile, STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE);
  assert.equal(adapter.capabilities.adapterId, STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_ADAPTER);
  assert.equal(
    adapter.capabilities.adapterVersion,
    STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_ADAPTER_VERSION,
  );
  assert.deepEqual(studioGptImage2TransparentSubjectCapabilities.outputFormats, ["image/png"]);
  assert.equal(studioGptImage2TransparentSubjectCapabilities.remoteIdempotency, false);
  assert.equal(studioGptImage2TransparentSubjectCapabilities.zeroDataRetention, false);
  assert.deepEqual(adapter.outputProfile.onlyProviders, ["openai"]);
  assert.deepEqual(adapter.outputProfile.fallbackModels, []);
  assert.equal(adapter.outputProfile.maxRetries, 0);
  assert.equal(adapter.outputProfile.costCapUsd, 0.10);
  assert.equal(adapter.outputProfile.accountingRequired, true);
  assert.equal(adapter.outputProfile.persistRawBeforeAccountingPolicy, true);
});

test("subject inspection requires exact PNG canvas and meaningful alpha before compositing", async () => {
  const valid = subjectCandidate(await subjectLayer());
  const inspection = await inspectStudioAtelierSubjectLayer(valid);
  assert.equal(inspection.width, WIDTH);
  assert.equal(inspection.height, HEIGHT);
  assert.equal(inspection.alpha.bounds.left, 382);
  assert.equal(inspection.alpha.bounds.top, 350);
  assert.equal(inspection.alpha.bounds.width, 260);
  assert.equal(inspection.alpha.bounds.height, 700);
  assert.ok(inspection.alpha.transparentPixelCount > 0);
  assert.ok(inspection.alpha.translucentPixelCount > 0);
  assert.ok(inspection.alpha.opaquePixelCount > 0);
  assert.ok(inspection.alpha.borderConnectedTransparentPixelCount > WIDTH * HEIGHT * 0.15);
  assert.ok(
    inspection.alpha.dominantVisibleComponentPixelCount
      >= inspection.alpha.visiblePixelCount * 0.8,
  );

  const opaqueBytes = new Uint8Array(await sharp({
    create: { width: WIDTH, height: HEIGHT, channels: 3, background: "#f4eee6" },
  }).png().toBuffer());
  await assert.rejects(
    () => inspectStudioAtelierSubjectLayer(subjectCandidate(opaqueBytes)),
    (error: unknown) => error instanceof StudioEngineError && error.code === "INVALID_ASSET",
  );

  const emptyBytes = new Uint8Array(await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).png().toBuffer());
  await assert.rejects(
    () => inspectStudioAtelierSubjectLayer(subjectCandidate(emptyBytes)),
    (error: unknown) => error instanceof StudioEngineError && error.code === "INVALID_ASSET",
  );

  const wrongCanvas = new Uint8Array(await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT - 1,
      channels: 4,
      background: { r: 200, g: 20, b: 30, alpha: 0.5 },
    },
  }).png().toBuffer());
  await assert.rejects(
    () => inspectStudioAtelierSubjectLayer(subjectCandidate(wrongCanvas)),
    (error: unknown) => error instanceof StudioEngineError && error.code === "INVALID_ASSET",
  );

  await assert.rejects(
    () => inspectStudioAtelierSubjectLayer({ ...valid, mimeType: "image/jpeg" } as never),
    (error: unknown) => error instanceof StudioEngineError && error.code === "INVALID_ASSET",
  );

  const jpegBytes = new Uint8Array(await sharp({
    create: { width: WIDTH, height: HEIGHT, channels: 3, background: "#f4eee6" },
  }).jpeg().toBuffer());
  await assert.rejects(
    () => inspectStudioAtelierSubjectLayer({
      bytes: jpegBytes,
      mimeType: "image/png",
      sha256: digest(jpegBytes),
    }),
    (error: unknown) => error instanceof StudioEngineError && error.code === "INVALID_ASSET",
  );
});

test("subject alpha gate rejects trivial, near-opaque, and fragmented layers", async () => {
  const trivial = await rectangleLayer([{ left: 500, top: 700, width: 2, height: 2 }]);
  await assert.rejects(
    () => inspectStudioAtelierSubjectLayer(subjectCandidate(trivial)),
    (error: unknown) => error instanceof StudioEngineError && error.code === "INVALID_ASSET",
  );

  const nearOpaque = await rectangleLayer([{
    left: 10,
    top: 10,
    width: WIDTH - 20,
    height: HEIGHT - 20,
  }]);
  await assert.rejects(
    () => inspectStudioAtelierSubjectLayer(subjectCandidate(nearOpaque)),
    (error: unknown) => error instanceof StudioEngineError && error.code === "INVALID_ASSET",
  );

  const fragmented = await rectangleLayer([{
    left: 240,
    top: 420,
    width: 140,
    height: 620,
  }, {
    left: 644,
    top: 420,
    width: 140,
    height: 620,
  }]);
  await assert.rejects(
    () => inspectStudioAtelierSubjectLayer(subjectCandidate(fragmented)),
    (error: unknown) => error instanceof StudioEngineError && error.code === "INVALID_ASSET",
  );

  const faintScene = await faintSceneLeakageLayer();
  await assert.rejects(
    () => inspectStudioAtelierSubjectLayer(subjectCandidate(faintScene)),
    (error: unknown) => error instanceof StudioEngineError && error.code === "INVALID_ASSET",
  );
});

test("subject normalization zeros hidden RGB and is deterministic", async () => {
  const candidate = subjectCandidate(await hiddenRgbSubjectLayer());
  const sourceRaw = await sharp(candidate.bytes).ensureAlpha().raw().toBuffer();
  assert.deepEqual(Array.from(sourceRaw.subarray(0, 4)), [27, 91, 133, 0]);
  const [first, second] = await Promise.all([
    normalizeStudioAtelierSubjectLayer(candidate),
    normalizeStudioAtelierSubjectLayer(candidate),
  ]);
  assert.equal(first.sha256, second.sha256);
  assert.deepEqual(first.bytes, second.bytes);
  assert.equal(first.sourceSha256, candidate.sha256);
  const raw = await sharp(first.bytes).ensureAlpha().raw().toBuffer();
  assert.deepEqual(Array.from(raw.subarray(0, 4)), [0, 0, 0, 0]);
});

test("room preflight accepts only explicit native canvas profiles", () => {
  assert.doesNotThrow(() => preflightStudioAtelierSubjectComposite({
    mimeType: "image/png",
    sha256: "a".repeat(64),
    width: WIDTH,
    height: HEIGHT,
  }));
  assert.doesNotThrow(() => preflightStudioAtelierSubjectComposite({
    mimeType: "image/png",
    sha256: "b".repeat(64),
    width: 1024,
    height: 1280,
  }, STUDIO_ATELIER_ROOM_CANVAS_POLICY_REVISION));
  assert.throws(
    () => preflightStudioAtelierSubjectComposite({
      mimeType: "image/png",
      sha256: "b".repeat(64),
      width: 1024,
      height: 1280,
    }),
    (error: unknown) => error instanceof StudioEngineError && error.code === "INVALID_ASSET",
  );
  assert.throws(
    () => preflightStudioAtelierSubjectComposite({
      mimeType: "image/png",
      sha256: "c".repeat(64),
      width: 1024,
      height: 1200,
    }, STUDIO_ATELIER_ROOM_CANVAS_POLICY_REVISION),
    (error: unknown) => error instanceof StudioEngineError && error.code === "INVALID_ASSET",
  );
});

test("transparent subject adapter retains sanitized failure accounting", async () => {
  const providerError = Object.assign(new Error("private provider failure"), {
    name: "GatewayInternalServerError",
    type: "failed_dependency",
    generationId: "gen-subject-failure-safe",
    usage: { inputTokens: 42 },
    providerMetadata: { gateway: { cost: "0.03125" } },
    responseHeaders: { "x-request-id": "req-subject-failure-safe" },
  });
  const adapter = createStudioGptImage2TransparentSubjectAdapter({
    generate: async () => { throw providerError; },
    now: (() => {
      const values = [100, 175];
      return () => values.shift() ?? 175;
    })(),
  });

  await assert.rejects(
    () => adapter.invoke(invocation()),
    (error: unknown) => {
      assert.ok(error instanceof StudioGatewayError);
      assert.deepEqual(error.accounting, { usage: { inputTokens: 42 }, costUsd: 0.03125 });
      assert.equal(error.upstream.generationId, "gen-subject-failure-safe");
      assert.equal(error.upstream.requestId, "req-subject-failure-safe");
      assert.equal(error.durationMs, 75);
      return true;
    },
  );
});

test("Sharp composite is deterministic and preserves every unoccluded room pixel", async () => {
  const room = roomPlate(await patternedRoom());
  const subject = subjectCandidate(await subjectLayer());
  const [first, second] = await Promise.all([
    compositeStudioAtelierSubject({ room, subject }),
    compositeStudioAtelierSubject({ room, subject }),
  ]);

  assert.equal(first.sha256, second.sha256);
  assert.deepEqual(first.bytes, second.bytes);
  assert.equal(first.sources.roomSha256, room.sha256);
  assert.equal(first.sources.subjectSha256, subject.sha256);
  assert.equal(first.preservation.roomPixelsGenerated, 0);
  assert.equal(first.preservation.unoccludedPixelsPreserved, true);
  assert.equal(
    first.preservation.unoccludedPixelCount,
    first.alpha.transparentPixelCount,
  );

  const [roomRaw, subjectRaw, outputRaw, outputMetadata] = await Promise.all([
    sharp(room.bytes).removeAlpha().raw().toBuffer(),
    sharp(subject.bytes).ensureAlpha().raw().toBuffer(),
    sharp(first.bytes).removeAlpha().raw().toBuffer(),
    sharp(first.bytes).metadata(),
  ]);
  assert.equal(outputMetadata.format, "png");
  assert.equal(outputMetadata.width, WIDTH);
  assert.equal(outputMetadata.height, HEIGHT);

  let compared = 0;
  for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel += 1) {
    if (subjectRaw[pixel * 4 + 3] !== 0) continue;
    const offset = pixel * 3;
    assert.equal(outputRaw[offset], roomRaw[offset]);
    assert.equal(outputRaw[offset + 1], roomRaw[offset + 1]);
    assert.equal(outputRaw[offset + 2], roomRaw[offset + 2]);
    compared += 1;
  }
  assert.equal(compared, first.preservation.unoccludedPixelCount);

  const visibleCenter = (640 * WIDTH + 480) * 3;
  assert.deepEqual(Array.from(outputRaw.subarray(visibleCenter, visibleCenter + 3)), [220, 30, 40]);
});

test("native 4:5 profile copies the guarded subject window 1:1 over the exact room", async () => {
  const room = roomPlate(await patternedRoom(1280));
  const subject = subjectCandidate(await subjectLayer());
  const [first, second] = await Promise.all([
    compositeStudioAtelierSubject({ room, subject }),
    compositeStudioAtelierSubject({ room, subject }),
  ]);

  assert.equal(first.sha256, second.sha256);
  assert.deepEqual(first.bytes, second.bytes);
  assert.equal(first.width, 1024);
  assert.equal(first.height, 1280);
  assert.equal(first.canvasPolicyRevision, STUDIO_ATELIER_ROOM_CANVAS_POLICY_REVISION);
  assert.equal(first.canvasProfile.profileId, "atelier-room-native-4x5-center-window-v1");
  assert.deepEqual(first.canvasProfile.subjectWindow, {
    left: 0, top: 128, width: 1024, height: 1280,
  });
  assert.equal(first.canvasProfile.transparentGuardPixels, 16);
  assert.equal(first.canvasProfile.pixelMapping, "EXACT_1_TO_1_WINDOW_COPY");
  assert.equal(first.preservation.roomPixelsGenerated, 0);

  const [roomRaw, subjectRaw, outputRaw, outputMetadata] = await Promise.all([
    sharp(room.bytes).removeAlpha().raw().toBuffer(),
    sharp(subject.bytes).ensureAlpha().raw().toBuffer(),
    sharp(first.bytes).removeAlpha().raw().toBuffer(),
    sharp(first.bytes).metadata(),
  ]);
  assert.equal(outputMetadata.width, 1024);
  assert.equal(outputMetadata.height, 1280);
  let compared = 0;
  for (let y = 0; y < 1280; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const outputPixel = y * WIDTH + x;
      const subjectPixel = (y + 128) * WIDTH + x;
      if (subjectRaw[subjectPixel * 4 + 3] !== 0) continue;
      const offset = outputPixel * 3;
      assert.equal(outputRaw[offset], roomRaw[offset]);
      assert.equal(outputRaw[offset + 1], roomRaw[offset + 1]);
      assert.equal(outputRaw[offset + 2], roomRaw[offset + 2]);
      compared += 1;
    }
  }
  assert.equal(compared, first.preservation.unoccludedPixelCount);
});

test("native 4:5 profile accepts the exact guarded window boundaries", async () => {
  const room = roomPlate(await patternedRoom(1280));
  const boundarySafe = subjectCandidate(await rectangleLayer([
    { left: 392, top: 360, width: 240, height: 680 },
    { left: 16, top: 360, width: 1, height: 1, alpha: 1 / 255 },
    { left: 1007, top: 360, width: 1, height: 1, alpha: 1 / 255 },
    { left: 500, top: 144, width: 1, height: 1, alpha: 1 / 255 },
    { left: 500, top: 1391, width: 1, height: 1, alpha: 1 / 255 },
  ]));

  const composite = await compositeStudioAtelierSubject({ room, subject: boundarySafe });

  assert.equal(composite.width, 1024);
  assert.equal(composite.height, 1280);
  assert.equal(composite.canvasProfile.profileId, "atelier-room-native-4x5-center-window-v1");
});

test("native 4:5 profile rejects even one faint-alpha pixel outside the guarded window", async () => {
  const room = roomPlate(await patternedRoom(1280));
  const unsafePixels = [
    { left: 15, top: 360 },
    { left: 1008, top: 360 },
    { left: 500, top: 127 },
    { left: 500, top: 143 },
    { left: 500, top: 1392 },
    { left: 500, top: 1408 },
  ];

  for (const pixel of unsafePixels) {
    const unsafe = subjectCandidate(await rectangleLayer([
      { left: 392, top: 360, width: 240, height: 680 },
      { ...pixel, width: 1, height: 1, alpha: 1 / 255 },
    ]));
    await assert.rejects(
      () => compositeStudioAtelierSubject({ room, subject: unsafe }),
      (error: unknown) => error instanceof StudioEngineError
        && error.code === "INVALID_ASSET"
        && /safe window/i.test(error.message),
      `expected (${pixel.left}, ${pixel.top}) to fail the native-room safe window`,
    );
  }
});

test("compositor rejects a changed room hash before any transform", async () => {
  const room = roomPlate(await patternedRoom());
  const subject = subjectCandidate(await subjectLayer());
  await assert.rejects(
    () => compositeStudioAtelierSubject({
      room: { ...room, sha256: "0".repeat(64) },
      subject,
    }),
    (error: unknown) => error instanceof StudioEngineError && error.code === "INVALID_ASSET",
  );
});

test("the deterministic composite is materialized before review from the exact subject candidate", async () => {
  const candidate = subjectCandidate(await subjectLayer());
  const room = roomPlate(await patternedRoom());
  const inspection = await inspectStudioAtelierSubjectLayer({
    bytes: candidate.bytes,
    mimeType: candidate.mimeType,
    sha256: candidate.sha256,
  });
  assert.ok(inspection.alpha.visiblePixelCount > 0);

  const composite = await compositeStudioAtelierSubject({ room, subject: candidate });
  assert.equal(composite.sources.subjectSha256, candidate.sha256);
  assert.equal(composite.sources.roomSha256, room.sha256);
});
