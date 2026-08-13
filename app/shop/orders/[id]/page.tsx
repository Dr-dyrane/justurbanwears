import type { Metadata } from "next";
import { OrderStatus } from "../../../../components/shop/order-status";

export const metadata: Metadata = {
  title: "Checkout status",
  description: "Review a checkout draft saved on this device.",
};

export default function OrderStatusPage() {
  return <OrderStatus />;
}
