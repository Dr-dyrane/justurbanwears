import { requireStudioOperator } from "../../../../../../../lib/server/studio-operator";
import { MAX_STUDIO_IMAGE_BYTES } from "../../../../../../../lib/studio/engine/assets";
import { StudioEngineError, engineErrorResponse } from "../../../../../../../lib/studio/engine/errors";
import { garmentRevisionMediaRoleSchema } from "../../../../../../../lib/studio/engine/garment-lifecycle-contracts";
import { replaceGarmentRevisionMedia } from "../../../../../../../lib/studio/engine/garment-lifecycle-service";
import { engineJson } from "../../../../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";

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
    const role = garmentRevisionMediaRoleSchema.safeParse(form.get("role"));
    const expectedVersion = Number(form.get("expectedVersion"));
    if (!(file instanceof File)) {
      throw new StudioEngineError("INVALID_ASSET", 415, "Choose one photo.", "Use Camera or Photos.");
    }
    if (!role.success || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw new StudioEngineError("INVALID_REQUEST", 400, "That photo change is incomplete.", "Reload the piece and try again.");
    }
    return engineJson({ workspace: await replaceGarmentRevisionMedia({
      wardrobeItemId: id,
      operator,
      expectedVersion,
      role: role.data,
      bytes: new Uint8Array(await file.arrayBuffer()),
      declaredType: file.type,
    }) }, { status: 201 });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
