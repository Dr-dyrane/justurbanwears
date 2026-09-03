import {
  modelCommandReceiptQuerySchema,
  readStudioModelCommandReceipt,
  updateModelAuthoritySchema,
  updateStudioModelAuthority,
} from "../../../../../lib/server/studio-authority-repository";
import { requireStudioOperator } from "../../../../../lib/server/studio-operator";
import { engineErrorResponse, StudioEngineError } from "../../../../../lib/studio/engine/errors";
import { engineJson, parseEngineJson } from "../../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const [operator, { id }] = await Promise.all([requireStudioOperator(), context.params]);
    const query = modelCommandReceiptQuerySchema.safeParse({
      idempotencyKey: new URL(request.url).searchParams.get("idempotencyKey"),
    });
    if (!query.success) {
      throw new StudioEngineError("INVALID_REQUEST", 400, "That model receipt request is incomplete.", "Reload Models.");
    }
    const result = await readStudioModelCommandReceipt(operator, id, query.data.idempotencyKey);
    return engineJson(result ?? { model: null, receipt: null });
  } catch (error) {
    return engineErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const [operator, { id }, input] = await Promise.all([
      requireStudioOperator(),
      context.params,
      parseEngineJson(request, updateModelAuthoritySchema),
    ]);
    return engineJson(await updateStudioModelAuthority(operator, id, input));
  } catch (error) {
    return engineErrorResponse(error);
  }
}
