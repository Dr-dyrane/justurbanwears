import {
  studioAtelierShopAdoptionCommandSchema,
} from "../studio/atelier/publication-adoption-contracts";
import { StudioEngineError, engineErrorResponse } from "../studio/engine/errors";
import { engineJson, parseEngineJson } from "../studio/engine/http";
import { assertStudioAtelierMutationOrigin } from "./studio-atelier-http";
import {
  studioAtelierShopAdoptionProductionService,
  type StudioAtelierShopAdoptionProductionService,
} from "./studio-atelier-publication-adoption-production";
import type { StudioOperator } from "./studio-operator";

type AdoptionContext = Readonly<{
  params: Promise<Readonly<{ id: string }>>;
}>;

type RequireStudioOperator = () => Promise<StudioOperator>;

function routeMismatch(): StudioEngineError {
  return new StudioEngineError(
    "INVALID_REQUEST",
    400,
    "The adoption command does not match this Wardrobe piece.",
    "Reload the piece and retry with its current adoption review.",
  );
}

export function createStudioAtelierShopAdoptionHttpHandlers(input: Readonly<{
  service: StudioAtelierShopAdoptionProductionService;
  requireOperator: RequireStudioOperator;
}>) {
  return Object.freeze({
    async GET(_request: Request, context: AdoptionContext): Promise<Response> {
      try {
        const [operator, { id }] = await Promise.all([
          input.requireOperator(),
          context.params,
        ]);
        return engineJson({
          adoption: await input.service.review({ operator, wardrobeItemId: id }),
        });
      } catch (error) {
        return engineErrorResponse(error);
      }
    },

    async POST(request: Request, context: AdoptionContext): Promise<Response> {
      try {
        assertStudioAtelierMutationOrigin(request);
        const [operator, { id }, command] = await Promise.all([
          input.requireOperator(),
          context.params,
          parseEngineJson(request, studioAtelierShopAdoptionCommandSchema),
        ]);
        if (command.wardrobeItemId !== id) throw routeMismatch();
        return engineJson({
          adoption: await input.service.adopt({ operator, command }),
        });
      } catch (error) {
        return engineErrorResponse(error);
      }
    },
  });
}

export const studioAtelierShopAdoptionHttpHandlers =
  createStudioAtelierShopAdoptionHttpHandlers({
    service: studioAtelierShopAdoptionProductionService,
    requireOperator: async () => {
      const { requireStudioOperator } = await import("./studio-operator");
      return requireStudioOperator();
    },
  });
