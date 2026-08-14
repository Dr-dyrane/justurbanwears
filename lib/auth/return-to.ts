export function authSignInPath(returnTo: string): string {
  const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//")
    ? returnTo
    : "/shop";
  return `/auth/sign-in?returnTo=${encodeURIComponent(safeReturnTo)}`;
}
