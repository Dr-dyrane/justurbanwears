import {
  requireOperatorActor,
  resolveOperatorActor,
} from "@/lib/shop/server-order/actors";
import { shopJson, shopRoute } from "@/lib/shop/server-order/http";
import { getShopOrderService } from "@/lib/shop/server-order/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return shopRoute(async () => {
    const actor = requireOperatorActor(await resolveOperatorActor(request));
    const orders = await getShopOrderService().listOperatorOrders(actor);
    return shopJson({ ok: true, orders });
  });
}
