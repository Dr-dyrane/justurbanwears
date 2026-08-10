import type { Metadata } from "next";
import { OrderStatus } from "../../../../components/shop/order-status";

export const metadata: Metadata = {
  title: "Order status",
  description: "Review the latest order status.",
};

export default function OrderStatusPage() {
  return <OrderStatus />;
}
