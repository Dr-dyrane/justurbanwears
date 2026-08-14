import { requireStudioOperator } from "../../../../../../lib/server/studio-operator";
import { MAX_STUDIO_IMAGE_BYTES } from "../../../../../../lib/studio/engine/assets";
import { engineErrorResponse, StudioEngineError } from "../../../../../../lib/studio/engine/errors";
import { engineJson } from "../../../../../../lib/studio/engine/http";
import {
  getPendingCaptureWorkspace,
  savePendingProductCapture,
} from "../../../../../../lib/studio/engine/pending-capture-service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sku: string }> },
): Promise<Response> {
  try {
    const [operator, { sku }] = await Promise.all([requireStudioOperator(), context.params]);
    return engineJson(await getPendingCaptureWorkspace(sku, operator));
  } catch (error) {
    return engineErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ sku: string }> },
): Promise<Response> {
  try {
    const [operator, { sku }] = await Promise.all([requireStudioOperator(), context.params]);
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_STUDIO_IMAGE_BYTES + 64 * 1024) {
      throw new StudioEngineError("INVALID_ASSET", 413, "That image is too large.", "Choose an image under 12 MB.");
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new StudioEngineError("INVALID_ASSET", 415, "Choose one photo.", "Use Camera or Photos.");
    }
    const workspace = await savePendingProductCapture({
      sku,
      role: form.get("role"),
      operator,
      bytes: new Uint8Array(await file.arrayBuffer()),
      declaredType: file.type,
    });
    return engineJson(workspace, { status: 201 });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
