import { studioAtelierHttpHandlers } from "@/lib/server/studio-atelier-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ operationId: string }> },
): Promise<Response> {
  return studioAtelierHttpHandlers.decision(request, context);
}
