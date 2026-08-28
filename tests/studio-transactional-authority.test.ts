import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function functionBody(migration: string, name: string, nextName?: string): string {
  const start = migration.indexOf(`FUNCTION ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const end = nextName ? migration.indexOf(`FUNCTION ${nextName}(`, start + 1) : migration.length;
  assert.ok(end > start, `missing boundary after ${name}`);
  return migration.slice(start, end);
}

function quotedFunctionBody(migration: string, name: string, nextName?: string): string {
  const start = migration.indexOf(`FUNCTION "${name}"(`);
  assert.ok(start >= 0, `missing ${name}`);
  const end = nextName
    ? migration.indexOf(`FUNCTION "${nextName}"(`, start + 1)
    : migration.length;
  assert.ok(end > start, `missing boundary after ${name}`);
  return migration.slice(start, end);
}

test("manual holds resolve replay before custody and publish inventory only from Wardrobe authority", async () => {
  const [migration, repository] = await Promise.all([
    source("drizzle/shop-postgres/0018_studio_transactional_authority.sql"),
    source("lib/server/studio-authority-repository.ts"),
  ]);
  const create = functionBody(migration, "studio_create_manual_hold_v2", "studio_release_manual_hold_v2");
  const release = functionBody(migration, "studio_release_manual_hold_v2", "studio_record_piece_move_v2");
  const expire = functionBody(migration, "studio_expire_manual_holds_v2", "studio_create_manual_hold_v2");
  const reconciliation = functionBody(migration, "studio_piece_is_reconciled_v1", "studio_expire_manual_holds_v2");

  assert.ok(create.indexOf("existing_hold.id IS NOT NULL") < create.indexOf("juw:studio:piece:"));
  assert.ok(create.indexOf("existing_hold.id IS NOT NULL") < create.indexOf("hold expiry must be in the future"));
  assert.ok(create.indexOf("STUDIO_IDEMPOTENCY_MISMATCH") < create.indexOf("INSERT INTO studio_manual_holds"));
  assert.match(create, /studio_piece_is_reconciled_v1\([\s\S]*'AVAILABLE', 'WARDROBE_RAIL'/);
  assert.match(create, /studio_piece_is_reconciled_v1\([\s\S]*'RESERVED', 'WARDROBE_RAIL'/);
  assert.match(create, /orders\.lifecycle_status = 'ACTIVE'/);
  assert.doesNotMatch(create, /active_hold\.operator_subject IS DISTINCT FROM/);
  assert.match(migration, /STUDIO_LEGACY_HOLD_SPLIT/);
  assert.match(migration, /STUDIO_LEGACY_ACTIVE_HOLD_SPLIT/);
  assert.match(reconciliation, /orders\.id,[\s\S]*orders\.version,[\s\S]*orders\.updated_at/);
  assert.match(reconciliation, /authority_updated_at := greatest\([\s\S]*inventory_record\.updated_at,[\s\S]*current_order\.updated_at/);
  assert.match(reconciliation, /custody\.updated_at >= authority_updated_at/);
  assert.match(reconciliation, /observation_record\.order_reference IS NOT DISTINCT FROM current_order\.reference/);
  assert.match(reconciliation, /observation_record\.occurred_at >= authority_updated_at/);
  assert.doesNotMatch(expire, /hold\.operator_subject = trim\(p_operator_subject\)/);
  assert.match(expire, /candidate\.operator_subject, candidate\.sku, 'RESERVED', 'WARDROBE_RAIL'/);
  assert.match(expire, /hold\.expires_at <= clock_timestamp\(\)/);

  for (const body of [release, expire]) {
    const authority = body.indexOf("'RESERVED', 'WARDROBE_RAIL'");
    const holdWrite = body.indexOf("UPDATE studio_manual_holds", authority);
    const inventoryWrite = body.indexOf("UPDATE shop_inventory", holdWrite);
    assert.ok(authority >= 0 && authority < holdWrite && holdWrite < inventoryWrite);
    assert.match(body, /orders\.lifecycle_status = 'ACTIVE'/);
  }
  assert.match(expire, /CONTINUE;[\s\S]*Expiry is not publication/);
  assert.doesNotMatch(repository, /with expired as \([\s\S]*update studio_manual_holds/i);
  assert.match(repository, /studio_create_manual_hold_v2/);
  assert.match(repository, /studio_release_manual_hold_v2/);
  assert.match(repository, /studio_expire_manual_holds_v2/);
  assert.match(repository, /outcome !== "CREATED" && outcome !== "REPLAYED"/);
  assert.match(repository, /outcome === "CREATED" && hold\.status !== "ACTIVE"/);
  assert.match(repository, /Hold needs expiry review/);
  const orderable = repository.slice(
    repository.indexOf("export async function listStudioOrderablePieceSkus"),
    repository.indexOf("function notificationForOrder"),
  );
  assert.ok(orderable.indexOf("await expireManualHolds") < orderable.indexOf("readCoreAuthority"));
  assert.match(repository, /database\.\$client\.transaction\(prepared/);
  assert.match(repository, /isolationLevel: "RepeatableRead"/);
  assert.match(repository, /readOnly: true/);
});

test("assisted order custody is fenced in one database command after exact replay", async () => {
  const [migration, route, store] = await Promise.all([
    source("drizzle/shop-postgres/0018_studio_transactional_authority.sql"),
    source("app/api/studio/orders/route.ts"),
    source("lib/shop/server-order/postgres-store.ts"),
  ]);
  const order = functionBody(migration, "shop_create_assisted_order_v4");
  const replay = order.indexOf("existing_order.id IS NOT NULL");
  const customerLock = order.indexOf("SELECT customers.* INTO customer_record", replay);
  const lock = order.indexOf("juw:studio:piece:");
  const custody = order.indexOf("studio_piece_is_reconciled_v1", lock);
  const create = order.indexOf("shop_create_assisted_order_v3", custody);

  assert.ok(replay >= 0 && replay < customerLock && customerLock < lock && lock < custody && custody < create);
  assert.ok(order.indexOf("juw:studio:assisted-order:idempotency:") < replay);
  assert.match(order, /assisted customer could not be established/);
  assert.match(order, /ORDER BY catalogue\.sku/);
  assert.match(order, /FOR UPDATE OF catalogue, inventory/);
  assert.match(order, /hold\.status = 'ACTIVE'/);
  assert.match(order, /active_hold\.expires_at > clock_timestamp\(\)/);
  assert.match(order, /'RESERVED', 'WARDROBE_RAIL'/);
  assert.match(order, /assisted hold expiry mismatch/);
  assert.match(order, /assisted hold inventory mismatch/);
  assert.match(order, /NOT reclaimed_expired_hold[\s\S]*'AVAILABLE', 'WARDROBE_RAIL'/);
  assert.match(order, /'AVAILABLE', 'WARDROBE_RAIL'/);
  assert.match(store, /shop_create_assisted_order_v4/);

  const post = route.slice(route.indexOf("export async function POST"));
  assert.doesNotMatch(post, /listStudioOrderablePieceSkus|loadServerShopProducts/);
  assert.match(post, /createAssistedOrder\(actor, body\)/);
});

test("location MOVE is an idempotent expected-version compare-and-swap with no-write conflicts", async () => {
  const [migration, repository, client] = await Promise.all([
    source("drizzle/shop-postgres/0018_studio_transactional_authority.sql"),
    source("lib/server/studio-authority-repository.ts"),
    source("lib/studio/services/studio-authority-client.ts"),
  ]);
  const move = functionBody(migration, "studio_record_piece_move_v2", "studio_record_piece_confirmation_v2");
  const replay = move.indexOf("existing_command.id IS NOT NULL");
  const pieceLock = move.indexOf("juw:studio:piece:");
  const lockedOrderRead = move.indexOf("INTO locked_order", pieceLock);
  const orderLock = move.indexOf("FOR UPDATE OF orders", lockedOrderRead);
  const inventoryLock = move.indexOf("FROM shop_inventory AS inventory", orderLock);
  const refreshedOrderRead = move.indexOf("INTO current_order", inventoryLock);
  const orderRevalidation = move.indexOf("current order changed while inventory was locked", refreshedOrderRead);
  const versionConflict = move.indexOf("current_version <> p_expected_version");
  const commandInsert = move.indexOf("INSERT INTO studio_piece_custody_commands");
  const projectionWrite = move.indexOf("UPDATE studio_piece_custody AS custody", commandInsert);
  const observationWrite = move.indexOf("INSERT INTO studio_physical_observations", commandInsert);

  assert.ok(
    replay >= 0
      && replay < pieceLock
      && pieceLock < lockedOrderRead
      && lockedOrderRead < orderLock
      && orderLock < inventoryLock
      && inventoryLock < refreshedOrderRead
      && refreshedOrderRead < orderRevalidation
      && orderRevalidation < versionConflict
      && versionConflict < commandInsert,
  );
  assert.ok(commandInsert < projectionWrite && projectionWrite < observationWrite);
  assert.match(move, /request_fingerprint IS DISTINCT FROM p_request_fingerprint/);
  assert.match(move, /custody\.version = p_expected_version/);
  assert.match(move, /STUDIO_LOCATION_VERSION_CONFLICT: location compare-and-swap failed/);
  assert.match(move, /locked_order\.version IS DISTINCT FROM current_order\.version/);
  assert.match(move, /locked_order\.lifecycle_status IS DISTINCT FROM current_order\.lifecycle_status/);
  assert.match(move, /locked_order\.fulfillment_status IS DISTINCT FROM current_order\.fulfillment_status/);
  assert.match(move, /locked_order\.return_status IS DISTINCT FROM current_order\.return_status/);
  assert.match(move, /current_authority_updated_at := greatest\([\s\S]*current_order\.authority_updated_at/);
  assert.match(move, /resulting_version[\s\S]*p_expected_version \+ 1/);
  assert.match(repository, /locationVersion: projected\?\.version \?\? 0/);
  assert.match(repository, /studio_record_piece_move_v2/);
  assert.match(repository, /"VERSION_CONFLICT"/);
  assert.match(client, /expectedVersion: number/);
});

test("Operations location commands require an exact canonical authority revision", async () => {
  const [{ locationCommandSchema }, repository, migration, stocktake] = await Promise.all([
    import("../lib/server/studio-authority-repository"),
    source("lib/server/studio-authority-repository.ts"),
    source("drizzle/shop-postgres/0018_studio_transactional_authority.sql"),
    source("lib/server/studio-stocktake-repository.ts"),
  ]);
  const freshAuthorityRevision = "2026-08-27T12:34:56.789123Z";
  const oneMicrosecondStaleRevision = "2026-08-27T12:34:56.789122Z";
  const valid = {
    command: "MOVE" as const,
    expectedAuthorityRevision: freshAuthorityRevision,
    expectedVersion: 0,
    idempotencyKey: "location:authority-1",
    locationKey: "WARDROBE_RAIL" as const,
    pieceKey: "sku:authority-piece",
  };
  const revisionValidator = repository.slice(
    repository.indexOf("const exactAuthorityRevisionSchema"),
    repository.indexOf("export const locationCommandSchema"),
  );

  assert.equal(locationCommandSchema.safeParse(valid).success, true);
  assert.equal(locationCommandSchema.safeParse({
    ...valid,
    expectedAuthorityRevision: oneMicrosecondStaleRevision,
  }).success, true);
  assert.notEqual(freshAuthorityRevision, oneMicrosecondStaleRevision);
  assert.equal(locationCommandSchema.safeParse({ ...valid, expectedAuthorityRevision: undefined }).success, false);
  assert.equal(locationCommandSchema.safeParse({
    ...valid,
    expectedAuthorityRevision: "2026-08-27T12:34:56.789Z",
  }).success, false);
  assert.equal(locationCommandSchema.safeParse({
    ...valid,
    expectedAuthorityRevision: "2026-08-27T13:34:56.789123+01:00",
  }).success, false);
  assert.equal(locationCommandSchema.safeParse({
    ...valid,
    command: "CONFIRM",
    expectedAuthorityRevision: "not-a-revision",
  }).success, false);

  assert.match(revisionValidator, /\.regex\([\s\S]*\\d\{6\}Z\$/);
  assert.doesNotMatch(revisionValidator, /Date\.parse|new Date|toISOString/);
  assert.match(repository, /expectedAuthorityRevision: input\.expectedAuthorityRevision[\s\S]*expectedVersion: input\.expectedVersion/);
  assert.equal((repository.match(/\$\{input\.expectedAuthorityRevision\}/g) ?? []).length, 2);
  assert.doesNotMatch(repository, /expectedAuthorityUpdatedAt/);
  assert.match(repository, /authorityUpdatedAt: piece\.authorityUpdatedAt/);
  assert.match(repository, /authorityRevision: piece\.authorityRevision/);
  assert.match(stocktake, /piece\.authority_updated_at at time zone 'UTC'[\s\S]*YYYY-MM-DD"T"HH24:MI:SS\.US"Z"[\s\S]*authority_revision/);
  assert.match(migration, /p_expected_version integer,\s+p_expected_authority_revision text/);
  assert.match(migration, /p_expected_location_version integer,\s+p_expected_authority_revision text/);
  assert.match(stocktake, /null::integer,\s+null::text,/);
});

test("delayed hold and fulfillment authority changes conflict before any location write", async () => {
  const [migration, commerce] = await Promise.all([
    source("drizzle/shop-postgres/0018_studio_transactional_authority.sql"),
    source("drizzle/shop-postgres/0007_material_cyclops.sql"),
  ]);
  const hold = functionBody(migration, "studio_create_manual_hold_v2", "studio_release_manual_hold_v2");
  const move = functionBody(migration, "studio_record_piece_move_v2", "studio_record_piece_confirmation_v2");
  const confirm = functionBody(migration, "studio_record_piece_confirmation_v2", "shop_create_assisted_order_v4");
  const fulfillment = quotedFunctionBody(commerce, "shop_transition_order_v2", "shop_resolve_return_inventory_v2");
  const moveAuthorityConflict = move.indexOf(
    ") IS DISTINCT FROM p_expected_authority_revision",
  );
  const moveCommandWrite = move.indexOf("INSERT INTO studio_piece_custody_commands");
  const moveProjectionWrite = move.indexOf("UPDATE studio_piece_custody AS custody", moveCommandWrite);
  const moveObservationWrite = move.indexOf("INSERT INTO studio_physical_observations", moveCommandWrite);
  const confirmAuthorityConflict = confirm.indexOf(
    ") IS DISTINCT FROM p_expected_authority_revision",
  );
  const confirmCommandWrite = confirm.indexOf("INSERT INTO studio_piece_custody_commands");
  const confirmSessionWrite = confirm.indexOf("UPDATE studio_stocktakes AS stocktake", confirmCommandWrite);
  const confirmObservationWrite = confirm.indexOf("INSERT INTO studio_physical_observations", confirmCommandWrite);

  assert.match(hold, /SET availability = 'RESERVED', reserved = 1, updated_at = clock_timestamp\(\)/);
  assert.doesNotMatch(hold, /studio_piece_custody/);
  assert.match(fulfillment, /fulfillment_status = p_target::shop_fulfillment_status[\s\S]*version = version \+ 1,[\s\S]*updated_at = p_now/);
  assert.doesNotMatch(fulfillment, /studio_piece_custody/);
  assert.ok(
    moveAuthorityConflict >= 0
      && moveAuthorityConflict < moveCommandWrite
      && moveAuthorityConflict < moveProjectionWrite
      && moveAuthorityConflict < moveObservationWrite,
  );
  assert.ok(
    confirmAuthorityConflict >= 0
      && confirmAuthorityConflict < confirmCommandWrite
      && confirmAuthorityConflict < confirmSessionWrite
      && confirmAuthorityConflict < confirmObservationWrite,
  );
  assert.match(move, /STUDIO_LOCATION_VERSION_CONFLICT: piece authority timestamp changed/);
  assert.match(confirm, /p_source = 'OPERATIONS'[\s\S]*STUDIO_LOCATION_VERSION_CONFLICT: piece authority timestamp changed/);
});

test("location CONFIRM shares the exact receipt domain and resolves replay before every mutable gate", async () => {
  const [migration, authority, stocktake] = await Promise.all([
    source("drizzle/shop-postgres/0018_studio_transactional_authority.sql"),
    source("lib/server/studio-authority-repository.ts"),
    source("lib/server/studio-stocktake-repository.ts"),
  ]);
  const confirm = functionBody(migration, "studio_record_piece_confirmation_v2", "shop_create_assisted_order_v4");
  const idempotencyLock = confirm.indexOf("juw:studio:location:idempotency:");
  const replay = confirm.indexOf("existing_command.id IS NOT NULL");
  const pieceLock = confirm.indexOf("juw:studio:piece:");
  const authorityRead = confirm.indexOf("FROM shop_inventory AS inventory", pieceLock);
  const locationConflict = confirm.indexOf("current_version <> p_expected_location_version");
  const stocktakeConflict = confirm.indexOf("stocktake_record.version <> p_expected_stocktake_version");
  const commandInsert = confirm.indexOf("INSERT INTO studio_piece_custody_commands");
  const sessionWrite = confirm.indexOf("UPDATE studio_stocktakes AS stocktake", commandInsert);
  const observationWrite = confirm.indexOf("INSERT INTO studio_physical_observations", commandInsert);

  assert.ok(idempotencyLock >= 0 && idempotencyLock < replay && replay < pieceLock && pieceLock < authorityRead);
  assert.ok(locationConflict >= 0 && locationConflict < commandInsert);
  assert.ok(stocktakeConflict >= 0 && stocktakeConflict < commandInsert);
  assert.ok(commandInsert < sessionWrite && sessionWrite < observationWrite);
  assert.match(confirm, /request_fingerprint IS DISTINCT FROM p_request_fingerprint[\s\S]*command IS DISTINCT FROM 'CONFIRM'/);
  assert.match(confirm, /'CONFIRM',[\s\S]*current_version, current_version/);
  assert.ok((confirm.match(/location key already used by a legacy observation/g) ?? []).length >= 2);

  const recordLocation = authority.slice(
    authority.indexOf("export async function recordPieceLocation"),
    authority.indexOf("export async function getStudioAuthority("),
  );
  const observe = stocktake.slice(
    stocktake.indexOf("export async function observePhysicalPiece"),
    stocktake.indexOf("export async function closeStocktake"),
  );
  for (const repositoryBody of [recordLocation, observe]) {
    assert.match(repositoryBody, /juw\.studio\.location-command\.v1/);
    assert.match(repositoryBody, /studio_record_piece_confirmation_v2/);
    assert.doesNotMatch(repositoryBody, /piece_lock as materialized/);
  }
  assert.doesNotMatch(recordLocation, /String\(replayRow\.piece_key\) !== input\.pieceKey/);
  assert.ok(recordLocation.indexOf("const replay =") < recordLocation.indexOf("getPhysicalPiece"));
  assert.ok(observe.indexOf("const replay =") < observe.indexOf("getPhysicalPiece"));
});

test("a Wardrobe stocktake cannot confirm stale AVAILABLE authority after a manual hold", async () => {
  const [migration, stocktake] = await Promise.all([
    source("drizzle/shop-postgres/0018_studio_transactional_authority.sql"),
    source("lib/server/studio-stocktake-repository.ts"),
  ]);
  const hold = functionBody(migration, "studio_create_manual_hold_v2", "studio_release_manual_hold_v2");
  const confirm = functionBody(migration, "studio_record_piece_confirmation_v2", "shop_create_assisted_order_v4");
  const start = stocktake.slice(
    stocktake.indexOf("export async function startStocktake"),
    stocktake.indexOf("function mapInsertedObservation"),
  );
  const staleGate = confirm.indexOf("frozen piece authority changed");
  const commandWrite = confirm.indexOf("INSERT INTO studio_piece_custody_commands");
  const stocktakeWrite = confirm.indexOf("UPDATE studio_stocktakes AS stocktake", commandWrite);
  const observationWrite = confirm.indexOf("INSERT INTO studio_physical_observations", commandWrite);

  assert.match(start, /'authorityUpdatedAt', piece\.authority_updated_at/);
  assert.match(start, /'locationVersion', piece\.location_version/);
  assert.match(start, /'availability', piece\.availability/);
  assert.match(hold, /SET availability = 'RESERVED', reserved = 1, updated_at = clock_timestamp\(\)/);
  assert.match(confirm, /expected_snapshot->'authorityUpdatedAt' IS DISTINCT FROM to_jsonb\(current_authority_updated_at\)/);
  assert.match(confirm, /expected_snapshot->>'locationVersion' IS DISTINCT FROM current_version::text/);
  assert.match(confirm, /expected_snapshot->>'availability' IS DISTINCT FROM current_availability/);
  assert.ok(staleGate >= 0 && staleGate < commandWrite && staleGate < stocktakeWrite && staleGate < observationWrite);
  assert.match(stocktake, /STUDIO_STOCKTAKE_AUTHORITY_CONFLICT[\s\S]*"VERSION_CONFLICT"/);
});

test("a Wardrobe stocktake cannot confirm stale AVAILABLE authority after a real order", async () => {
  const [migration, checkout, stocktake] = await Promise.all([
    source("drizzle/shop-postgres/0018_studio_transactional_authority.sql"),
    source("drizzle/shop-postgres/0007_material_cyclops.sql"),
    source("lib/server/studio-stocktake-repository.ts"),
  ]);
  const confirm = functionBody(migration, "studio_record_piece_confirmation_v2", "shop_create_assisted_order_v4");
  const assistedOrder = functionBody(migration, "shop_create_assisted_order_v4");
  const start = stocktake.slice(
    stocktake.indexOf("export async function startStocktake"),
    stocktake.indexOf("function mapInsertedObservation"),
  );
  const pieceLock = confirm.indexOf("juw:studio:piece:");
  const lockedOrderRead = confirm.indexOf("INTO locked_order", pieceLock);
  const orderLock = confirm.indexOf("FOR UPDATE OF orders", lockedOrderRead);
  const inventoryLock = confirm.indexOf("FROM shop_inventory AS inventory", orderLock);
  const refreshedOrderRead = confirm.indexOf("INTO current_order", inventoryLock);
  const orderRevalidation = confirm.indexOf("current order changed while inventory was locked", refreshedOrderRead);
  const staleGate = confirm.indexOf("frozen piece authority changed");
  const commandWrite = confirm.indexOf("INSERT INTO studio_piece_custody_commands");

  assert.match(checkout, /SET availability = 'RESERVED', reserved = 1, updated_at = p_now/);
  assert.match(assistedOrder, /shop_create_assisted_order_v3/);
  assert.match(start, /'orderReference', piece\.order_reference/);
  assert.match(start, /'orderVersion', piece\.order_version/);
  assert.match(start, /'orderLifecycleStatus', piece\.order_lifecycle_status/);
  assert.match(start, /'orderFulfillmentStatus', piece\.order_fulfillment_status/);
  assert.match(start, /'orderReturnStatus', piece\.order_return_status/);
  assert.match(stocktake, /greatest\([\s\S]*inventory\.updated_at,[\s\S]*current_order\.authority_updated_at/);
  assert.match(confirm, /current_authority_updated_at := greatest\([\s\S]*inventory_record\.updated_at,[\s\S]*current_order\.authority_updated_at/);
  assert.match(confirm, /NULLIF\(expected_snapshot->>'orderReference', ''\) IS DISTINCT FROM current_order_reference/);
  assert.match(confirm, /expected_snapshot->>'orderVersion' IS DISTINCT FROM current_order_version::text/);
  assert.match(confirm, /expected_snapshot->>'orderLifecycleStatus' IS DISTINCT FROM current_order_lifecycle_status/);
  assert.match(confirm, /expected_snapshot->>'orderFulfillmentStatus' IS DISTINCT FROM current_order_fulfillment_status/);
  assert.match(confirm, /expected_snapshot->>'orderReturnStatus' IS DISTINCT FROM current_order_return_status/);
  assert.match(confirm, /expected_snapshot->>'expectedLocationKey' IS DISTINCT FROM effective_location_key/);
  assert.match(confirm, /expected_snapshot->>'expectedCustody' IS DISTINCT FROM base_custody/);
  assert.ok(
    pieceLock >= 0
      && pieceLock < lockedOrderRead
      && lockedOrderRead < orderLock
      && orderLock < inventoryLock
      && inventoryLock < refreshedOrderRead
      && refreshedOrderRead < orderRevalidation
      && orderRevalidation < staleGate
      && staleGate < commandWrite,
  );
});

test("a location MOVE away and back invalidates the frozen stocktake location revision", async () => {
  const [migration, stocktake, schema] = await Promise.all([
    source("drizzle/shop-postgres/0018_studio_transactional_authority.sql"),
    source("lib/server/studio-stocktake-repository.ts"),
    source("db/shop-postgres-schema.ts"),
  ]);
  const move = functionBody(migration, "studio_record_piece_move_v2", "studio_record_piece_confirmation_v2");
  const confirm = functionBody(migration, "studio_record_piece_confirmation_v2", "shop_create_assisted_order_v4");
  const staleGate = confirm.indexOf("expected_snapshot->>'locationVersion' IS DISTINCT FROM current_version::text");
  const commandWrite = confirm.indexOf("INSERT INTO studio_piece_custody_commands");

  assert.match(stocktake, /coalesce\(custody_revision\.version, 0\) as location_version/);
  assert.match(stocktake, /left join studio_piece_custody as custody_revision[\s\S]*custody_revision\.piece_key = piece\.piece_key/);
  assert.match(stocktake, /'locationVersion', piece\.location_version/);
  assert.match(schema, /authorityUpdatedAt: string;\s+locationVersion: number;/);
  assert.match(move, /version = p_expected_version \+ 1/);
  assert.ok(staleGate >= 0 && staleGate < commandWrite);
});

test("0018 stops before authority cutover when an OPEN count lacks the complete frozen receipt", async () => {
  const migration = await source("drizzle/shop-postgres/0018_studio_transactional_authority.sql");
  const preflight = migration.indexOf("STUDIO_LEGACY_OPEN_STOCKTAKE_AUTHORITY_REQUIRED");
  const firstAuthorityCutover = migration.indexOf("CREATE OR REPLACE FUNCTION studio_piece_is_reconciled_v1");
  const moveCutover = migration.indexOf("CREATE OR REPLACE FUNCTION studio_record_piece_move_v2");
  const confirmCutover = migration.indexOf("CREATE OR REPLACE FUNCTION studio_record_piece_confirmation_v2");
  const blockStart = migration.lastIndexOf("DO $$", preflight);
  const blockEnd = migration.indexOf("--> statement-breakpoint", preflight);
  const preflightBlock = migration.slice(blockStart, blockEnd);

  assert.ok(
    blockStart >= 0
      && preflight > blockStart
      && preflight < firstAuthorityCutover
      && preflight < moveCutover
      && preflight < confirmCutover,
  );
  assert.match(preflightBlock, /stocktake\.state = 'OPEN'/);
  assert.match(preflightBlock, /WHEN jsonb_typeof\(stocktake\.expected_pieces\) IS DISTINCT FROM 'array' THEN true/);
  assert.match(preflightBlock, /WHEN jsonb_array_length\(stocktake\.expected_pieces\) = 0 THEN true/);
  assert.match(preflightBlock, /jsonb_array_elements\(stocktake\.expected_pieces\)/);
  assert.match(preflightBlock, /jsonb_typeof\(expected_piece\.value\) IS DISTINCT FROM 'object'/);
  assert.match(preflightBlock, /expected_piece\.value \?& ARRAY/);
  assert.doesNotMatch(preflightBlock, /CROSS JOIN LATERAL/);
  for (const key of [
    "authorityUpdatedAt",
    "locationVersion",
    "orderReference",
    "orderVersion",
    "orderLifecycleStatus",
    "orderFulfillmentStatus",
    "orderReturnStatus",
  ]) {
    assert.match(preflightBlock, new RegExp(`'${key}'`));
  }
  assert.doesNotMatch(preflightBlock, /UPDATE studio_stocktakes|state = 'CLOSED'/);
});

test("location confirmation preserves the shared deadlock order across every piece writer", async () => {
  const [migration, commerce] = await Promise.all([
    source("drizzle/shop-postgres/0018_studio_transactional_authority.sql"),
    source("drizzle/shop-postgres/0007_material_cyclops.sql"),
  ]);
  const expire = functionBody(migration, "studio_expire_manual_holds_v2", "studio_create_manual_hold_v2");
  const create = functionBody(migration, "studio_create_manual_hold_v2", "studio_release_manual_hold_v2");
  const release = functionBody(migration, "studio_release_manual_hold_v2", "studio_record_piece_move_v2");
  const move = functionBody(migration, "studio_record_piece_move_v2", "studio_record_piece_confirmation_v2");
  const confirm = functionBody(migration, "studio_record_piece_confirmation_v2", "shop_create_assisted_order_v4");
  const assisted = functionBody(migration, "shop_create_assisted_order_v4");
  const fulfillment = quotedFunctionBody(commerce, "shop_transition_order_v2", "shop_resolve_return_inventory_v2");
  const returns = quotedFunctionBody(commerce, "shop_transition_return_v2", "shop_authorize_payment_evidence_v2");

  for (const body of [expire, create, release]) {
    const pieceLock = body.indexOf("juw:studio:piece:");
    const inventoryLock = body.indexOf("shop_inventory AS inventory", pieceLock);
    assert.ok(pieceLock >= 0 && pieceLock < inventoryLock);
    assert.equal(body.indexOf("FOR UPDATE OF orders", inventoryLock), -1);
  }

  const assistedReplayOrderLock = assisted.indexOf("FOR UPDATE OF orders");
  const assistedReplayReturn = assisted.indexOf("RETURN shop_order_document_v3", assistedReplayOrderLock);
  const assistedPieceLock = assisted.indexOf("juw:studio:piece:", assistedReplayReturn);
  const assistedInventoryLock = assisted.indexOf("shop_inventory AS inventory", assistedPieceLock);
  assert.ok(
    assistedReplayOrderLock >= 0
      && assistedReplayOrderLock < assistedReplayReturn
      && assistedReplayReturn < assistedPieceLock
      && assistedPieceLock < assistedInventoryLock,
  );
  assert.equal(assisted.indexOf("FOR UPDATE OF orders", assistedInventoryLock), -1);

  const movePieceLock = move.indexOf("juw:studio:piece:");
  const moveOrderLock = move.indexOf("FOR UPDATE OF orders", movePieceLock);
  const moveInventoryLock = move.indexOf("shop_inventory AS inventory", moveOrderLock);
  assert.ok(movePieceLock >= 0 && movePieceLock < moveOrderLock && moveOrderLock < moveInventoryLock);

  const confirmationPieceLock = confirm.indexOf("juw:studio:piece:");
  const confirmationOrderLock = confirm.indexOf("FOR UPDATE OF orders", confirmationPieceLock);
  const confirmationInventoryLock = confirm.indexOf("shop_inventory AS inventory", confirmationOrderLock);
  assert.ok(
    confirmationPieceLock >= 0
      && confirmationPieceLock < confirmationOrderLock
      && confirmationOrderLock < confirmationInventoryLock,
  );

  const fulfillmentOrderRead = fulfillment.indexOf("FROM shop_orders AS orders");
  const fulfillmentOrderLock = fulfillment.indexOf("FOR UPDATE;", fulfillmentOrderRead);
  assert.ok(fulfillmentOrderRead >= 0 && fulfillmentOrderRead < fulfillmentOrderLock);
  assert.ok(fulfillmentOrderLock < fulfillment.indexOf("shop_sell_order_inventory_v2"));
  assert.ok(fulfillmentOrderLock < fulfillment.indexOf("shop_release_order_inventory_v2"));

  const returnOrderRead = returns.indexOf("FROM shop_orders AS orders");
  const returnOrderLock = returns.indexOf("FOR UPDATE;", returnOrderRead);
  const returnInventory = returns.indexOf("shop_resolve_return_inventory_v2", returnOrderLock);
  assert.ok(returnOrderRead >= 0 && returnOrderRead < returnOrderLock && returnOrderLock < returnInventory);
});

test("all physical writers share database locks and migration metadata carries the exact receipt schema", async () => {
  const [migration, authority, stocktake, schema, snapshotText, journalText] = await Promise.all([
    source("drizzle/shop-postgres/0018_studio_transactional_authority.sql"),
    source("lib/server/studio-authority-repository.ts"),
    source("lib/server/studio-stocktake-repository.ts"),
    source("db/shop-postgres-schema.ts"),
    source("drizzle/shop-postgres/meta/0018_snapshot.json"),
    source("drizzle/shop-postgres/meta/_journal.json"),
  ]);
  const lock = /juw:studio:piece:/g;
  assert.ok((migration.match(lock) ?? []).length >= 6);
  assert.match(authority, /studio_record_piece_confirmation_v2/);
  assert.match(stocktake, /studio_record_piece_confirmation_v2/);
  assert.ok((migration.match(/juw:studio:location:idempotency:/g) ?? []).length >= 2);
  assert.match(schema, /studio_piece_custody_command_known[\s\S]*'MOVE', 'CONFIRM'/);
  assert.match(schema, /studio_piece_custody_command_receipt_pair/);

  const snapshot = JSON.parse(snapshotText) as {
    prevId: string;
    tables: Record<string, {
      checkConstraints: Record<string, { value: string }>;
      columns: Record<string, unknown>;
    }>;
  };
  const custodyCommands = snapshot.tables["public.studio_piece_custody_commands"];
  const columns = custodyCommands.columns;
  assert.ok(columns.request_fingerprint);
  assert.ok(columns.expected_version);
  assert.ok(columns.resulting_version);
  assert.match(custodyCommands.checkConstraints.studio_piece_custody_command_known.value, /MOVE.*CONFIRM/);
  assert.ok(custodyCommands.checkConstraints.studio_piece_custody_command_receipt_pair);
  assert.match(custodyCommands.checkConstraints.studio_piece_custody_command_version_step.value, /command.*CONFIRM/);
  assert.equal(snapshot.prevId, "1875f22d-d22a-44d6-a429-c83b17ce90c3");
  assert.match(journalText, /0018_studio_transactional_authority/);
});
