import type { Metadata } from "next";
import { ShopCheckout } from "../../../components/shop/shop-checkout";
import { normalizeWhatsAppOrderNumber } from "../../../lib/shop/whatsapp-order";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Review your bag, delivery choice, and order total.",
};

export default function CheckoutPage() {
  return (
    <ShopCheckout
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? ""}
      whatsappOrderNumber={normalizeWhatsAppOrderNumber(
        process.env.SHOP_WHATSAPP_ORDER_NUMBER,
      )}
    />
  );
}
