import { createHash } from "node:crypto";
import sharp from "sharp";
import { STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE } from "../ai/studio-gpt-image-2-subject-layer";
import { StudioEngineError } from "../studio/engine/errors";

export const STUDIO_ATELIER_SUBJECT_COMPOSITE_REVISION =
  "sharp-alpha-over-room-v1" as const;
export const STUDIO_ATELIER_SUBJECT_NORMALIZATION_REVISION =
  "transparent-rgb-zero-png-v1" as const;

const OUTPUT_WIDTH = STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE.width;
const OUTPUT_HEIGHT = STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE.height;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PIXEL_COUNT = OUTPUT_WIDTH * OUTPUT_HEIGHT;
const MIN_BORDER_BACKGROUND_PIXELS = Math.ceil(PIXEL_COUNT * 0.15);
const MIN_VISIBLE_PIXELS = Math.ceil(PIXEL_COUNT * 0.01);
const MAX_VISIBLE_PIXELS = Math.floor(PIXEL_COUNT * 0.85);
const MIN_VISIBLE_BOUND_WIDTH = Math.ceil(OUTPUT_WIDTH * 0.05);
const MIN_VISIBLE_BOUND_HEIGHT = Math.ceil(OUTPUT_HEIGHT * 0.30);
const MIN_DOMINANT_VISIBLE_RATIO = 0.80;
const MIN_OPAQUE_VISIBLE_RATIO = 0.05;
const MATERIAL_ALPHA_THRESHOLD = 16;
const MAX_FAINT_ALPHA_PIXELS = Math.floor(PIXEL_COUNT * 0.01);

type SupportedImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export type StudioAtelierHashedImage = Readonly<{
  bytes: Uint8Array;
  mimeType: SupportedImageMimeType;
  sha256: string;
}>;

export type StudioAtelierSubjectLayer = StudioAtelierHashedImage & Readonly<{
  mimeType: "image/png";
}>;

export type StudioAtelierImageDescriptor = Readonly<{
  mimeType: SupportedImageMimeType;
  sha256: string;
  width: number;
  height: number;
}>;

export type StudioAtelierSubjectLayerInspection = Readonly<{
  mimeType: "image/png";
  width: number;
  height: number;
  channels: 4;
  alpha: Readonly<{
    transparentPixelCount: number;
    translucentPixelCount: number;
    opaquePixelCount: number;
    visiblePixelCount: number;
    materialVisiblePixelCount: number;
    faintAlphaPixelCount: number;
    borderConnectedTransparentPixelCount: number;
    dominantVisibleComponentPixelCount: number;
    bounds: Readonly<{
      left: number;
      top: number;
      width: number;
      height: number;
    }>;
  }>;
}>;

type DecodedImage = Readonly<{
  data: Uint8Array;
  width: number;
  height: number;
  channels: 4;
}>;

type SharpMetadata = Readonly<{
  format?: string;
  width?: number;
  height?: number;
  orientation?: number;
}>;

type SharpRawInfo = Readonly<{
  width: number;
  height: number;
  channels: number;
}>;

interface StudioAtelierSharpPipeline {
  metadata(): Promise<SharpMetadata>;
  ensureAlpha(): StudioAtelierSharpPipeline;
  removeAlpha(): StudioAtelierSharpPipeline;
  raw(): StudioAtelierSharpPipeline;
  composite(overlays: Array<{
    input: Uint8Array;
    raw: { width: number; height: number; channels: 4 };
    left: number;
    top: number;
    blend: "over";
  }>): StudioAtelierSharpPipeline;
  png(options: {
    compressionLevel: number;
    adaptiveFiltering: boolean;
    palette: boolean;
    effort: number;
  }): StudioAtelierSharpPipeline;
  toBuffer(): Promise<Buffer>;
  toBuffer(options: { resolveWithObject: true }): Promise<{
    data: Buffer;
    info: SharpRawInfo;
  }>;
}

const createImagePipeline = sharp as unknown as (
  input: Uint8Array,
  options?: {
    failOn?: "error";
    raw?: { width: number; height: number; channels: 3 | 4 };
  },
) => StudioAtelierSharpPipeline;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function invalidAsset(message: string, recovery: string): never {
  throw new StudioEngineError("INVALID_ASSET", 422, message, recovery);
}

