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
import { PAYMENT_EVIDENCE_AUTHORIZATION_NOTICE } from "@/lib/shop/server-order/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: ShopRouteContext): Promise<Response> {
  return shopRoute(async () => {
    const actor = requireCustomerActor(await resolveCustomerActor(request));
    const reference = await routeParam(context, "reference");
    const authorization = await getShopOrderService().authorizePaymentEvidence(
      actor,
      reference,
      await readShopJson(request),
    );
    return shopJson({
      ok: true,
      authorization: {
        id: authorization.id,
        method: "PUT",
        uploadUrl: `/api/shop/orders/${encodeURIComponent(reference)}/payment-evidence/${authorization.id}`,
        contentType: authorization.contentType,
        byteSize: authorization.byteSize,
        sha256: authorization.sha256,
        expiresAt: authorization.expiresAt,
        requiredHeaders: {
          "content-type": authorization.contentType,
          "content-length": String(authorization.byteSize),
          "x-content-sha256": authorization.sha256,
        },
        notice: PAYMENT_EVIDENCE_AUTHORIZATION_NOTICE,
      },
    }, { status: 201 });
  });
}
