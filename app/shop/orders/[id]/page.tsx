import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OrderStatus } from "../../../../components/shop/order-status";
import { getShopCustomerSession } from "../../../../lib/auth/customer";
import { authSignInPath } from "../../../../lib/auth/return-to";
import {
  customerActorFromSession,
  requireCustomerActor,
} from "../../../../lib/shop/server-order/actors";
import { getShopOrderService } from "../../../../lib/shop/server-order/runtime";
import {
  ShopOrderError,
  type ShopServerOrder,
} from "../../../../lib/shop/server-order/types";

export const metadata: Metadata = {
  title: "Order status",
  description: "Review the latest confirmed payment, handoff, and return state for your order.",
};

export const dynamic = "force-dynamic";

export default async function OrderStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const returnTo = `/shop/orders/${encodeURIComponent(id)}`;
  const actor = customerActorFromSession(await getShopCustomerSession());
  if (!actor) redirect(authSignInPath(returnTo));

  let initialError = "";
  let initialOrder: ShopServerOrder | null = null;
  let initialState: "error" | "not-found" | "ready" = "error";
  try {
    initialOrder = await getShopOrderService().getCustomerOrder(
      requireCustomerActor(actor),
      id,
    );
    initialState = "ready";
  } catch (error) {
    if (error instanceof ShopOrderError && error.code === "NOT_FOUND") {
      initialState = "not-found";
    } else {
      initialError = "This order could not be opened. Try again.";
    }
  }

  return (
    <OrderStatus
      initialError={initialError}
      initialOrder={initialOrder}
      initialState={initialState}
      reference={id}
    />
  );
}
