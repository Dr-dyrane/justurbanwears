import {
  requireCustomerActor,
  resolveCustomerActor,
} from "@/lib/shop/server-order/actors";
import { readShopJson, shopJson, shopRoute } from "@/lib/shop/server-order/http";
import { getShopOrderService } from "@/lib/shop/server-order/runtime";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return shopRoute(async () => {
    const actor = requireCustomerActor(await resolveCustomerActor(request));
    const order = await getShopOrderService().createOrder(actor, await readShopJson(request));
    return shopJson({ ok: true, order }, { status: 201 });
  });
}

export async function GET(request: Request): Promise<Response> {
  return shopRoute(async () => {
    const actor = requireCustomerActor(await resolveCustomerActor(request));
    const orders = await getShopOrderService().listCustomerOrders(actor);
    return shopJson({ ok: true, orders });
  });
}