/** Fail before a paid call when the locked room cannot accept this profile. */
export function preflightStudioAtelierSubjectComposite(
  room: StudioAtelierImageDescriptor,
): void {
  if (
    !SHA256_PATTERN.test(room.sha256)
    || !["image/jpeg", "image/png", "image/webp"].includes(room.mimeType)
    || !Number.isSafeInteger(room.width)
    || !Number.isSafeInteger(room.height)
    || room.width !== OUTPUT_WIDTH
    || room.height !== OUTPUT_HEIGHT
  ) {
    invalidAsset(
      `The locked room is not an exact ${OUTPUT_WIDTH}x${OUTPUT_HEIGHT} compositing authority.`,
      "Approve and hash a same-canvas room authority; never resize, crop, pad or extend the locked room implicitly.",
    );
  }
}

function assertHash(label: string, image: StudioAtelierHashedImage): void {
  if (!SHA256_PATTERN.test(image.sha256) || sha256(image.bytes) !== image.sha256) {
    invalidAsset(
      `The ${label} bytes do not match their declared hash.`,
      `Restore the exact approved ${label} before compositing.`,
    );
  }
}

function expectedSharpFormat(mimeType: SupportedImageMimeType): "jpeg" | "png" | "webp" {
  if (mimeType === "image/jpeg") return "jpeg";
  if (mimeType === "image/png") return "png";
  return "webp";
}

