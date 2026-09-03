import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  garmentRevisionMediaCommandSchema,
  garmentRevisionMediaReceiptSchema,
  type GarmentRevisionMediaRole,
} from "../lib/studio/engine/garment-lifecycle-contracts";

const root = process.cwd();
const source = (path: string) => readFileSync(`${root}/${path}`, "utf8");

const route = source("app/api/studio/wardrobe/[id]/lifecycle/media/route.ts");
const service = source("lib/studio/engine/garment-lifecycle-service.ts");
const repository = source("lib/server/studio-garment-lifecycle-repository.ts");
const panel = source("components/studio/garment-lifecycle-panel.tsx");

function functionBody(contents: string, name: string) {
  const start = contents.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} is missing`);
  const nextExport = contents.indexOf("\nexport async function ", start + 1);
  return contents.slice(start, nextExport >= 0 ? nextExport : undefined);
}

const expectedPublicationRevision = "a".repeat(64);
const mediaSha256 = "b".repeat(64);
const requestFingerprint = "c".repeat(64);
const wardrobeItemId = "00000000-0000-0000-0000-000000000026";
const receiptId = "00000000-0000-4000-8000-000000000026";

test("the media command requires one stable identity and the exact item, draft, publication, and role expectations", () => {
  const roles: GarmentRevisionMediaRole[] = ["GARMENT_FRONT", "GARMENT_BACK", "FABRIC_DETAIL"];
  for (const role of roles) {
    assert.equal(garmentRevisionMediaCommandSchema.safeParse({
      expectedDraftVersion: 4,
      expectedItemVersion: 8,
      expectedPublicationRevision,
      idempotencyKey: `studio-media:${role.toLowerCase()}:stable`,
      role,
    }).success, true, `${role} must use the same guarded command contract`);
  }

  assert.equal(garmentRevisionMediaCommandSchema.safeParse({
    expectedDraftVersion: 4,
    expectedItemVersion: 8,
    expectedPublicationRevision,
    role: "GARMENT_BACK",
  }).success, false, "idempotency identity must not be optional");
  assert.equal(garmentRevisionMediaCommandSchema.safeParse({
    expectedItemVersion: 8,
    expectedPublicationRevision,
    idempotencyKey: "studio-media:missing-draft-expectation",
    role: "GARMENT_BACK",
  }).success, false, "the expected draft version field must be present even when its value is null");

  assert.equal(garmentRevisionMediaReceiptSchema.safeParse({
    actorSubject: "actor-lulu",
    command: "REPLACE_MEDIA",
    consequence: "The private media changed; Shop did not.",
    expectedDraftVersion: 4,
    expectedItemVersion: 8,
    expectedPublicationRevision,
    idempotencyKey: "studio-media:receipt:stable",
    mediaRole: "FABRIC_DETAIL",
    mediaSha256,
    occurredAt: "2026-09-02T20:15:00.000Z",
    receiptId,
    requestFingerprint,
    result: "PRIVATE_MEDIA_REPLACED",
    resultingDraftVersion: 5,
    resultingItemVersion: 8,
    schemaVersion: "juw.studio-garment-media-command-receipt.v1",
    summary: "Fabric detail replaced privately",
    wardrobeItemId,
  }).success, true);
});

test("the service fingerprints the target, item, draft, publication, role, and verified bytes before one repository command", () => {
  const media = functionBody(service, "replaceGarmentRevisionMedia");
  const fingerprintContract = functionBody(service, "garmentRevisionMediaRequestFingerprint");
  const fingerprintStart = media.indexOf("const requestFingerprint");
  const repositoryCall = media.indexOf("replaceGarmentRevisionMediaAtomically", fingerprintStart);
  assert.ok(fingerprintStart >= 0 && repositoryCall > fingerprintStart, "fingerprinting must precede the write command");
  const fingerprint = media.slice(fingerprintStart, repositoryCall);

  assert.match(fingerprint, /garmentRevisionMediaRequestFingerprint\(\{/);
  assert.match(fingerprint, /wardrobeItemId:\s*input\.wardrobeItemId/);
  assert.match(fingerprint, /command:\s*input\.command/);
  assert.match(fingerprint, /mediaSha256/);
  assert.match(fingerprintContract, /schemaVersion:\s*"juw\.studio-garment-media-command\.v1"/);
  assert.match(fingerprintContract, /wardrobeItemId:\s*input\.wardrobeItemId/);
  assert.match(fingerprintContract, /expectedItemVersion:\s*input\.command\.expectedItemVersion/);
  assert.match(fingerprintContract, /expectedDraftVersion:\s*input\.command\.expectedDraftVersion/);
  assert.match(fingerprintContract, /expectedPublicationRevision:\s*input\.command\.expectedPublicationRevision/);
  assert.match(fingerprintContract, /role:\s*input\.command\.role/);
  assert.match(fingerprintContract, /mediaSha256:\s*input\.mediaSha256/);

  assert.match(media, /replaceGarmentRevisionMediaAtomically\(\{/);
  assert.doesNotMatch(media, /saveWardrobeCapture\(/, "capture rows must not be written before the guarded repository command");
  assert.doesNotMatch(media, /addStudioAsset\(/, "asset rows must not be written before the guarded repository command");
  assert.doesNotMatch(media, /replaceWardrobeApprovedFront\(/, "front assignment must not escape the guarded repository command");
  assert.doesNotMatch(media, /updateDraftGarmentRevision\(/, "draft CAS must be part of the same repository command");
  assert.doesNotMatch(media, /appendGarmentEvent\(/, "receipt history must be part of the same repository command");
});

test("the repository serializes media replacement and emits its receipt in one guarded SQL statement", () => {
  const atomic = functionBody(repository, "buildGarmentRevisionMediaAtomicQuery");
  const command = functionBody(repository, "replaceGarmentRevisionMediaAtomically");
  assert.match(command, /getStudioDb\(\)\)\.execute\([\s\S]*buildGarmentRevisionMediaAtomicQuery\(input\)/, "media replacement must execute its one SQL statement");
  assert.ok((atomic.match(/pg_advisory_xact_lock/g) ?? []).length >= 2, "piece and command locks must both be acquired");
  assert.match(atomic, /studioWardrobeItemLockKey\(input\.operatorSubject, input\.wardrobeItemId\)/);
  assert.match(atomic, /input\.identity\.idempotencyKey/);
  assert.match(atomic, /existing_command as materialized/);
  assert.match(atomic, /requestFingerprint/);
  assert.match(atomic, /input\.expectedItemVersion/);
  assert.match(atomic, /input\.expectedDraftVersion/);
  assert.match(atomic, /input\.expectedPublicationRevision/);
  assert.match(atomic, /studio_pending_product_captures/);
  assert.match(atomic, /studio_assets/);
  assert.match(atomic, /studio_garment_revisions/);
  assert.match(atomic, /not exists \(select 1 from existing_command\)/);
  assert.match(atomic, /'MEDIA_REPLACED'/);
  assert.match(atomic, /'commandReceipt'/);
  assert.match(atomic, /'PRIVATE_MEDIA_REPLACED'/);
  assert.match(repository, /GARMENT_MEDIA_COMMAND_RECEIPT_SCHEMA_VERSION\s*=\s*"juw\.studio-garment-media-command-receipt\.v1"/);
  assert.match(atomic, /GARMENT_MEDIA_COMMAND_RECEIPT_SCHEMA_VERSION/);
  assert.match(atomic, /select 'APPLIED' as result_kind/);
  assert.match(atomic, /select 'EXISTING' as result_kind/);
});

test("the authenticated media route accepts the guarded command and exposes exact receipt reconciliation", () => {
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function POST/);
  assert.match(route, /requireStudioOperator/);
  assert.match(route, /garmentRevisionMediaReceiptQuerySchema/);
  assert.match(route, /getGarmentRevisionMediaReceipt/);
  assert.match(route, /form\.get\("expectedDraftVersion"\)/);
  assert.match(route, /form\.get\("expectedItemVersion"\)/);
  assert.match(route, /form\.get\("expectedPublicationRevision"\)/);
  assert.match(route, /form\.get\("idempotencyKey"\)/);
  assert.match(route, /garmentRevisionMediaCommandSchema\.safeParse/);
  assert.match(route, /replaceGarmentRevisionMedia\(\{/);
});

test("the client persists one role-scoped command and treats only a durable receipt as reconciliation", () => {
  const media = functionBody(panel, "replaceMedia");
  assert.match(media, /commandInFlightRef\.current/);
  assert.match(media, /getOrCreateSessionCommandKey\(\{/);
  assert.match(media, /`garment-media:\$\{wardrobeItemId\}:\$\{role\}`/);
  assert.match(media, /const revision = `\$\{role\}:\$\{mediaSha256\}`/);
  assert.match(media, /body\.set\("expectedDraftVersion"/);
  assert.match(media, /body\.set\("expectedItemVersion"/);
  assert.match(media, /body\.set\("expectedPublicationRevision"/);
  assert.match(media, /body\.set\("idempotencyKey", idempotencyKey\)/);
  assert.match(media, /lifecycle\/media\?idempotencyKey=/);
  assert.match(panel, /function mediaReceiptMatchesCommand\(/);
  assert.match(panel, /receipt\.wardrobeItemId === wardrobeItemId/);
  assert.match(panel, /receipt\.mediaRole === command\.mediaRole/);
  assert.match(panel, /receipt\.mediaSha256 === command\.mediaSha256/);
  assert.match(panel, /receipt\.expectedItemVersion === command\.expectedItemVersion/);
  assert.match(panel, /receipt\.expectedDraftVersion === command\.expectedDraftVersion/);
  assert.match(panel, /receipt\.expectedPublicationRevision === command\.expectedPublicationRevision/);
  assert.match(media, /mediaReceiptMatchesCommand\(reconciled\.receipt, commandIdentity, wardrobeItemId\)/);
  assert.match(media, /clearSessionCommandKey\(\{/);
  assert.doesNotMatch(media, /readWorkspace\(/, "a changed projection is not proof that this command succeeded");
  assert.doesNotMatch(media, /itemVersion\s*>\s*expectedVersion/, "version drift is not a command receipt");
});
