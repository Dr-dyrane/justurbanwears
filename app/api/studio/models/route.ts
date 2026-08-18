import {
  createModelAuthoritySchema,
  createStudioModelAuthority,
  listStudioModelAuthority,
} from "../../../../lib/server/studio-authority-repository";
import { requireStudioOperator } from "../../../../lib/server/studio-operator";
import { MAX_STUDIO_IMAGE_BYTES } from "../../../../lib/studio/engine/assets";
import { engineErrorResponse, StudioEngineError } from "../../../../lib/studio/engine/errors";
import { engineJson } from "../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const operator = await requireStudioOperator();
    return engineJson({ models: await listStudioModelAuthority(operator) });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
export async function POST(request: Request): Promise<Response> {
  try {
    const operator = await requireStudioOperator();
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_STUDIO_IMAGE_BYTES + 64 * 1024) {
      throw new StudioEngineError("INVALID_ASSET", 413, "That image is too large.", "Choose an image under 12 MB.");
    }
    const form = await request.formData();
    const parsed = createModelAuthoritySchema.safeParse({
      authorityConfirmed: form.get("authorityConfirmed"),
      licenseUrl: form.get("licenseUrl"),
      name: form.get("name"),
    });
    const file = form.get("file");
    if (!parsed.success || !(file instanceof File)) {
      throw new StudioEngineError("INVALID_REQUEST", 400, "Add the model photo and its usage source.", "Choose an adult photo, add its licence URL, and confirm authority.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > MAX_STUDIO_IMAGE_BYTES) {
      throw new StudioEngineError("INVALID_ASSET", 413, "That image is too large.", "Choose an image under 12 MB.");
    }
    const model = await createStudioModelAuthority({
      operator,
      name: parsed.data.name,
      licenseUrl: parsed.data.licenseUrl,
      bytes,
      declaredType: file.type,
    });
    return engineJson({ model }, { status: 201 });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
