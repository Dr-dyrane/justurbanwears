import { requireStudioOperator } from "../../../../../../../lib/server/studio-operator";
import { MAX_STUDIO_IMAGE_BYTES } from "../../../../../../../lib/studio/engine/assets";
import { StudioEngineError, engineErrorResponse } from "../../../../../../../lib/studio/engine/errors";
import {
  garmentRevisionMediaCommandSchema,
  garmentRevisionMediaReceiptQuerySchema,
} from "../../../../../../../lib/studio/engine/garment-lifecycle-contracts";
import {
  getGarmentLifecycleWorkspace,
  getGarmentRevisionMediaReceipt,
  replaceGarmentRevisionMedia,
} from "../../../../../../../lib/studio/engine/garment-lifecycle-service";
import { engineJson } from "../../../../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const query = garmentRevisionMediaReceiptQuerySchema.safeParse({
      idempotencyKey: new URL(request.url).searchParams.get("idempotencyKey"),
    });
    if (!query.success) {
      throw new StudioEngineError(
        "INVALID_REQUEST",
        400,
        "That photo receipt request is invalid.",
        "Return to the piece and choose the photo again.",
      );
    }
    const [operator, { id }] = await Promise.all([requireStudioOperator(), context.params]);
    const receipt = await getGarmentRevisionMediaReceipt({
      wardrobeItemId: id,
      operator,
      idempotencyKey: query.data.idempotencyKey,
    });
    return engineJson({
      receipt,
      ...(receipt ? { workspace: await getGarmentLifecycleWorkspace(id, operator) } : {}),
    });
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
    const expectedDraftVersionValue = form.get("expectedDraftVersion");
    const expectedPublicationRevisionValue = form.get("expectedPublicationRevision");
    const command = garmentRevisionMediaCommandSchema.safeParse({
      expectedDraftVersion: expectedDraftVersionValue === null || expectedDraftVersionValue === ""
        ? null
        : Number(expectedDraftVersionValue),
      expectedItemVersion: Number(form.get("expectedItemVersion")),
      expectedPublicationRevision: expectedPublicationRevisionValue === null || expectedPublicationRevisionValue === ""
        ? null
        : expectedPublicationRevisionValue,
      idempotencyKey: form.get("idempotencyKey"),
      role: form.get("role"),
    });
    if (!(file instanceof File)) {
      throw new StudioEngineError("INVALID_ASSET", 415, "Choose one photo.", "Use Camera or Photos.");
    }
    if (!command.success) {
      throw new StudioEngineError("INVALID_REQUEST", 400, "That photo change is incomplete.", "Reload the piece and try again.");
    }
    return engineJson(await replaceGarmentRevisionMedia({
      wardrobeItemId: id,
      operator,
      command: command.data,
      bytes: new Uint8Array(await file.arrayBuffer()),
      declaredType: file.type,
    }), { status: 201 });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
