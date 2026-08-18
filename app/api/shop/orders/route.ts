import {
  requireCustomerActor,
  resolveCustomerActor,
} from "@/lib/shop/server-order/actors";
import { readShopJson, shopJson, shopRoute } from "@/lib/shop/server-order/http";
import { requireShopPaymentInstructions } from "@/lib/shop/server-order/commerce-guidance";
import { flushOrderNotificationsAfterMutation } from "@/lib/shop/server-order/email-notifications";
import { getShopOrderService } from "@/lib/shop/server-order/runtime";
import { parseOrderListQuery } from "@/lib/shop/server-order/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return shopRoute(async () => {
    const actor = requireCustomerActor(await resolveCustomerActor(request));
    requireShopPaymentInstructions();
    const order = await getShopOrderService().createOrder(actor, await readShopJson(request));
    await flushOrderNotificationsAfterMutation();
    return shopJson({ ok: true, order }, { status: 201 });
  });
}

export async function GET(request: Request): Promise<Response> {
  return shopRoute(async () => {
    const actor = requireCustomerActor(await resolveCustomerActor(request));
    const page = await getShopOrderService().pageCustomerOrders(
      actor,
      parseOrderListQuery(new URL(request.url).searchParams),
    );
    return shopJson({ ok: true, ...page });
  });
}
