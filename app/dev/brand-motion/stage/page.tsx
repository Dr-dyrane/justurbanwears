import { notFound } from "next/navigation";
import { GlobalBrandLoadingStage } from "../../../../components/brand/global-brand-loading-stage";

export default function GlobalBrandLoadingStagePreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <GlobalBrandLoadingStage delayMs={0} />;
}
