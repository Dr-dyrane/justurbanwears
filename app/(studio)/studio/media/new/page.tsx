import type { Metadata } from "next";
import { ShootComposer } from "../../../../../components/shoot/shoot-composer";

export const metadata: Metadata = {
  title: "New media · Studio",
  description: "Compose a clearly marked private mock set.",
};

export default function StudioMediaComposerPage() {
  return <ShootComposer />;
}
