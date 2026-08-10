import type { Metadata } from "next";
import { ShopOrders } from "../../../components/shop/shop-orders";

export const metadata: Metadata = {
  title: "Saved checkouts",
  description: "Review checkouts saved on this device.",
};

export default function OrdersPage() {
  return <ShopOrders />;
}
