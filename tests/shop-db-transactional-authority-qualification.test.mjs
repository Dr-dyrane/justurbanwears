import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { SHOP_CATALOGUE_MANIFEST } from "../scripts/shop-db/catalogue-manifest.mjs";
import { manifestChecksum } from "../scripts/shop-db/release-core.mjs";
import {
  CANONICAL_NEON_PARENT_BRANCH_ID,
  CANONICAL_NEON_PROJECT_ID,
  CONFIRMATION_NO_WRITE_TABLES,
  FROZEN_QUALIFICATION_CHAIN,
  FROZEN_QUALIFICATION_JOURNAL_SHA256,
  FROZEN_TRANSACTIONAL_AUTHORITY_MIGRATION_SHA256,
  FROZEN_TRANSACTIONAL_AUTHORITY_SNAPSHOT_SHA256,
  LEGACY_RESOLUTION_REFERENCE_PREFIX,
  QUALIFICATION_CONFIRMATION,
  assertConfirmationStateUnchanged,
  assertQualificationManifestIdentity,
  deterministicLegacyResolutionReference,
  executeQualification,
  legacyQualificationStocktakeBinding,
  loadQualificationManifest,
  oneMicrosecondEarlier,
  parseQualificationEnvironment,
  redactSensitive,
  resolveAuditResultPath,
  resolveCredentialCleanupPath,
  resolveLegacyStocktake,
  runDeterministicRace,
  verifyExplicitLegacyResolution,
  waitForBackendLock,
} from "../scripts/shop-db/qualify-transactional-authority.mjs";

const repositoryRoot = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const frozenManifest = await loadQualificationManifest(repositoryRoot);

function environment(overrides = {}) {
  return {
    DATABASE_URL_UNPOOLED: "postgresql://qualification:secret@ep-qualification.neon.tech/neondb?sslmode=require",
    JUW_DB_QUALIFICATION_BRANCH_ID: "br-disposable-qualification",
    JUW_DB_QUALIFICATION_CONFIRM: QUALIFICATION_CONFIRMATION,
    JUW_DB_QUALIFICATION_ENV_FILE: join(tmpdir(), "juw-qualification.env"),
    JUW_DB_QUALIFICATION_JOURNAL_SHA256: frozenManifest.tail.journal,
    JUW_DB_QUALIFICATION_MIGRATION_0018_SHA256: frozenManifest.tail.migration18,
    JUW_DB_QUALIFICATION_MIGRATION_0019_SHA256: frozenManifest.tail.migration19,
    JUW_DB_QUALIFICATION_MIGRATION_0020_SHA256: frozenManifest.tail.migration20,
    JUW_DB_QUALIFICATION_PARENT_BRANCH_ID: CANONICAL_NEON_PARENT_BRANCH_ID,
    JUW_DB_QUALIFICATION_PHASE: "apply-and-race",
    JUW_DB_QUALIFICATION_PRODUCTION_HOST: "ep-production.neon.tech",
    JUW_DB_QUALIFICATION_PROJECT_ID: CANONICAL_NEON_PROJECT_ID,
    JUW_DB_QUALIFICATION_RUN_ID: "release-abcdef12",
    JUW_DB_QUALIFICATION_LEGACY_RESOLUTION_REFERENCE: `${LEGACY_RESOLUTION_REFERENCE_PREFIX}:${"a".repeat(64)}`,
    JUW_DB_QUALIFICATION_LEGACY_STOCKTAKE_ID: "123e4567-e89b-42d3-a456-426614174000",
    JUW_DB_QUALIFICATION_SNAPSHOT_0018_SHA256: frozenManifest.tail.snapshot18,
    JUW_DB_QUALIFICATION_SNAPSHOT_0019_SHA256: frozenManifest.tail.snapshot19,
    JUW_DB_QUALIFICATION_SNAPSHOT_0020_SHA256: frozenManifest.tail.snapshot20,
    SHOP_DB_EXPECTED_DATABASE: "neondb",
    SHOP_DB_EXPECTED_HOST: "ep-qualification.neon.tech",
    SHOP_DB_EXPECTED_MANIFEST_CHECKSUM: manifestChecksum(SHOP_CATALOGUE_MANIFEST),
    SHOP_DB_GIT_SHA: "a".repeat(40),
    SHOP_DB_TARGET: "preview",
    ...overrides,
  };
}

const LEGACY_STOCKTAKE_ID = "223e4567-e89b-42d3-a456-426614174000";
const LEGACY_STARTED_AT = "2026-08-27T12:34:56.123456Z";
const LEGACY_RESOLVED_AT = "2026-08-27T12:35:01.654321Z";

