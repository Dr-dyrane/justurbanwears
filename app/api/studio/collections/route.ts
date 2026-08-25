import {
  applyStudioCollectionCommand,
  listStudioCollections,
  previewStudioCollectionCommand,
} from "../../../../lib/server/studio-collection-repository";
import { requireStudioOperator } from "../../../../lib/server/studio-operator";
import { studioCollectionCommandRequestSchema } from "../../../../lib/studio/collections/contracts";
import { engineErrorResponse } from "../../../../lib/studio/engine/errors";
import { engineJson, parseEngineJson } from "../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await requireStudioOperator();
    return engineJson(await listStudioCollections());
  } catch (error) {
    return engineErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const [operator, input] = await Promise.all([
      requireStudioOperator(),
      parseEngineJson(request, studioCollectionCommandRequestSchema),
    ]);
    if (input.phase === "PREVIEW") {
      return engineJson({ preview: await previewStudioCollectionCommand(operator, input.intent) });
    }
    const receipt = await applyStudioCollectionCommand({
      operator,
      intent: input.intent,
      expectedRevision: input.expectedRevision,
      idempotencyKey: input.idempotencyKey,
    });
    const { scopes } = await listStudioCollections();
    const collection = scopes.find((scope) => scope.id === receipt.collection.id) ?? receipt.collection;
    return engineJson({ receipt: { ...receipt, collection }, collections: scopes });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
