import type { Metadata } from "next";
import { StocktakeWorkspace } from "../../../../../components/studio/stocktake-workspace";

export const metadata: Metadata = {
  title: "Scan piece · Studio",
  description: "Compare physical evidence with Studio truth before recording it.",
};

export default async function StudioScanPiecePage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const { sku } = await params;
  return <StocktakeWorkspace mode="scan" pieceKey={decodeURIComponent(sku)} />;
}
