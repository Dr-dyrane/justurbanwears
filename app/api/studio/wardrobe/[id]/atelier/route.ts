import { requireStudioOperator } from "../../../../../../lib/server/studio-operator";
import { studioAtelierEligibilityService } from "../../../../../../lib/server/studio-atelier-eligibility-composition";
import { createStudioAtelierEligibilityHttpHandler } from "../../../../../../lib/server/studio-atelier-eligibility-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = createStudioAtelierEligibilityHttpHandler({
  requireOperator: requireStudioOperator,
  service: studioAtelierEligibilityService,
});
