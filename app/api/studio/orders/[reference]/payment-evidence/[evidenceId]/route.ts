import {
  requireOperatorActor,
  resolveOperatorActor,
} from "@/lib/shop/server-order/actors";
import {
  routeParam,
  shopJson,
  shopRoute,
  type ShopRouteContext,
} from "@/lib/shop/server-order/http";
import { getShopOrderService } from "@/lib/shop/server-order/runtime";
import { ShopOrderError } from "@/lib/shop/server-order/types";
import { getShopBlob } from "@/lib/server/vercel-blob";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: ShopRouteContext): Promise<Response> {
  return shopRoute(async () => {
    const actor = requireOperatorActor(await resolveOperatorActor(request));
    const reference = await routeParam(context, "reference");
    const evidenceId = await routeParam(context, "evidenceId");
    const order = await getShopOrderService().getOperatorOrder(actor, reference);
    const evidence = order.evidence.find((item) => item.id === evidenceId);
    if (!evidence || evidence.status !== "RECEIVED" || !evidence.blobPathname) {
      throw new ShopOrderError("NOT_FOUND", "The payment evidence was not found.");
    }

    const result = await getShopBlob("private", evidence.blobPathname, {
      ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
    });
    if (!result) throw new ShopOrderError("NOT_FOUND", "The payment evidence was not found.");
    if (result.statusCode === 304) {
      return new Response(null, {
        status: 304,
        headers: {
          "cache-control": "private, no-cache, no-store",
          etag: result.blob.etag,
        },
      });
    }
    if (result.statusCode !== 200 || !result.stream) {
      return shopJson({ ok: false, error: { code: "NOT_FOUND", message: "The payment evidence was not found." } }, { status: 404 });
    }

    const extension = evidence.contentType === "application/pdf"
      ? "pdf"
      : evidence.contentType === "image/png"
        ? "png"
        : evidence.contentType === "image/webp"
          ? "webp"
          : "jpg";
    return new Response(result.stream, {
      headers: {
        "cache-control": "private, no-cache, no-store",
        "content-disposition": `inline; filename="payment-evidence.${extension}"`,
        "content-type": evidence.contentType,
        etag: result.blob.etag,
        "x-content-type-options": "nosniff",
      },
    });
  });
}
