import { requireStudioOperator } from "../../../../../../lib/server/studio-operator";
import { MAX_STUDIO_IMAGE_BYTES } from "../../../../../../lib/studio/engine/assets";
import { StudioEngineError, engineErrorResponse } from "../../../../../../lib/studio/engine/errors";
import { engineJson } from "../../../../../../lib/studio/engine/http";
import {
  getWardrobeCaptureWorkspace,
  saveWardrobeCapture,
} from "../../../../../../lib/studio/engine/pending-capture-service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const [operator, { id }] = await Promise.all([requireStudioOperator(), context.params]);
    return engineJson(await getWardrobeCaptureWorkspace(id, operator));
  } catch (error) {
    return engineErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const [operator, { id }] = await Promise.all([requireStudioOperator(), context.params]);
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_STUDIO_IMAGE_BYTES + 64 * 1024) {
      throw new StudioEngineError("INVALID_ASSET", 413, "That image is too large.", "Choose an image under 12 MB.");
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new StudioEngineError("INVALID_ASSET", 415, "Choose one photo.", "Use Camera or Photos.");
    }
    return engineJson(await saveWardrobeCapture({
      wardrobeItemId: id,
      role: form.get("role"),
      operator,
      bytes: new Uint8Array(await file.arrayBuffer()),
      declaredType: file.type,
    }), { status: 201 });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