function resolveLegacyEnvironment(overrides = {}) {
  return environment({
    JUW_DB_QUALIFICATION_LEGACY_RESOLUTION_REFERENCE: "",
    JUW_DB_QUALIFICATION_LEGACY_STOCKTAKE_ID: LEGACY_STOCKTAKE_ID,
    JUW_DB_QUALIFICATION_PHASE: "resolve-legacy",
    ...overrides,
  });
}

function exactLegacyOpenState(runId = "release-abcdef12") {
  const binding = legacyQualificationStocktakeBinding(runId);
  return {
    closed_at: null,
    expected_pieces: structuredClone(binding.expectedPieces),
    id: LEGACY_STOCKTAKE_ID,
    idempotency_key: binding.idempotencyKey,
    location_key: binding.locationKey,
    location_label: binding.locationLabel,
    operator_subject: binding.operatorSubject,
    started_at: LEGACY_STARTED_AT,
    state: "OPEN",
    updated_at: LEGACY_STARTED_AT,
    version: 1,
  };
}

function exactLegacyClosedState(openState = exactLegacyOpenState()) {
  return {
    ...structuredClone(openState),
    closed_at: LEGACY_RESOLVED_AT,
    state: "CLOSED",
    updated_at: LEGACY_RESOLVED_AT,
    version: 2,
  };
}

function legacyResolverClient(options = {}) {
  const trace = [];
  const targetRows = Object.hasOwn(options, "targetRows")
    ? options.targetRows
    : [{ state: exactLegacyOpenState() }];
  const defaultAfter = exactLegacyClosedState(targetRows[0]?.state ?? exactLegacyOpenState());
  const updateRows = Object.hasOwn(options, "updateRows")
    ? options.updateRows
    : [{ state: defaultAfter }];
  const collisionRows = options.collisionRows ?? [];
  const client = {
    async query(text, values = []) {
      trace.push({ text, values: structuredClone(values) });
      if (text.includes("where stocktake.id <> $1::uuid")) return { rows: structuredClone(collisionRows) };
      if (text.includes("where stocktake.id = $1::uuid") && text.includes("for update")) {
        return { rows: structuredClone(targetRows) };
      }
      if (text.includes("update studio_stocktakes as stocktake")) return { rows: structuredClone(updateRows) };
      if (text.includes("where stocktake.id = $1::uuid")) {
        return { rows: structuredClone(options.readRows ?? [{ state: defaultAfter }]) };
      }
      return { rows: [] };
    },
    release() {},
  };
  return { client, trace };
}

test("qualification environment requires an exact disposable preview target", () => {
  const parsed = parseQualificationEnvironment(environment());
  assert.equal(parsed.projectId, CANONICAL_NEON_PROJECT_ID);
  assert.equal(parsed.parentBranchId, CANONICAL_NEON_PARENT_BRANCH_ID);
  assert.equal(parsed.branchId, "br-disposable-qualification");
  assert.equal(parsed.host, "ep-qualification.neon.tech");

  assert.throws(
    () => parseQualificationEnvironment(environment({ SHOP_DB_TARGET: "production" })),
    /only.*preview/i,
  );
  assert.throws(
    () => parseQualificationEnvironment(environment({ JUW_DB_QUALIFICATION_CONFIRM: "" })),
    /requires JUW_DB_QUALIFICATION_CONFIRM/,
  );
  assert.throws(
    () => parseQualificationEnvironment(environment({ JUW_DB_QUALIFICATION_BRANCH_ID: CANONICAL_NEON_PARENT_BRANCH_ID })),
    /cannot run on the production branch/,
  );
  assert.throws(
    () => parseQualificationEnvironment(environment({
      JUW_DB_QUALIFICATION_PRODUCTION_HOST: "ep-qualification.neon.tech",
    })),
    /production host/,
  );
  assert.throws(
    () => parseQualificationEnvironment(environment({
      DATABASE_URL_UNPOOLED: "postgresql://qualification:secret@ep-qualification-pooler.neon.tech/neondb",
      SHOP_DB_EXPECTED_HOST: "ep-qualification-pooler.neon.tech",
    })),
    /pooled endpoint/i,
  );
  assert.throws(
    () => parseQualificationEnvironment(environment({ VERCEL_ENV: "production" })),
    /VERCEL_ENV=production/,
  );
  assert.throws(
    () => parseQualificationEnvironment(environment({ JUW_DB_QUALIFICATION_PHASE: "" })),
    /must be legacy-block, resolve-legacy, or apply-and-race/,
  );
  assert.throws(
    () => parseQualificationEnvironment(environment({ JUW_DB_QUALIFICATION_LEGACY_STOCKTAKE_ID: "" })),
    /exact legacy stocktake UUID/,
  );
  const legacyBlock = parseQualificationEnvironment(environment({
    JUW_DB_QUALIFICATION_LEGACY_RESOLUTION_REFERENCE: "",
    JUW_DB_QUALIFICATION_LEGACY_STOCKTAKE_ID: "",
    JUW_DB_QUALIFICATION_PHASE: "legacy-block",
  }));
  assert.equal(legacyBlock.phase, "legacy-block");

  const resolver = parseQualificationEnvironment(resolveLegacyEnvironment());
  assert.equal(resolver.phase, "resolve-legacy");
  assert.equal(resolver.legacyStocktakeId, LEGACY_STOCKTAKE_ID);
  assert.equal(resolver.legacyResolutionReference, null);
  assert.throws(
    () => parseQualificationEnvironment(resolveLegacyEnvironment({ JUW_DB_QUALIFICATION_LEGACY_STOCKTAKE_ID: "" })),
    /exact legacy stocktake UUID/,
  );
  assert.throws(
    () => parseQualificationEnvironment(resolveLegacyEnvironment({
      JUW_DB_QUALIFICATION_LEGACY_RESOLUTION_REFERENCE: `${LEGACY_RESOLUTION_REFERENCE_PREFIX}:${"b".repeat(64)}`,
    })),
    /computes its own deterministic resolution reference/,
  );
  assert.throws(
    () => parseQualificationEnvironment(environment({
      JUW_DB_QUALIFICATION_LEGACY_RESOLUTION_REFERENCE: "ops:qualification-resolution-001",
    })),
    /exact deterministic legacy resolution reference/,
  );
});

