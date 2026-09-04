import type { Metadata } from "next";
import { ModelAtelier } from "../../../../components/studio/model-atelier";

export const metadata: Metadata = {
  title: "Models · Studio",
  description: "Review Studio model profiles, styling and private authority records.",
};

export default function StudioModelsPage() {
  return <ModelAtelier />;
}
