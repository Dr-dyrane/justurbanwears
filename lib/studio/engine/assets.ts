import { StudioEngineError } from "./errors";

export const MAX_STUDIO_IMAGE_BYTES = 12 * 1024 * 1024;

export type VerifiedImage = {
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
  width: number | null;
  height: number | null;
};

export function verifyStudioImage(bytes: Uint8Array, declaredType?: string): VerifiedImage {
  if (!bytes.byteLength || bytes.byteLength > MAX_STUDIO_IMAGE_BYTES) {
    throw new StudioEngineError(
      "INVALID_ASSET",
      bytes.byteLength > MAX_STUDIO_IMAGE_BYTES ? 413 : 415,
      "That image cannot be used.",
      "Choose a JPEG, PNG or WebP under 12 MB.",
    );
  }
  const detected = detect(bytes);
  if (!detected || (declaredType && declaredType !== detected.mimeType && declaredType !== "application/octet-stream")) {
    throw new StudioEngineError(
      "INVALID_ASSET",
      415,
      "That file is not a supported image.",
      "Choose a JPEG, PNG or WebP.",
    );
  }
  return { bytes, ...detected };
}

function detect(bytes: Uint8Array): Omit<VerifiedImage, "bytes"> | null {
  if (
    bytes.length >= 24
    && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      .every((value, index) => bytes[index] === value)
  ) {
    return {
      mimeType: "image/png",
      extension: "png",
      width: u32be(bytes, 16),
      height: u32be(bytes, 20),
    };
  }
  if (bytes.length >= 12 && text(bytes, 0, 4) === "RIFF" && text(bytes, 8, 4) === "WEBP") {
    const dimensions = webpDimensions(bytes);
    return { mimeType: "image/webp", extension: "webp", ...dimensions };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const dimensions = jpegDimensions(bytes);
    return { mimeType: "image/jpeg", extension: "jpg", ...dimensions };
  }
  return null;
}

function jpegDimensions(bytes: Uint8Array): { width: number | null; height: number | null } {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + length + 2 > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return {
        height: (bytes[offset + 5] << 8) | bytes[offset + 6],
        width: (bytes[offset + 7] << 8) | bytes[offset + 8],
      };
    }
    offset += 2 + length;
  }
  return { width: null, height: null };
}

function webpDimensions(bytes: Uint8Array): { width: number | null; height: number | null } {
  const kind = text(bytes, 12, 4);
  if (kind === "VP8X" && bytes.length >= 30) {
    return { width: 1 + u24le(bytes, 24), height: 1 + u24le(bytes, 27) };
  }
  if (kind === "VP8 " && bytes.length >= 30) {
    return {
      width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
      height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
    };
  }
  if (kind === "VP8L" && bytes.length >= 25) {
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  return { width: null, height: null };
}

function text(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function u32be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function u24le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}
