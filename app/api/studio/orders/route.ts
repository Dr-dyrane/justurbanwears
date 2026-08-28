import {
  requireOperatorActor,
  resolveOperatorActor,
} from "@/lib/shop/server-order/actors";
import { readShopJson, shopJson, shopRoute } from "@/lib/shop/server-order/http";
import { getShopOrderService } from "@/lib/shop/server-order/runtime";
import { flushOrderNotificationsAfterMutation } from "@/lib/shop/server-order/email-notifications";
import { requireShopPaymentInstructions } from "@/lib/shop/server-order/commerce-guidance";
import { parseOrderListQuery } from "@/lib/shop/server-order/validation";
import { parseAssistedOrder } from "@/lib/shop/server-order/validation";
import { loadServerShopProducts } from "@/lib/shop/server-catalog";
import { listStudioOrderablePieceSkus } from "@/lib/server/studio-authority-repository";
import type { StudioOperator } from "@/lib/server/studio-operator";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return shopRoute(async () => {
    const actor = requireOperatorActor(await resolveOperatorActor(request));
    const studioOperator: StudioOperator = {
      subject: actor.subject,
      email: actor.email ?? "",
      displayName: actor.displayName ?? actor.email ?? "Studio operator",
      role: actor.role,
    };
    const [page, products, eligibleResult] = await Promise.all([
      getShopOrderService().pageOperatorOrders(
        actor,
        parseOrderListQuery(new URL(request.url).searchParams),
      ),
      loadServerShopProducts(),
      listStudioOrderablePieceSkus(studioOperator)
        .then((skus) => ({ ok: true as const, skus }))
        .catch(() => ({ ok: false as const, skus: new Set<string>() })),
    ]);
    await flushOrderNotificationsAfterMutation();
    return shopJson({
      ok: true,
      ...page,
      productsReady: eligibleResult.ok,
      products: products.filter((product) => (
        product.availability === "AVAILABLE"
        && product.availabilityConfirmed
        && eligibleResult.skus.has(product.sku)
      )).map((product) => ({
        slug: product.slug,
        sku: product.sku,
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
    const body = await readShopJson(request);
    parseAssistedOrder(body);
    const order = await getShopOrderService().createAssistedOrder(actor, body);
    await flushOrderNotificationsAfterMutation();
    return shopJson({ ok: true, order }, { status: 201 });
  });
}
