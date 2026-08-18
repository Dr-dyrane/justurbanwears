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
import { flushOrderNotificationsAfterMutation } from "@/lib/shop/server-order/email-notifications";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: ShopRouteContext): Promise<Response> {
  return shopRoute(async () => {
    const actor = requireCustomerActor(await resolveCustomerActor(request));
    const order = await getShopOrderService().getCustomerOrder(
      actor,
      await routeParam(context, "reference"),
    );
    return shopJson({ ok: true, order, timeline: order.events });
  });
}

export async function PATCH(request: Request, context: ShopRouteContext): Promise<Response> {
  return shopRoute(async () => {
    const actor = requireCustomerActor(await resolveCustomerActor(request));
    const order = await getShopOrderService().mutateCustomerOrder(
      actor,
      await routeParam(context, "reference"),
      await readShopJson(request),
    );
    await flushOrderNotificationsAfterMutation();
    return shopJson({ ok: true, order, timeline: order.events });
  });
}
