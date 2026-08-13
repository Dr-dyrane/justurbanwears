import type { Metadata } from "next";
import { ShopOrders } from "../../../components/shop/shop-orders";

export const metadata: Metadata = {
  title: "Checkout drafts",
  description: "Review checkout drafts saved on this device.",
};

export default function OrdersPage() {
  return <ShopOrders />;
}
