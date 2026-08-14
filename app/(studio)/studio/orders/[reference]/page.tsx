import type { Metadata } from "next";
import { ConnectedOrderDetail } from "../../../../../components/studio/connected-order-detail";

export const metadata: Metadata = {
  title: "Order · Studio",
  description: "Check payment, prepare delivery, and manage returns.",
};

export default function StudioOrderDetailPage() {
  return <ConnectedOrderDetail />;
}
