import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { assertCleanGit, resolveGitSha, safeErrorMessage, withAdminClient } from "./admin-client.mjs";
import { applyCatalogueInTransaction, verifyCatalogueInTransaction } from "./catalogue-operations.mjs";
import { SHOP_CATALOGUE_MANIFEST } from "./catalogue-manifest.mjs";
import {
  buildCatalogueMutationPlan,
  assertExpectedManifestChecksum,
  resolveDatabaseAccess,
  validateManifest,
  withLockedTransaction,
} from "./release-core.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const command = process.argv[2];
const commands = new Set(["seed", "verify", "descriptive-sync"]);

if (!commands.has(command) || process.argv.length !== 3) {
  console.error("Usage: node scripts/shop-db/catalogue.mjs <seed|verify|descriptive-sync>");
  process.exitCode = 1;
} else {
  try {
    const validated = validateManifest(SHOP_CATALOGUE_MANIFEST, { assetRoot: join(repositoryRoot, "public") });
    const mutating = command !== "verify";
    const guardedAccess = resolveDatabaseAccess(process.env, { mutating });
    assertExpectedManifestChecksum(process.env, validated.checksum, {
      mutating,
      target: guardedAccess.target,
    });
    if (mutating && guardedAccess.target === "production") assertCleanGit(repositoryRoot);
    await withAdminClient(process.env, { mutating }, async (client, access) => {
      if (command === "verify") {
        await withLockedTransaction(client, async (transaction) => {
          await verifyCatalogueInTransaction(transaction, SHOP_CATALOGUE_MANIFEST, validated, access.target);
        });
        console.log(`Shop catalogue ${access.target}: ${validated.productCount} rows verified at ${validated.checksum}.`);
        return;
      }

      const mode = command;
      const plan = buildCatalogueMutationPlan(SHOP_CATALOGUE_MANIFEST, {
        mode,
        target: access.target,
        gitSha: resolveGitSha(process.env, repositoryRoot),
      });
      const result = await withLockedTransaction(client, async (transaction) => {
        return applyCatalogueInTransaction(transaction, SHOP_CATALOGUE_MANIFEST, plan, access.target);
      });
      console.log(result === "noop"
        ? `Shop catalogue ${access.target}: revision ${plan.revision} already applied; no changes.`
        : `Shop catalogue ${access.target}: ${plan.productCount} rows applied at ${plan.checksum}.`);
    });
  } catch (error) {
    console.error(`Shop catalogue ${command} failed: ${safeErrorMessage(error)}`);
    process.exitCode = 1;
  }
}
