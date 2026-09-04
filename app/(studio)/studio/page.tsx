import type { Metadata } from "next";
import { StudioHome } from "../../../components/studio/studio-home";

export const metadata: Metadata = {
  title: "Studio",
  description: "Run the shared JustUrbanWears wardrobe, media, orders and operations workspace.",
};

export default function StudioPage() {
  return <StudioHome />;
}
