import { requireStudioOperator } from "../../../../../../lib/server/studio-operator";
import { commitIntakeSchema } from "../../../../../../lib/studio/engine/contracts";
import { engineErrorResponse } from "../../../../../../lib/studio/engine/errors";
import { engineJson, parseEngineJson } from "../../../../../../lib/studio/engine/http";
import { commitStudioIntake } from "../../../../../../lib/studio/engine/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const [operator, { id }, input] = await Promise.all([
      requireStudioOperator(),
      context.params,
      parseEngineJson(request, commitIntakeSchema),
    ]);
    return engineJson(await commitStudioIntake({ id, operator, ...input }));
  } catch (error) {
    return engineErrorResponse(error);
  }
}
