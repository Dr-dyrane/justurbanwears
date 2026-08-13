import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./shop-postgres-schema";

function requireRuntimeDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

  if (!databaseUrl) {
    throw new Error(
      "Neon is not configured. Connect the Neon resource and provide DATABASE_URL for this environment.",
    );
  }

  return databaseUrl;
}

function createShopDb() {
  const client = neon(requireRuntimeDatabaseUrl());
  return drizzle(client, { schema });
}

export type ShopDb = ReturnType<typeof createShopDb>;

let shopDb: ShopDb | undefined;

export function getShopDb(): ShopDb {
  if (typeof window !== "undefined") {
    throw new Error("The Neon shop database is available only on the server.");
  }

  shopDb ??= createShopDb();
  return shopDb;
}

export async function getStudioDb(): Promise<ShopDb> {
  return getShopDb();
}
