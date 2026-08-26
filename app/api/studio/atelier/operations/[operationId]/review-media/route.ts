import { studioAtelierHttpHandlers } from "@/lib/server/studio-atelier-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ operationId: string }> },
): Promise<Response> {
  return studioAtelierHttpHandlers.reviewMedia(request, context);
}
