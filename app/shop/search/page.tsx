import type { Metadata } from "next";
import { ShopSearch } from "../../../components/shop/shop-search";

export const metadata: Metadata = {
  title: "Find your next piece",
  description: "Search and refine the justurban wears wardrobe.",
};

export default function SearchPage() {
  return <ShopSearch />;
}
