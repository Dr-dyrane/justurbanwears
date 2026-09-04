import type { Metadata } from "next";
import { StudioRouteRecovery } from "../../../../components/studio/navigation/studio-route-recovery";

export const metadata: Metadata = {
  title: "Page not found · Studio",
  description: "Return to the current JustUrbanWears Studio workflow.",
};

export default function UnknownStudioPage() {
  return <StudioRouteRecovery kind="not-found" />;
}
