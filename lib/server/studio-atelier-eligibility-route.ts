import { z } from "zod";
import { StudioEngineError, engineErrorResponse } from "../studio/engine/errors";
import { engineJson } from "../studio/engine/http";
import type { StudioAtelierEligibilityService } from "./studio-atelier-eligibility-service";

type WardrobeItemContext = Readonly<{
  params: Promise<Readonly<{ id: string }>>;
}>;

type EligibilityOperator = Readonly<{ subject: string }>;
type RequireEligibilityOperator = () => Promise<EligibilityOperator>;

const wardrobeItemIdSchema = z.string().uuid();

function invalidWardrobeItem(): StudioEngineError {
  return new StudioEngineError(
    "INVALID_REQUEST",
    400,
    "That Atelier garment request is invalid.",
    "Open the exact garment from Wardrobe.",
  );
}

/**
 * Auth is injected deliberately. This read handler has no concrete repository,
 * runtime, readiness probe, ownership fence, provider, or mutation dependency.
 */
export function createStudioAtelierEligibilityHttpHandler(input: Readonly<{
  service: StudioAtelierEligibilityService;
  requireOperator: RequireEligibilityOperator;
}>) {
  return async function readStudioAtelierEligibility(
    _request: Request,
    context: WardrobeItemContext,
  ): Promise<Response> {
    try {
      // Authenticate first so malformed object paths do not bypass the Studio
      // operator boundary or reveal whether a wardrobe record may exist.
      const operator = await input.requireOperator();
      const { id } = await context.params;
      const wardrobeItemId = wardrobeItemIdSchema.safeParse(id);
      if (!wardrobeItemId.success) throw invalidWardrobeItem();

      return engineJson(
        await input.service.read(operator.subject, wardrobeItemId.data),
      );
    } catch (error) {
      return engineErrorResponse(error);
    }
  };
}
