import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  locationCommandSchema,
  STUDIO_AUTHORITY_REQUIRED_SQL,
} from "../lib/server/studio-authority-repository";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("normal location work separates a physical check from an authoritative move", () => {
  assert.equal(locationCommandSchema.safeParse({
    command: "CONFIRM",
    expectedAuthorityRevision: "2026-08-27T12:00:00.000000Z",
    expectedVersion: 0,
    idempotencyKey: "confirm:piece-001",
    locationKey: "WARDROBE_RAIL",
    pieceKey: "sku:JUW-001",
  }).success, true);
  assert.equal(locationCommandSchema.safeParse({
    command: "MOVE",
    expectedAuthorityRevision: "2026-08-27T12:00:00.000000Z",
    expectedVersion: 0,
    idempotencyKey: "move:piece-001",
    locationKey: "PACKING_SHELF",
    pieceKey: "sku:JUW-001",
  }).success, true);
  assert.equal(locationCommandSchema.safeParse({
    command: "MOVE",
    expectedAuthorityRevision: "2026-08-27T12:00:00.000000Z",
    expectedVersion: 0,
    idempotencyKey: "move:piece-001",
    locationKey: "CUSTOMER",
    pieceKey: "sku:JUW-001",
  }).success, false);

  const ddl = STUDIO_AUTHORITY_REQUIRED_SQL.join("\n");
  assert.match(ddl, /create table studio_piece_custody_commands/);
  assert.match(ddl, /unique \(operator_subject, idempotency_key\)/);
  assert.match(ddl, /create table studio_piece_custody/);
  assert.match(ddl, /primary key \(operator_subject, piece_key\)/);
});

