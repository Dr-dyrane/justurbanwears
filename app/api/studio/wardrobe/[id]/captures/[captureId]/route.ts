import { requireStudioOperator } from "../../../../../../../lib/server/studio-operator";
import { engineErrorResponse } from "../../../../../../../lib/studio/engine/errors";
import { readWardrobeCapture } from "../../../../../../../lib/studio/engine/pending-capture-service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; captureId: string }> },
): Promise<Response> {
  try {
    const [operator, { id, captureId }] = await Promise.all([requireStudioOperator(), context.params]);
    const capture = await readWardrobeCapture({ wardrobeItemId: id, captureId, operator });
    return new Response(capture.stream, { headers: {
      "cache-control": "private, no-store, max-age=0",
      "content-type": capture.mimeType,
      "content-length": String(capture.byteSize),
      "x-content-type-options": "nosniff",
    } });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
