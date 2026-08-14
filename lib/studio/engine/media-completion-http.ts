import { MAX_STUDIO_IMAGE_BYTES } from "./assets";
import { StudioEngineError } from "./errors";
import { mediaCompletionSourceModeSchema } from "./media-completion-contracts";

export async function parseMediaCompletionRequest(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || "0");
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    if (Number.isFinite(contentLength) && contentLength > 16 * 1024) {
      throw new StudioEngineError("INVALID_REQUEST", 413, "That request is too large.", "Try again.");
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new StudioEngineError("INVALID_REQUEST", 400, "That AI request could not be read.", "Try again.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new StudioEngineError("INVALID_REQUEST", 400, "That AI request could not be read.", "Try again.");
    }
    const record = body as Record<string, unknown>;
    const sourceMode = mediaCompletionSourceModeSchema.safeParse(record.sourceMode);
    if (!sourceMode.success || sourceMode.data !== "APPROVED_FRONT") {
      throw new StudioEngineError("INVALID_REQUEST", 400, "Choose an approved garment source.", "Open the piece again.");
    }
    return {
      role: record.role,
      sourceMode: sourceMode.data,
      correction: typeof record.correction === "string" ? record.correction : undefined,
    };
  }
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
    sourceMode: "UPLOADED_AUTHORITY" as const,
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