test("result and credential paths are tightly scoped", () => {
  assert.match(resolveAuditResultPath(environment(), repositoryRoot), /storage[\\/]runtime-audit/);
  assert.throws(
    () => resolveAuditResultPath(environment({ JUW_DB_QUALIFICATION_RESULT_PATH: join(tmpdir(), "outside.json") }), repositoryRoot),
    /must stay under/,
  );
  assert.match(resolveCredentialCleanupPath(environment(), repositoryRoot), /juw-qualification\.env$/);
  assert.throws(
    () => resolveCredentialCleanupPath(environment({ JUW_DB_QUALIFICATION_ENV_FILE: "relative.env" }), repositoryRoot),
    /exact absolute path/,
  );
  assert.throws(
    () => resolveCredentialCleanupPath(environment({
      JUW_DB_QUALIFICATION_ENV_FILE: join(repositoryRoot, "juw-dangerous.env"),
    }), repositoryRoot),
    /must stay in the OS temp directory/,
  );
});

test("migration identity is derived from the frozen journal and snapshot chain", async () => {
  const manifest = frozenManifest;
  const tail = manifest.migrations.slice(-3);
  assert.deepEqual(tail.map((migration) => migration.tag), [
    "0018_studio_transactional_authority",
    "0019_studio_atelier_external_authority",
    "0020_studio_atelier_shop_adoption_receipts",
  ]);
  for (const migration of tail) {
    assert.match(migration.hash, /^[0-9a-f]{64}$/);
    assert.ok(migration.statementCount > 0);
  }
  assert.match(manifest.tail.snapshot18Id, /^[0-9a-f-]{36}$/);
  assert.match(manifest.tail.snapshot19Id, /^[0-9a-f-]{36}$/);
  assert.match(manifest.tail.snapshot20Id, /^[0-9a-f-]{36}$/);
  assert.equal(manifest.tail.journal, FROZEN_QUALIFICATION_JOURNAL_SHA256);
  assert.equal(manifest.tail.migration18, FROZEN_TRANSACTIONAL_AUTHORITY_MIGRATION_SHA256);
  assert.equal(manifest.tail.snapshot18, FROZEN_TRANSACTIONAL_AUTHORITY_SNAPSHOT_SHA256);
  for (const [index, frozen] of FROZEN_QUALIFICATION_CHAIN.entries()) {
    const suffix = 18 + index;
    assert.equal(manifest.tail[`migration${suffix}`], frozen.migrationSha256);
    assert.equal(manifest.tail[`snapshot${suffix}`], frozen.snapshotSha256);
    assert.equal(manifest.tail[`snapshot${suffix}Id`], frozen.snapshotId);
  }
  assert.doesNotThrow(() => assertQualificationManifestIdentity(manifest.tail, manifest));
  assert.throws(
    () => assertQualificationManifestIdentity({ ...manifest.tail, migration20: "f".repeat(64) }, manifest),
    /identity mismatch for migration20/,
  );
});

