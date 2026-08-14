import {
  requireCustomerActor,
  resolveCustomerActor,
} from "@/lib/shop/server-order/actors";
import {
  readShopJson,
  routeParam,
  shopJson,
  shopRoute,
  type ShopRouteContext,
} from "@/lib/shop/server-order/http";
import { getShopOrderService } from "@/lib/shop/server-order/runtime";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: ShopRouteContext): Promise<Response> {
  return shopRoute(async () => {
    const actor = requireCustomerActor(await resolveCustomerActor(request));
    const order = await getShopOrderService().requestReturn(
      actor,
      await routeParam(context, "reference"),
      await readShopJson(request),
    );
    return shopJson({ ok: true, order, timeline: order.events }, { status: 201 });
  });
}
