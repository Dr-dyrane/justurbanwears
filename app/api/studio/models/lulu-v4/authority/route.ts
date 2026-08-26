import {
  describeLuluV4Authority,
  parseLuluV4View,
  resolveLuluV4AuthorityStack,
} from "../../../../../../lib/server/studio-lulu-v4-authority";
import { requireStudioOperator } from "../../../../../../lib/server/studio-operator";
import { engineErrorResponse } from "../../../../../../lib/studio/engine/errors";
import { engineJson } from "../../../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireStudioOperator();
    const view = parseLuluV4View(new URL(request.url).searchParams.get("view"));
    await resolveLuluV4AuthorityStack(view);
    return engineJson({ ready: true, authority: describeLuluV4Authority(view) });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
