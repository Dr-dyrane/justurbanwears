import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Pool } from "@neondatabase/serverless";
import {
  ADMIN_LOCK_SQL,
  CATALOGUE_NAMESPACE,
  loadMigrations,
  manifestChecksum,
  resolveDatabaseAccess,
} from "./release-core.mjs";
import { SHOP_CATALOGUE_MANIFEST } from "./catalogue-manifest.mjs";

export const QUALIFICATION_CONFIRMATION = "RUN_JUW_DISPOSABLE_TRANSACTIONAL_AUTHORITY_QUALIFICATION";
export const CANONICAL_NEON_PROJECT_ID = "calm-glade-28091571";
export const CANONICAL_NEON_PARENT_BRANCH_ID = "br-mute-paper-awfdn96n";
export const LEGACY_RESOLUTION_REFERENCE_PREFIX = "juw-db-qualification:legacy-resolution:v1";
export const FROZEN_TRANSACTIONAL_AUTHORITY_MIGRATION_SHA256 = "ba280c8782f6e700c654a968081b8f33a6cd90cca3a192771f8a896f1d2e5c7f";
export const FROZEN_TRANSACTIONAL_AUTHORITY_SNAPSHOT_SHA256 = "f5eb6f022967f4503b4e00499f43873aa13c49f026c21e8fb1963c0e8cf03678";
export const FROZEN_QUALIFICATION_JOURNAL_SHA256 = "9f70e1f8a884eedf39a360553a5b1cc9842ab2118db527b791052b9ae584dbe2";
export const FROZEN_QUALIFICATION_CHAIN = Object.freeze([
  Object.freeze({
    createdAt: 1787893200000,
    index: 18,
    migrationBytes: 62_439,
    migrationSha256: FROZEN_TRANSACTIONAL_AUTHORITY_MIGRATION_SHA256,
    number: "0018",
    snapshotBytes: 278_475,
    snapshotId: "d6aea739-be2d-4d9c-81b3-97ddf2763ab8",
    snapshotSha256: FROZEN_TRANSACTIONAL_AUTHORITY_SNAPSHOT_SHA256,
    tag: "0018_studio_transactional_authority",
  }),
  Object.freeze({
    createdAt: 1787893200001,
    index: 19,
    migrationBytes: 16_229,
    migrationSha256: "066326e3799bede35c4f0f691691ec05a4c0563507ed3aa5d42475eeec44fc0e",
    number: "0019",
    snapshotBytes: 317_959,
    snapshotId: "4f36dc5b-ccd2-4dfb-92d1-898adc8e57ea",
    snapshotSha256: "87a9fab76ef5dd8b949f525b3af88d66ba8e92a9a434972ea4b37a42f20027e5",
    tag: "0019_studio_atelier_external_authority",
  }),
  Object.freeze({
    createdAt: 1787893200002,
    index: 20,
    migrationBytes: 9_449,
    migrationSha256: "c41ef48bf6aeeae70a8b63e37a8d934420e6ba619bb34a2806cacd98a0b6e453",
    number: "0020",
    snapshotBytes: 336_160,
    snapshotId: "8c5a41f0-cef4-4834-9b3a-3a90dd1a3a4b",
    snapshotSha256: "1b80d1bc5dadcf1ec16e05dd507db8e63a8f2e1e9e2e9b927d2088ed5b99d0e6",
    tag: "0020_studio_atelier_shop_adoption_receipts",
  }),
]);
export const CONFIRMATION_NO_WRITE_TABLES = Object.freeze([
  "shop_inventory",
  "studio_piece_custody",
  "studio_piece_custody_commands",
  "studio_physical_observations",
  "studio_stocktakes",
]);

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const SHA256 = /^[0-9a-f]{64}$/;
const RUN_ID = /^[a-z0-9][a-z0-9-]{7,39}$/;
const BRANCH_ID = /^br-[a-z0-9-]{6,80}$/;
const HEX_SHA = /^[0-9a-f]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QUALIFICATION_PHASES = new Set(["legacy-block", "resolve-legacy", "apply-and-race"]);
const LEGACY_RESOLUTION_REFERENCE = new RegExp(`^${LEGACY_RESOLUTION_REFERENCE_PREFIX}:[0-9a-f]{64}$`);
const CANONICAL_LEGACY_STOCKTAKE_JSON_SQL = `
  to_jsonb(stocktake) || jsonb_build_object(
    'started_at', to_char(stocktake.started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'closed_at', case
      when stocktake.closed_at is null then null
      else to_char(stocktake.closed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    end,
    'updated_at', to_char(stocktake.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )
`;
const CANONICAL_CATALOGUE_LEDGER_JSON_SQL = `
  to_jsonb(seed) || jsonb_build_object(
    'applied_at', to_char(seed.applied_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )
`;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeHost(value) {
  return value?.trim().toLowerCase() ?? "";
}

function isWithin(parent, candidate) {
  const delta = relative(parent, candidate);
  return delta === "" || (!delta.startsWith(`..${sep}`) && delta !== ".." && !isAbsolute(delta));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex");
}

export function legacyQualificationStocktakeBinding(runId) {
  invariant(RUN_ID.test(runId), "Legacy qualification binding requires an exact qualification run ID.");
  const expectedPieces = Object.freeze([Object.freeze({
    availability: "AVAILABLE",
    expectedCustody: "STUDIO",
    expectedLocationKey: "WARDROBE_RAIL",
    expectedLocationLabel: "Wardrobe rail",
    orderReference: null,
    pieceKey: `sku:LEGACY-${runId}`,
    sku: null,
    title: "Unresolved legacy qualification count",
    wardrobeItemId: null,
  })]);
  return Object.freeze({
    expectedPieces,
    idempotencyKey: `legacy-${runId}`,
    locationKey: "WARDROBE_RAIL",
    locationLabel: "Wardrobe rail",
    operatorSubject: `qualification:${runId}:legacy-open`,
  });
}

export function deterministicLegacyResolutionReference(configuration, stocktake) {
  return `${LEGACY_RESOLUTION_REFERENCE_PREFIX}:${digest({
    branchId: configuration.branchId,
    committedSha: configuration.gitSha,
    parentBranchId: configuration.parentBranchId,
    projectId: configuration.projectId,
    runId: configuration.runId,
    stocktake: {
      closedAt: stocktake.closed_at,
      expectedPieces: stocktake.expected_pieces,
      id: stocktake.id,
      idempotencyKey: stocktake.idempotency_key,
      locationKey: stocktake.location_key,
      locationLabel: stocktake.location_label,
      operatorSubject: stocktake.operator_subject,
      startedAt: stocktake.started_at,
      state: stocktake.state,
      updatedAt: stocktake.updated_at,
      version: stocktake.version,
    },
  })}`;
}

function requiredSha256(env, name) {
  const value = env[name]?.trim().toLowerCase() ?? "";
  invariant(SHA256.test(value), `${name} must be the final frozen lowercase SHA-256.`);
  return value;
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

export function resolveAuditResultPath(env, root = repositoryRoot) {
  const allowedRoot = resolve(root, "storage/runtime-audit");
  const configured = env.JUW_DB_QUALIFICATION_RESULT_PATH?.trim();
  const candidate = configured
    ? resolve(configured)
    : join(allowedRoot, `transactional-authority-${env.JUW_DB_QUALIFICATION_RUN_ID}-${env.JUW_DB_QUALIFICATION_PHASE}.json`);
  invariant(isWithin(allowedRoot, candidate), "Qualification result path must stay under storage/runtime-audit.");
  invariant(candidate.toLowerCase().endsWith(".json"), "Qualification result path must be a JSON file.");
  return candidate;
}

export function resolveCredentialCleanupPath(env, root = repositoryRoot) {
  const configured = env.JUW_DB_QUALIFICATION_ENV_FILE?.trim();
  invariant(configured && isAbsolute(configured), "JUW_DB_QUALIFICATION_ENV_FILE must be an exact absolute path.");
  const candidate = resolve(configured);
  const allowedAuditRoot = resolve(root, "storage/runtime-audit/credentials");
  const allowedTemporaryRoot = resolve(tmpdir());
  invariant(
    isWithin(allowedTemporaryRoot, candidate) || isWithin(allowedAuditRoot, candidate),
    "Qualification credential path must stay in the OS temp directory or storage/runtime-audit/credentials.",
  );
  invariant(candidate.toLowerCase().endsWith(".env"), "Qualification credential path must end in .env.");
  invariant(
    /^juw-[a-z0-9._-]+\.env$/i.test(candidate.split(/[\\/]/).at(-1) ?? ""),
    "Qualification credential filename must begin with juw-.",
  );
  return candidate;
}

export function parseQualificationEnvironment(env = process.env) {
  invariant(env.SHOP_DB_TARGET?.trim() === "preview", "Database qualification is allowed only with SHOP_DB_TARGET=preview.");
  const access = resolveDatabaseAccess(env, { mutating: true });
  invariant(
    env.JUW_DB_QUALIFICATION_CONFIRM === QUALIFICATION_CONFIRMATION,
    `Database qualification requires JUW_DB_QUALIFICATION_CONFIRM=${QUALIFICATION_CONFIRMATION}.`,
  );
  invariant(
    env.JUW_DB_QUALIFICATION_PROJECT_ID?.trim() === CANONICAL_NEON_PROJECT_ID,
    `Qualification must target Neon project ${CANONICAL_NEON_PROJECT_ID}.`,
  );
  invariant(
    env.JUW_DB_QUALIFICATION_PARENT_BRANCH_ID?.trim() === CANONICAL_NEON_PARENT_BRANCH_ID,
    `Qualification branch must descend from ${CANONICAL_NEON_PARENT_BRANCH_ID}.`,
  );
  const branchId = env.JUW_DB_QUALIFICATION_BRANCH_ID?.trim() ?? "";
  invariant(BRANCH_ID.test(branchId), "JUW_DB_QUALIFICATION_BRANCH_ID is invalid.");
  invariant(branchId !== CANONICAL_NEON_PARENT_BRANCH_ID, "Qualification cannot run on the production branch.");
  const runId = env.JUW_DB_QUALIFICATION_RUN_ID?.trim() ?? "";
  invariant(RUN_ID.test(runId), "JUW_DB_QUALIFICATION_RUN_ID must be a unique lowercase disposable-run identifier.");
  const phase = env.JUW_DB_QUALIFICATION_PHASE?.trim() ?? "";
  invariant(
    QUALIFICATION_PHASES.has(phase),
    "JUW_DB_QUALIFICATION_PHASE must be legacy-block, resolve-legacy, or apply-and-race.",
  );
  const legacyStocktakeId = env.JUW_DB_QUALIFICATION_LEGACY_STOCKTAKE_ID?.trim() ?? "";
  const legacyResolutionReference = env.JUW_DB_QUALIFICATION_LEGACY_RESOLUTION_REFERENCE?.trim() ?? "";
  const normalizationRetryReceiptSha256 = env.JUW_DB_QUALIFICATION_NORMALIZATION_RECEIPT_SHA256?.trim().toLowerCase() ?? "";
  invariant(
    !normalizationRetryReceiptSha256 || SHA256.test(normalizationRetryReceiptSha256),
    "JUW_DB_QUALIFICATION_NORMALIZATION_RECEIPT_SHA256 must be an exact lowercase SHA-256 when supplied.",
  );
  if (phase === "legacy-block") {
    invariant(!legacyStocktakeId && !legacyResolutionReference, "legacy-block cannot claim a pre-existing resolution.");
  } else {
    invariant(UUID.test(legacyStocktakeId), `${phase} requires the exact legacy stocktake UUID from legacy-block.`);
  }
  if (phase === "apply-and-race") {
    invariant(
      LEGACY_RESOLUTION_REFERENCE.test(legacyResolutionReference),
      "apply-and-race requires the exact deterministic legacy resolution reference.",
    );
  } else if (phase === "resolve-legacy") {
    invariant(!legacyResolutionReference, "resolve-legacy computes its own deterministic resolution reference.");
  }
  const gitSha = env.SHOP_DB_GIT_SHA?.trim().toLowerCase() ?? "";
  invariant(HEX_SHA.test(gitSha), "Qualification requires the exact 40-character committed SHOP_DB_GIT_SHA.");
  const expectedManifestIdentity = Object.freeze({
    journal: requiredSha256(env, "JUW_DB_QUALIFICATION_JOURNAL_SHA256"),
    migration18: requiredSha256(env, "JUW_DB_QUALIFICATION_MIGRATION_0018_SHA256"),
    migration19: requiredSha256(env, "JUW_DB_QUALIFICATION_MIGRATION_0019_SHA256"),
    migration20: requiredSha256(env, "JUW_DB_QUALIFICATION_MIGRATION_0020_SHA256"),
    snapshot18: requiredSha256(env, "JUW_DB_QUALIFICATION_SNAPSHOT_0018_SHA256"),
    snapshot19: requiredSha256(env, "JUW_DB_QUALIFICATION_SNAPSHOT_0019_SHA256"),
    snapshot20: requiredSha256(env, "JUW_DB_QUALIFICATION_SNAPSHOT_0020_SHA256"),
  });
  const catalogueChecksum = manifestChecksum(SHOP_CATALOGUE_MANIFEST);
  invariant(
    env.SHOP_DB_EXPECTED_MANIFEST_CHECKSUM?.trim().toLowerCase() === catalogueChecksum,
    "Qualification requires the current SHOP_DB_EXPECTED_MANIFEST_CHECKSUM even for preview.",
  );

  const parsed = new URL(access.databaseUrl);
  const qualificationHost = normalizeHost(parsed.hostname);
  const expectedHost = normalizeHost(env.SHOP_DB_EXPECTED_HOST);
  const productionHost = normalizeHost(env.JUW_DB_QUALIFICATION_PRODUCTION_HOST);
  invariant(productionHost, "A freshly resolved JUW_DB_QUALIFICATION_PRODUCTION_HOST is required.");
  invariant(qualificationHost === expectedHost, "Qualification connection host does not match SHOP_DB_EXPECTED_HOST.");
  invariant(qualificationHost !== productionHost, "Qualification connection resolves to the production host.");
  invariant(!qualificationHost.includes("-pooler") && !qualificationHost.includes(".pooler."), "Qualification requires a direct Neon endpoint.");
  invariant(env.VERCEL_ENV !== "production", "VERCEL_ENV=production is forbidden for database qualification.");

  return Object.freeze({
    branchId,
    catalogueChecksum,
    databaseName: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    databaseUrl: access.databaseUrl,
    expectedManifestIdentity,
    gitSha,
    host: qualificationHost,
    legacyResolutionReference: legacyResolutionReference || null,
    legacyStocktakeId: legacyStocktakeId || null,
    normalizationRetryReceiptSha256: normalizationRetryReceiptSha256 || null,
    parentBranchId: CANONICAL_NEON_PARENT_BRANCH_ID,
    phase,
    productionHost,
    projectId: CANONICAL_NEON_PROJECT_ID,
    resultPath: resolveAuditResultPath(env),
    runId,
    credentialPath: resolveCredentialCleanupPath(env),
  });
}

export function redactSensitive(value, secrets = []) {
  let text = value instanceof Error ? value.stack || value.message : String(value ?? "");
  for (const secret of secrets) {
    if (secret) text = text.replaceAll(secret, "[redacted]");
  }
  text = text.replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi, "[redacted database URL]");
  return text;
}

