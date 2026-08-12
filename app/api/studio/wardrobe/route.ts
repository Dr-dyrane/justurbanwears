import { listWardrobeItems } from "../../../../lib/server/studio-intake-repository";
import { requireStudioOperator } from "../../../../lib/server/studio-operator";
import { engineErrorResponse } from "../../../../lib/studio/engine/errors";
import { engineJson } from "../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const operator = await requireStudioOperator();
    return engineJson({ items: await listWardrobeItems(operator.subject) });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
