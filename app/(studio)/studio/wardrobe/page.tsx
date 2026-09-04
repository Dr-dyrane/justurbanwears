import type { Metadata } from "next";
import { WardrobeWorkbench } from "../../../../components/studio/wardrobe-workbench";

export const metadata: Metadata = {
  title: "Wardrobe · Studio",
  description: "Manage Studio garments, drops, listing readiness and archived pieces.",
};

export default function StudioWardrobePage() {
  return <WardrobeWorkbench />;
}
