import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle/shop-postgres",
  schema: "./db/shop-postgres-schema.ts",
});
