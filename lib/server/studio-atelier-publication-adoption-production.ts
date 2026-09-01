import type {
  StudioAtelierShopAdoptionReview,
} from "../studio/atelier/publication-adoption-contracts";
import {
  createStudioAtelierShopAdoptionReviewService,
  createStudioAtelierShopAdoptionService,
  type StudioAtelierShopPublicationAuthority,
} from "./studio-atelier-publication-adoption";
import {
  createStudioAtelierShopAdoptionProductionLedger,
} from "./studio-atelier-publication-adoption-ledger";
import {
  studioAtelierShopAdoptionSqlRepository,
  type StudioAtelierShopAdoptionTarget,
  type StudioAtelierShopAdoptionSqlRepository,
} from "./studio-atelier-publication-adoption-ledger-repository";
import type { StudioOperator } from "./studio-operator";
import { StudioEngineError } from "../studio/engine/errors";

function publicationAuthorityFor(
  target: StudioAtelierShopAdoptionTarget,
): StudioAtelierShopPublicationAuthority {
  return Object.freeze({
    expectedItemVersion: target.expectedVersion,
    listingFacts: Object.freeze({
      title: target.title,
      description: target.description,
      category: target.category,
      colour: target.colour,
      sizeLabel: target.sizeLabel,
      condition: target.condition,
      price: target.price,
    }),
  });
}

export type StudioAtelierShopAdoptionProductionService = Readonly<{
  review(input: Readonly<{
    operator: StudioOperator;
    wardrobeItemId: string;
  }>): Promise<StudioAtelierShopAdoptionReview>;
  adopt(input: Readonly<{
    operator: StudioOperator;
    command: unknown;
  }>): ReturnType<ReturnType<typeof createStudioAtelierShopAdoptionService>>;
}>;

export function createStudioAtelierShopAdoptionProductionService(input: Readonly<{
  repository?: StudioAtelierShopAdoptionSqlRepository;
  review?: ReturnType<typeof createStudioAtelierShopAdoptionReviewService>;
}> = {}): StudioAtelierShopAdoptionProductionService {
  const repository = input.repository ?? studioAtelierShopAdoptionSqlRepository;
  const readPublicationAuthority = async (identity: Readonly<{
    operatorSubject: string;
    wardrobeItemId: string;
  }>) => {
    const target = await repository.loadPublishableTarget(identity);
    if (!target) {
      throw new StudioEngineError(
        "VERSION_CONFLICT",
        409,
        "The reviewed Shop listing changed or is no longer publishable.",
        "Reload the Atelier Shop review before publishing.",
      );
    }
    return publicationAuthorityFor(target);
  };
  const reviewLocks = input.review ?? createStudioAtelierShopAdoptionReviewService({
    readPublicationAuthority,
  });
  const adopt = createStudioAtelierShopAdoptionService({
    ledger: createStudioAtelierShopAdoptionProductionLedger({ repository }),
    dependencies: { readPublicationAuthority },
  });
  return Object.freeze({
    async review(reviewInput) {
      await repository.assertReady();
      const target = await repository.loadPublishableTarget({
        operatorSubject: reviewInput.operator.subject,
        wardrobeItemId: reviewInput.wardrobeItemId,
      });
      if (!target) return Object.freeze({
        state: "BLOCKED",
        wardrobeItemId: reviewInput.wardrobeItemId,
        blockers: Object.freeze([
          "This piece is archived, already published, or missing required Shop facts",
        ]),
      });
      return reviewLocks(reviewInput);
    },
    adopt,
  });
}

export const studioAtelierShopAdoptionProductionService =
  createStudioAtelierShopAdoptionProductionService();
