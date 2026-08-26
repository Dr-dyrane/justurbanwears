import { studioAtelierHttpHandlers } from "@/lib/server/studio-atelier-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return studioAtelierHttpHandlers.prepare(request);
}
