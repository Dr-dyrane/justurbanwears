import type { Metadata } from "next";
import { StocktakeWorkspace } from "../../../../components/studio/stocktake-workspace";

export const metadata: Metadata = {
  title: "Stocktake · Studio",
  description: "Confirm each physical piece and resolve only the exceptions.",
};

export default function StudioStocktakePage() {
  return <StocktakeWorkspace mode="stocktake" />;
}
