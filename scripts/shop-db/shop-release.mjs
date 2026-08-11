import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { assertCleanGit, resolveGitSha, safeErrorMessage, withAdminClient } from "./admin-client.mjs";
import { applyCatalogueInTransaction, verifyCatalogueInTransaction } from "./catalogue-operations.mjs";
import { SHOP_CATALOGUE_MANIFEST } from "./catalogue-manifest.mjs";
import {
  assertExpectedManifestChecksum,
  buildCatalogueMutationPlan,
  decideMigrations,
  loadMigrations,
  queryRows,
  resolveDatabaseAccess,
  validateManifest,
  withLockedTransaction,
} from "./release-core.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

if (process.argv.length !== 2) {
  console.error("Usage: node scripts/shop-db/shop-release.mjs");
  process.exitCode = 1;
} else {
  try {
    const validation = validateManifest(SHOP_CATALOGUE_MANIFEST, { assetRoot: join(repositoryRoot, "public") });
    const guardedAccess = resolveDatabaseAccess(process.env, { mutating: true });
    assertExpectedManifestChecksum(process.env, validation.checksum, {
      mutating: true,
      target: guardedAccess.target,
    });
    if (guardedAccess.target === "production") assertCleanGit(repositoryRoot);
    const migrations = loadMigrations(join(repositoryRoot, "drizzle/shop-postgres"));
    const plan = buildCatalogueMutationPlan(SHOP_CATALOGUE_MANIFEST, {
      // The full release must also refresh reviewed presentation fields after
      // migrations rename existing catalogue primary keys. The upsert still
      // leaves operational inventory untouched; its inventory statements are
      // insert-only for genuinely new rows.
      mode: "descriptive-sync",
      target: guardedAccess.target,
      gitSha: resolveGitSha(process.env, repositoryRoot),
    });

    await withAdminClient(process.env, { mutating: true }, async (client, access) => {
      const result = await withLockedTransaction(client, async (transaction) => {
        await transaction.query('create schema if not exists "drizzle"');
        await transaction.query(`create table if not exists "drizzle"."__drizzle_migrations" (
          "id" serial primary key,
          "hash" text not null,
          "created_at" bigint
        )`);
        const appliedRows = queryRows(await transaction.query(
          'select "hash", "created_at" from "drizzle"."__drizzle_migrations" order by "created_at" asc',
        ));
        const migrationDecision = decideMigrations(migrations, appliedRows);
        for (const migration of migrationDecision.pending) {
          for (const statement of migration.statements) await transaction.query(statement);
          await transaction.query(
            'insert into "drizzle"."__drizzle_migrations" ("hash", "created_at") values ($1, $2)',
            [migration.hash, migration.createdAt],
          );
        }
        const catalogueDecision = await applyCatalogueInTransaction(
          transaction,
          SHOP_CATALOGUE_MANIFEST,
          plan,
          access.target,
        );
        await verifyCatalogueInTransaction(transaction, SHOP_CATALOGUE_MANIFEST, validation, access.target);
        return { catalogueDecision, migrationCount: migrationDecision.pending.length };
      });
      console.log(
        `Shop release ${access.target}: ${result.migrationCount} migration(s), catalogue ${result.catalogueDecision}, ${validation.productCount} rows verified at ${validation.checksum}.`,
      );
    });
  } catch (error) {
    console.error(`Shop release failed: ${safeErrorMessage(error)}`);
    process.exitCode = 1;
  }
}
