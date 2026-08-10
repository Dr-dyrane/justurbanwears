import type { Metadata } from "next";
import { ShopHome } from "../../components/shop/shop-home";

export const metadata: Metadata = {
  title: "Urban ladies’ wear · Curated in Lagos",
  description: "A public edit of clearly described, pre-loved urban womenswear.",
};

export default function ShopPage() {
  return <ShopHome />;
}
