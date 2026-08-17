import type { Metadata } from "next";
import { GarmentDossier } from "../../../../../components/studio/garment-dossier";

export const metadata: Metadata = {
  title: "Piece · Studio",
  description: "Review garment truth, media, inventory, and the next legal action.",
};

export default function StudioGarmentDossierPage() {
  return <GarmentDossier />;
}
