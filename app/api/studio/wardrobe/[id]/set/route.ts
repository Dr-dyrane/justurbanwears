import { requireStudioOperator } from "../../../../../../lib/server/studio-operator";
import { startGarmentSetSchema } from "../../../../../../lib/studio/engine/garment-set-contracts";
import { engineErrorResponse } from "../../../../../../lib/studio/engine/errors";
import { engineJson, parseEngineJson } from "../../../../../../lib/studio/engine/http";
import { readGarmentSet, startGarmentSet } from "../../../../../../lib/studio/engine/garment-set-service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const [operator, { id }] = await Promise.all([requireStudioOperator(), context.params]);
    return engineJson({ workspace: await readGarmentSet(id, operator) });
  } catch (error) {
    return engineErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const [operator, { id }] = await Promise.all([requireStudioOperator(), context.params]);
    await parseEngineJson(request, startGarmentSetSchema);
    return engineJson({ workspace: await startGarmentSet(id, operator) }, { status: 202 });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
