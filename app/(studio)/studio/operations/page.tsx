import type { Metadata } from "next";
import { OperationsDesk } from "../../../../components/studio/operations-desk";

export const metadata: Metadata = {
  title: "Operations · Studio",
  description: "Review Studio inventory, holds, location checks and operational attention.",
};

export default function StudioOperationsPage() {
  return <OperationsDesk />;
}
