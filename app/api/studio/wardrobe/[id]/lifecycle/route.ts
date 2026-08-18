import { requireStudioOperator } from "../../../../../../lib/server/studio-operator";
import { engineErrorResponse } from "../../../../../../lib/studio/engine/errors";
import {
  getGarmentLifecycleWorkspace,
  runGarmentLifecycleCommand,
} from "../../../../../../lib/studio/engine/garment-lifecycle-service";
import { garmentLifecycleCommandSchema } from "../../../../../../lib/studio/engine/garment-lifecycle-contracts";
import { engineJson, parseEngineJson } from "../../../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const [operator, { id }] = await Promise.all([requireStudioOperator(), context.params]);
    return engineJson({ workspace: await getGarmentLifecycleWorkspace(id, operator) });
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
    return engineJson({ workspace: await runGarmentLifecycleCommand({
      wardrobeItemId: id,
      operator,
      command,
    }) });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
