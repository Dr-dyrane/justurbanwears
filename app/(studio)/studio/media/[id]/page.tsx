import type { Metadata } from "next";
import { ShootDetail } from "../../../../../components/shoot/shoot-detail";

export const metadata: Metadata = {
  title: "Media review · Studio",
  description: "Compare a private frame and record the human decision.",
};

export default function StudioMediaDetailPage() {
  return <ShootDetail />;
}
