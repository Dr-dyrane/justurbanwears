import type { Metadata } from "next";
import { ShopCheckout } from "../../../components/shop/shop-checkout";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Review your bag, delivery choice, and order total.",
};

export default function CheckoutPage() {
  return <ShopCheckout />;
}
