import { StudioAuthSurface } from "../../../components/studio/auth/studio-auth-surface";
import { ShopAuthSurface } from "../../../components/shop/shop-auth-surface";

export const dynamic = "force-dynamic";

function safeReturnTo(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate?.startsWith("/shop") && !candidate.startsWith("//")) return candidate;
  return candidate?.startsWith("/studio") && !candidate.startsWith("//") ? candidate : "/studio";
}

export default async function StudioAuthPage({
  params,
  searchParams,
}: {
  params: Promise<{ path: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const [{ path }, query] = await Promise.all([params, searchParams]);
  const returnTo = safeReturnTo(query.returnTo);
  return returnTo.startsWith("/shop")
    ? <ShopAuthSurface path={path} returnTo={returnTo} />
    : <StudioAuthSurface path={path} returnTo={returnTo} />;
}
