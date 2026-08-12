import { AppShell } from "../../components/studio/app-shell";
import { requireStudioOperator } from "../../lib/server/studio-operator";
import { StudioEngineError } from "../../lib/studio/engine/errors";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  if (process.env.STUDIO_AI_ENGINE_AUTH_MODE) {
    try {
      await requireStudioOperator();
    } catch (error) {
      if (error instanceof StudioEngineError && error.code === "AUTH_REQUIRED") {
        redirect("/auth/sign-in?returnTo=/studio");
      }
      if (error instanceof StudioEngineError && error.code === "OPERATOR_FORBIDDEN") {
        redirect("/auth/sign-in?returnTo=/studio&access=denied");
      }
      throw error;
    }
  }
  return <AppShell>{children}</AppShell>;
}
