import { studioAtelierPublishedMediaHttpHandlers } from
  "@/lib/server/studio-atelier-publication-media-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = Readonly<{
  params: Promise<Readonly<{ receiptId: string; role: string }>>;
}>;

export function GET(request: Request, context: Context): Promise<Response> {
  return studioAtelierPublishedMediaHttpHandlers.GET(request, context);
}

export function HEAD(request: Request, context: Context): Promise<Response> {
  return studioAtelierPublishedMediaHttpHandlers.HEAD(request, context);
}
