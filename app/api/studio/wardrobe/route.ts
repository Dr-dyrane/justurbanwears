import { listWardrobeItems } from "../../../../lib/server/studio-intake-repository";
import { requireStudioOperator } from "../../../../lib/server/studio-operator";
import { engineErrorResponse } from "../../../../lib/studio/engine/errors";
import { engineJson } from "../../../../lib/studio/engine/http";
import { getWardrobeCaptureWorkspace } from "../../../../lib/studio/engine/pending-capture-service";
import { getStudioPublicationReview } from "../../../../lib/studio/engine/catalogue-publication-service";
import {
  cataloguePublicationReceipt,
  listCataloguePublications,
} from "../../../../lib/server/studio-catalogue-publication-repository";
import { projectStudioNativeShopReadiness } from "../../../../lib/studio/projections/publishing-queue";

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
    const withCaptures = await Promise.all(items.map(async (item) => {
      const knownPublication = publicationsByItem.get(item.id);
      const [captureWorkspace, publicationReview] = await Promise.all([
        getWardrobeCaptureWorkspace(item.id, operator),
        knownPublication ? Promise.resolve(null) : getStudioPublicationReview(item.id, operator),
      ]);
      const publication = knownPublication
        ?? (publicationReview?.state === "PUBLISHED" ? publicationReview.receipt : undefined);
      const nativeShopReadiness = projectStudioNativeShopReadiness(publicationReview);
      return {
        ...item,
        directCaptures: captureWorkspace.captures,
        ...(publication ? { publication } : {}),
        ...(nativeShopReadiness ? { nativeShopReadiness } : {}),
      };
    }));
    return engineJson({ items: withCaptures });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