function parseSnapshot(text, label) {
  const value = JSON.parse(text);
  invariant(value?.version === "7" || value?.version === 7, `${label} snapshot version must be 7.`);
  invariant(value?.dialect === "postgresql", `${label} snapshot dialect must be PostgreSQL.`);
  invariant(typeof value?.id === "string" && typeof value?.prevId === "string", `${label} snapshot identity is invalid.`);
  return value;
}

export async function loadQualificationManifest(root = repositoryRoot) {
  const directory = join(root, "drizzle/shop-postgres");
  const migrations = loadMigrations(directory);
  const journalText = await readFile(join(directory, "meta/_journal.json"), "utf8");
  const journal = JSON.parse(journalText);
  invariant(Array.isArray(journal.entries), "Drizzle journal entries are invalid.");
  invariant(journal.entries.length === migrations.length, "Drizzle journal and migration file counts differ.");
  journal.entries.forEach((entry, index) => {
    invariant(entry.idx === index, `Drizzle journal index ${index} is not sequential.`);
    invariant(entry.tag === migrations[index].tag, `Drizzle journal tag mismatch at index ${index}.`);
    invariant(Number(entry.when) === migrations[index].createdAt, `Drizzle journal timestamp mismatch for ${entry.tag}.`);
    invariant(entry.version === "7" || entry.version === 7, `Drizzle journal version mismatch for ${entry.tag}.`);
    invariant(entry.breakpoints === true, `Drizzle journal breakpoints are required for ${entry.tag}.`);
  });
  invariant(
    Buffer.byteLength(journalText, "utf8") === 3_206,
    "Drizzle journal byte size differs from the frozen qualification journal.",
  );
  invariant(digest(journalText) === FROZEN_QUALIFICATION_JOURNAL_SHA256, "Drizzle journal differs from the frozen qualification journal.");

  const chain = [];
  let previousSnapshot = null;
  for (const frozen of FROZEN_QUALIFICATION_CHAIN) {
    const migrationIndex = migrations.findIndex((migration) => migration.tag === frozen.tag);
    invariant(migrationIndex === frozen.index, `${frozen.tag} is not at frozen journal index ${frozen.index}.`);
    const migration = migrations[migrationIndex];
    invariant(migration.createdAt === frozen.createdAt, `${frozen.tag} has the wrong journal timestamp.`);
    invariant(migration.hash === frozen.migrationSha256, `${frozen.number} bytes differ from the frozen migration.`);
    const migrationText = (await readFile(join(directory, `${frozen.tag}.sql`), "utf8")).replace(/\r\n/g, "\n");
    invariant(
      Buffer.byteLength(migrationText, "utf8") === frozen.migrationBytes,
      `${frozen.number} migration byte size differs from the frozen migration.`,
    );

    const snapshotText = await readFile(join(directory, `meta/${frozen.number}_snapshot.json`), "utf8");
    const snapshot = parseSnapshot(snapshotText, frozen.number);
    invariant(snapshot.id === frozen.snapshotId, `${frozen.number} snapshot ID differs from the frozen snapshot.`);
    invariant(digest(snapshotText) === frozen.snapshotSha256, `${frozen.number} snapshot differs from the frozen snapshot.`);
    invariant(
      Buffer.byteLength(snapshotText, "utf8") === frozen.snapshotBytes,
      `${frozen.number} snapshot byte size differs from the frozen snapshot.`,
    );
    if (previousSnapshot) {
      invariant(
        snapshot.prevId === previousSnapshot.id,
        `${frozen.number} snapshot does not descend from the exact ${FROZEN_QUALIFICATION_CHAIN[chain.length - 1].number} snapshot.`,
      );
    }
    chain.push(Object.freeze({ migration, snapshot, snapshotText }));
    previousSnapshot = snapshot;
  }
  invariant(
    FROZEN_QUALIFICATION_CHAIN.at(-1).index === migrations.length - 1,
    "0020 must be the frozen journal tail for qualification.",
  );

  const [entry18, entry19, entry20] = chain;

  return Object.freeze({
    migrations: migrations.map(({ tag, createdAt, hash, statements }) => Object.freeze({
      tag,
      createdAt,
      hash,
      statementCount: statements.length,
    })),
    tail: Object.freeze({
      journal: digest(journalText),
      migration18: entry18.migration.hash,
      migration19: entry19.migration.hash,
      migration20: entry20.migration.hash,
      snapshot18: digest(entry18.snapshotText),
      snapshot18Id: entry18.snapshot.id,
      snapshot19: digest(entry19.snapshotText),
      snapshot19Id: entry19.snapshot.id,
      snapshot20: digest(entry20.snapshotText),
      snapshot20Id: entry20.snapshot.id,
    }),
  });
}

export function assertQualificationManifestIdentity(expected, manifest) {
  for (const field of ["journal", "migration18", "migration19", "migration20", "snapshot18", "snapshot19", "snapshot20"]) {
    invariant(
      expected[field] === manifest.tail[field],
      `Frozen qualification identity mismatch for ${field}; do not apply this checkout.`,
    );
  }
}

function commandEnvironment(env) {
  return {
    ...env,
    DATABASE_URL: "",
    POSTGRES_URL: "",
    SHOP_DB_TARGET: "preview",
  };
}

