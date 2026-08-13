import { getChatGPTUser } from "../../app/chatgpt-auth";
import { getNeonAuth } from "../auth/neon";
import { getStudioOperatorMembership } from "./studio-operator-membership";
import { StudioEngineError } from "../studio/engine/errors";

export type StudioOperator = {
  subject: string;
  email: string;
  displayName: string;
  role: "operator" | "admin";
};

export async function requireStudioOperator(): Promise<StudioOperator> {
  const mode = process.env.STUDIO_AI_ENGINE_AUTH_MODE;
  if (mode !== "openai-sites" && mode !== "neon-auth") {
    throw new StudioEngineError(
      "ENGINE_DISABLED",
      503,
      "Studio AI is not enabled for this host.",
      "Use the approved Studio workspace.",
    );
  }
  const user = mode === "neon-auth"
    ? await getNeonAuth().getSession().then(({ data }) => data?.user
      ? {
          userId: data.user.id,
          email: data.user.email,
          displayName: data.user.name || data.user.email,
        }
      : null)
    : await getChatGPTUser();
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
  const normalizedEmail = user.email.trim().toLowerCase();
  if (!allowlist.has(normalizedEmail)) {
    throw new StudioEngineError(
      "OPERATOR_FORBIDDEN",
      403,
      "This account does not have Studio access.",
      "Ask an administrator to add your account.",
    );
  }
  const membership = mode === "neon-auth"
    ? await getStudioOperatorMembership({ subject: user.userId, email: normalizedEmail, bootstrap: true })
    : { role: "operator" as const };
  if (!membership) {
    throw new StudioEngineError(
      "OPERATOR_FORBIDDEN",
      403,
      "This account does not have Studio access.",
      "Ask an administrator to restore your Studio membership.",
    );
  }
  return { subject: user.userId, email: user.email, displayName: user.displayName, role: membership.role };
}