async function decodeExactCanvas(
  label: string,
  image: StudioAtelierHashedImage,
): Promise<DecodedImage> {
  assertHash(label, image);
  let metadata: SharpMetadata;
  try {
    metadata = await createImagePipeline(image.bytes, { failOn: "error" }).metadata();
  } catch {
    invalidAsset(
      `The ${label} is not a decodable image.`,
      `Restore a valid ${image.mimeType} ${label}.`,
    );
  }
  if (metadata.format !== expectedSharpFormat(image.mimeType)) {
    invalidAsset(
      `The ${label} MIME declaration does not match its bytes.`,
      `Restore the correctly declared ${label}.`,
    );
  }
  if (metadata.width !== OUTPUT_WIDTH || metadata.height !== OUTPUT_HEIGHT) {
    invalidAsset(
      `The ${label} is not on the ${OUTPUT_WIDTH}x${OUTPUT_HEIGHT} Atelier canvas.`,
      `Render the ${label} on the exact declared canvas without resizing it here.`,
    );
  }
  if (metadata.orientation !== undefined && metadata.orientation !== 1) {
    invalidAsset(
      `The ${label} has unresolved orientation metadata.`,
      `Normalize and re-approve the ${label} before compositing.`,
    );
  }
  try {
    const decoded = await createImagePipeline(image.bytes, { failOn: "error" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (
      decoded.info.width !== OUTPUT_WIDTH
      || decoded.info.height !== OUTPUT_HEIGHT
      || decoded.info.channels !== 4
    ) {
      invalidAsset(
        `The ${label} decoded geometry is invalid.`,
        `Restore the exact ${OUTPUT_WIDTH}x${OUTPUT_HEIGHT} ${label}.`,
      );
    }
    return Object.freeze({
      data: new Uint8Array(decoded.data),
      width: decoded.info.width,
      height: decoded.info.height,
      channels: 4,
    });
  } catch (error) {
    if (error instanceof StudioEngineError) throw error;
    invalidAsset(
      `The ${label} pixels could not be decoded.`,
      `Restore a valid ${label} before compositing.`,
    );
  }
}

function inspectAlpha(subject: DecodedImage): StudioAtelierSubjectLayerInspection["alpha"] {
  let transparentPixelCount = 0;
  let translucentPixelCount = 0;
  let opaquePixelCount = 0;
  let faintAlphaPixelCount = 0;
  let materialVisiblePixelCount = 0;
  let left: number = OUTPUT_WIDTH;
  let top: number = OUTPUT_HEIGHT;
  let right = -1;
  let bottom = -1;

  for (let offset = 3, pixel = 0; offset < subject.data.length; offset += 4, pixel += 1) {
    const alpha = subject.data[offset];
    if (alpha === 0) {
      transparentPixelCount += 1;
      continue;
    }
    if (alpha === 255) opaquePixelCount += 1;
    else translucentPixelCount += 1;
    if (alpha < MATERIAL_ALPHA_THRESHOLD) {
      faintAlphaPixelCount += 1;
      continue;
    }
    materialVisiblePixelCount += 1;
    const x = pixel % OUTPUT_WIDTH;
    const y = Math.floor(pixel / OUTPUT_WIDTH);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }

  const visiblePixelCount = translucentPixelCount + opaquePixelCount;
  if (transparentPixelCount === 0) {
    invalidAsset(
      "The subject layer has no transparent background pixels.",
      "Generate a transparent PNG subject layer, not an opaque scene.",
    );
  }
  if (visiblePixelCount === 0) {
    invalidAsset(
      "The subject layer is completely transparent.",
      "Generate one visible full-body subject on the transparent canvas.",
    );
  }
  if (opaquePixelCount === 0) {
    invalidAsset(
      "The subject layer has no fully opaque subject pixels.",
      "Generate a solid subject interior with transparency limited to the background and antialiased edges.",
    );
  }
  if (faintAlphaPixelCount > MAX_FAINT_ALPHA_PIXELS) {
    invalidAsset(
      "The subject layer contains excessive faint-alpha pixels outside material subject coverage.",
      "Remove low-opacity room, shadow or scene leakage and keep only narrow antialiased subject edges.",
    );
  }

  const cornerPixels = [
    0,
    OUTPUT_WIDTH - 1,
    (OUTPUT_HEIGHT - 1) * OUTPUT_WIDTH,
    PIXEL_COUNT - 1,
  ];
  if (cornerPixels.some((pixel) => subject.data[pixel * 4 + 3] !== 0)) {
    invalidAsset(
      "The subject layer reaches a canvas corner.",
      "Return one isolated subject with a border-connected transparent background.",
    );
  }

  const borderConnectedTransparentPixelCount = largestComponent(subject, false, true);
  if (borderConnectedTransparentPixelCount < MIN_BORDER_BACKGROUND_PIXELS) {
    invalidAsset(
      "The subject layer has too little border-connected transparent background.",
      "Remove generated room or scene pixels and keep the subject isolated on transparency.",
    );
  }
  if (
    materialVisiblePixelCount < MIN_VISIBLE_PIXELS
    || materialVisiblePixelCount > MAX_VISIBLE_PIXELS
  ) {
    invalidAsset(
      "The subject layer visible occupancy is outside the safe technical range.",
      "Generate one meaningful isolated subject, not a trivial mark or an almost-opaque scene.",
    );
  }
  if (opaquePixelCount / materialVisiblePixelCount < MIN_OPAQUE_VISIBLE_RATIO) {
    invalidAsset(
      "The subject layer contains too little solid subject interior.",
      "Keep transparency to the background and antialiased edges, not the whole subject.",
    );
  }

  const boundsWidth = right - left + 1;
  const boundsHeight = bottom - top + 1;
  if (boundsWidth < MIN_VISIBLE_BOUND_WIDTH || boundsHeight < MIN_VISIBLE_BOUND_HEIGHT) {
    invalidAsset(
      "The subject layer visible bounds are too small for a full-body candidate.",
      "Generate one complete same-canvas subject; identity and body shape remain semantic review concerns.",
    );
  }

  const dominantVisibleComponentPixelCount = largestComponent(subject, true, false);
  if (
    dominantVisibleComponentPixelCount / materialVisiblePixelCount
      < MIN_DOMINANT_VISIBLE_RATIO
  ) {
    invalidAsset(
      "The subject layer is fragmented into unrelated visible regions.",
      "Return one connected subject layer without scattered scene fragments or alpha noise.",
    );
  }

  return Object.freeze({
    transparentPixelCount,
    translucentPixelCount,
    opaquePixelCount,
    visiblePixelCount,
    materialVisiblePixelCount,
    faintAlphaPixelCount,
    borderConnectedTransparentPixelCount,
    dominantVisibleComponentPixelCount,
    bounds: Object.freeze({
      left,
      top,
      width: boundsWidth,
      height: boundsHeight,
    }),
  });
}

function largestComponent(
  image: DecodedImage,
  visible: boolean,
  borderStartsOnly: boolean,
): number {
  const visited = new Uint8Array(PIXEL_COUNT);
  const queue = new Int32Array(PIXEL_COUNT);
  let largest = 0;

  const belongs = (pixel: number) => (
    image.data[pixel * 4 + 3] >= MATERIAL_ALPHA_THRESHOLD
  ) === visible;
  const flood = (start: number) => {
    if (visited[start] || !belongs(start)) return 0;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const pixel = queue[head++];
      const x = pixel % OUTPUT_WIDTH;
      const visit = (next: number) => {
        if (!visited[next] && belongs(next)) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      };
      if (x > 0) visit(pixel - 1);
      if (x + 1 < OUTPUT_WIDTH) visit(pixel + 1);
      if (pixel >= OUTPUT_WIDTH) visit(pixel - OUTPUT_WIDTH);
      if (pixel + OUTPUT_WIDTH < PIXEL_COUNT) visit(pixel + OUTPUT_WIDTH);
    }
    return tail;
  };

  if (borderStartsOnly) {
    for (let x = 0; x < OUTPUT_WIDTH; x += 1) {
      largest = Math.max(largest, flood(x));
      largest = Math.max(largest, flood((OUTPUT_HEIGHT - 1) * OUTPUT_WIDTH + x));
    }
    for (let y = 1; y + 1 < OUTPUT_HEIGHT; y += 1) {
      largest = Math.max(largest, flood(y * OUTPUT_WIDTH));
      largest = Math.max(largest, flood(y * OUTPUT_WIDTH + OUTPUT_WIDTH - 1));
    }
    return largest;
  }

  for (let pixel = 0; pixel < PIXEL_COUNT; pixel += 1) {
    largest = Math.max(largest, flood(pixel));
  }
  return largest;
}

function assertOpaqueRoom(room: DecodedImage): void {
  for (let offset = 3; offset < room.data.length; offset += 4) {
    if (room.data[offset] !== 255) {
      invalidAsset(
        "The locked room plate is not fully opaque.",
        "Restore the approved opaque room plate before compositing.",
      );
    }
  }
}

export async function inspectStudioAtelierSubjectLayer(
  subject: StudioAtelierSubjectLayer,
): Promise<StudioAtelierSubjectLayerInspection> {
  if (subject.mimeType !== STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE.mediaType) {
    invalidAsset(
      "The subject layer is not declared as image/png.",
      "Use the transparent PNG subject output profile.",
    );
  }
  const decoded = await decodeExactCanvas("subject layer", subject);
  return subjectInspection(decoded);
}

/**
 * Canonicalizes only hidden RGB values under alpha zero. Provider bytes stay
 * retained separately; this normalized PNG is eligible for subject-layer
 * technical gates and exact deterministic composition. The composite is the
 * artifact eligible for semantic and human review.
 */
export async function normalizeStudioAtelierSubjectLayer(
  subject: StudioAtelierSubjectLayer,
) {
  if (subject.mimeType !== "image/png") {
    invalidAsset(
      "The subject candidate is not declared as image/png.",
      "Use the transparent PNG subject output profile.",
    );
  }
  const decoded = await decodeExactCanvas("subject layer", subject);
  const inspection = subjectInspection(decoded);
  const normalizedPixels = decoded.data.slice();
  for (let offset = 0; offset < normalizedPixels.length; offset += 4) {
    if (normalizedPixels[offset + 3] !== 0) continue;
    normalizedPixels[offset] = 0;
    normalizedPixels[offset + 1] = 0;
    normalizedPixels[offset + 2] = 0;
  }
  const bytes = new Uint8Array(await createImagePipeline(normalizedPixels, {
    raw: { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, channels: 4 },
  }).png({
    compressionLevel: 9,
    adaptiveFiltering: false,
    palette: false,
    effort: 10,
  }).toBuffer());
  return Object.freeze({
    bytes,
    sha256: sha256(bytes),
    mimeType: "image/png" as const,
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
    normalizationRevision: STUDIO_ATELIER_SUBJECT_NORMALIZATION_REVISION,
    sourceSha256: subject.sha256,
    inspection,
  });
}

function subjectInspection(decoded: DecodedImage): StudioAtelierSubjectLayerInspection {
  return Object.freeze({
    mimeType: "image/png",
    width: decoded.width,
    height: decoded.height,
    channels: 4,
    alpha: inspectAlpha(decoded),
  });
}

function verifyUnoccludedPixels(input: {
  room: DecodedImage;
  subject: DecodedImage;
  output: Uint8Array;
  outputChannels: number;
}): number {
  let verified = 0;
  for (let pixel = 0; pixel < OUTPUT_WIDTH * OUTPUT_HEIGHT; pixel += 1) {
    if (input.subject.data[pixel * 4 + 3] !== 0) continue;
    const roomOffset = pixel * 4;
    const outputOffset = pixel * input.outputChannels;
    if (
      input.output[outputOffset] !== input.room.data[roomOffset]
      || input.output[outputOffset + 1] !== input.room.data[roomOffset + 1]
      || input.output[outputOffset + 2] !== input.room.data[roomOffset + 2]
    ) {
      throw new StudioEngineError(
        "ENGINE_UNAVAILABLE",
        503,
        "The deterministic composite changed an unoccluded room pixel.",
        "Quarantine this composite and inspect the compositor revision.",
      );
    }
    verified += 1;
  }
  return verified;
}

/**
 * Builds the exact app-owned review artifact from a technically valid subject
 * and the locked room. Human approval applies to this returned composite, not
 * to the intermediate transparent subject layer.
 */
export async function compositeStudioAtelierSubject(input: {
  room: StudioAtelierHashedImage;
  subject: StudioAtelierSubjectLayer;
}) {
  const [room, subject] = await Promise.all([
    decodeExactCanvas("locked room plate", input.room),
    decodeExactCanvas("subject layer", input.subject),
  ]);
  const inspection = subjectInspection(subject);
  assertOpaqueRoom(room);

  const roomRgb = new Uint8Array(OUTPUT_WIDTH * OUTPUT_HEIGHT * 3);
  for (let source = 0, target = 0; source < room.data.length; source += 4, target += 3) {
    roomRgb[target] = room.data[source];
    roomRgb[target + 1] = room.data[source + 1];
    roomRgb[target + 2] = room.data[source + 2];
  }

  const composited = await createImagePipeline(roomRgb, {
    raw: { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, channels: 3 },
  })
    .composite([{
      input: subject.data,
      raw: { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, channels: 4 },
      left: 0,
      top: 0,
      blend: "over",
    }])
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (
    composited.info.width !== OUTPUT_WIDTH
    || composited.info.height !== OUTPUT_HEIGHT
    || composited.info.channels !== 3
  ) {
    throw new StudioEngineError(
      "ENGINE_UNAVAILABLE",
      503,
      "The deterministic composite produced invalid geometry.",
      "Quarantine this composite and inspect the compositor revision.",
    );
  }

  const unoccludedPixelCount = verifyUnoccludedPixels({
    room,
    subject,
    output: composited.data,
    outputChannels: composited.info.channels,
  });
  const bytes = new Uint8Array(await createImagePipeline(composited.data, {
    raw: { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, channels: 3 },
  })
    .png({
      compressionLevel: 9,
      adaptiveFiltering: false,
      palette: false,
      effort: 10,
    })
    .toBuffer());

  return Object.freeze({
    bytes,
    sha256: sha256(bytes),
    mimeType: "image/png" as const,
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
    compositeRevision: STUDIO_ATELIER_SUBJECT_COMPOSITE_REVISION,
    sources: Object.freeze({
      roomSha256: input.room.sha256,
      subjectSha256: input.subject.sha256,
    }),
    alpha: inspection.alpha,
    preservation: Object.freeze({
      unoccludedPixelCount,
      unoccludedPixelsPreserved: true,
      roomPixelsGenerated: 0,
    }),
  });
}
