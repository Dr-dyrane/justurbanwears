import { listStudioMediaAuthority } from "../../../../lib/server/studio-authority-repository";
import { requireStudioOperator } from "../../../../lib/server/studio-operator";
import { engineErrorResponse } from "../../../../lib/studio/engine/errors";
import { engineJson } from "../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const operator = await requireStudioOperator();
    return engineJson({ media: await listStudioMediaAuthority(operator) });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
