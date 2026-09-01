import { neon } from "@neondatabase/serverless";

export type StudioOperatorMembership = Readonly<{
  role: "operator" | "admin";
  workspaceId: string;
  dataSubject: string;
}>;

function exactNonEmptyString(value: unknown, maximum: number): string | null {
  if (typeof value !== "string" || value !== value.trim() || value.length < 1 || value.length > maximum) {
    return null;
  }
  return value;
}

/** Parses only the trusted SQL row shape returned by the membership/workspace join. */
export function parseStudioOperatorMembershipRow(row: unknown): StudioOperatorMembership | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const record = row as Record<string, unknown>;
  const role = record.role;
  const workspaceId = exactNonEmptyString(record.workspace_id, 160);
  const dataSubject = exactNonEmptyString(record.data_subject, 512);
  if ((role !== "operator" && role !== "admin") || !workspaceId || !dataSubject) return null;
  return Object.freeze({ role, workspaceId, dataSubject });
}

export async function getStudioOperatorMembership(input: {
  subject: string;
  email: string;
}): Promise<StudioOperatorMembership | null> {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!databaseUrl) return null;
  const sql = neon(databaseUrl);
  const rows = await sql.query(
    `select membership.role, membership.workspace_id, workspace.data_subject
      from studio_operator_membership membership
      inner join studio_workspaces workspace on workspace.id = membership.workspace_id
      where membership.auth_subject = $1
        and lower(membership.email) = lower($2)
        and membership.active = true
        and membership.role in ('operator', 'admin')
      limit 1`,
    [input.subject, input.email],
  );
  return parseStudioOperatorMembershipRow(rows[0]);
}
