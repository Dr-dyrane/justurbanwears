import { requireStudioOperator } from "../../../../../../lib/server/studio-operator";
import { createModelProfileSchema } from "../../../../../../lib/studio/engine/contracts";
import { verifyStudioImage } from "../../../../../../lib/studio/engine/assets";
import { engineErrorResponse, StudioEngineError } from "../../../../../../lib/studio/engine/errors";
import { engineJson } from "../../../../../../lib/studio/engine/http";
import { addAuthorizedStockModel } from "../../../../../../lib/studio/engine/wear-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const [operator, { id }] = await Promise.all([requireStudioOperator(), context.params]);
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > 12 * 1024 * 1024 + 32_768) {
      throw new StudioEngineError("INVALID_ASSET", 413, "That image is too large.", "Choose an image under 12 MB.");
    }
    const form = await request.formData();
    const parsed = createModelProfileSchema.safeParse({
      name: form.get("name"),
      licenseUrl: form.get("licenseUrl"),
      authorityConfirmed: form.get("authorityConfirmed"),
    });
    const file = form.get("file");
    if (!parsed.success || !(file instanceof File)) {
      throw new StudioEngineError("INVALID_REQUEST", 400, "Confirm the model image and usage authority.", "Add a licensed adult photo and confirm authority.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > 12 * 1024 * 1024) {
      throw new StudioEngineError("INVALID_ASSET", 413, "That image is too large.", "Choose an image under 12 MB.");
    }
    verifyStudioImage(bytes, file.type);
    return engineJson(await addAuthorizedStockModel({
      wardrobeItemId: id,
      operator,
      name: parsed.data.name,
      licenseUrl: parsed.data.licenseUrl,
      bytes,
      declaredType: file.type,
    }), { status: 201 });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