test("authoritative Studio surfaces no longer expose local commerce or mock media mutations", async () => {
  const [operations, models, gallery, detail] = await Promise.all([
    read("components/studio/operations-desk.tsx"),
    read("components/studio/model-atelier.tsx"),
    read("components/shoot/shoot-gallery.tsx"),
    read("components/shoot/shoot-detail.tsx"),
  ]);
  assert.doesNotMatch(operations, /reserveOrder|fulfillOrder|cancelOrder|openReturn|disposeReturn/);
  assert.doesNotMatch(models, /createModel\(|updateModel\(/);
  assert.doesNotMatch(`${gallery}\n${detail}`, /createMockShoot|MOCK FRAME|LOCAL \/ SAFE/);
  assert.match(operations, /command: "CONFIRM" \| "MOVE"/);
});

test("hold release receipts distinguish a new release from terminal replays", async () => {
  const route = await read("app/api/studio/authority/holds/[id]/route.ts");
  assert.match(route, /outcome === "RELEASED"/);
  assert.match(route, /outcome === "ALREADY_EXPIRED"/);
  assert.match(route, /is available again/);
  assert.match(route, /had already been released/);
  assert.match(route, /had already expired/);
  assert.match(route, /Review the piece before promising its availability/);
});

test("hold create receipts distinguish creation from every replay state", async () => {
  const [route, repository] = await Promise.all([
    read("app/api/studio/authority/holds/route.ts"),
    read("lib/server/studio-authority-repository.ts"),
  ]);
  assert.match(route, /ManualHoldCreateOutcome = "CREATED" \| "REPLAYED"/);
  assert.match(route, /outcome === "CREATED"/);
  assert.match(route, /hold\.status === "ACTIVE"/);
  assert.match(route, /hold\.status === "RELEASED"/);
  assert.match(route, /is already active/);
  assert.match(route, /had already been released/);
  assert.match(route, /had already expired/);
  assert.match(route, /created\.outcome === "CREATED" \? 201 : 200/);
  assert.match(repository, /ManualHoldCreateMutation/);
  assert.match(repository, /outcome !== "CREATED" && outcome !== "REPLAYED"/);
  assert.match(repository, /outcome === "CREATED" && hold\.status !== "ACTIVE"/);
  assert.match(repository, /"The hold receipt was invalid\."/);
});

test("authority projections finish lazy expiry before reads and expose an exact blocked receipt", async () => {
  const repository = await read("lib/server/studio-authority-repository.ts");
  const orderable = repository.slice(
    repository.indexOf("export async function listStudioOrderablePieceSkus"),
    repository.indexOf("function notificationForOrder"),
  );
  const snapshot = repository.slice(repository.indexOf("export async function getStudioAuthority(operator"));

  assert.ok(orderable.indexOf("await expireManualHolds") < orderable.indexOf("readCoreAuthority"));
  assert.ok(snapshot.indexOf("expireReservations") < snapshot.indexOf("expireManualHolds"));
  assert.ok(snapshot.indexOf("await expireManualHolds") < snapshot.indexOf("Promise.all"));
  assert.match(repository, /database\.\$client\.transaction\(prepared/);
  assert.match(repository, /isolationLevel: "RepeatableRead"/);
  assert.match(repository, /readOnly: true/);
  assert.match(repository, /physicalPiecesReadQuery\(operator\.subject\)/);
  assert.match(repository, /includeOrders \? operatorOrdersReadQuery\(100\) : emptyRows/);
  assert.match(snapshot, /readCoreAuthority\(operator, true\)/);
  assert.doesNotMatch(snapshot, /listOperatorOrders/);
  assert.match(repository, /Hold needs expiry review/);
  assert.match(repository, /safe expiry preflight did not complete/);
  assert.match(repository, /actionLabel: expiryBlocked \? "Review blocker" : "Review hold"/);
});

test("hold release validates its UUID before invoking persistence", async () => {
  const route = await read("app/api/studio/authority/holds/[id]/route.ts");
  const validation = route.indexOf("releaseParamsSchema.safeParse");
  const persistence = route.indexOf("releaseManualHold(operator");

  assert.match(route, /z\.string\(\)\.uuid\(\)/);
  assert.match(route, /"INVALID_REQUEST",\s+400/);
  assert.ok(validation >= 0, "expected hold route UUID validation");
  assert.ok(persistence > validation, "expected UUID validation before persistence");
});

test("location mutations bind the visible revision and distinguish a determinate conflict", async () => {
  const [client, operations, provider] = await Promise.all([
    read("lib/studio/services/studio-authority-client.ts"),
    read("components/studio/operations-desk.tsx"),
    read("components/studio/studio-provider.tsx"),
  ]);

  assert.match(client, /locationVersion: number/);
  assert.match(client, /authorityUpdatedAt: string/);
  assert.match(client, /authorityRevision: string/);
  assert.match(client, /export class StudioAuthorityClientError extends Error/);
  assert.match(client, /readonly status: number/);
  assert.match(client, /readonly code: string \| null/);
  assert.match(client, /command: "CONFIRM" \| "MOVE";\s+expectedAuthorityRevision: string;\s+expectedVersion: number/);
  assert.match(provider, /authorityUpdatedAt: garment\.createdAt,\s+authorityRevision: simulatorAuthorityTimestamp\(garment\.createdAt\),\s+locationVersion: 0/);
  assert.match(operations, /interface LocationMutationIntent extends MutationIntent/);
  assert.match(operations, /expectedAuthorityRevision: string/);
  assert.match(operations, /AUTHORITY_TIMESTAMP_PATTERN = \/\^\\d\{4\}[^\n]+\\d\{6\}Z\$\//);
  assert.match(operations, /AUTHORITY_TIMESTAMP_PATTERN\.test\(candidate\.expectedAuthorityRevision\)/);
  assert.doesNotMatch(operations, /authorityTimestamp\.toISOString/);
  assert.match(operations, /async function recordLocation\(\s+piece: StudioAuthorityPiece/);
  assert.match(operations, /const expectedAuthorityRevision = piece\.authorityRevision;\s+const expectedVersion = piece\.locationVersion/);
  assert.match(operations, /readLocationMutationIntent\(\)/);
  assert.match(operations, /storedIntent\.expectedAuthorityRevision/);
  assert.match(operations, /JSON\.stringify\(request\)/);
  assert.match(operations, /authority\.recordLocation\(\{\s+command: intent\.command,\s+expectedAuthorityRevision: intent\.expectedAuthorityRevision,\s+expectedVersion: intent\.expectedVersion,/);
  assert.match(operations, /cause\.code === "VERSION_CONFLICT"/);
  assert.match(operations, /clearMutationIntent\(LOCATION_INTENT_STORAGE_KEY\)/);
  assert.match(operations, /changed in another window/);
});