export function runReleaseCommand(script, args, env = process.env) {
  return execFileSync(process.execPath, [script, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: commandEnvironment(env),
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function assertQualificationCheckout(gitSha, root = repositoryRoot, run = execFileSync) {
  const options = {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  };
  const head = String(run("git", ["rev-parse", "HEAD"], options)).trim().toLowerCase();
  invariant(head === gitSha, "Qualification git SHA does not match the checked-out HEAD.");
  const status = String(run("git", ["status", "--porcelain=v1", "--untracked-files=all"], options)).trim();
  invariant(status === "", "Qualification requires a clean committed worktree.");
  return Object.freeze({ clean: true, head });
}

function assertDisposableCloneCatalogueLedgerState(state, configuration) {
  invariant(state && typeof state === "object" && !Array.isArray(state), "Disposable clone catalogue ledger row is invalid.");
  invariant(state.namespace === CATALOGUE_NAMESPACE, "Disposable clone catalogue ledger namespace does not match.");
  invariant(state.revision === SHOP_CATALOGUE_MANIFEST.revision, "Disposable clone catalogue ledger revision does not match.");
  invariant(
    state.target === "production" || state.target === "preview",
    "Disposable clone catalogue ledger target must be production or preview.",
  );
  invariant(state.checksum === configuration.catalogueChecksum, "Disposable clone catalogue ledger checksum does not match.");
  invariant(
    Number(state.row_count) === SHOP_CATALOGUE_MANIFEST.products.length,
    "Disposable clone catalogue ledger row count does not match.",
  );
  invariant(state.operation === "descriptive-sync", "Disposable clone catalogue ledger operation does not match.");
  invariant(
    typeof state.git_sha === "string" && /^[0-9a-f]{7,64}$/.test(state.git_sha),
    "Disposable clone catalogue ledger git SHA is invalid.",
  );
  invariant(
    typeof state.applied_at === "string" && state.applied_at.length > 0,
    "Disposable clone catalogue ledger applied timestamp is missing.",
  );
}

function catalogueLedgerPreservedState(state) {
  const preserved = { ...state };
  delete preserved.target;
  return preserved;
}

function catalogueNormalizationRetryReceipt(configuration, before, after) {
  return digest({
    afterSha256: digest(after),
    beforeSha256: digest(before),
    branchId: configuration.branchId,
    committedSha: configuration.gitSha,
    parentBranchId: configuration.parentBranchId,
    projectId: configuration.projectId,
    runId: configuration.runId,
  });
}

async function readCanonicalCatalogueLedgerStates(client) {
  const result = await client.query(`
    select ${CANONICAL_CATALOGUE_LEDGER_JSON_SQL} as state
    from shop_seed_ledger as seed
    order by seed.namespace, seed.revision
  `);
  return rows(result).map((row) => row.state);
}

export async function normalizeDisposableCloneCatalogueLedger(client, configuration, manifest) {
  invariant(configuration.phase === "apply-and-race", "Catalogue target normalization is apply-and-race only.");
  invariant(
    configuration.host !== normalizeHost(configuration.productionHost),
    "Catalogue target normalization cannot target production.",
  );
  return transaction(client, async (tx) => {
    await tx.query("select set_config('lock_timeout', $1, true)", ["30s"]);
    await tx.query(ADMIN_LOCK_SQL);
    const boundaryBefore = await capturePreCutoverBoundary(tx);
    assertPreCutoverBoundary(boundaryBefore, manifest);
    const ledgerBefore = await readCanonicalCatalogueLedgerStates(tx);
    const selected = await tx.query(`
      select ${CANONICAL_CATALOGUE_LEDGER_JSON_SQL} as state
      from shop_seed_ledger as seed
      where seed.namespace = $1 and seed.revision = $2
      for update
    `, [CATALOGUE_NAMESPACE, SHOP_CATALOGUE_MANIFEST.revision]);
    invariant(rows(selected).length === 1, "Expected exactly one current catalogue ledger row on the disposable clone.");
    const before = rows(selected)[0].state;
    assertDisposableCloneCatalogueLedgerState(before, configuration);
    const capturedCurrentRows = ledgerBefore.filter((state) => (
      state.namespace === before.namespace && state.revision === before.revision
    ));
    assert.equal(capturedCurrentRows.length, 1, "Canonical seed-ledger capture does not contain the exact current catalogue row.");
    assert.deepEqual(capturedCurrentRows[0], before, "Locked catalogue ledger row differs from its canonical boundary capture.");
    const preserved = catalogueLedgerPreservedState(before);
    let after = before;
    let action = "ALREADY_PREVIEW";

    if (before.target === "production") {
      invariant(
        configuration.normalizationRetryReceiptSha256 === null,
        "A fresh production-clone normalization cannot supply a retry receipt.",
      );
      const updated = await tx.query(`
        update shop_seed_ledger as seed
        set target = 'preview'
        where seed.namespace = $1
          and seed.revision = $2
          and seed.target = 'production'
          and seed.checksum = $3
          and seed.row_count = $4
          and seed.git_sha = $5
          and seed.operation = $6
        returning ${CANONICAL_CATALOGUE_LEDGER_JSON_SQL} as state
      `, [
        CATALOGUE_NAMESPACE,
        SHOP_CATALOGUE_MANIFEST.revision,
        configuration.catalogueChecksum,
        SHOP_CATALOGUE_MANIFEST.products.length,
        before.git_sha,
        before.operation,
      ]);
      invariant(rows(updated).length === 1, "Disposable clone catalogue ledger compare-and-swap did not update exactly one row.");
      after = rows(updated)[0].state;
      action = "NORMALIZED_PRODUCTION_CLONE_TO_PREVIEW";
    } else {
      const inferredBefore = { ...before, target: "production" };
      const expectedRetryReceipt = catalogueNormalizationRetryReceipt(configuration, inferredBefore, before);
      invariant(
        configuration.normalizationRetryReceiptSha256 === expectedRetryReceipt,
        "An already-preview catalogue row requires the exact prior normalization retry receipt.",
      );
    }

    assertDisposableCloneCatalogueLedgerState(after, configuration);
    invariant(after.target === "preview", "Disposable clone catalogue ledger target was not normalized to preview.");
    assert.deepEqual(
      catalogueLedgerPreservedState(after),
      preserved,
      "Disposable clone catalogue ledger normalization changed immutable evidence.",
    );
    const ledgerAfter = await readCanonicalCatalogueLedgerStates(tx);
    const expectedLedgerAfter = ledgerBefore.map((state) => (
      state.namespace === before.namespace && state.revision === before.revision ? after : state
    ));
    assert.deepEqual(
      ledgerAfter,
      expectedLedgerAfter,
      "Disposable clone catalogue ledger normalization changed more than the exact current target.",
    );
    const boundaryAfter = await capturePreCutoverBoundary(tx);
    assert.deepEqual(boundaryAfter.ledger, boundaryBefore.ledger, "Catalogue target normalization advanced the migration ledger.");
    assert.equal(boundaryAfter.schemaHash, boundaryBefore.schemaHash, "Catalogue target normalization changed the database schema.");
    assert.equal(boundaryBefore.seedLedgerHash, digest(ledgerBefore), "Pre-normalization seed-ledger hash is not canonical.");
    assert.equal(boundaryAfter.seedLedgerHash, digest(ledgerAfter), "Post-normalization seed-ledger hash is not canonical.");
    const retryReceiptSha256 = catalogueNormalizationRetryReceipt(
      configuration,
      before.target === "production" ? before : { ...before, target: "production" },
      after,
    );
    return Object.freeze({
      action,
      afterSha256: digest(after),
      beforeSha256: digest(before),
      boundaryAfterSha256: boundaryAfter.seedLedgerHash,
      boundaryBeforeSha256: boundaryBefore.seedLedgerHash,
      checksum: after.checksum,
      from: before.target,
      migrationLedgerUnchanged: true,
      namespace: after.namespace,
      operation: after.operation,
      preservedFieldsSha256: digest(preserved),
      revision: after.revision,
      retryReceiptSha256,
      rowCount: Number(after.row_count),
      schemaUnchanged: true,
      to: after.target,
    });
  }, { isolationLevel: "serializable" });
}

function releaseFailureText(error) {
  return [error?.message, error?.stdout, error?.stderr]
    .filter(Boolean)
    .map((value) => String(value))
    .join("\n");
}

async function capturePreCutoverBoundary(client) {
  const [ledger, columns, constraints, indexes, routines, enumValues, seedLedger] = await Promise.all([
    client.query('select "hash", "created_at" from "drizzle"."__drizzle_migrations" order by "created_at" asc'),
    client.query(`
      select relation.relname, attribute.attname,
        format_type(attribute.atttypid, attribute.atttypmod) as data_type,
        attribute.attnotnull, pg_get_expr(default_value.adbin, default_value.adrelid) as default_expression
      from pg_class as relation
      inner join pg_namespace as namespace on namespace.oid = relation.relnamespace
      inner join pg_attribute as attribute on attribute.attrelid = relation.oid
      left join pg_attrdef as default_value
        on default_value.adrelid = relation.oid and default_value.adnum = attribute.attnum
      where namespace.nspname = 'public'
        and (relation.relname like 'shop\\_%' escape '\\' or relation.relname like 'studio\\_%' escape '\\')
        and relation.relkind in ('r', 'p')
        and attribute.attnum > 0 and not attribute.attisdropped
      order by relation.relname, attribute.attnum
    `),
    client.query(`
      select relation.relname, constraint_record.conname,
        pg_get_constraintdef(constraint_record.oid, true) as definition
      from pg_constraint as constraint_record
      inner join pg_class as relation on relation.oid = constraint_record.conrelid
      inner join pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and (relation.relname like 'shop\\_%' escape '\\' or relation.relname like 'studio\\_%' escape '\\')
      order by relation.relname, constraint_record.conname
    `),
    client.query(`
      select relation.relname, index_record.relname as index_name, pg_get_indexdef(index_record.oid) as definition
      from pg_index as index_link
      inner join pg_class as relation on relation.oid = index_link.indrelid
      inner join pg_class as index_record on index_record.oid = index_link.indexrelid
      inner join pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and (relation.relname like 'shop\\_%' escape '\\' or relation.relname like 'studio\\_%' escape '\\')
      order by relation.relname, index_record.relname
    `),
    client.query(`
      select routine.proname, pg_get_function_identity_arguments(routine.oid) as identity_arguments,
        pg_get_function_result(routine.oid) as result_type, pg_get_functiondef(routine.oid) as definition
      from pg_proc as routine
      inner join pg_namespace as namespace on namespace.oid = routine.pronamespace
      where namespace.nspname = 'public'
        and (routine.proname like 'shop\\_%' escape '\\' or routine.proname like 'studio\\_%' escape '\\')
        and routine.prokind in ('f', 'p')
      order by routine.proname, identity_arguments
    `),
    client.query(`
      select type_record.typname, enum_value.enumlabel, enum_value.enumsortorder
      from pg_type as type_record
      inner join pg_namespace as namespace on namespace.oid = type_record.typnamespace
      inner join pg_enum as enum_value on enum_value.enumtypid = type_record.oid
      where namespace.nspname = 'public'
        and (type_record.typname like 'shop\\_%' escape '\\' or type_record.typname like 'studio\\_%' escape '\\')
      order by type_record.typname, enum_value.enumsortorder
    `),
    client.query(`
      select ${CANONICAL_CATALOGUE_LEDGER_JSON_SQL} as state
      from shop_seed_ledger as seed
      order by seed.namespace, seed.revision
    `),
  ]);
  const schemaState = {
    columns: rows(columns),
    constraints: rows(constraints),
    enumValues: rows(enumValues),
    indexes: rows(indexes),
    routines: rows(routines),
  };
  return Object.freeze({
    ledger: rows(ledger).map((row) => ({ createdAt: Number(row.created_at), hash: String(row.hash) })),
    schemaHash: digest(schemaState),
    seedLedgerHash: digest(rows(seedLedger).map((row) => row.state)),
  });
}

function assertPreCutoverBoundary(boundary, manifest) {
  const migration18Index = manifest.migrations.findIndex((migration) => migration.tag === "0018_studio_transactional_authority");
  invariant(migration18Index > 0, "0018 pre-cutover boundary cannot be derived.");
  invariant(
    boundary.ledger.length <= migration18Index,
    "Disposable branch has already applied 0018; legacy cutover cannot be qualified there.",
  );
  boundary.ledger.forEach((applied, index) => {
    assert.deepEqual(applied, {
      createdAt: manifest.migrations[index].createdAt,
      hash: manifest.migrations[index].hash,
    }, `Pre-cutover migration mismatch at index ${index}.`);
  });
}

async function seedLegacyOpenStocktake(client, runId) {
  const binding = legacyQualificationStocktakeBinding(runId);
  const row = await queryOne(client, `
    insert into studio_stocktakes as stocktake (
      operator_subject, idempotency_key, location_key, location_label,
      state, expected_pieces, version, started_at, updated_at
    ) values (
      $1, $2, $3, $4, 'OPEN', $5::jsonb, 1,
      clock_timestamp(), clock_timestamp()
    ) returning ${CANONICAL_LEGACY_STOCKTAKE_JSON_SQL} as state
  `, [
    binding.operatorSubject,
    binding.idempotencyKey,
    binding.locationKey,
    binding.locationLabel,
    JSON.stringify(binding.expectedPieces),
  ]);
  return row.state;
}

async function readLegacyStocktake(client, id) {
  const result = await client.query(`
    select ${CANONICAL_LEGACY_STOCKTAKE_JSON_SQL} as state
    from studio_stocktakes as stocktake
    where stocktake.id = $1::uuid
  `, [id]);
  invariant(rows(result).length === 1, "Legacy qualification stocktake is missing; preserve it as audit evidence.");
  return rows(result)[0].state;
}

function assertLegacyStocktakeIdentity(stocktake, configuration, binding) {
  invariant(stocktake?.id === configuration.legacyStocktakeId, "Legacy stocktake UUID does not match the exact qualification target.");
  invariant(stocktake.operator_subject === binding.operatorSubject, "Legacy stocktake operator does not belong to this qualification run.");
  invariant(stocktake.idempotency_key === binding.idempotencyKey, "Legacy stocktake idempotency key does not match this qualification run.");
  invariant(stocktake.location_key === binding.locationKey, "Legacy stocktake location key differs from the frozen qualification fixture.");
  invariant(stocktake.location_label === binding.locationLabel, "Legacy stocktake location label differs from the frozen qualification fixture.");
  assert.deepEqual(stocktake.expected_pieces, binding.expectedPieces, "Legacy stocktake expected pieces differ from the exact legacy fixture.");
}

function assertLegacyOpenStocktake(stocktake, configuration, binding) {
  assertLegacyStocktakeIdentity(stocktake, configuration, binding);
  invariant(stocktake.state === "OPEN", "Legacy stocktake is not OPEN; refuse qualification-only resolution.");
  invariant(stocktake.closed_at === null, "Legacy stocktake already has a closed_at value; refuse qualification-only resolution.");
  invariant(stocktake.version === 1, "Legacy stocktake version is not the exact unresolved version 1.");
}

function assertLegacyClosedStocktake(stocktake, configuration, binding) {
  assertLegacyStocktakeIdentity(stocktake, configuration, binding);
  invariant(stocktake.state === "CLOSED", "Legacy stocktake remains OPEN; resolve it explicitly before cutover.");
  invariant(typeof stocktake.closed_at === "string" && stocktake.closed_at.length > 0, "Legacy stocktake is missing its resolution timestamp.");
  invariant(stocktake.updated_at === stocktake.closed_at, "Legacy stocktake resolution timestamps are not the exact single-clock update.");
  invariant(stocktake.version === 2, "Legacy stocktake is not the exact resolved version 2.");
}

async function assertNoLegacyQualificationCollision(client, configuration, binding) {
  const collision = await client.query(`
    select stocktake.id::text as id
    from studio_stocktakes as stocktake
    where stocktake.id <> $1::uuid
      and (
        stocktake.operator_subject = $2
        or stocktake.idempotency_key = $3
      )
    for update
  `, [configuration.legacyStocktakeId, binding.operatorSubject, binding.idempotencyKey]);
  invariant(rows(collision).length === 0, "An unrelated stocktake shares the qualification operator or idempotency key.");
}

async function lockLegacyResolutionTarget(client, configuration) {
  await client.query(`
    select pg_advisory_xact_lock(
      hashtextextended(
        'juw.transactional-authority.legacy-resolution.v1:' || $1::uuid::text,
        0
      )
    )
  `, [configuration.legacyStocktakeId]);
  const target = await client.query(`
    select ${CANONICAL_LEGACY_STOCKTAKE_JSON_SQL} as state
    from studio_stocktakes as stocktake
    where stocktake.id = $1::uuid
    for update
  `, [configuration.legacyStocktakeId]);
  invariant(rows(target).length === 1, "Legacy qualification stocktake is missing or is not the sole exact UUID target.");
  return rows(target)[0].state;
}

export async function resolveLegacyStocktake(client, configuration) {
  const binding = legacyQualificationStocktakeBinding(configuration.runId);
  return transaction(client, async (transactionClient) => {
    const before = await lockLegacyResolutionTarget(transactionClient, configuration);
    assertLegacyOpenStocktake(before, configuration, binding);
    await assertNoLegacyQualificationCollision(transactionClient, configuration, binding);

    const update = await transactionClient.query(`
      with resolution_clock as (
        select clock_timestamp() as resolved_at
      )
      update studio_stocktakes as stocktake
      set state = 'CLOSED',
        closed_at = resolution_clock.resolved_at,
        updated_at = resolution_clock.resolved_at,
        version = stocktake.version + 1
      from resolution_clock
      where stocktake.id = $1::uuid
        and stocktake.operator_subject = $2
        and stocktake.idempotency_key = $3
        and stocktake.location_key = $4
        and stocktake.location_label = $5
        and stocktake.state = 'OPEN'
        and stocktake.closed_at is null
        and stocktake.version = 1
        and stocktake.expected_pieces = $6::jsonb
      returning ${CANONICAL_LEGACY_STOCKTAKE_JSON_SQL} as state
    `, [
      configuration.legacyStocktakeId,
      binding.operatorSubject,
      binding.idempotencyKey,
      binding.locationKey,
      binding.locationLabel,
      JSON.stringify(binding.expectedPieces),
    ]);
    invariant(rows(update).length === 1, "Legacy stocktake resolution CAS did not update exactly one row.");
    const after = rows(update)[0].state;
    assertLegacyClosedStocktake(after, configuration, binding);
    assert.deepEqual(after, {
      ...before,
      closed_at: after.closed_at,
      state: "CLOSED",
      updated_at: after.updated_at,
      version: before.version + 1,
    }, "Legacy stocktake resolution changed fields outside state, closed_at, updated_at, and version.");

    return Object.freeze({
      closedAt: after.closed_at,
      id: after.id,
      resolutionReference: deterministicLegacyResolutionReference(configuration, after),
      version: after.version,
    });
  }, { isolationLevel: "serializable" });
}

export async function verifyExplicitLegacyResolution(client, configuration) {
  const binding = legacyQualificationStocktakeBinding(configuration.runId);
  const stocktake = await readLegacyStocktake(client, configuration.legacyStocktakeId);
  assertLegacyClosedStocktake(stocktake, configuration, binding);
  await assertNoLegacyQualificationCollision(client, configuration, binding);
  const resolutionReference = deterministicLegacyResolutionReference(configuration, stocktake);
  invariant(
    configuration.legacyResolutionReference === resolutionReference,
    "Legacy resolution reference does not bind the exact preserved CLOSED stocktake.",
  );
  return Object.freeze({
    closedAt: stocktake.closed_at,
    id: stocktake.id,
    resolutionReference,
    version: stocktake.version,
  });
}

function runExpectedLegacyBlockedRelease(releaseCommand, env, secrets) {
  try {
    releaseCommand(join(repositoryRoot, "scripts/shop-db/shop-release.mjs"), [], env);
  } catch (error) {
    const failure = releaseFailureText(error);
    invariant(
      failure.includes("STUDIO_LEGACY_OPEN_STOCKTAKE_AUTHORITY_REQUIRED"),
      `Release failed for an unexpected reason: ${redactSensitive(failure, secrets)}`,
    );
    return redactSensitive(failure, secrets);
  }
  throw new Error("0018 unexpectedly applied over an unresolved legacy OPEN stocktake.");
}

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

async function queryOne(client, text, values = []) {
  const result = await client.query(text, values);
  invariant(rows(result).length === 1, "Expected exactly one database row.");
  return result.rows[0];
}

async function transaction(client, work, options = {}) {
  let began = false;
  try {
    const isolation = options.isolationLevel ? ` isolation level ${options.isolationLevel}` : "";
    const mode = options.readOnly ? " read only" : "";
    await client.query(`begin${isolation}${mode}`);
    began = true;
    await client.query("select set_config('lock_timeout', $1, true)", ["8s"]);
    await client.query("select set_config('statement_timeout', $1, true)", ["30s"]);
    const result = await work(client);
    await client.query("commit");
    began = false;
    return result;
  } catch (error) {
    if (began) {
      try {
        await client.query("rollback");
      } catch {
        // Preserve the command failure. Closing the client releases its transaction.
      }
    }
    throw error;
  }
}

async function settle(promise) {
  try {
    return { status: "fulfilled", value: await promise };
  } catch (error) {
    return { status: "rejected", error };
  }
}

export async function waitForBackendLock(observer, backendPid, options = {}) {
  const attempts = options.attempts ?? 200;
  const wait = options.sleep ?? (() => sleep(25));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await observer.query(
      "select state, wait_event_type, wait_event from pg_stat_activity where pid = $1",
      [backendPid],
    );
    const row = rows(result)[0];
    if (row?.wait_event_type === "Lock") return row;
    await wait();
  }
  throw new Error(`Backend ${backendPid} did not reach a deterministic lock wait.`);
}

export async function runDeterministicRace({
  lockName,
  loser,
  loserAction,
  loserPid,
  observer,
  waitForLock = waitForBackendLock,
  winner,
  winnerAction,
  winnerLock,
}) {
  let winnerOpen = false;
  let loserPromise;
  try {
    await winner.query("begin");
    winnerOpen = true;
    await winner.query("select set_config('lock_timeout', $1, true)", ["8s"]);
    await winner.query("select set_config('statement_timeout', $1, true)", ["30s"]);
    if (winnerLock) {
      await winnerLock(winner);
    } else {
      invariant(lockName, "A deterministic race requires lockName or winnerLock.");
      await winner.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [lockName]);
    }
    loserPromise = transaction(loser, loserAction);
    await waitForLock(observer, loserPid);
    const winnerValue = await winnerAction(winner);
    await winner.query("commit");
    winnerOpen = false;
    return { winner: winnerValue, loser: await settle(loserPromise) };
  } catch (error) {
    if (winnerOpen) {
      try {
        await winner.query("rollback");
      } catch {
        // Closing the backend below releases every remaining lock.
      }
    }
    if (loserPromise) await settle(loserPromise);
    throw error;
  }
}

function fixtureIdentity(runId, key) {
  const compactRun = runId.replaceAll("-", "").slice(0, 16);
  const compactKey = key.replaceAll("-", "").slice(0, 12);
  const sku = `Q${compactRun}${compactKey}`.toUpperCase().slice(0, 40);
  return Object.freeze({
    email: `${compactRun}.${compactKey}@qualification.invalid`,
    key,
    operator: `qualification:${runId}:${key}`,
    pieceKey: `sku:${sku}`,
    sku,
    slug: `qualification-${runId}-${key}`.toLowerCase().slice(0, 160),
  });
}

const FIXTURE_KEYS = Object.freeze([
  "hold-replay",
  "hold-piece-race",
  "release-race",
  "expiry-wins",
  "release-wins",
  "expiry-blocked",
  "order-replay",
  "order-piece-race",
  "order-hold-blocked",
  "order-expired-hold",
  "move-wins",
  "confirm-wins",
  "move-cas",
  "move-fulfillment-race",
  "move-hold-race",
  "confirm-fulfillment-race",
  "ops-authority-replay",
  "ops-one-micro-stale",
  "ops-hold-authority",
  "stale-hold",
  "stale-order",
  "stale-time",
  "stale-order-direct",
  "stale-order-shared",
  "stale-return-direct",
  "stale-custody-version",
  "read-create",
  "read-release",
]);

function fixtureMap(runId) {
  return new Map(FIXTURE_KEYS.map((key) => [key, fixtureIdentity(runId, key)]));
}

async function seedFixtures(client, runId) {
  const fixtures = fixtureMap(runId);
  await transaction(client, async (tx) => {
    const fixtureTime = new Date((await queryOne(tx, "select clock_timestamp() as now")).now).toISOString();
    const existing = await tx.query(
      "select sku from shop_catalogue_items where sku = any($1::varchar[])",
      [[...fixtures.values()].map((fixture) => fixture.sku)],
    );
    invariant(rows(existing).length === 0, "Qualification fixtures already exist; use a fresh disposable branch/run ID.");
    for (const fixture of fixtures.values()) {
      await tx.query(`
        insert into shop_catalogue_items (
          sku, slug, name, category, price, tagged_size, fit, condition, colour,
          drop_label, tone, silhouette, note, story, details, measurements,
          model_anchor, media, created_at, updated_at
        ) values (
          $1, $2, $3, 'Qualification', 10000, 'M', 'Test', 'New', 'Black',
          'Qualification', 'Neutral', 'Test', 'Disposable database qualification fixture',
          'Disposable database qualification fixture', '[]'::jsonb, '[]'::jsonb,
          '{}'::jsonb, '[]'::jsonb, $4::timestamptz, $4::timestamptz
        )
      `, [fixture.sku, fixture.slug, `Qualification ${fixture.key}`, fixtureTime]);
      await tx.query(`
        insert into shop_inventory (
          sku, availability, on_hand, reserved, sold, returned, write_off, updated_at
        ) values ($1, 'AVAILABLE', 1, 0, 0, 0, 0, $2::timestamptz)
      `, [fixture.sku, fixtureTime]);
      const command = await queryOne(tx, `
        insert into studio_piece_custody_commands (
          operator_subject, idempotency_key, piece_key, command,
          from_location_key, from_location_label, to_location_key, to_location_label,
          custody, availability, order_reference, request_fingerprint,
          expected_version, resulting_version, reason, created_at
        ) values (
          $1, $2, $3, 'MOVE', 'PACKING_SHELF', 'Packing shelf',
          'WARDROBE_RAIL', 'Wardrobe rail', 'STUDIO', 'AVAILABLE', null,
          null, null, null, 'Qualification fixture initialization', $4::timestamptz
        ) returning id
      `, [fixture.operator, `fixture-${runId}-${fixture.key}`, fixture.pieceKey, fixtureTime]);
      await tx.query(`
        insert into studio_piece_custody (
          operator_subject, piece_key, location_key, location_label, custody,
          availability, order_reference, last_command_id, version, updated_at
        ) values ($1, $2, 'WARDROBE_RAIL', 'Wardrobe rail', 'STUDIO',
          'AVAILABLE', null, $3::uuid, 1, $4::timestamptz)
      `, [fixture.operator, fixture.pieceKey, command.id, fixtureTime]);
    }
  });
  return fixtures;
}

function holdKey(fixture, suffix) {
  return `hold-${fixture.key}-${suffix}`.slice(0, 160);
}

function locationKey(fixture, suffix) {
  return `location-${fixture.key}-${suffix}`.slice(0, 160);
}

async function createHold(client, fixture, idempotencyKey, expiresAt, overrides = {}) {
  const values = {
    contact: `${fixture.key}@customer.invalid`,
    customerName: `Customer ${fixture.key}`,
    reason: "Qualification reservation",
    ...overrides,
  };
  return queryOne(client, `
    select * from studio_create_manual_hold_v2($1, $2, $3, $4, $5, $6, $7::timestamptz)
  `, [
    fixture.operator,
    idempotencyKey,
    fixture.sku,
    values.customerName,
    values.contact,
    values.reason,
    expiresAt,
  ]);
}

async function releaseHold(client, fixture, holdId) {
  return queryOne(client, "select * from studio_release_manual_hold_v2($1, $2::uuid)", [fixture.operator, holdId]);
}

async function expireHolds(client, fixture) {
  const row = await queryOne(client, "select studio_expire_manual_holds_v2($1) as expired_count", [fixture.operator]);
  return Number(row.expired_count);
}

async function locationVersion(client, fixture) {
  const row = await queryOne(client, `
    select version from studio_piece_custody where operator_subject = $1 and piece_key = $2
  `, [fixture.operator, fixture.pieceKey]);
  return Number(row.version);
}

async function currentAuthorityProjection(client, fixture) {
  const row = await queryOne(client, `
    with order_candidates as (
      select orders.reference, orders.version,
        orders.lifecycle_status::text as lifecycle_status,
        orders.fulfillment_status::text as fulfillment_status,
        orders.updated_at,
        returns.status::text as return_status,
        row_number() over (order by orders.updated_at desc, orders.id desc) as rank
      from shop_order_items as items
      inner join shop_orders as orders on orders.id = items.order_id
      left join shop_order_returns as returns on returns.order_id = orders.id
      where items.sku = $1 and orders.lifecycle_status in ('ACTIVE', 'COMPLETED')
    ),
    current_order as (
      select * from order_candidates where rank = 1
    )
    select inventory.availability::text as availability,
      to_char(
        greatest(inventory.updated_at, coalesce(current_order.updated_at, inventory.updated_at)) at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) as authority_revision,
      current_order.reference as order_reference,
      current_order.version as order_version,
      current_order.fulfillment_status,
      current_order.return_status
    from shop_inventory as inventory
    left join current_order on true
    where inventory.sku = $1
  `, [fixture.sku]);
  invariant(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(row.authority_revision),
    "Database did not return the canonical six-microsecond authority revision.",
  );
  return row;
}

export function oneMicrosecondEarlier(revision) {
  const match = /^(.*\.)(\d{6})Z$/.exec(revision);
  invariant(match && Number(match[2]) > 0, "Authority revision must have a positive microsecond component.");
  return `${match[1]}${String(Number(match[2]) - 1).padStart(6, "0")}Z`;
}

async function movePiece(client, fixture, options) {
  const expectedAuthorityRevision = options.expectedAuthorityRevision
    ?? (await currentAuthorityProjection(client, fixture)).authority_revision;
  const fingerprint = options.fingerprint ?? digest({
    command: "MOVE",
    contract: "juw.studio.location-command.v1",
    expectedAuthorityRevision,
    expectedVersion: options.expectedVersion,
    locationKey: options.location,
    note: options.note ?? null,
    pieceKey: fixture.pieceKey,
    source: "OPERATIONS",
  });
  return queryOne(client, `
    select * from studio_record_piece_move_v2(
      $1, $2, $3, $4, null::uuid, $5, $6, $7, $8, $9, $10, $11
    )
  `, [
    fixture.operator,
    options.idempotencyKey,
    fingerprint,
    fixture.pieceKey,
    fixture.sku,
    options.availability ?? "AVAILABLE",
    options.orderReference ?? null,
    options.expectedVersion,
    expectedAuthorityRevision,
    options.location,
    options.note ?? null,
  ]);
}

async function confirmPiece(client, fixture, options) {
  const source = options.source ?? "OPERATIONS";
  const expectedAuthorityRevision = source === "STOCKTAKE"
    ? null
    : options.expectedAuthorityRevision ?? (await currentAuthorityProjection(client, fixture)).authority_revision;
  const fingerprint = options.fingerprint ?? digest(source === "STOCKTAKE" ? {
    command: "CONFIRM",
    contract: "juw.studio.location-command.v1",
    expectedVersion: options.stocktakeVersion ?? null,
    locationKey: options.location,
    note: options.note ?? null,
    pieceKey: fixture.pieceKey,
    source,
    stocktakeId: options.stocktakeId ?? null,
  } : {
    command: "CONFIRM",
    contract: "juw.studio.location-command.v1",
    expectedAuthorityRevision,
    expectedVersion: options.expectedVersion ?? null,
    locationKey: options.location,
    note: options.note ?? null,
    pieceKey: fixture.pieceKey,
    source,
  });
  return queryOne(client, `
    select * from studio_record_piece_confirmation_v2(
      $1, $2, $3, $4, $5, null::uuid, $6, $7::integer, $8::text, $9, $10,
      $11::uuid, $12::integer
    )
  `, [
    fixture.operator,
    options.idempotencyKey,
    fingerprint,
    source,
    fixture.pieceKey,
    fixture.sku,
    options.expectedVersion ?? null,
    expectedAuthorityRevision,
    options.location,
    options.note ?? null,
    options.stocktakeId ?? null,
    options.stocktakeVersion ?? null,
  ]);
}

async function reconcileReservedAtWardrobe(client, fixture, suffix) {
  return confirmPiece(client, fixture, {
    expectedVersion: await locationVersion(client, fixture),
    idempotencyKey: locationKey(fixture, `reserved-${suffix}`),
    location: "WARDROBE_RAIL",
  });
}

async function makeExpiredHold(client, fixture, suffix, reconcile = true) {
  const now = new Date((await queryOne(client, "select clock_timestamp() as now")).now);
  const hold = await createHold(
    client,
    fixture,
    holdKey(fixture, suffix),
    new Date(now.getTime() + 3_600_000).toISOString(),
  );
  if (reconcile) await reconcileReservedAtWardrobe(client, fixture, suffix);
  await client.query(`
    update studio_manual_holds
    set created_at = clock_timestamp() - interval '2 minutes',
        expires_at = clock_timestamp() - interval '1 minute'
    where id = $1::uuid
  `, [hold.id]);
  return hold;
}

function orderEnvelope(fixture, suffix, overrides = {}) {
  const email = overrides.email ?? fixture.email;
  const idempotencyKey = overrides.idempotencyKey ?? `order-${fixture.key}-${suffix}`.slice(0, 160);
  const now = overrides.now ?? new Date(Date.now() - 1_000).toISOString();
  return Object.freeze({
    actor: fixture.operator,
    contact: {
      email,
      name: `Customer ${fixture.key}`,
      phone: "+2348000000000",
    },
    fingerprint: overrides.fingerprint ?? digest({ email, fixture: fixture.key, idempotencyKey, suffix }),
    fulfillment: overrides.fulfillment ?? { kind: "PICKUP", optionId: "pickup" },
    idempotencyKey,
    lines: [{ quantity: 1, slug: fixture.slug, taggedSize: "M" }],
    now,
    reservationExpiresAt: overrides.reservationExpiresAt ?? new Date(Date.parse(now) + 3_600_000).toISOString(),
    source: "IN_PERSON",
  });
}

async function createOrder(client, fixture, envelope) {
  const row = await queryOne(client, `
    select shop_create_assisted_order_v4(
      $1, 'Qualification operator', $2, 'Disposable database qualification',
      $3, $4, $5::jsonb, $6::jsonb, $7::jsonb,
      $8::timestamptz, $9::timestamptz
    ) as document
  `, [
    envelope.actor,
    envelope.source,
    envelope.idempotencyKey,
    envelope.fingerprint,
    JSON.stringify(envelope.lines),
    JSON.stringify(envelope.contact),
    JSON.stringify(envelope.fulfillment),
    envelope.now,
    envelope.reservationExpiresAt,
  ]);
  return row.document;
}

async function stateDigest(client, fixture) {
  const row = await queryOne(client, `
    select jsonb_build_object(
      'inventory', (select to_jsonb(inventory) from shop_inventory inventory where inventory.sku = $1),
      'holds', (select coalesce(jsonb_agg(to_jsonb(hold) order by hold.id), '[]'::jsonb)
        from studio_manual_holds hold where hold.sku = $1),
      'orders', (select coalesce(jsonb_agg(to_jsonb(orders) order by orders.id), '[]'::jsonb)
        from shop_orders orders inner join shop_order_items items on items.order_id = orders.id where items.sku = $1),
      'customers', (select coalesce(jsonb_agg(to_jsonb(customers) order by customers.id), '[]'::jsonb)
        from shop_customers customers where lower(customers.email) like $2),
      'custody', (select to_jsonb(custody) from studio_piece_custody custody
        where custody.operator_subject = $3 and custody.piece_key = $4),
      'commands', (select coalesce(jsonb_agg(to_jsonb(command) order by command.id), '[]'::jsonb)
        from studio_piece_custody_commands command where command.operator_subject = $3 and command.piece_key = $4),
      'observations', (select coalesce(jsonb_agg(to_jsonb(observation) order by observation.id), '[]'::jsonb)
        from studio_physical_observations observation where observation.operator_subject = $3 and observation.piece_key = $4),
      'stocktakes', (select coalesce(jsonb_agg(to_jsonb(stocktake) order by stocktake.id), '[]'::jsonb)
        from studio_stocktakes stocktake where stocktake.operator_subject = $3)
    ) as state
  `, [fixture.sku, `%${fixture.key.replaceAll("-", "")}%`, fixture.operator, fixture.pieceKey]);
  return digest(row.state);
}

async function confirmationWriteState(client, fixture, stocktakeId) {
  const row = await queryOne(client, `
    select jsonb_build_object(
      'inventory', (select to_jsonb(inventory) from shop_inventory inventory where inventory.sku = $1),
      'custody', (select to_jsonb(custody) from studio_piece_custody custody
        where custody.operator_subject = $2 and custody.piece_key = $3),
      'commands', (select coalesce(jsonb_agg(to_jsonb(command) order by command.id), '[]'::jsonb)
        from studio_piece_custody_commands command where command.operator_subject = $2 and command.piece_key = $3),
      'observations', (select coalesce(jsonb_agg(to_jsonb(observation) order by observation.id), '[]'::jsonb)
        from studio_physical_observations observation where observation.operator_subject = $2 and observation.piece_key = $3),
      'stocktake', (select to_jsonb(stocktake) from studio_stocktakes stocktake where stocktake.id = $4::uuid)
    ) as state
  `, [fixture.sku, fixture.operator, fixture.pieceKey, stocktakeId]);
  return row.state;
}

export function assertConfirmationStateUnchanged(before, after, scenario) {
  const fields = ["inventory", "custody", "commands", "observations", "stocktake"];
  for (const [index, field] of fields.entries()) {
    assert.deepEqual(
      after[field],
      before[field],
      `${scenario}: confirmation changed ${CONFIRMATION_NO_WRITE_TABLES[index]}`,
    );
  }
}

function assertLocationReceiptStateUnchanged(before, after, scenario) {
  for (const [field, table] of [
    ["custody", "studio_piece_custody"],
    ["commands", "studio_piece_custody_commands"],
    ["observations", "studio_physical_observations"],
    ["stocktake", "studio_stocktakes"],
  ]) {
    assert.deepEqual(after[field], before[field], `${scenario}: losing command changed ${table}`);
  }
}

function errorContains(outcome, fragment) {
  assert.equal(outcome.status, "rejected", `Expected rejection containing ${fragment}.`);
  assert.match(String(outcome.error?.message ?? outcome.error), new RegExp(fragment));
}

async function assertCount(client, text, values, expected, label) {
  const row = await queryOne(client, `select count(*)::integer as count from (${text}) qualification_count`, values);
  assert.equal(Number(row.count), expected, label);
}

async function holdQualification(clients, fixtures) {
  const { a, b, observer, pids } = clients;
  const results = [];

  {
    const fixture = fixtures.get("hold-replay");
    const key = holdKey(fixture, "same");
    const expiry = new Date(Date.now() + 3_600_000).toISOString();
    const race = await runDeterministicRace({
      lockName: `juw:studio:hold:idempotency:${fixture.operator}:${key}`,
      loser: b,
      loserAction: (client) => createHold(client, fixture, key, expiry),
      loserPid: pids.b,
      observer,
      winner: a,
      winnerAction: (client) => createHold(client, fixture, key, expiry),
    });
    assert.equal(race.winner.outcome, "CREATED");
    assert.equal(race.loser.status, "fulfilled");
    assert.equal(race.loser.value.outcome, "REPLAYED");
    assert.equal(race.loser.value.id, race.winner.id);
    await assertCount(observer, "select 1 from studio_manual_holds where sku = $1", [fixture.sku], 1, "same-key hold duplicated");
    results.push("hold-same-key-replay");
  }

  {
    const fixture = fixtures.get("hold-piece-race");
    const expiry = new Date(Date.now() + 3_600_000).toISOString();
    const race = await runDeterministicRace({
      lockName: `juw:studio:piece:${fixture.sku}`,
      loser: b,
      loserAction: (client) => createHold(client, fixture, holdKey(fixture, "loser"), expiry),
      loserPid: pids.b,
      observer,
      winner: a,
      winnerAction: (client) => createHold(client, fixture, holdKey(fixture, "winner"), expiry),
    });
    assert.equal(race.winner.outcome, "CREATED");
    errorContains(race.loser, "STUDIO_PIECE_UNAVAILABLE");
    await assertCount(observer, "select 1 from studio_manual_holds where sku = $1", [fixture.sku], 1, "piece race created multiple holds");
    results.push("hold-piece-single-winner");
  }

  {
    const fixture = fixtures.get("release-race");
    const hold = await makeExpiredHold(observer, fixture, "release", true);
    const race = await runDeterministicRace({
      lockName: `juw:studio:piece:${fixture.sku}`,
      loser: b,
      loserAction: (client) => releaseHold(client, fixture, hold.id),
      loserPid: pids.b,
      observer,
      winner: a,
      winnerAction: (client) => releaseHold(client, fixture, hold.id),
    });
    assert.equal(race.winner.outcome, "RELEASED");
    assert.equal(race.loser.status, "fulfilled");
    assert.equal(race.loser.value.outcome, "ALREADY_RELEASED");
    results.push("hold-double-release");
  }

  {
    const fixture = fixtures.get("expiry-wins");
    const hold = await makeExpiredHold(observer, fixture, "expiry", true);
    const race = await runDeterministicRace({
      lockName: `juw:studio:piece:${fixture.sku}`,
      loser: b,
      loserAction: (client) => releaseHold(client, fixture, hold.id),
      loserPid: pids.b,
      observer,
      winner: a,
      winnerAction: (client) => expireHolds(client, fixture),
    });
    assert.equal(race.winner, 1);
    assert.equal(race.loser.status, "fulfilled");
    assert.equal(race.loser.value.outcome, "ALREADY_EXPIRED");
    results.push("hold-expiry-wins");
  }

  {
    const fixture = fixtures.get("release-wins");
    const hold = await makeExpiredHold(observer, fixture, "release", true);
    const race = await runDeterministicRace({
      lockName: `juw:studio:piece:${fixture.sku}`,
      loser: b,
      loserAction: (client) => expireHolds(client, fixture),
      loserPid: pids.b,
      observer,
      winner: a,
      winnerAction: (client) => releaseHold(client, fixture, hold.id),
    });
    assert.equal(race.winner.outcome, "RELEASED");
    assert.equal(race.loser.status, "fulfilled");
    assert.equal(race.loser.value, 0);
    results.push("hold-release-wins");
  }

  {
    const fixture = fixtures.get("expiry-blocked");
    const hold = await makeExpiredHold(observer, fixture, "blocked", false);
    const before = await stateDigest(observer, fixture);
    assert.equal(await expireHolds(observer, fixture), 0);
    assert.equal(await stateDigest(observer, fixture), before, "blocked expiry changed database state");
    const release = await settle(releaseHold(observer, fixture, hold.id));
    errorContains(release, "STUDIO_CUSTODY_CONFLICT");
    assert.equal(await stateDigest(observer, fixture), before, "blocked release changed database state");
    results.push("hold-custody-no-write");
  }

  return results;
}

async function orderQualification(clients, fixtures) {
  const { a, b, observer, pids } = clients;
  const results = [];

  {
    const fixture = fixtures.get("order-replay");
    const envelope = orderEnvelope(fixture, "same");
    const lock = `juw:studio:assisted-order:idempotency:${envelope.contact.email.toLowerCase()}:${envelope.idempotencyKey}`;
    const race = await runDeterministicRace({
      lockName: lock,
      loser: b,
      loserAction: (client) => createOrder(client, fixture, envelope),
      loserPid: pids.b,
      observer,
      winner: a,
      winnerAction: (client) => createOrder(client, fixture, envelope),
    });
    assert.equal(race.loser.status, "fulfilled");
    assert.equal(race.loser.value.reference, race.winner.reference);
    await assertCount(observer, `select 1 from shop_order_items where sku = $1`, [fixture.sku], 1, "same-key assisted order duplicated");
    results.push("order-same-key-replay");
  }

  {
    const fixture = fixtures.get("order-piece-race");
    const winner = orderEnvelope(fixture, "winner", { email: `winner.${fixture.email}` });
    const loser = orderEnvelope(fixture, "loser", { email: `loser.${fixture.email}` });
    const race = await runDeterministicRace({
      lockName: `juw:studio:piece:${fixture.sku}`,
      loser: b,
      loserAction: (client) => createOrder(client, fixture, loser),
      loserPid: pids.b,
      observer,
      winner: a,
      winnerAction: (client) => createOrder(client, fixture, winner),
    });
    assert.ok(race.winner.reference);
    errorContains(race.loser, "SHOP_INVENTORY_UNAVAILABLE");
    await assertCount(observer, `select 1 from shop_order_items where sku = $1`, [fixture.sku], 1, "piece race created multiple assisted orders");
    await assertCount(observer, `select 1 from shop_customers where lower(email) = lower($1)`, [loser.contact.email], 0, "losing assisted customer did not roll back");
    results.push("order-piece-single-winner");
  }

  {
    const fixture = fixtures.get("order-hold-blocked");
    const expiry = new Date(Date.now() + 3_600_000).toISOString();
    await createHold(observer, fixture, holdKey(fixture, "active"), expiry);
    const envelope = orderEnvelope(fixture, "blocked");
    const before = await stateDigest(observer, fixture);
    const outcome = await settle(createOrder(observer, fixture, envelope));
    errorContains(outcome, "SHOP_INVENTORY_UNAVAILABLE");
    assert.equal(await stateDigest(observer, fixture), before, "active-hold assisted-order failure wrote state");
    results.push("order-active-hold-no-write");
  }

  {
    const fixture = fixtures.get("order-expired-hold");
    await makeExpiredHold(observer, fixture, "reclaim", true);
    const document = await createOrder(observer, fixture, orderEnvelope(fixture, "reclaim"));
    assert.ok(document.reference);
    const state = await queryOne(observer, `
      select inventory.availability::text as availability, inventory.reserved,
        hold.status, orders.reference
      from shop_inventory inventory
      inner join studio_manual_holds hold on hold.sku = inventory.sku
      inner join shop_order_items items on items.sku = inventory.sku
      inner join shop_orders orders on orders.id = items.order_id
      where inventory.sku = $1
    `, [fixture.sku]);
    assert.equal(state.status, "EXPIRED");
    assert.equal(state.availability, "RESERVED");
    assert.equal(Number(state.reserved), 1);
    assert.equal(state.reference, document.reference);
    results.push("order-expired-hold-atomic-reclaim");
  }

  return results;
}

async function locationQualification(clients, fixtures) {
  const { a, b, observer, pids } = clients;
  const results = [];

  {
    const fixture = fixtures.get("move-wins");
    const key = locationKey(fixture, "cross");
    const race = await runDeterministicRace({
      lockName: `juw:studio:location:idempotency:${fixture.operator}:${key}`,
      loser: b,
      loserAction: (client) => confirmPiece(client, fixture, {
        expectedVersion: 1,
        fingerprint: digest("confirm-loser"),
        idempotencyKey: key,
        location: "WARDROBE_RAIL",
      }),
      loserPid: pids.b,
      observer,
      winner: a,
      winnerAction: (client) => movePiece(client, fixture, {
        expectedVersion: 1,
        fingerprint: digest("move-winner"),
        idempotencyKey: key,
        location: "PACKING_SHELF",
      }),
    });
    assert.equal(race.winner.outcome, "APPLIED");
    errorContains(race.loser, "STUDIO_IDEMPOTENCY_MISMATCH");
    assert.equal(await locationVersion(observer, fixture), 2);
    results.push("location-move-wins-cross-type");
  }

  {
    const fixture = fixtures.get("confirm-wins");
    const key = locationKey(fixture, "cross");
    const race = await runDeterministicRace({
      lockName: `juw:studio:location:idempotency:${fixture.operator}:${key}`,
      loser: b,
      loserAction: (client) => movePiece(client, fixture, {
        expectedVersion: 1,
        fingerprint: digest("move-loser"),
        idempotencyKey: key,
        location: "PACKING_SHELF",
      }),
      loserPid: pids.b,
      observer,
      winner: a,
      winnerAction: (client) => confirmPiece(client, fixture, {
        expectedVersion: 1,
        fingerprint: digest("confirm-winner"),
        idempotencyKey: key,
        location: "WARDROBE_RAIL",
      }),
    });
    assert.equal(race.winner.outcome, "APPLIED");
    errorContains(race.loser, "STUDIO_IDEMPOTENCY_MISMATCH");
    assert.equal(await locationVersion(observer, fixture), 1);
    results.push("location-confirm-wins-cross-type");
  }

  {
    const fixture = fixtures.get("move-cas");
    const race = await runDeterministicRace({
      lockName: `juw:studio:piece:${fixture.sku}`,
      loser: b,
      loserAction: (client) => movePiece(client, fixture, {
        expectedVersion: 1,
        idempotencyKey: locationKey(fixture, "loser"),
        location: "RETURN_INSPECTION",
      }),
      loserPid: pids.b,
      observer,
      winner: a,
      winnerAction: (client) => movePiece(client, fixture, {
        expectedVersion: 1,
        idempotencyKey: locationKey(fixture, "winner"),
        location: "PACKING_SHELF",
      }),
    });
    assert.equal(race.winner.outcome, "APPLIED");
    errorContains(race.loser, "STUDIO_LOCATION_VERSION_CONFLICT");
    assert.equal(await locationVersion(observer, fixture), 2);
    await assertCount(observer, `
      select 1 from studio_piece_custody_commands
      where operator_subject = $1 and piece_key = $2 and idempotency_key like $3
    `, [fixture.operator, fixture.pieceKey, `location-${fixture.key}-%`], 1, "location CAS loser wrote a receipt");
    results.push("location-expected-version-cas");
  }

  {
    const fixture = fixtures.get("move-hold-race");
    const staleProjection = await currentAuthorityProjection(observer, fixture);
    const before = await confirmationWriteState(observer, fixture, null);
    const race = await runDeterministicRace({
      lockName: `juw:studio:piece:${fixture.sku}`,
      loser: b,
      loserAction: (client) => movePiece(client, fixture, {
        expectedAuthorityRevision: staleProjection.authority_revision,
        expectedVersion: 1,
        idempotencyKey: locationKey(fixture, "delayed-hold-loser"),
        location: "PACKING_SHELF",
      }),
      loserPid: pids.b,
      observer,
      winner: a,
      winnerAction: (client) => createHold(
        client,
        fixture,
        holdKey(fixture, "delayed-winner"),
        new Date(Date.now() + 3_600_000).toISOString(),
      ),
    });
    assert.equal(race.winner.outcome, "CREATED");
    errorContains(race.loser, "STUDIO_LOCATION_VERSION_CONFLICT");
    const after = await confirmationWriteState(observer, fixture, null);
    assertLocationReceiptStateUnchanged(before, after, "delayed-hold MOVE conflict");
    assert.deepEqual(
      {
        availability: after.inventory.availability,
        onHand: Number(after.inventory.on_hand),
        reserved: Number(after.inventory.reserved),
      },
      { availability: "RESERVED", onHand: 1, reserved: 1 },
      "manual-hold writer did not remain the sole inventory mutation",
    );
    assert.equal(await locationVersion(observer, fixture), 1, "delayed-hold MOVE conflict advanced locationVersion");
    await assertCount(observer, "select 1 from studio_manual_holds where id = $1::uuid and status = 'ACTIVE'", [race.winner.id], 1, "winning hold is absent");
    results.push(rowRaceScenario(
      "location-move-vs-delayed-manual-hold",
      true,
      "SHARED_PIECE_ADVISORY_SERIALIZATION",
      "studio_manual_holds + shop_inventory",
    ));
  }

  {
    const fixture = fixtures.get("confirm-fulfillment-race");
    const fulfillment = {
      address: {
        area: "Victoria Island",
        country: "Nigeria",
        state: "Lagos",
        street: "14 Qualification Road",
      },
      kind: "DELIVERY",
      optionId: "lagos",
    };
    await createOrder(observer, fixture, orderEnvelope(fixture, "confirm-fulfillment", { fulfillment }));
    const order = await currentOrderForFixture(observer, fixture);
    const staleProjection = await currentAuthorityProjection(observer, fixture);
    const before = await confirmationWriteState(observer, fixture, null);
    const race = await runDeterministicRace({
      loser: b,
      loserAction: (client) => confirmPiece(client, fixture, {
        expectedAuthorityRevision: staleProjection.authority_revision,
        expectedVersion: 1,
        idempotencyKey: locationKey(fixture, "delayed-fulfillment-loser"),
        location: "PACKING_SHELF",
      }),
      loserPid: pids.b,
      observer,
      winner: a,
      winnerLock: (client) => client.query("select 1 from shop_orders where id = $1::uuid for update", [order.id]),
      winnerAction: (client) => updateOrderInTransit(client, order.id, fixture.key),
    });
    errorContains(race.loser, "STUDIO_LOCATION_VERSION_CONFLICT");
    assert.deepEqual(await orderState(observer, order.id), race.winner, "fulfillment writer was not the sole order mutation");
    assertConfirmationStateUnchanged(
      before,
      await confirmationWriteState(observer, fixture, null),
      "delayed-fulfillment CONFIRM conflict",
    );
    assert.equal(await locationVersion(observer, fixture), 1, "delayed-fulfillment CONFIRM conflict advanced locationVersion");
    results.push(rowRaceScenario(
      "location-confirm-vs-delayed-fulfillment",
      false,
      "ORDER_ROW_LOCK_AND_POST_WAIT_CONFIRM_REVALIDATION",
      "shop_orders",
    ));
  }

  {
    const fixture = fixtures.get("move-fulfillment-race");
    const fulfillment = {
      address: {
        area: "Victoria Island",
        country: "Nigeria",
        state: "Lagos",
        street: "12 Qualification Road",
      },
      kind: "DELIVERY",
      optionId: "lagos",
    };
    await createOrder(observer, fixture, orderEnvelope(fixture, "fulfillment", { fulfillment }));
    const order = await currentOrderForFixture(observer, fixture);
    const before = await confirmationWriteState(observer, fixture, null);
    const race = await runDeterministicRace({
      loser: b,
      loserAction: (client) => movePiece(client, fixture, {
        availability: "RESERVED",
        expectedVersion: 1,
        idempotencyKey: locationKey(fixture, "in-transit-loser"),
        location: "RETURN_INSPECTION",
        orderReference: order.reference,
      }),
      loserPid: pids.b,
      observer,
      winner: a,
      winnerLock: (client) => client.query("select 1 from shop_orders where id = $1::uuid for update", [order.id]),
      winnerAction: (client) => updateOrderInTransit(client, order.id, fixture.key),
    });
    errorContains(race.loser, "STUDIO_(LOCATION_VERSION|CUSTODY)_CONFLICT");
    assert.deepEqual(await orderState(observer, order.id), race.winner, "fulfillment writer was not the sole order mutation");
    assertConfirmationStateUnchanged(
      before,
      await confirmationWriteState(observer, fixture, null),
      "direct-row fulfillment conflict",
    );
    results.push(rowRaceScenario(
      "location-move-vs-in-transit-direct-row",
      false,
      "ORDER_ROW_LOCK_AND_POST_WAIT_MOVE_REVALIDATION",
      "shop_orders",
    ));
  }

  return results;
}

async function openStocktake(client, fixture, suffix, expectedLocationKey = null) {
  const stocktake = await queryOne(client, `
    with order_candidates as (
      select
        orders.id,
        orders.reference,
        orders.version,
        orders.lifecycle_status::text as lifecycle_status,
        orders.fulfillment_status::text as fulfillment_status,
        orders.updated_at as authority_updated_at,
        returns.status::text as return_status,
        row_number() over (
          order by orders.updated_at desc, orders.id desc
        ) as rank
      from shop_order_items as items
      inner join shop_orders as orders on orders.id = items.order_id
      left join shop_order_returns as returns on returns.order_id = orders.id
      where items.sku = $1
        and orders.lifecycle_status in ('ACTIVE', 'COMPLETED')
    ),
    current_order as (
      select * from order_candidates where rank = 1
    ),
    base_authority as (
      select
        inventory.availability::text as availability,
        greatest(
          inventory.updated_at,
          coalesce(current_order.authority_updated_at, inventory.updated_at)
        ) as authority_updated_at,
        current_order.reference as order_reference,
        current_order.version as order_version,
        current_order.lifecycle_status as order_lifecycle_status,
        current_order.fulfillment_status as order_fulfillment_status,
        current_order.return_status as order_return_status,
        case
          when inventory.availability = 'AVAILABLE' then 'WARDROBE_RAIL'
          when inventory.availability = 'RESERVED' and current_order.fulfillment_status = 'IN_TRANSIT' then 'COURIER'
          when inventory.availability = 'RESERVED' then 'PACKING_SHELF'
          when inventory.availability = 'SOLD' and current_order.return_status = 'RECEIVED' then 'RETURN_INSPECTION'
          when inventory.availability = 'SOLD' then 'CUSTOMER'
          else 'RETIRED'
        end as base_location_key,
        case
          when inventory.availability = 'AVAILABLE' then 'Wardrobe rail'
          when inventory.availability = 'RESERVED' and current_order.fulfillment_status = 'IN_TRANSIT' then 'With courier'
          when inventory.availability = 'RESERVED' then 'Packing shelf'
          when inventory.availability = 'SOLD' and current_order.return_status = 'RECEIVED' then 'Return inspection'
          when inventory.availability = 'SOLD' then 'With customer'
          else 'Retired'
        end as base_location_label,
        case
          when inventory.availability in ('AVAILABLE', 'RESERVED')
            and coalesce(current_order.fulfillment_status, '') <> 'IN_TRANSIT' then 'STUDIO'
          when inventory.availability = 'SOLD' and current_order.return_status = 'RECEIVED' then 'STUDIO'
          when inventory.availability = 'RESERVED' and current_order.fulfillment_status = 'IN_TRANSIT' then 'COURIER'
          when inventory.availability = 'SOLD' then 'CUSTOMER'
          else 'UNKNOWN'
        end as base_custody
      from shop_inventory as inventory
      left join current_order on true
      where inventory.sku = $1
    ),
    exact_authority as (
      select
        base.*,
        coalesce(projection.location_key, base.base_location_key) as effective_location_key,
        coalesce(projection.location_label, base.base_location_label) as effective_location_label,
        coalesce(custody_revision.version, 0) as location_version
      from base_authority as base
      left join studio_piece_custody as projection
        on projection.operator_subject = $2
        and projection.piece_key = $3
        and base.base_custody = 'STUDIO'
        and projection.custody = 'STUDIO'
        and projection.availability = base.availability
        and projection.order_reference is not distinct from base.order_reference
        and projection.updated_at >= base.authority_updated_at
      left join studio_piece_custody as custody_revision
        on custody_revision.operator_subject = $2
        and custody_revision.piece_key = $3
    ),
    inserted as (
      insert into studio_stocktakes (
        operator_subject, idempotency_key, location_key, location_label,
        state, expected_pieces, version, started_at, updated_at
      )
      select
        $2,
        $4,
        authority.effective_location_key,
        authority.effective_location_label,
        'OPEN',
        jsonb_build_array(jsonb_build_object(
          'authorityUpdatedAt', authority.authority_updated_at,
          'locationVersion', authority.location_version,
          'pieceKey', $3,
          'wardrobeItemId', null,
          'sku', $1,
          'title', $5::text,
          'expectedLocationKey', authority.effective_location_key,
          'expectedLocationLabel', authority.effective_location_label,
          'expectedCustody', authority.base_custody,
          'availability', authority.availability,
          'orderReference', authority.order_reference,
          'orderVersion', authority.order_version,
          'orderLifecycleStatus', authority.order_lifecycle_status,
          'orderFulfillmentStatus', authority.order_fulfillment_status,
          'orderReturnStatus', authority.order_return_status
        )),
        1,
        clock_timestamp(),
        clock_timestamp()
      from exact_authority as authority
      where authority.base_custody = 'STUDIO'
        and authority.effective_location_key in ('WARDROBE_RAIL', 'PACKING_SHELF', 'RETURN_INSPECTION')
        and ($6::text is null or authority.effective_location_key = $6)
      returning *
    )
    select * from inserted
  `, [
    fixture.sku,
    fixture.operator,
    fixture.pieceKey,
    `stocktake-${fixture.key}-${suffix}`,
    `Qualification ${fixture.key}`,
    expectedLocationKey,
  ]);
  invariant(stocktake.id, `Could not open ${expectedLocationKey ?? "current-location"} stocktake for ${fixture.key}.`);
  return stocktake;
}

async function assertStaleStocktakeNoWrite(client, fixture, stocktake, suffix) {
  const before = await stateDigest(client, fixture);
  const outcome = await settle(confirmPiece(client, fixture, {
    expectedVersion: null,
    idempotencyKey: locationKey(fixture, `stale-${suffix}`),
    location: stocktake.location_key,
    source: "STOCKTAKE",
    stocktakeId: stocktake.id,
    stocktakeVersion: 1,
  }));
  errorContains(outcome, "STUDIO_(STOCKTAKE_AUTHORITY|STOCKTAKE_VERSION|LOCATION_VERSION)_CONFLICT");
  assert.equal(await stateDigest(client, fixture), before, `${suffix} stale stocktake wrote state`);
}

async function staleStocktakeQualification(client, fixtures) {
  const results = [];
  {
    const fixture = fixtures.get("stale-hold");
    const stocktake = await openStocktake(client, fixture, "hold");
    await createHold(client, fixture, holdKey(fixture, "stale"), new Date(Date.now() + 3_600_000).toISOString());
    await assertStaleStocktakeNoWrite(client, fixture, stocktake, "manual-hold");
    results.push("stale-stocktake-manual-hold");
  }
  {
    const fixture = fixtures.get("stale-order");
    const stocktake = await openStocktake(client, fixture, "order");
    await createOrder(client, fixture, orderEnvelope(fixture, "stale"));
    await assertStaleStocktakeNoWrite(client, fixture, stocktake, "assisted-order");
    results.push("stale-stocktake-assisted-order");
  }
  {
    const fixture = fixtures.get("stale-time");
    const stocktake = await openStocktake(client, fixture, "time");
    await client.query(`
      update shop_inventory set updated_at = clock_timestamp() where sku = $1
    `, [fixture.sku]);
    await assertStaleStocktakeNoWrite(client, fixture, stocktake, "authority-timestamp");
    results.push("stale-stocktake-authority-timestamp");
  }
  {
    const fixture = fixtures.get("stale-custody-version");
    const stocktake = await openStocktake(client, fixture, "custody-version", "WARDROBE_RAIL");
    await movePiece(client, fixture, {
      expectedVersion: 1,
      idempotencyKey: locationKey(fixture, "away"),
      location: "PACKING_SHELF",
    });
    await movePiece(client, fixture, {
      expectedVersion: 2,
      idempotencyKey: locationKey(fixture, "back"),
      location: "WARDROBE_RAIL",
    });
    const restored = await queryOne(client, `
      select location_key, location_label, custody, availability, order_reference, version
      from studio_piece_custody
      where operator_subject = $1 and piece_key = $2
    `, [fixture.operator, fixture.pieceKey]);
    assert.deepEqual(
      {
        availability: restored.availability,
        custody: restored.custody,
        locationKey: restored.location_key,
        locationLabel: restored.location_label,
        orderReference: restored.order_reference,
        version: Number(restored.version),
      },
      {
        availability: "AVAILABLE",
        custody: "STUDIO",
        locationKey: "WARDROBE_RAIL",
        locationLabel: "Wardrobe rail",
        orderReference: null,
        version: 3,
      },
      "away-and-back fixture did not restore values while advancing locationVersion",
    );
    await assertStaleStocktakeNoWrite(client, fixture, stocktake, "custody-away-and-back");
    results.push("stale-stocktake-custody-away-and-back-version");
  }
  return results;
}

async function forceNonMillisecondAuthorityRevision(client, fixture) {
  await client.query(`
    update shop_inventory
    set updated_at = date_trunc('milliseconds', clock_timestamp()) + interval '999 microseconds'
    where sku = $1
  `, [fixture.sku]);
  const projection = await currentAuthorityProjection(client, fixture);
  invariant(/\.\d{3}999Z$/.test(projection.authority_revision), "Qualification did not establish non-millisecond authority.");
  return projection;
}

async function operationsAuthorityQualification(client, fixtures) {
  const results = [];

  {
    const fixture = fixtures.get("ops-authority-replay");
    const projection = await forceNonMillisecondAuthorityRevision(client, fixture);
    const command = {
      expectedAuthorityRevision: projection.authority_revision,
      expectedVersion: 1,
      idempotencyKey: locationKey(fixture, "microsecond-replay"),
      location: "WARDROBE_RAIL",
    };
    const applied = await confirmPiece(client, fixture, command);
    assert.equal(applied.outcome, "APPLIED");
    await createHold(
      client,
      fixture,
      holdKey(fixture, "replay-advance"),
      new Date(Date.now() + 3_600_000).toISOString(),
    );
    const beforeReplay = await confirmationWriteState(client, fixture, null);
    const replay = await confirmPiece(client, fixture, command);
    assert.equal(replay.outcome, "REPLAYED");
    assert.equal(replay.id, applied.id, "exact same-key replay returned a different receipt");
    assertConfirmationStateUnchanged(
      beforeReplay,
      await confirmationWriteState(client, fixture, null),
      "same-key replay after authority advance",
    );
    results.push({
      exactReceiptReused: true,
      name: "operations-six-microsecond-authority-and-exact-replay",
      nonMillisecondRevision: true,
      replayResolvedBeforeMutableAuthorityGates: true,
    });
  }

  {
    const fixture = fixtures.get("ops-one-micro-stale");
    const projection = await forceNonMillisecondAuthorityRevision(client, fixture);
    const staleRevision = oneMicrosecondEarlier(projection.authority_revision);
    const before = await confirmationWriteState(client, fixture, null);
    const outcome = await settle(confirmPiece(client, fixture, {
      expectedAuthorityRevision: staleRevision,
      expectedVersion: 1,
      idempotencyKey: locationKey(fixture, "one-microsecond-stale"),
      location: "WARDROBE_RAIL",
    }));
    errorContains(outcome, "STUDIO_LOCATION_VERSION_CONFLICT");
    assertConfirmationStateUnchanged(
      before,
      await confirmationWriteState(client, fixture, null),
      "one-microsecond stale authority conflict",
    );
    assert.equal(await locationVersion(client, fixture), 1);
    results.push({
      differenceMicroseconds: 1,
      name: "operations-one-microsecond-stale-no-write",
      unchangedOnConflict: CONFIRMATION_NO_WRITE_TABLES,
    });
  }

  {
    const fixture = fixtures.get("ops-hold-authority");
    const availableProjection = await currentAuthorityProjection(client, fixture);
    const hold = await createHold(
      client,
      fixture,
      holdKey(fixture, "authority"),
      new Date(Date.now() + 3_600_000).toISOString(),
    );
    const beforeReserveConflict = await confirmationWriteState(client, fixture, null);
    const reserveConflict = await settle(movePiece(client, fixture, {
      expectedAuthorityRevision: availableProjection.authority_revision,
      expectedVersion: 1,
      idempotencyKey: locationKey(fixture, "stale-reserve"),
      location: "PACKING_SHELF",
    }));
    errorContains(reserveConflict, "STUDIO_LOCATION_VERSION_CONFLICT");
    assertConfirmationStateUnchanged(
      beforeReserveConflict,
      await confirmationWriteState(client, fixture, null),
      "manual-hold reserve authority conflict",
    );

    await reconcileReservedAtWardrobe(client, fixture, "authority-release");
    const reservedProjection = await currentAuthorityProjection(client, fixture);
    assert.equal((await releaseHold(client, fixture, hold.id)).outcome, "RELEASED");
    const beforeReleaseConflict = await confirmationWriteState(client, fixture, null);
    const releaseConflict = await settle(movePiece(client, fixture, {
      availability: "RESERVED",
      expectedAuthorityRevision: reservedProjection.authority_revision,
      expectedVersion: 1,
      idempotencyKey: locationKey(fixture, "stale-release"),
      location: "RETURN_INSPECTION",
    }));
    errorContains(releaseConflict, "STUDIO_LOCATION_VERSION_CONFLICT");
    assertConfirmationStateUnchanged(
      beforeReleaseConflict,
      await confirmationWriteState(client, fixture, null),
      "manual-hold release authority conflict",
    );
    assert.equal(await locationVersion(client, fixture), 1);
    results.push({
      locationVersionStayedConstant: true,
      name: "operations-hold-reserve-release-authority-no-write",
      unchangedOnConflict: CONFIRMATION_NO_WRITE_TABLES,
    });
  }

  return results;
}

async function currentOrderForFixture(client, fixture) {
  return queryOne(client, `
    select orders.id, orders.customer_id, orders.reference, orders.version,
      orders.fulfillment_status::text as fulfillment_status
    from shop_orders as orders
    inner join shop_order_items as items on items.order_id = orders.id
    where items.sku = $1
      and orders.lifecycle_status in ('ACTIVE', 'COMPLETED')
    order by orders.updated_at desc, orders.id desc
    limit 1
  `, [fixture.sku]);
}

async function orderState(client, orderId) {
  return (await queryOne(client, `
    select to_jsonb(orders) as state from shop_orders as orders where orders.id = $1::uuid
  `, [orderId])).state;
}

async function returnState(client, returnId) {
  return (await queryOne(client, `
    select to_jsonb(returns) as state from shop_order_returns as returns where returns.id = $1::uuid
  `, [returnId])).state;
}

async function updateOrderAuthority(client, orderId) {
  return (await queryOne(client, `
    update shop_orders as orders
    set fulfillment_status = 'READY_FOR_HANDOFF',
        version = orders.version + 1,
        updated_at = clock_timestamp()
    where orders.id = $1::uuid
    returning to_jsonb(orders) as state
  `, [orderId])).state;
}

async function updateOrderInTransit(client, orderId, fixtureKey) {
  return (await queryOne(client, `
    update shop_orders as orders
    set fulfillment_status = 'IN_TRANSIT',
        carrier_name = 'Qualification courier',
        tracking_reference = $2,
        dispatch_reference = $3,
        dispatched_at = clock_timestamp(),
        version = orders.version + 1,
        updated_at = clock_timestamp()
    where orders.id = $1::uuid
    returning to_jsonb(orders) as state
  `, [orderId, `TRACK-${fixtureKey}`, `DISPATCH-${fixtureKey}`])).state;
}

async function insertQualificationReturn(client, fixture, order) {
  return queryOne(client, `
    insert into shop_order_returns (
      order_id, customer_id, idempotency_key, request_fingerprint,
      status, reason, detail, requested_at, eligible_until
    ) values (
      $1::uuid, $2::uuid, $3, $4, 'REQUESTED', 'OTHER',
      'Qualification-only return lifecycle race fixture.',
      clock_timestamp(), clock_timestamp() + interval '30 days'
    ) returning id, order_id
  `, [
    order.id,
    order.customer_id,
    `return-${fixture.key}`,
    digest({ fixture: fixture.key, kind: "return-lifecycle-race" }),
  ]);
}

async function updateReturnAuthority(client, returnId) {
  return (await queryOne(client, `
    update shop_order_returns as returns
    set status = 'APPROVED', approved_at = clock_timestamp()
    where returns.id = $1::uuid
    returning to_jsonb(returns) as state
  `, [returnId])).state;
}

async function confirmFrozenStocktake(client, fixture, stocktake, suffix) {
  return confirmPiece(client, fixture, {
    expectedVersion: null,
    idempotencyKey: locationKey(fixture, suffix),
    location: stocktake.location_key,
    source: "STOCKTAKE",
    stocktakeId: stocktake.id,
    stocktakeVersion: Number(stocktake.version),
  });
}

function rowRaceScenario(name, competingWriterUsesSharedPieceAdvisory, proofBoundary, authorityWriterTable) {
  return Object.freeze({
    authorityWriterIsSoleMutation: true,
    authorityWriterTable,
    competingWriterUsesSharedPieceAdvisory,
    name,
    proofBoundary,
    unchangedOnConflict: CONFIRMATION_NO_WRITE_TABLES,
  });
}

async function currentOrderRaceQualification(clients, fixtures) {
  const { a, b, observer, pids } = clients;
  const results = [];

  {
    const fixture = fixtures.get("stale-order-shared");
    await createOrder(observer, fixture, orderEnvelope(fixture, "shared"));
    const order = await currentOrderForFixture(observer, fixture);
    const stocktake = await openStocktake(observer, fixture, "shared", "PACKING_SHELF");
    const before = await confirmationWriteState(observer, fixture, stocktake.id);
    const race = await runDeterministicRace({
      lockName: `juw:studio:piece:${fixture.sku}`,
      loser: b,
      loserAction: (client) => confirmFrozenStocktake(client, fixture, stocktake, "order-shared-loser"),
      loserPid: pids.b,
      observer,
      winner: a,
      winnerAction: (client) => updateOrderAuthority(client, order.id),
    });
    errorContains(race.loser, "STUDIO_STOCKTAKE_AUTHORITY_CONFLICT");
    assert.deepEqual(await orderState(observer, order.id), race.winner, "shared-advisory order writer was not the sole order mutation");
    assertConfirmationStateUnchanged(
      before,
      await confirmationWriteState(observer, fixture, stocktake.id),
      "shared-advisory current-order conflict",
    );
    results.push(rowRaceScenario(
      "stale-stocktake-current-order-shared-advisory",
      true,
      "SHARED_PIECE_ADVISORY_SERIALIZATION",
      "shop_orders",
    ));
  }

  {
    const fixture = fixtures.get("stale-order-direct");
    await createOrder(observer, fixture, orderEnvelope(fixture, "direct"));
    const order = await currentOrderForFixture(observer, fixture);
    const stocktake = await openStocktake(observer, fixture, "direct", "PACKING_SHELF");
    const before = await confirmationWriteState(observer, fixture, stocktake.id);
    const race = await runDeterministicRace({
      loser: b,
      loserAction: (client) => confirmFrozenStocktake(client, fixture, stocktake, "order-direct-loser"),
      loserPid: pids.b,
      observer,
      winner: a,
      winnerLock: (client) => client.query("select 1 from shop_orders where id = $1::uuid for update", [order.id]),
      winnerAction: (client) => updateOrderAuthority(client, order.id),
    });
    errorContains(race.loser, "STUDIO_STOCKTAKE_AUTHORITY_CONFLICT");
    assert.deepEqual(await orderState(observer, order.id), race.winner, "direct-row order writer was not the sole order mutation");
    assertConfirmationStateUnchanged(
      before,
      await confirmationWriteState(observer, fixture, stocktake.id),
      "direct-row current-order conflict",
    );
    results.push(rowRaceScenario(
      "stale-stocktake-current-order-direct-row",
      false,
      "ORDER_ROW_LOCK_AND_POST_WAIT_AUTHORITY_REVALIDATION",
      "shop_orders",
    ));
  }

  {
    const fixture = fixtures.get("stale-return-direct");
    await createOrder(observer, fixture, orderEnvelope(fixture, "return"));
    const order = await currentOrderForFixture(observer, fixture);
    const orderReturn = await insertQualificationReturn(observer, fixture, order);
    const stocktake = await openStocktake(observer, fixture, "return", "PACKING_SHELF");
    const before = await confirmationWriteState(observer, fixture, stocktake.id);
    const race = await runDeterministicRace({
      loser: b,
      loserAction: (client) => confirmFrozenStocktake(client, fixture, stocktake, "return-direct-loser"),
      loserPid: pids.b,
      observer,
      winner: a,
      winnerLock: (client) => client.query("select 1 from shop_orders where id = $1::uuid for update", [order.id]),
      winnerAction: (client) => updateReturnAuthority(client, orderReturn.id),
    });
    errorContains(race.loser, "STUDIO_STOCKTAKE_AUTHORITY_CONFLICT");
    assert.deepEqual(await returnState(observer, orderReturn.id), race.winner, "direct-row return writer was not the sole return mutation");
    assertConfirmationStateUnchanged(
      before,
      await confirmationWriteState(observer, fixture, stocktake.id),
      "direct-row return conflict",
    );
    results.push(rowRaceScenario(
      "stale-stocktake-current-return-direct-row",
      false,
      "ORDER_ROW_WAIT_THEN_RETURN_STATUS_REVALIDATION",
      "shop_order_returns",
    ));
  }

  return results;
}

async function repeatableReadQualification(clients, fixtures) {
  const { a: reader, b: writer, observer } = clients;
  const results = [];
  {
    const fixture = fixtures.get("read-create");
    await reader.query("begin isolation level repeatable read read only");
    try {
      const beforeHold = await queryOne(reader, `select count(*)::integer as count from studio_manual_holds where sku = $1`, [fixture.sku]);
      assert.equal(Number(beforeHold.count), 0);
      await transaction(writer, (client) => createHold(
        client,
        fixture,
        holdKey(fixture, "read"),
        new Date(Date.now() + 3_600_000).toISOString(),
      ));
      const oldInventory = await queryOne(reader, `select availability::text as availability, reserved from shop_inventory where sku = $1`, [fixture.sku]);
      assert.equal(oldInventory.availability, "AVAILABLE");
      assert.equal(Number(oldInventory.reserved), 0);
      await reader.query("commit");
    } catch (error) {
      await reader.query("rollback");
      throw error;
    }
    const current = await queryOne(observer, `
      select inventory.availability::text as availability, inventory.reserved,
        (select count(*) from studio_manual_holds hold where hold.sku = inventory.sku and hold.status = 'ACTIVE')::integer as active_holds
      from shop_inventory inventory where inventory.sku = $1
    `, [fixture.sku]);
    assert.equal(current.availability, "RESERVED");
    assert.equal(Number(current.reserved), 1);
    assert.equal(Number(current.active_holds), 1);
    results.push("repeatable-read-hold-create");
  }

  {
    const fixture = fixtures.get("read-release");
    const hold = await createHold(
      observer,
      fixture,
      holdKey(fixture, "read"),
      new Date(Date.now() + 3_600_000).toISOString(),
    );
    await reconcileReservedAtWardrobe(observer, fixture, "read");
    await reader.query("begin isolation level repeatable read read only");
    try {
      const oldHold = await queryOne(reader, "select status from studio_manual_holds where id = $1::uuid", [hold.id]);
      assert.equal(oldHold.status, "ACTIVE");
      await transaction(writer, (client) => releaseHold(client, fixture, hold.id));
      const oldInventory = await queryOne(reader, `select availability::text as availability, reserved from shop_inventory where sku = $1`, [fixture.sku]);
      assert.equal(oldInventory.availability, "RESERVED");
      assert.equal(Number(oldInventory.reserved), 1);
      await reader.query("commit");
    } catch (error) {
      await reader.query("rollback");
      throw error;
    }
    const current = await queryOne(observer, `
      select inventory.availability::text as availability, inventory.reserved, hold.status
      from shop_inventory inventory inner join studio_manual_holds hold on hold.sku = inventory.sku
      where hold.id = $1::uuid
    `, [hold.id]);
    assert.equal(current.status, "RELEASED");
    assert.equal(current.availability, "AVAILABLE");
    assert.equal(Number(current.reserved), 0);
    results.push("repeatable-read-hold-release");
  }
  return results;
}

async function verifyMigrationLedger(client, manifest) {
  const exists = await queryOne(client, "select to_regclass('drizzle.__drizzle_migrations')::text as table_name");
  invariant(exists.table_name, "Drizzle migration ledger is absent after release.");
  const result = await client.query(`
    select hash, created_at from drizzle.__drizzle_migrations order by created_at asc
  `);
  assert.equal(result.rows.length, manifest.migrations.length, "Remote migration ledger length differs from the committed journal.");
  result.rows.forEach((row, index) => {
    assert.equal(String(row.hash), manifest.migrations[index].hash, `Remote migration hash mismatch at index ${index}.`);
    assert.equal(Number(row.created_at), manifest.migrations[index].createdAt, `Remote migration timestamp mismatch at index ${index}.`);
  });
  const functions = await queryOne(client, `
    select
      to_regprocedure('studio_create_manual_hold_v2(text,text,text,text,text,text,timestamptz)') is not null as create_hold,
      to_regprocedure('studio_release_manual_hold_v2(text,uuid)') is not null as release_hold,
      to_regprocedure('studio_expire_manual_holds_v2(text)') is not null as expire_holds,
      to_regprocedure('studio_record_piece_move_v2(text,text,text,text,uuid,text,text,text,integer,text,text,text)') is not null as move_piece,
      to_regprocedure('studio_record_piece_confirmation_v2(text,text,text,text,text,uuid,text,integer,text,text,text,uuid,integer)') is not null as confirm_piece,
      to_regprocedure('shop_create_assisted_order_v4(text,text,text,text,text,text,jsonb,jsonb,jsonb,timestamptz,timestamptz)') is not null as assisted_order
  `);
  for (const [name, present] of Object.entries(functions)) assert.equal(present, true, `Required function ${name} is absent.`);
}

async function configureClients(pool) {
  const [a, b, observer] = await Promise.all([pool.connect(), pool.connect(), pool.connect()]);
  try {
    await a.query("set application_name = 'juw-qualification-a'");
    await b.query("set application_name = 'juw-qualification-b'");
    await observer.query("set application_name = 'juw-qualification-observer'");
    const [aPid, bPid, observerPid] = await Promise.all([
      queryOne(a, "select pg_backend_pid()::integer as pid"),
      queryOne(b, "select pg_backend_pid()::integer as pid"),
      queryOne(observer, "select pg_backend_pid()::integer as pid"),
    ]);
    const pids = { a: Number(aPid.pid), b: Number(bPid.pid), observer: Number(observerPid.pid) };
    assert.equal(new Set(Object.values(pids)).size, 3, "Qualification did not obtain three distinct database backends.");
    return { a, b, observer, pids };
  } catch (error) {
    a.release();
    b.release();
    observer.release();
    throw error;
  }
}

async function runLiveMatrix(pool, runId) {
  const clients = await configureClients(pool);
  try {
    const fixtures = await seedFixtures(clients.observer, runId);
    return [
      ...await holdQualification(clients, fixtures),
      ...await orderQualification(clients, fixtures),
      ...await locationQualification(clients, fixtures),
      ...await operationsAuthorityQualification(clients.observer, fixtures),
      ...await staleStocktakeQualification(clients.observer, fixtures),
      ...await currentOrderRaceQualification(clients, fixtures),
      ...await repeatableReadQualification(clients, fixtures),
    ];
  } finally {
    for (const client of [clients.a, clients.b, clients.observer]) {
      try {
        await client.query("rollback");
      } catch {
        // A client with no active transaction may reject ROLLBACK; release it regardless.
      }
      client.release();
    }
  }
}

async function writeReport(path, report) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

async function removeCredentialFile(path) {
  await rm(path, { force: true });
}

async function verifyCredentialFile(path) {
  const metadata = await lstat(path);
  invariant(metadata.isFile() && !metadata.isSymbolicLink(), "Qualification credential path must be a regular non-symlink file.");
  if (process.platform !== "win32") {
    invariant((metadata.mode & 0o077) === 0, "Qualification credential file permissions must be mode 0600 or stricter.");
  }
}

export async function executeQualification(env = process.env, dependencies = {}) {
  const configuration = parseQualificationEnvironment(env);
  const report = {
    branchDeletionRequired: configuration.phase === "apply-and-race",
    branchDisposition: configuration.phase === "legacy-block"
      ? "KEEP_UNTIL_EXPLICIT_LEGACY_RESOLUTION"
      : configuration.phase === "resolve-legacy"
        ? "KEEP_UNTIL_APPLY_AND_RACE"
        : "DELETE_AFTER_QUALIFICATION",
    branchId: configuration.branchId,
    committedSha: configuration.gitSha,
    finishedAt: null,
    manifest: null,
    projectId: configuration.projectId,
    phase: configuration.phase,
    runId: configuration.runId,
    scenarios: [],
    startedAt: new Date().toISOString(),
    status: "RUNNING",
  };
  const encodedPassword = new URL(configuration.databaseUrl).password;
  const secrets = [configuration.databaseUrl, encodedPassword, decodeURIComponent(encodedPassword)];
  let failure;
  let manifest;
  let pool;
  try {
    report.checkout = await (dependencies.verifyCheckout ?? assertQualificationCheckout)(configuration.gitSha);
    await (dependencies.verifyCredentialFile ?? verifyCredentialFile)(configuration.credentialPath);
    manifest = await loadQualificationManifest();
    assertQualificationManifestIdentity(configuration.expectedManifestIdentity, manifest);
    report.manifest = {
      catalogueChecksum: configuration.catalogueChecksum,
      catalogueRevision: SHOP_CATALOGUE_MANIFEST.revision,
      migrationCount: manifest.migrations.length,
      tail: manifest.tail,
    };
    const releaseCommand = dependencies.runReleaseCommand ?? runReleaseCommand;
    report.preflight = redactSensitive(
      releaseCommand(join(repositoryRoot, "scripts/shop-db/release.mjs"), ["check"], env),
      secrets,
    );
    const poolFactory = dependencies.poolFactory ?? ((databaseUrl) => new Pool({ connectionString: databaseUrl, max: 4 }));
    pool = poolFactory(configuration.databaseUrl);

    if (configuration.phase === "legacy-block") {
      const legacyClient = await pool.connect();
      try {
        const initialBoundary = await capturePreCutoverBoundary(legacyClient);
        assertPreCutoverBoundary(initialBoundary, manifest);
        const legacyStocktake = await seedLegacyOpenStocktake(legacyClient, configuration.runId);
        const beforeFailure = await capturePreCutoverBoundary(legacyClient);
        report.release = runExpectedLegacyBlockedRelease(releaseCommand, env, secrets);
        const afterFailure = await capturePreCutoverBoundary(legacyClient);
        assert.deepEqual(afterFailure, beforeFailure, "Failed 0018 apply advanced the ledger, schema, functions, or seed ledger.");
        assert.deepEqual(
          await readLegacyStocktake(legacyClient, legacyStocktake.id),
          legacyStocktake,
          "Failed 0018 apply mutated the unresolved legacy stocktake.",
        );
        report.legacyCutover = {
          preCutoverBoundary: beforeFailure,
          resolutionRequired: true,
          stocktakeId: legacyStocktake.id,
          stocktakeOperator: legacyStocktake.operator_subject,
        };
      } finally {
        legacyClient.release();
      }
      report.postflight = redactSensitive(
        releaseCommand(join(repositoryRoot, "scripts/shop-db/release.mjs"), ["check"], env),
        secrets,
      );
      report.scenarios = [{
        name: "legacy-open-stocktake-blocks-0018-transactionally",
        noAutomaticResolution: true,
        resolutionRequired: true,
      }];
      report.status = "RESOLUTION_REQUIRED";
    } else if (configuration.phase === "resolve-legacy") {
      const resolutionClient = await pool.connect();
      try {
        const beforeResolution = await capturePreCutoverBoundary(resolutionClient);
        assertPreCutoverBoundary(beforeResolution, manifest);
        report.legacyResolution = await resolveLegacyStocktake(resolutionClient, configuration);
        const afterResolution = await capturePreCutoverBoundary(resolutionClient);
        assert.deepEqual(
          afterResolution,
          beforeResolution,
          "Explicit legacy resolution advanced the migration ledger, schema, functions, or seed ledger.",
        );
      } finally {
        resolutionClient.release();
      }
      report.postflight = redactSensitive(
        releaseCommand(join(repositoryRoot, "scripts/shop-db/release.mjs"), ["check"], env),
        secrets,
      );
      report.scenarios = [{
        exactExpectedPiecesPreserved: true,
        name: "legacy-open-stocktake-explicit-resolution",
        resolutionReference: report.legacyResolution.resolutionReference,
        rowPreservedForAudit: true,
      }];
      report.status = "RESOLUTION_RECORDED";
    } else {
      const preCutoverClient = await pool.connect();
      try {
        const preCutoverBoundary = await capturePreCutoverBoundary(preCutoverClient);
        assertPreCutoverBoundary(preCutoverBoundary, manifest);
        report.legacyResolution = await verifyExplicitLegacyResolution(preCutoverClient, configuration);
        report.catalogueTargetNormalization = await normalizeDisposableCloneCatalogueLedger(
          preCutoverClient,
          configuration,
          manifest,
        );
      } finally {
        preCutoverClient.release();
      }

      report.release = redactSensitive(
        releaseCommand(join(repositoryRoot, "scripts/shop-db/shop-release.mjs"), [], env),
        secrets,
      );
      report.postflight = redactSensitive(
        releaseCommand(join(repositoryRoot, "scripts/shop-db/release.mjs"), ["check"], env),
        secrets,
      );
      const verificationClient = await pool.connect();
      try {
        await verifyMigrationLedger(verificationClient, manifest);
      } finally {
        verificationClient.release();
      }
      report.scenarios = await (dependencies.runLiveMatrix ?? runLiveMatrix)(pool, configuration.runId);
      report.status = "PASS";
    }
  } catch (error) {
    report.status = "FAIL";
    report.error = redactSensitive(error, secrets);
    failure = error;
  } finally {
    report.finishedAt = new Date().toISOString();
    if (pool) {
      try {
        await pool.end();
      } catch (error) {
        report.poolCleanupError = redactSensitive(error, secrets);
        report.status = "FAIL";
      }
    }
    const cleanup = dependencies.removeCredentialFile ?? removeCredentialFile;
    try {
      await cleanup(configuration.credentialPath);
      report.credentialFileRemoved = true;
    } catch (error) {
      report.credentialFileRemoved = false;
      report.credentialCleanupError = redactSensitive(error, secrets);
      report.status = "FAIL";
    }
    const output = dependencies.writeReport ?? writeReport;
    try {
      await output(configuration.resultPath, report);
    } catch (error) {
      report.reportWriteError = redactSensitive(error, secrets);
      report.status = "FAIL";
    }
  }
  if (!["PASS", "RESOLUTION_RECORDED", "RESOLUTION_REQUIRED"].includes(report.status)) {
    const message = report.error ?? report.credentialCleanupError ?? report.poolCleanupError
      ?? report.reportWriteError ?? "Transactional-authority qualification cleanup failed.";
    throw Object.assign(new Error(message, failure ? { cause: failure } : undefined), { qualificationReport: report });
  }
  return report;
}

async function main() {
  try {
    const report = await executeQualification(process.env);
    if (report.status === "RESOLUTION_REQUIRED") {
      console.log(
        `Transactional-authority legacy block passed. Keep disposable branch ${report.branchId}; run resolve-legacy for stocktake ${report.legacyCutover.stocktakeId}.`,
      );
    } else if (report.status === "RESOLUTION_RECORDED") {
      console.log(
        `Transactional-authority legacy resolution recorded. Keep disposable branch ${report.branchId}; run apply-and-race with stocktake ${report.legacyResolution.id} and resolution reference ${report.legacyResolution.resolutionReference}.`,
      );
    } else {
      console.log(`Transactional-authority qualification PASS: ${report.scenarios.length} scenarios. Delete Neon branch ${report.branchId} and verify deletion.`);
    }
  } catch (error) {
    const report = error?.qualificationReport;
    console.error(`Transactional-authority qualification failed: ${report?.error ?? redactSensitive(error)}`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) await main();
