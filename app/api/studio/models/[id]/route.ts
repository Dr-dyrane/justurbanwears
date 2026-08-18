import { updateModelAuthoritySchema, updateStudioModelAuthority } from "../../../../../lib/server/studio-authority-repository";
import { requireStudioOperator } from "../../../../../lib/server/studio-operator";
import { engineErrorResponse } from "../../../../../lib/studio/engine/errors";
import { engineJson, parseEngineJson } from "../../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const [operator, { id }, input] = await Promise.all([
      requireStudioOperator(),
      context.params,
      parseEngineJson(request, updateModelAuthoritySchema),
    ]);
    return engineJson({ model: await updateStudioModelAuthority(operator, id, input) });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
