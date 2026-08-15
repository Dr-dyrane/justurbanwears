import "../studio-atelier.css";
import { AppShell } from "../../components/studio/app-shell";
import { requireStudioOperator } from "../../lib/server/studio-operator";
import { StudioEngineError } from "../../lib/studio/engine/errors";
import { authSignInPath } from "../../lib/auth/return-to";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const candidateReturnTo = requestHeaders.get("x-justurbanwears-studio-return-to");
  const returnToHasControlCharacter = candidateReturnTo
    ? [...candidateReturnTo].some((character) => {
        const code = character.charCodeAt(0);
        return code <= 0x1f || code === 0x7f;
      })
    : false;
  const returnTo = candidateReturnTo
    && candidateReturnTo.startsWith("/studio")
    && !candidateReturnTo.startsWith("//")
    && candidateReturnTo.length <= 2_048
    && !returnToHasControlCharacter
    ? candidateReturnTo
    : "/studio";
  let operator = null;
  if (process.env.STUDIO_AI_ENGINE_AUTH_MODE) {
    try {
      operator = await requireStudioOperator();
    } catch (error) {
      if (error instanceof StudioEngineError && error.code === "AUTH_REQUIRED") {
        redirect(authSignInPath(returnTo));
      }
      if (error instanceof StudioEngineError && error.code === "OPERATOR_FORBIDDEN") {
        redirect(`${authSignInPath(returnTo)}&access=denied`);
      }
      throw error;
    }
  }
  return <AppShell operator={operator}>{children}</AppShell>;
}
