import { StudioAuthSurface } from "../../../components/studio/auth/studio-auth-surface";

export const dynamic = "force-dynamic";

function safeReturnTo(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.startsWith("/studio") ? candidate : "/studio";
}

export default async function StudioAuthPage({
  params,
  searchParams,
}: {
  params: Promise<{ path: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const [{ path }, query] = await Promise.all([params, searchParams]);
  return <StudioAuthSurface path={path} returnTo={safeReturnTo(query.returnTo)} />;
}
