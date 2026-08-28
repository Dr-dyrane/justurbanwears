import { studioAtelierShopAdoptionHttpHandlers } from
  "@/lib/server/studio-atelier-publication-adoption-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = Readonly<{
  params: Promise<Readonly<{ id: string }>>;
}>;

export function GET(request: Request, context: Context): Promise<Response> {
  return studioAtelierShopAdoptionHttpHandlers.GET(request, context);
}

export function POST(request: Request, context: Context): Promise<Response> {
  return studioAtelierShopAdoptionHttpHandlers.POST(request, context);
}
