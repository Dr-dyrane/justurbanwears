import { createOrReuseIntake } from "../../../../lib/server/studio-intake-repository";
import { requireStudioOperator } from "../../../../lib/server/studio-operator";
import { createIntakeSchema } from "../../../../lib/studio/engine/contracts";
import { engineErrorResponse } from "../../../../lib/studio/engine/errors";
import { engineJson, parseEngineJson } from "../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const operator = await requireStudioOperator();
    const input = await parseEngineJson(request, createIntakeSchema);
    const intake = await createOrReuseIntake({ operator, ...input });
    return engineJson({ intake }, { status: 201 });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
