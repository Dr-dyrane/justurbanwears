import {
  grantStudioAtelierConsent,
  readStudioAtelierConsentStatus,
  revokeStudioAtelierConsent,
  studioAtelierConsentCommandSchema,
} from "../../../../../lib/server/studio-atelier-consent-repository";
import {
  assertStudioAtelierMutationOrigin,
} from "../../../../../lib/server/studio-atelier-http";
import { requireStudioOperator } from "../../../../../lib/server/studio-operator";
import { engineErrorResponse } from "../../../../../lib/studio/engine/errors";
import {
  engineJson,
  parseEngineJson,
} from "../../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const operator = await requireStudioOperator();
    return engineJson({ consent: await readStudioAtelierConsentStatus(operator) });
  } catch (error) {
    return engineErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertStudioAtelierMutationOrigin(request);
    const [operator, command] = await Promise.all([
      requireStudioOperator(),
      parseEngineJson(request, studioAtelierConsentCommandSchema),
    ]);
    const receipt = command.action === "GRANT"
      ? await grantStudioAtelierConsent({ operator, command })
      : await revokeStudioAtelierConsent({ operator, command });
    return engineJson({ receipt });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
