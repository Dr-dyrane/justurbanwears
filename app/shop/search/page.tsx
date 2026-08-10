import type { Metadata } from "next";
import { ShopSearch } from "../../../components/shop/shop-search";

export const metadata: Metadata = {
  title: "Search the edit",
  description: "Search and refine the justurban wears public catalogue.",
};

export default function SearchPage() {
  return <ShopSearch />;
}
