import { listWardrobeItems } from "../../../../lib/server/studio-intake-repository";
import { requireStudioOperator } from "../../../../lib/server/studio-operator";
import { engineErrorResponse } from "../../../../lib/studio/engine/errors";
import { engineJson } from "../../../../lib/studio/engine/http";
import { getWardrobeCaptureWorkspace } from "../../../../lib/studio/engine/pending-capture-service";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const operator = await requireStudioOperator();
    const items = await listWardrobeItems(operator.subject);
    const withCaptures = await Promise.all(items.map(async (item) => ({
      ...item,
      directCaptures: (await getWardrobeCaptureWorkspace(item.id, operator)).captures,
    })));
    return engineJson({ items: withCaptures });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
