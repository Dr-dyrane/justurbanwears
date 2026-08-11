import { execFileSync } from "node:child_process";
import { resolveDatabaseAccess, validateGitSha } from "./release-core.mjs";

export function resolveGitSha(env = process.env, cwd = process.cwd()) {
  const configured = env.SHOP_DB_GIT_SHA?.trim() || env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (configured) return validateGitSha(configured.toLowerCase());
  const sha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim().toLowerCase();
  return validateGitSha(sha);
}

export function assertCleanGit(cwd = process.cwd()) {
  const status = execFileSync("git", ["status", "--porcelain"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (status.trim()) throw new Error("Production database writes require a clean git worktree.");
}

export function safeErrorMessage(error, env = process.env) {
  let message = error instanceof Error ? error.message : "unknown error";
  for (const key of ["DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING", "DATABASE_URL", "POSTGRES_URL"]) {
    const value = env[key]?.trim();
    if (!value) continue;
    message = message.replaceAll(value, "[redacted database URL]");
    try {
      const parsed = new URL(value);
      if (parsed.password) {
        message = message.replaceAll(parsed.password, "[redacted]");
        message = message.replaceAll(decodeURIComponent(parsed.password), "[redacted]");
      }
    } catch {
      // Invalid credentials are rejected by the guard; the literal was redacted above.
    }
  }
  return message;
}

export async function withAdminClient(env, options, work) {
  const access = resolveDatabaseAccess(env, options);
  const { Pool } = await import("@neondatabase/serverless");
  const pool = new Pool({ connectionString: access.databaseUrl, max: 1 });
  let client;
  try {
    client = await pool.connect();
    return await work(client, access);
  } finally {
    client?.release();
    await pool.end();
  }
}
