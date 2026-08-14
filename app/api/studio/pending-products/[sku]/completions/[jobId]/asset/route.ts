import { requireStudioOperator } from "../../../../../../../../lib/server/studio-operator";
import { engineErrorResponse } from "../../../../../../../../lib/studio/engine/errors";
import { privateCompletionAssetResponse } from "../../../../../../../../lib/studio/engine/media-completion-http";
import { readMediaCompletionAsset } from "../../../../../../../../lib/studio/engine/media-completion-service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sku: string; jobId: string }> },
) {
  try {
    const [operator, { sku, jobId }] = await Promise.all([requireStudioOperator(), context.params]);
    return privateCompletionAssetResponse(await readMediaCompletionAsset({
      target: { kind: "PENDING_PRODUCT", key: sku },
      jobId,
      operator,
    }));
  } catch (error) {
    return engineErrorResponse(error);
  }
}
