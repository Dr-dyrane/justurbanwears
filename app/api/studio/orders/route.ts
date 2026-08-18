import {
  requireOperatorActor,
  resolveOperatorActor,
} from "@/lib/shop/server-order/actors";
import { readShopJson, shopJson, shopRoute } from "@/lib/shop/server-order/http";
import { getShopOrderService } from "@/lib/shop/server-order/runtime";
import { flushOrderNotificationsAfterMutation } from "@/lib/shop/server-order/email-notifications";
import { requireShopPaymentInstructions } from "@/lib/shop/server-order/commerce-guidance";
import { parseOrderListQuery } from "@/lib/shop/server-order/validation";
import { loadServerShopProducts } from "@/lib/shop/server-catalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return shopRoute(async () => {
    const actor = requireOperatorActor(await resolveOperatorActor(request));
    const [page, products] = await Promise.all([
      getShopOrderService().pageOperatorOrders(
        actor,
        parseOrderListQuery(new URL(request.url).searchParams),
      ),
      loadServerShopProducts(),
    ]);
    await flushOrderNotificationsAfterMutation();
    return shopJson({
      ok: true,
      ...page,
      products: products.filter((product) => (
        product.availability === "AVAILABLE" && product.availabilityConfirmed
      )).map((product) => ({
        slug: product.slug,
        name: product.name,
        taggedSize: product.taggedSize,
        price: product.price,
      })),
    });
  });
}

export async function POST(request: Request): Promise<Response> {
  return shopRoute(async () => {
    const actor = requireOperatorActor(await resolveOperatorActor(request));
    requireShopPaymentInstructions();
    const order = await getShopOrderService().createAssistedOrder(actor, await readShopJson(request));
    await flushOrderNotificationsAfterMutation();
    return shopJson({ ok: true, order }, { status: 201 });
  });
}
