import { getStudioApplicationProjection, projectScenarioStudioApplication } from "../../../../lib/server/studio-application-projection";
import { requireStudioOperator } from "../../../../lib/server/studio-operator";
import { StudioEngineError, engineErrorResponse } from "../../../../lib/studio/engine/errors";
import { engineJson } from "../../../../lib/studio/engine/http";
import { isStudioScenario } from "../../../../lib/studio/simulator";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const operator = await requireStudioOperator();
    const scenario = new URL(request.url).searchParams.get("scenario");
    if (scenario) {
      if (process.env.NODE_ENV !== "development" || !isStudioScenario(scenario)) {
        throw new StudioEngineError(
          "INVALID_REQUEST",
          400,
          "That Studio scenario is unavailable.",
          "Return to connected Studio.",
        );
      }
      return engineJson(projectScenarioStudioApplication({
        operator,
        now: new Date().toISOString(),
        scenario,
      }));
    }
    return engineJson(await getStudioApplicationProjection(operator));
  } catch (error) {
    return engineErrorResponse(error);
  }
}
