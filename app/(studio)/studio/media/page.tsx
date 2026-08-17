import type { Metadata } from "next";
import { ShootGallery } from "../../../../components/shoot/shoot-gallery";

export const metadata: Metadata = {
  title: "Media · Studio",
  description: "Review private visual work and its decisions.",
};

export default function StudioMediaPage() {
  return <ShootGallery />;
}
