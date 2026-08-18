import { getShopCommerceGuidance } from "@/lib/shop/server-order/commerce-guidance";
import { shopJson } from "@/lib/shop/server-order/http";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return shopJson({ ok: true, guidance: getShopCommerceGuidance() });
}
