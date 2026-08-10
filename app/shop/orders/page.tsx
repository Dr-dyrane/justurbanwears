import type { Metadata } from "next";
import { ShopOrders } from "../../../components/shop/shop-orders";

export const metadata: Metadata = {
  title: "Orders",
  description: "Review orders and their latest status.",
};

export default function OrdersPage() {
  return <ShopOrders />;
}
