import { getChatGPTUser } from "../../app/chatgpt-auth";
import { getNeonAuth } from "../auth/neon";
import { getStudioOperatorMembership } from "./studio-operator-membership";
import { projectStudioOperator } from "./studio-operator-projection";
import type { StudioOperator } from "./studio-operator-projection";
import { StudioEngineError } from "../studio/engine/errors";

export {
  projectStudioOperator,
  studioOperatorClientProfile,
} from "./studio-operator-projection";
export type {
  StudioOperatorClientProfile,
  StudioOperatorRole,
} from "./studio-operator-projection";
export type { StudioOperator };

export async function requireStudioOperator(): Promise<StudioOperator> {
  const mode = process.env.STUDIO_AI_ENGINE_AUTH_MODE;
  if (mode !== "openai-sites" && mode !== "neon-auth") {
    const localDevelopment = process.env.NODE_ENV === "development";
    throw new StudioEngineError(
      "ENGINE_DISABLED",
      503,
      localDevelopment
        ? "This local Studio host is not configured."
        : "Studio is not configured on this deployment.",
      localDevelopment
        ? "Follow docs/operations/LOCAL-ACCESS.md to restore the linked project's development environment, then restart Studio."
        : "Restore this deployment's Studio server configuration.",
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
    ? await getStudioOperatorMembership({ subject: user.userId, email: normalizedEmail })
    : {
        role: "operator" as const,
        workspaceId: `openai-sites:${user.userId}`,
        dataSubject: user.userId,
      };
  if (!membership) {
    throw new StudioEngineError(
      "OPERATOR_FORBIDDEN",
      403,
      "This account does not have Studio access.",
      "Ask an administrator to restore your Studio membership.",
    );
  }
  return projectStudioOperator({
    actorSubject: user.userId,
    email: user.email,
    displayName: user.displayName,
    membership,
  });
}
