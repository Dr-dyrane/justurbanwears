import { requireStudioOperator } from "../../../../../../lib/server/studio-operator";
import { publishStudioPieceSchema } from "../../../../../../lib/studio/engine/catalogue-publication-contracts";
import {
  getStudioPublicationReview,
  publishStudioPiece,
} from "../../../../../../lib/studio/engine/catalogue-publication-service";
import { engineErrorResponse } from "../../../../../../lib/studio/engine/errors";
import { engineJson, parseEngineJson } from "../../../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const [operator, { id }] = await Promise.all([requireStudioOperator(), context.params]);
    return engineJson({ review: await getStudioPublicationReview(id, operator) });
  } catch (error) {
    return engineErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const [operator, { id }, input] = await Promise.all([
      requireStudioOperator(),
      context.params,
      parseEngineJson(request, publishStudioPieceSchema),
    ]);
    const receipt = await publishStudioPiece({
      wardrobeItemId: id,
      operator,
      expectedRevision: input.expectedRevision,
      idempotencyKey: input.idempotencyKey,
    });
    return engineJson({ receipt }, { status: 201 });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
