import { requireStudioOperator } from "../../../../../../lib/server/studio-operator";
import { engineErrorResponse, StudioEngineError } from "../../../../../../lib/studio/engine/errors";
import {
  getGarmentLifecycleCommandReceipt,
  getGarmentLifecycleWorkspace,
  runGarmentLifecycleCommand,
} from "../../../../../../lib/studio/engine/garment-lifecycle-service";
import {
  garmentLifecycleCommandReceiptQuerySchema,
  garmentLifecycleCommandSchema,
} from "../../../../../../lib/studio/engine/garment-lifecycle-contracts";
import { engineJson, parseEngineJson } from "../../../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const [operator, { id }] = await Promise.all([requireStudioOperator(), context.params]);
    const idempotencyKey = new URL(request.url).searchParams.get("idempotencyKey");
    const workspace = await getGarmentLifecycleWorkspace(id, operator);
    if (!idempotencyKey) return engineJson({ workspace });
    const query = garmentLifecycleCommandReceiptQuerySchema.safeParse({ idempotencyKey });
    if (!query.success) {
      throw new StudioEngineError(
        "INVALID_REQUEST",
        400,
        "That garment receipt request is invalid.",
        "Retry the original action from the Piece screen.",
      );
    }
    return engineJson({
      receipt: await getGarmentLifecycleCommandReceipt({
        wardrobeItemId: id,
        operator,
        idempotencyKey: query.data.idempotencyKey,
      }),
      workspace,
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
    const [operator, { id }, command] = await Promise.all([
      requireStudioOperator(),
      context.params,
      parseEngineJson(request, garmentLifecycleCommandSchema),
    ]);
    const workspace = await runGarmentLifecycleCommand({
      wardrobeItemId: id,
      operator,
      command,
    });
    const receipt = command.command === "SAVE_FACTS" || command.command === "ARCHIVE"
      ? await getGarmentLifecycleCommandReceipt({
          wardrobeItemId: id,
          operator,
          idempotencyKey: command.idempotencyKey,
        })
      : null;
    if ((command.command === "SAVE_FACTS" || command.command === "ARCHIVE") && !receipt) {
      throw new StudioEngineError(
        "ENGINE_UNAVAILABLE",
        503,
        "Studio saved the garment state but could not verify its receipt.",
        "Do not repeat the action. Reload the Piece screen to reconcile it.",
      );
    }
    return engineJson({ receipt, workspace });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
