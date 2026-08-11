import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { safeErrorMessage, withAdminClient } from "./admin-client.mjs";
import { decideMigrations, loadMigrations, queryRows } from "./release-core.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationDirectory = join(repositoryRoot, "drizzle/shop-postgres");
const command = process.argv[2];

if (command !== "check" || process.argv.length !== 3) {
  console.error("Usage: node scripts/shop-db/release.mjs check");
  process.exitCode = 1;
} else {
  try {
    const migrations = loadMigrations(migrationDirectory);
    await withAdminClient(process.env, { mutating: false }, async (client, access) => {
      const [{ migration_table: migrationTable }] = queryRows(await client.query(
        "select to_regclass('drizzle.__drizzle_migrations')::text as migration_table",
      ));
      const appliedRows = migrationTable
        ? queryRows(await client.query('select "hash", "created_at" from "drizzle"."__drizzle_migrations" order by "created_at" asc'))
        : [];
      const decision = decideMigrations(migrations, appliedRows);
      console.log(`Shop schema ${access.target}: ${decision.applied} applied, ${decision.pending.length} pending.`);
      for (const migration of decision.pending) console.log(`Pending: ${migration.tag}`);
    });
  } catch (error) {
    console.error(`Shop schema ${command} failed: ${safeErrorMessage(error)}`);
    process.exitCode = 1;
  }
}
