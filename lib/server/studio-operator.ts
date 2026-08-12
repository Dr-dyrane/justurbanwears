import { getChatGPTUser } from "../../app/chatgpt-auth";
import { StudioEngineError } from "../studio/engine/errors";

export type StudioOperator = {
  subject: string;
  email: string;
  displayName: string;
};

export async function requireStudioOperator(): Promise<StudioOperator> {
  if (process.env.STUDIO_AI_ENGINE_AUTH_MODE !== "openai-sites") {
    throw new StudioEngineError(
      "ENGINE_DISABLED",
      503,
      "Studio AI is not enabled for this host.",
      "Use the approved Studio workspace.",
    );
  }
  const user = await getChatGPTUser();
  if (!user) {
    throw new StudioEngineError(
      "AUTH_REQUIRED",
      401,
      "Sign in to use Studio AI.",
      "Sign in, then try again.",
    );
  }
  const allowlist = new Set(
    (process.env.STUDIO_OPERATOR_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  if (!allowlist.has(user.email.trim().toLowerCase())) {
    throw new StudioEngineError(
      "OPERATOR_FORBIDDEN",
      403,
      "This account does not have Studio access.",
      "Ask an administrator to add your account.",
    );
  }
  return { subject: user.userId, email: user.email, displayName: user.displayName };
}
