import { createNeonAuth, type NeonAuth } from "@neondatabase/auth/next/server";
import { StudioEngineError } from "../studio/engine/errors";

let authInstance: NeonAuth | undefined;

export function getNeonAuth(): NeonAuth {
  if (authInstance) return authInstance;
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl || !secret) {
    throw new StudioEngineError(
      "ENGINE_DISABLED",
      503,
      "Studio sign-in is not configured.",
      "Ask an administrator to finish Studio activation.",
    );
  }
  authInstance = createNeonAuth({
    baseUrl,
    cookies: { secret, sessionDataTtl: 300 },
    logLevel: process.env.NODE_ENV === "production" ? "warn" : "error",
  });
  return authInstance;
}
