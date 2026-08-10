import type { Metadata } from "next";
import { ProductDetail } from "../../../../components/shop/product-detail";

export const metadata: Metadata = {
  title: "Product detail",
  description: "Product availability, fit, condition, and garment measurements.",
};

export default function ShopProductPage() {
  return <ProductDetail />;
}
