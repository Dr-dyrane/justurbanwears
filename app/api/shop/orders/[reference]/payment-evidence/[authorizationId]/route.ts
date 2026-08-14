import {
  requireCustomerActor,
  resolveCustomerActor,
} from "@/lib/shop/server-order/actors";
import {
  routeParam,
  shopJson,
  shopRoute,
  type ShopRouteContext,
} from "@/lib/shop/server-order/http";
import {
  uploadAuthorizedPaymentEvidence,
  vercelPrivatePaymentEvidenceBlobStore,
} from "@/lib/shop/server-order/payment-evidence";
import { getShopOrderService } from "@/lib/shop/server-order/runtime";
import { PAYMENT_EVIDENCE_RECEIVED_NOTICE } from "@/lib/shop/server-order/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(request: Request, context: ShopRouteContext): Promise<Response> {
  return shopRoute(async () => {
    const actor = requireCustomerActor(await resolveCustomerActor(request));
    const order = await uploadAuthorizedPaymentEvidence(
      getShopOrderService(),
      vercelPrivatePaymentEvidenceBlobStore,
      actor,
      await routeParam(context, "reference"),
      await routeParam(context, "authorizationId"),
      request,
    );
    return shopJson({
      ok: true,
      order,
      timeline: order.events,
      evidence: { status: "RECEIVED", notice: PAYMENT_EVIDENCE_RECEIVED_NOTICE },
    });
  });
}
