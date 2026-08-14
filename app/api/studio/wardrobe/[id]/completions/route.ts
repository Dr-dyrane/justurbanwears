import { requireStudioOperator } from "../../../../../../lib/server/studio-operator";
import { engineErrorResponse } from "../../../../../../lib/studio/engine/errors";
import { engineJson } from "../../../../../../lib/studio/engine/http";
import { parseMediaCompletionRequest } from "../../../../../../lib/studio/engine/media-completion-http";
import { createMediaCompletion, readLatestMediaCompletion } from "../../../../../../lib/studio/engine/media-completion-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const [operator, { id }] = await Promise.all([requireStudioOperator(), context.params]);
    const role = new URL(request.url).searchParams.get("role");
    return engineJson(await readLatestMediaCompletion({
      target: { kind: "WARDROBE_ITEM", key: id },
      role,
      operator,
    }));
  } catch (error) {
    return engineErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const [operator, { id }] = await Promise.all([requireStudioOperator(), context.params]);
    const input = await parseMediaCompletionRequest(request);
    return engineJson(await createMediaCompletion({
      target: { kind: "WARDROBE_ITEM", key: id },
      operator,
      ...input,
    }), { status: 202 });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
