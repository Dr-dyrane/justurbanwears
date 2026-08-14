import { MAX_STUDIO_IMAGE_BYTES } from "./assets";
import { StudioEngineError } from "./errors";

export async function parseMediaCompletionForm(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_STUDIO_IMAGE_BYTES + 96 * 1024) {
    throw new StudioEngineError("INVALID_ASSET", 413, "That image is too large.", "Choose an image under 12 MB.");
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new StudioEngineError("INVALID_ASSET", 415, "Choose one authority photo.", "Use Camera or Photos.");
  }
  if (file.size > MAX_STUDIO_IMAGE_BYTES) {
    throw new StudioEngineError("INVALID_ASSET", 413, "That image is too large.", "Choose an image under 12 MB.");
  }
  const correction = form.get("correction");
  return {
    role: form.get("role"),
    authorityConfirmed: form.get("authorityConfirmed"),
    correction: typeof correction === "string" ? correction : undefined,
    bytes: new Uint8Array(await file.arrayBuffer()),
    declaredType: file.type,
  };
}

export function privateCompletionAssetResponse(asset: {
  stream: ReadableStream;
  mimeType: string;
  byteSize: number;
}) {
  return new Response(asset.stream, { headers: {
    "cache-control": "private, no-store, max-age=0",
    "content-type": asset.mimeType,
    "content-length": String(asset.byteSize),
    "x-content-type-options": "nosniff",
  } });
}
