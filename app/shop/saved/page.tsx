import type { Metadata } from "next";
import { SavedProducts } from "../../../components/shop/saved-products";

export const metadata: Metadata = {
  title: "Saved pieces",
};

export default function SavedPage() {
  return <SavedProducts />;
}
