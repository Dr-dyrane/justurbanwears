import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShopOrders } from "../../../components/shop/shop-orders";
import { getShopCustomerSession } from "../../../lib/auth/customer";
import { authSignInPath } from "../../../lib/auth/return-to";
import {
  customerActorFromSession,
  requireCustomerActor,
} from "../../../lib/shop/server-order/actors";
import { getShopOrderService } from "../../../lib/shop/server-order/runtime";
import type { ShopServerOrder } from "../../../lib/shop/server-order/types";

export const metadata: Metadata = {
  title: "Your orders",
  description: "Track payment, delivery, pickup, and return updates for your orders.",
};

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const actor = customerActorFromSession(await getShopCustomerSession());
  if (!actor) redirect(authSignInPath("/shop/orders"));

  let initialError = "";
  let orders: ShopServerOrder[] = [];
  try {
    orders = await getShopOrderService().listCustomerOrders(requireCustomerActor(actor));
  } catch {
    initialError = "Your orders could not be opened. Try again.";
  }

  return <ShopOrders initialError={initialError} initialOrders={orders} />;
}
