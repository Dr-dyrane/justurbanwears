import type {
  StudioAtelierShopAdoptionReview,
} from "../studio/atelier/publication-adoption-contracts";
import {
  createStudioAtelierShopAdoptionReviewService,
  createStudioAtelierShopAdoptionService,
} from "./studio-atelier-publication-adoption";
import {
  createStudioAtelierShopAdoptionProductionLedger,
} from "./studio-atelier-publication-adoption-ledger";
import {
  studioAtelierShopAdoptionSqlRepository,
  type StudioAtelierShopAdoptionSqlRepository,
} from "./studio-atelier-publication-adoption-ledger-repository";
import type { StudioOperator } from "./studio-operator";

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
  const reviewLocks = input.review ?? createStudioAtelierShopAdoptionReviewService();
  const adopt = createStudioAtelierShopAdoptionService({
    ledger: createStudioAtelierShopAdoptionProductionLedger({ repository }),
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
