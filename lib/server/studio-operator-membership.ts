import { neon } from "@neondatabase/serverless";

export type StudioOperatorMembership = { role: "operator" | "admin" };

export async function getStudioOperatorMembership(input: {
  subject: string;
  email: string;
  bootstrap?: boolean;
}): Promise<StudioOperatorMembership | null> {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!databaseUrl) return null;
  const sql = neon(databaseUrl);
  if (input.bootstrap) {
    await sql.query(
      `insert into studio_operator_membership (auth_subject, email, role, active)
       values ($1, $2, 'admin', true) on conflict do nothing`,
      [input.subject, input.email],
    );
  }
  const rows = await sql.query(
    `select role from studio_operator_membership
      where auth_subject = $1 and lower(email) = lower($2) and active = true
      and role in ('operator', 'admin') limit 1`,
    [input.subject, input.email],
  );
  const role = rows[0]?.role;
  return role === "operator" || role === "admin" ? { role } : null;
}
