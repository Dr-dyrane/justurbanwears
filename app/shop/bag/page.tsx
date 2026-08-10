import type { Metadata } from "next";
import { ShopBag } from "../../../components/shop/shop-bag";

export const metadata: Metadata = {
  title: "Your bag",
};

export default function BagPage() {
  return <ShopBag />;
}
