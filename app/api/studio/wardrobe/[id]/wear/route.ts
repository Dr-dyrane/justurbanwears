import { requireStudioOperator } from "../../../../../../lib/server/studio-operator";
import { createWearGenerationSchema } from "../../../../../../lib/studio/engine/contracts";
import { engineErrorResponse } from "../../../../../../lib/studio/engine/errors";
import { engineJson, parseEngineJson } from "../../../../../../lib/studio/engine/http";
import { generateWearCandidate, getWearWorkspace } from "../../../../../../lib/studio/engine/wear-service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const [operator, { id }] = await Promise.all([requireStudioOperator(), context.params]);
    return engineJson({ workspace: await getWearWorkspace(id, operator) });
  } catch (error) {
    return engineErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const [operator, { id }, input] = await Promise.all([
      requireStudioOperator(),
      context.params,
      parseEngineJson(request, createWearGenerationSchema),
    ]);
    return engineJson(await generateWearCandidate({ wardrobeItemId: id, operator, ...input }), { status: 202 });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
