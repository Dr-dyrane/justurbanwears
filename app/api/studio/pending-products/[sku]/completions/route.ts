import { requireStudioOperator } from "../../../../../../lib/server/studio-operator";
import { engineErrorResponse } from "../../../../../../lib/studio/engine/errors";
import { engineJson } from "../../../../../../lib/studio/engine/http";
import { parseMediaCompletionForm } from "../../../../../../lib/studio/engine/media-completion-http";
import { createMediaCompletion, readLatestMediaCompletion } from "../../../../../../lib/studio/engine/media-completion-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ sku: string }> }) {
  try {
    const [operator, { sku }] = await Promise.all([requireStudioOperator(), context.params]);
    const role = new URL(request.url).searchParams.get("role");
    return engineJson(await readLatestMediaCompletion({
      target: { kind: "PENDING_PRODUCT", key: sku },
      role,
      operator,
    }));
  } catch (error) {
    return engineErrorResponse(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ sku: string }> }) {
  try {
    const [operator, { sku }] = await Promise.all([requireStudioOperator(), context.params]);
    const input = await parseMediaCompletionForm(request);
    return engineJson(await createMediaCompletion({
      target: { kind: "PENDING_PRODUCT", key: sku },
      operator,
      ...input,
    }), { status: 202 });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
