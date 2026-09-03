import {
  requireOperatorActor,
  resolveOperatorActor,
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
    const actor = requireOperatorActor(await resolveOperatorActor(request));
    const result = await getShopOrderService().getOperatorTransitionResult(
      actor,
      await routeParam(context, "reference"),
      new URL(request.url).searchParams.get("idempotencyKey"),
    );
    return shopJson(result
      ? { ok: true, ...result, timeline: result.order.events }
      : { ok: true, receipt: null });
  });
}

export async function POST(request: Request, context: ShopRouteContext): Promise<Response> {
  return shopRoute(async () => {
    const actor = requireOperatorActor(await resolveOperatorActor(request));
    const result = await getShopOrderService().transitionOrderWithReceipt(
      actor,
      await routeParam(context, "reference"),
      await readShopJson(request),
    );
    await flushOrderNotificationsAfterMutation();
    return shopJson({ ok: true, ...result, timeline: result.order.events });
  });
}