test("live matrix binds opaque six-microsecond authority and frozen function arities", async () => {
  const source = await readFile(join(repositoryRoot, "scripts/shop-db/qualify-transactional-authority.mjs"), "utf8");
  assert.equal(
    oneMicrosecondEarlier("2026-08-27T12:34:56.789123Z"),
    "2026-08-27T12:34:56.789122Z",
  );
  assert.throws(() => oneMicrosecondEarlier("2026-08-27T12:34:56.000000Z"), /positive microsecond/);
  assert.match(source, /YYYY-MM-DD"T"HH24:MI:SS\.US"Z"/);
  assert.match(source, /expectedAuthorityRevision/);
  assert.match(source, /studio_record_piece_move_v2\(text,text,text,text,uuid,text,text,text,integer,text,text,text\)/);
  assert.match(source, /studio_record_piece_confirmation_v2\(text,text,text,text,text,uuid,text,integer,text,text,text,uuid,integer\)/);
  assert.match(source, /location-move-vs-delayed-manual-hold/);
  assert.match(source, /location-confirm-vs-delayed-fulfillment/);
  assert.match(source, /operations-six-microsecond-authority-and-exact-replay/);
  assert.match(source, /operations-one-microsecond-stale-no-write/);
});

test("sensitive errors are redacted before reporting", () => {
  const url = "postgresql://qualification:secret@ep-qualification.neon.tech/neondb";
  const redacted = redactSensitive(new Error(`failed ${url} password secret`), [url, "secret"]);
  assert.doesNotMatch(redacted, /qualification:secret|password secret/);
  assert.match(redacted, /\[redacted/);
});

test("lock wait uses observed backend state rather than a timing-only race", async () => {
  const seen = [];
  const observer = {
    async query(_text, values) {
      seen.push(values[0]);
      return seen.length < 3
        ? { rows: [{ state: "active", wait_event_type: null, wait_event: null }] }
        : { rows: [{ state: "active", wait_event_type: "Lock", wait_event: "advisory" }] };
    },
  };
  const state = await waitForBackendLock(observer, 42, { attempts: 3, sleep: async () => {} });
  assert.equal(state.wait_event_type, "Lock");
  assert.deepEqual(seen, [42, 42, 42]);
});

test("deterministic race releases the winner lock before awaiting the loser", async () => {
  const trace = [];
  let releaseLoser;
  const loserGate = new Promise((resolvePromise) => { releaseLoser = resolvePromise; });
  const winner = {
    async query(text) {
      trace.push(`winner:${text.split(" ")[0]}`);
      if (text === "commit") releaseLoser();
      return { rows: [] };
    },
  };
  const loser = {
    async query(text) {
      trace.push(`loser:${text.split(" ")[0]}`);
      return { rows: [] };
    },
  };
  const outcome = await runDeterministicRace({
    lockName: "qualification-lock",
    loser,
    loserAction: async () => {
      trace.push("loser:action");
      await loserGate;
      return "loser";
    },
    loserPid: 22,
    observer: {},
    waitForLock: async () => {
      trace.push("observer:blocked");
      return { wait_event_type: "Lock" };
    },
    winner,
    winnerAction: async () => {
      trace.push("winner:action");
      return "winner";
    },
  });
  assert.equal(outcome.winner, "winner");
  assert.deepEqual(outcome.loser, { status: "fulfilled", value: "loser" });
  assert.ok(trace.indexOf("observer:blocked") < trace.indexOf("winner:action"));
  assert.ok(trace.indexOf("winner:commit") < trace.lastIndexOf("loser:commit"));
});

test("deterministic race can prove a direct row-lock barrier without claiming shared advisory serialization", async () => {
  const trace = [];
  let releaseLoser;
  const loserGate = new Promise((resolvePromise) => { releaseLoser = resolvePromise; });
  const winner = {
    async query(text) {
      trace.push(`winner:${text}`);
      if (text === "commit") releaseLoser();
      return { rows: [] };
    },
  };
  const loser = {
    async query(text) {
      trace.push(`loser:${text}`);
      return { rows: [] };
    },
  };
  const outcome = await runDeterministicRace({
    loser,
    loserAction: async () => {
      await loserGate;
      throw new Error("STUDIO_STOCKTAKE_AUTHORITY_CONFLICT");
    },
    loserPid: 23,
    observer: {},
    waitForLock: async () => ({ wait_event: "transactionid", wait_event_type: "Lock" }),
    winner,
    winnerAction: async () => "row-updated",
    winnerLock: async (client) => {
      trace.push("proof:direct-row-lock");
      await client.query("select 1 from shop_orders where id = $1 for update", ["order-id"]);
    },
  });
  assert.equal(outcome.winner, "row-updated");
  assert.equal(outcome.loser.status, "rejected");
  assert.match(outcome.loser.error.message, /STUDIO_STOCKTAKE_AUTHORITY_CONFLICT/);
  assert.ok(trace.includes("proof:direct-row-lock"));
  assert.equal(trace.some((entry) => entry.includes("pg_advisory_xact_lock")), false);
});

test("conflict no-write assertion covers every confirmation-owned table", () => {
  assert.deepEqual(CONFIRMATION_NO_WRITE_TABLES, [
    "shop_inventory",
    "studio_piece_custody",
    "studio_piece_custody_commands",
    "studio_physical_observations",
    "studio_stocktakes",
  ]);
  const baseline = {
    commands: [],
    custody: { version: 2 },
    inventory: { availability: "RESERVED" },
    observations: [],
    stocktake: { state: "OPEN", version: 1 },
  };
  assert.doesNotThrow(() => assertConfirmationStateUnchanged(baseline, structuredClone(baseline), "offline"));
  for (const field of Object.keys(baseline)) {
    const changed = structuredClone(baseline);
    changed[field] = { qualificationMutation: field };
    assert.throws(
      () => assertConfirmationStateUnchanged(baseline, changed, "offline"),
      /confirmation changed/,
      `expected ${field} mutation to fail the no-write assertion`,
    );
  }
});

test("legacy-block phase proves release rollback and never resolves the OPEN count itself", async () => {
  const migration18Index = frozenManifest.migrations.findIndex((migration) => (
    migration.tag === "0018_studio_transactional_authority"
  ));
  const ledger = frozenManifest.migrations.slice(0, migration18Index).map((migration) => ({
    created_at: migration.createdAt,
    hash: migration.hash,
  }));
  const legacyState = exactLegacyOpenState();
  const queryTrace = [];
  const client = {
    async query(text) {
      queryTrace.push(text);
      if (text.includes('"drizzle"."__drizzle_migrations"')) return { rows: ledger };
      if (text.includes("insert into studio_stocktakes")) return { rows: [{ state: structuredClone(legacyState) }] };
      if (text.includes("from studio_stocktakes as stocktake") && text.includes("where stocktake.id = $1::uuid")) {
        return { rows: [{ state: structuredClone(legacyState) }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const pool = {
    async connect() { return client; },
    async end() {},
  };
  let report;
  const legacyEnv = environment({
    JUW_DB_QUALIFICATION_LEGACY_RESOLUTION_REFERENCE: "",
    JUW_DB_QUALIFICATION_LEGACY_STOCKTAKE_ID: "",
    JUW_DB_QUALIFICATION_PHASE: "legacy-block",
    JUW_DB_QUALIFICATION_RESULT_PATH: join(repositoryRoot, "storage/runtime-audit", `legacy-offline-${Date.now()}.json`),
  });
  const result = await executeQualification(legacyEnv, {
    poolFactory: () => pool,
    removeCredentialFile: async () => {},
    runReleaseCommand: (script) => {
      if (script.endsWith("shop-release.mjs")) {
        const error = new Error("release rejected");
        error.stderr = "STUDIO_LEGACY_OPEN_STOCKTAKE_AUTHORITY_REQUIRED";
        throw error;
      }
      return "offline prefix check";
    },
    verifyCredentialFile: async () => {},
    writeReport: async (_path, value) => { report = structuredClone(value); },
  });
  assert.equal(result.status, "RESOLUTION_REQUIRED");
  assert.equal(report.legacyCutover.stocktakeId, legacyState.id);
  assert.equal(report.legacyCutover.resolutionRequired, true);
  assert.equal(queryTrace.filter((text) => text.includes("update studio_stocktakes")).length, 0);
  assert.equal(queryTrace.filter((text) => text.includes("delete from studio_stocktakes")).length, 0);
});

test("qualification-only resolver locks and closes exactly one frozen legacy row", async () => {
  const configuration = parseQualificationEnvironment(resolveLegacyEnvironment());
  const before = exactLegacyOpenState();
  const after = exactLegacyClosedState(before);
  const { client, trace } = legacyResolverClient({
    targetRows: [{ state: before }],
    updateRows: [{ state: after }],
  });

  const result = await resolveLegacyStocktake(client, configuration);
  assert.deepEqual(result, {
    closedAt: LEGACY_RESOLVED_AT,
    id: LEGACY_STOCKTAKE_ID,
    resolutionReference: deterministicLegacyResolutionReference(configuration, after),
    version: 2,
  });
  assert.match(result.resolutionReference, new RegExp(`^${LEGACY_RESOLUTION_REFERENCE_PREFIX}:[0-9a-f]{64}$`));

  const sqlTrace = trace.map(({ text }) => text);
  const beginIndex = sqlTrace.findIndex((text) => text === "begin isolation level serializable");
  const advisoryIndex = sqlTrace.findIndex((text) => text.includes("pg_advisory_xact_lock"));
  const rowLockIndex = sqlTrace.findIndex((text) => text.includes("where stocktake.id = $1::uuid") && text.includes("for update"));
  const collisionIndex = sqlTrace.findIndex((text) => text.includes("where stocktake.id <> $1::uuid"));
  const updateIndex = sqlTrace.findIndex((text) => text.includes("update studio_stocktakes as stocktake"));
  const commitIndex = sqlTrace.findIndex((text) => text === "commit");
  assert.ok(beginIndex >= 0 && beginIndex < advisoryIndex);
  assert.ok(advisoryIndex < rowLockIndex && rowLockIndex < collisionIndex);
  assert.ok(collisionIndex < updateIndex && updateIndex < commitIndex);
  assert.deepEqual(trace[advisoryIndex].values, [LEGACY_STOCKTAKE_ID]);
  assert.deepEqual(trace[rowLockIndex].values, [LEGACY_STOCKTAKE_ID]);

  const updateSql = sqlTrace[updateIndex];
  const setClause = updateSql.match(/\bset\b([\s\S]*?)\bfrom resolution_clock\b/i)?.[1] ?? "";
  const assignedColumns = [...setClause.matchAll(/^\s*([a-z_]+)\s*=/gim)].map((match) => match[1]);
  assert.deepEqual(assignedColumns, ["state", "closed_at", "updated_at", "version"]);
  assert.match(updateSql, /stocktake\.id = \$1::uuid/);
  assert.match(updateSql, /stocktake\.expected_pieces = \$6::jsonb/);
  const mutations = sqlTrace.filter((text) => /\b(?:insert\s+into|update\s+studio_stocktakes|delete\s+from|alter\s+|create\s+|drop\s+)\b/i.test(text));
  assert.deepEqual(mutations, [updateSql]);
});

test("legacy resolution reference is stable under key order and sensitive to every binding axis", () => {
  const configuration = parseQualificationEnvironment(resolveLegacyEnvironment());
  const stocktake = exactLegacyClosedState();
  const reference = deterministicLegacyResolutionReference(configuration, stocktake);
  const reordered = Object.fromEntries(Object.entries(stocktake).reverse());
  reordered.expected_pieces = stocktake.expected_pieces.map((piece) => Object.fromEntries(Object.entries(piece).reverse()));
  assert.equal(deterministicLegacyResolutionReference(configuration, reordered), reference);

  const changedConfigurations = [
    { ...configuration, branchId: "br-different-qualification" },
    { ...configuration, gitSha: "b".repeat(40) },
    { ...configuration, parentBranchId: "br-different-parent" },
    { ...configuration, projectId: "different-project" },
    { ...configuration, runId: "release-different1" },
  ];
  for (const changed of changedConfigurations) {
    assert.notEqual(deterministicLegacyResolutionReference(changed, stocktake), reference);
  }

  const rowMutations = [
    { closed_at: "2026-08-27T12:35:01.654322Z" },
    { id: "323e4567-e89b-42d3-a456-426614174000" },
    { idempotency_key: "legacy-different" },
    { location_key: "PACKING_SHELF" },
    { location_label: "Packing shelf" },
    { operator_subject: "qualification:other:legacy-open" },
    { started_at: "2026-08-27T12:34:56.123457Z" },
    { state: "OPEN" },
    { updated_at: "2026-08-27T12:35:01.654322Z" },
    { version: 3 },
    { expected_pieces: [{ ...stocktake.expected_pieces[0], title: "Changed" }] },
  ];
  for (const mutation of rowMutations) {
    assert.notEqual(deterministicLegacyResolutionReference(configuration, { ...stocktake, ...mutation }), reference);
  }
});

test("qualification-only resolver rolls back every identity, state, collision, and CAS mismatch", async (context) => {
  const configuration = parseQualificationEnvironment(resolveLegacyEnvironment());
  const open = exactLegacyOpenState();
  const closed = exactLegacyClosedState(open);
  const mutate = (change) => [{ state: { ...structuredClone(open), ...change } }];
  const cases = [
    { name: "missing exact UUID", options: { targetRows: [] } },
    { name: "different returned UUID", options: { targetRows: mutate({ id: "323e4567-e89b-42d3-a456-426614174000" }) } },
    { name: "wrong operator", options: { targetRows: mutate({ operator_subject: "qualification:other:legacy-open" }) } },
    { name: "wrong idempotency key", options: { targetRows: mutate({ idempotency_key: "legacy-other" }) } },
    { name: "wrong location key", options: { targetRows: mutate({ location_key: "PACKING_SHELF" }) } },
    { name: "wrong location label", options: { targetRows: mutate({ location_label: "Packing shelf" }) } },
    { name: "not OPEN", options: { targetRows: mutate({ state: "CLOSED" }) } },
    { name: "non-null closed_at", options: { targetRows: mutate({ closed_at: LEGACY_RESOLVED_AT }) } },
    { name: "not version 1", options: { targetRows: mutate({ version: 2 }) } },
    {
      name: "changed expected JSON",
      options: { targetRows: mutate({ expected_pieces: [{ ...open.expected_pieces[0], title: "Changed" }] }) },
    },
    {
      name: "unrelated operator or key collision",
      options: { collisionRows: [{ id: "423e4567-e89b-42d3-a456-426614174000" }] },
    },
    { name: "zero-row CAS", options: { updateRows: [] }, reachesUpdate: true },
    { name: "multi-row CAS", options: { updateRows: [{ state: closed }, { state: closed }] }, reachesUpdate: true },
    {
      name: "post-update immutable field changed",
      options: { updateRows: [{ state: { ...closed, started_at: "2026-08-27T12:34:56.123457Z" } }] },
      reachesUpdate: true,
    },
  ];

  for (const mismatch of cases) {
    await context.test(mismatch.name, async () => {
      const { client, trace } = legacyResolverClient(mismatch.options);
      await assert.rejects(resolveLegacyStocktake(client, configuration));
      const sqlTrace = trace.map(({ text }) => text);
      assert.ok(sqlTrace.includes("rollback"));
      assert.equal(sqlTrace.includes("commit"), false);
      assert.equal(
        sqlTrace.some((text) => text.includes("update studio_stocktakes as stocktake")),
        mismatch.reachesUpdate === true,
      );
    });
  }
});

test("apply-and-race binds the exact deterministic reference to the preserved CLOSED row", async () => {
  const resolverConfiguration = parseQualificationEnvironment(resolveLegacyEnvironment());
  const closed = exactLegacyClosedState();
  const reference = deterministicLegacyResolutionReference(resolverConfiguration, closed);
  const applyConfiguration = parseQualificationEnvironment(environment({
    JUW_DB_QUALIFICATION_LEGACY_RESOLUTION_REFERENCE: reference,
    JUW_DB_QUALIFICATION_LEGACY_STOCKTAKE_ID: LEGACY_STOCKTAKE_ID,
  }));
  const { client } = legacyResolverClient({ readRows: [{ state: closed }] });
  const verified = await verifyExplicitLegacyResolution(client, applyConfiguration);
  assert.equal(verified.resolutionReference, reference);
  assert.equal(verified.version, 2);

  const wrongReferenceClient = legacyResolverClient({ readRows: [{ state: closed }] }).client;
  await assert.rejects(
    verifyExplicitLegacyResolution(wrongReferenceClient, {
      ...applyConfiguration,
      legacyResolutionReference: `${LEGACY_RESOLUTION_REFERENCE_PREFIX}:${"b".repeat(64)}`,
    }),
    /does not bind the exact preserved CLOSED stocktake/,
  );

  const changedRowClient = legacyResolverClient({
    readRows: [{ state: {
      ...closed,
      expected_pieces: [{ ...closed.expected_pieces[0], title: "Changed after resolution" }],
    } }],
  }).client;
  await assert.rejects(
    verifyExplicitLegacyResolution(changedRowClient, applyConfiguration),
    /expected pieces differ/,
  );
});

test("resolve-legacy persists its deterministic reference without applying migrations", async () => {
  const migration18Index = frozenManifest.migrations.findIndex((migration) => (
    migration.tag === "0018_studio_transactional_authority"
  ));
  const ledger = frozenManifest.migrations.slice(0, migration18Index).map((migration) => ({
    created_at: migration.createdAt,
    hash: migration.hash,
  }));
  const fake = legacyResolverClient();
  const originalQuery = fake.client.query.bind(fake.client);
  fake.client.query = async (text, values = []) => {
    if (text.includes('"drizzle"."__drizzle_migrations"')) return { rows: structuredClone(ledger) };
    return originalQuery(text, values);
  };
  const pool = {
    async connect() { return fake.client; },
    async end() {},
  };
  const releaseCalls = [];
  let persistedReport;
  const result = await executeQualification(resolveLegacyEnvironment({
    JUW_DB_QUALIFICATION_RESULT_PATH: join(repositoryRoot, "storage/runtime-audit", `resolve-offline-${Date.now()}.json`),
  }), {
    poolFactory: () => pool,
    removeCredentialFile: async () => {},
    runReleaseCommand: (script, args) => {
      releaseCalls.push({ args, script });
      return "offline prefix check";
    },
    verifyCredentialFile: async () => {},
    writeReport: async (_path, report) => { persistedReport = structuredClone(report); },
  });

  assert.equal(result.status, "RESOLUTION_RECORDED");
  assert.equal(result.branchDeletionRequired, false);
  assert.equal(result.branchDisposition, "KEEP_UNTIL_APPLY_AND_RACE");
  assert.equal(result.legacyResolution.id, LEGACY_STOCKTAKE_ID);
  assert.match(result.legacyResolution.resolutionReference, new RegExp(`^${LEGACY_RESOLUTION_REFERENCE_PREFIX}:[0-9a-f]{64}$`));
  assert.equal(persistedReport.legacyResolution.resolutionReference, result.legacyResolution.resolutionReference);
  assert.equal(releaseCalls.every(({ script }) => script.endsWith("release.mjs")), true);
  assert.equal(releaseCalls.some(({ script }) => script.endsWith("shop-release.mjs")), false);
  assert.equal(fake.trace.some(({ text }) => /\b(?:insert\s+into|delete\s+from)\b/i.test(text)), false);
});

test("frozen manifest mismatch still cleans credentials and writes a redacted failure report", async () => {
  const calls = [];
  let report;
  await assert.rejects(
    executeQualification(environment({
      JUW_DB_QUALIFICATION_MIGRATION_0020_SHA256: "f".repeat(64),
      JUW_DB_QUALIFICATION_RESULT_PATH: join(repositoryRoot, "storage/runtime-audit", `mismatch-${Date.now()}.json`),
    }), {
      poolFactory: () => { throw new Error("pool must not open"); },
      removeCredentialFile: async () => { calls.push("credential-cleanup"); },
      runReleaseCommand: () => { throw new Error("release must not run"); },
      verifyCredentialFile: async () => {},
      writeReport: async (_path, value) => { report = structuredClone(value); },
    }),
    /identity mismatch for migration20/,
  );
  assert.deepEqual(calls, ["credential-cleanup"]);
  assert.equal(report.status, "FAIL");
  assert.match(report.error, /identity mismatch for migration20/);
});

test("injected offline execution cleans resources and never needs a real connection", async () => {
  const root = await mkdtemp(join(tmpdir(), "juw-qualification-offline-"));
  const credentialPath = join(root, "juw-offline.env");
  const resultPath = join(repositoryRoot, "storage/runtime-audit", `offline-${Date.now()}.json`);
  await writeFile(credentialPath, "DATABASE_URL_UNPOOLED=redacted\n", "utf8");
  await chmod(credentialPath, 0o600);
  const env = environment({
    JUW_DB_QUALIFICATION_ENV_FILE: credentialPath,
    JUW_DB_QUALIFICATION_RESULT_PATH: resultPath,
  });
  const calls = [];
  const fakeVerificationClient = {
    release() { calls.push("verification:release"); },
  };
  const fakePool = {
    async connect() { return fakeVerificationClient; },
    async end() { calls.push("pool:end"); },
  };
  let capturedReport;
  await assert.rejects(
    executeQualification(env, {
      poolFactory: () => fakePool,
      removeCredentialFile: async (path) => { calls.push(`remove:${path}`); },
      runReleaseCommand: () => "offline",
      runLiveMatrix: async () => ["offline-scenario"],
      writeReport: async (_path, report) => { capturedReport = structuredClone(report); },
    }),
    /client\.query is not a function/,
  );
  assert.equal(capturedReport.status, "FAIL");
  assert.equal(capturedReport.credentialFileRemoved, true);
  assert.deepEqual(calls, ["verification:release", "pool:end", `remove:${credentialPath}`]);
  await readFile(credentialPath, "utf8");
});
