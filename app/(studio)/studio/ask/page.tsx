import type { Metadata } from "next";
import { StudioAskSurface } from "../../../../components/studio/navigation/studio-ask-surface";

export const metadata: Metadata = {
  title: "Ask Studio · justurban wears",
  description: "Resolve Studio state and open safely prepared operator actions.",
};

export default function StudioAskPage() {
  return <StudioAskSurface />;
}
