import { putShopBlob } from "../../../../../../lib/server/vercel-blob";
import {
  addStudioAsset,
  getIntakeSnapshot,
  getOwnedIntakeRow,
} from "../../../../../../lib/server/studio-intake-repository";
import { requireStudioOperator } from "../../../../../../lib/server/studio-operator";
import { verifyStudioImage } from "../../../../../../lib/studio/engine/assets";
import { engineErrorResponse, StudioEngineError } from "../../../../../../lib/studio/engine/errors";
import { sha256 } from "../../../../../../lib/studio/engine/fingerprint";
import { engineJson } from "../../../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const [operator, { id }] = await Promise.all([requireStudioOperator(), context.params]);
    await getOwnedIntakeRow(id, operator.subject);
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > 12 * 1024 * 1024 + 64 * 1024) {
      throw new StudioEngineError("INVALID_ASSET", 413, "That image is too large.", "Choose an image under 12 MB.");
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || form.get("role") !== "SOURCE") {
      throw new StudioEngineError("INVALID_ASSET", 415, "Choose one source image.", "Use Camera or Photos.");
    }
    const verified = verifyStudioImage(new Uint8Array(await file.arrayBuffer()), file.type);
    const hash = sha256(verified.bytes);
    const pathname = `studio/intakes/${id}/sources/${hash}.${verified.extension}`;
    const blob = await putShopBlob("private", pathname, Buffer.from(verified.bytes), {
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: verified.mimeType,
      cacheControlMaxAge: 31_536_000,
    });
    await addStudioAsset({
      intakeId: id,
      role: "SOURCE",
      blobPathname: blob.pathname,
      blobUrl: blob.url,
      mimeType: verified.mimeType,
      byteSize: verified.bytes.byteLength,
      width: verified.width,
      height: verified.height,
      sha256: hash,
    });
    return engineJson({ intake: await getIntakeSnapshot(id, operator.subject) }, { status: 201 });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
