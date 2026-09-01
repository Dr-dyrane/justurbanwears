import { requireStudioOperator } from "../../../../../../lib/server/studio-operator";
import { engineErrorResponse, StudioEngineError } from "../../../../../../lib/studio/engine/errors";
import {
  getGarmentPermanentDeleteReceipt,
  permanentlyDeleteGarment,
} from "../../../../../../lib/studio/engine/garment-lifecycle-service";
import {
  garmentPermanentDeleteReceiptQuerySchema,
  garmentPermanentDeleteSchema,
} from "../../../../../../lib/studio/engine/garment-lifecycle-contracts";
import { engineJson, parseEngineJson } from "../../../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const query = garmentPermanentDeleteReceiptQuerySchema.safeParse({
      idempotencyKey: new URL(request.url).searchParams.get("idempotencyKey"),
    });
    if (!query.success) {
      throw new StudioEngineError(
        "INVALID_REQUEST",
        400,
        "That deletion receipt request is invalid.",
        "Return to Archived and try again.",
      );
    }
    const [operator, { id }] = await Promise.all([requireStudioOperator(), context.params]);
    return engineJson({ receipt: await getGarmentPermanentDeleteReceipt({
      wardrobeItemId: id,
      operator,
      idempotencyKey: query.data.idempotencyKey,
    }) });
  } catch (error) {
    return engineErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const [operator, { id }, command] = await Promise.all([
      requireStudioOperator(),
      context.params,
      parseEngineJson(request, garmentPermanentDeleteSchema),
    ]);
    return engineJson({ receipt: await permanentlyDeleteGarment({
      wardrobeItemId: id,
      operator,
      command,
    }) });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
