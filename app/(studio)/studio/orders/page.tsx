import type { Metadata } from "next";
import { ConnectedOrderInbox } from "../../../../components/studio/connected-order-inbox";

export const metadata: Metadata = {
  title: "Connected orders · Studio",
  description: "Review customer reservations and progress each order safely.",
};

export default function StudioOrdersPage() {
  return <ConnectedOrderInbox />;
}
