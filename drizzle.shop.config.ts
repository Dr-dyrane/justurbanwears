import { defineConfig } from "drizzle-kit";

const migrationUrl =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING;

export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle/shop-postgres",
  schema: "./db/shop-postgres-schema.ts",
  ...(migrationUrl ? { dbCredentials: { url: migrationUrl } } : {}),
});
