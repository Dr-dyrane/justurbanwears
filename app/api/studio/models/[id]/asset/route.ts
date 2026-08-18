import { readStudioModelAsset } from "../../../../../../lib/server/studio-authority-repository";
import { requireStudioOperator } from "../../../../../../lib/server/studio-operator";
import { engineErrorResponse } from "../../../../../../lib/studio/engine/errors";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const [operator, { id }] = await Promise.all([requireStudioOperator(), context.params]);
    const asset = await readStudioModelAsset(operator, id);
    return new Response(asset.stream, { headers: {
      "cache-control": "private, no-store, max-age=0",
      "content-length": String(asset.byteSize),
      "content-type": asset.mimeType,
      "x-content-type-options": "nosniff",
    } });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
