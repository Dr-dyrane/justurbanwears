import type { StudioOperatorMembership } from "./studio-operator-membership";

export type StudioOperatorRole = "operator" | "admin";

export type StudioOperator = Readonly<{
  /** Compatibility data-scope alias. This is never the authenticated human actor. */
  subject: string;
  /** Authenticated human identity used for audit and personal state. */
  actorSubject: string;
  workspaceId: string;
  /** Canonical namespace used by existing operator_subject ownership and hashes. */
  workspaceSubject: string;
  email: string;
  displayName: string;
  role: StudioOperatorRole;
}>;

export type StudioOperatorClientProfile = Readonly<Pick<
  StudioOperator,
  "email" | "displayName" | "role"
>>;

export function projectStudioOperator(input: Readonly<{
  actorSubject: string;
  email: string;
  displayName: string;
  membership: StudioOperatorMembership;
}>): StudioOperator {
  return Object.freeze({
    subject: input.membership.dataSubject,
    actorSubject: input.actorSubject,
    workspaceId: input.membership.workspaceId,
    workspaceSubject: input.membership.dataSubject,
    email: input.email,
    displayName: input.displayName,
    role: input.membership.role,
  });
}

export function studioOperatorClientProfile(
  operator: StudioOperator,
): StudioOperatorClientProfile {
  return Object.freeze({
    email: operator.email,
    displayName: operator.displayName,
    role: operator.role,
  });
}
