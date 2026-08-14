import { listWardrobeItems } from "../../../../lib/server/studio-intake-repository";
import { requireStudioOperator } from "../../../../lib/server/studio-operator";
import { engineErrorResponse } from "../../../../lib/studio/engine/errors";
import { engineJson } from "../../../../lib/studio/engine/http";
import { getWardrobeCaptureWorkspace } from "../../../../lib/studio/engine/pending-capture-service";
import {
  cataloguePublicationReceipt,
  listCataloguePublications,
} from "../../../../lib/server/studio-catalogue-publication-repository";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const operator = await requireStudioOperator();
    const [items, publications] = await Promise.all([
      listWardrobeItems(operator.subject),
      listCataloguePublications(operator.subject),
    ]);
    const publicationsByItem = new Map(publications.map((publication) => [
      publication.wardrobeItemId,
      cataloguePublicationReceipt(publication),
    ]));
    const withCaptures = await Promise.all(items.map(async (item) => ({
      ...item,
      directCaptures: (await getWardrobeCaptureWorkspace(item.id, operator)).captures,
      ...(publicationsByItem.has(item.id) ? { publication: publicationsByItem.get(item.id)! } : {}),
    })));
    return engineJson({ items: withCaptures });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
