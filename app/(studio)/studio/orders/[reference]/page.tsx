import type { Metadata } from "next";
import { ConnectedOrderDetail } from "../../../../../components/studio/connected-order-detail";

export const metadata: Metadata = {
  title: "Order action desk · Studio",
  description: "Review evidence, confirm settled funds, and progress fulfilment.",
};

export default function StudioOrderDetailPage() {
  return <ConnectedOrderDetail />;
}
