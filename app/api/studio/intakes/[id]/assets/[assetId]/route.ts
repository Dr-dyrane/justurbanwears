import { requireStudioOperator } from "../../../../../../../lib/server/studio-operator";
import { engineErrorResponse } from "../../../../../../../lib/studio/engine/errors";
import { readPrivateAsset } from "../../../../../../../lib/studio/engine/service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; assetId: string }> },
): Promise<Response> {
  try {
    const [operator, { id, assetId }] = await Promise.all([requireStudioOperator(), context.params]);
    const asset = await readPrivateAsset(id, assetId, operator);
    return new Response(asset.stream, {
      headers: {
        "cache-control": "private, no-store, max-age=0",
        "content-type": asset.mimeType,
        "content-length": String(asset.byteSize),
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
