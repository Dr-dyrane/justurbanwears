import { getIntakeSnapshot } from "../../../../../lib/server/studio-intake-repository";
import { requireStudioOperator } from "../../../../../lib/server/studio-operator";
import { engineErrorResponse } from "../../../../../lib/studio/engine/errors";
import { engineJson } from "../../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const [operator, { id }] = await Promise.all([requireStudioOperator(), context.params]);
    return engineJson({ intake: await getIntakeSnapshot(id, operator.subject) });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
