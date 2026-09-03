import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  garmentLifecycleCommandReceiptSchema,
  garmentLifecycleCommandSchema,
} from "../lib/studio/engine/garment-lifecycle-contracts";
import { garmentLifecycleCommandRequestFingerprint } from "../lib/studio/engine/garment-lifecycle-service";

const root = process.cwd();
const repository = readFileSync(`${root}/lib/server/studio-garment-lifecycle-repository.ts`, "utf8");
const service = readFileSync(`${root}/lib/studio/engine/garment-lifecycle-service.ts`, "utf8");

const facts = {
  title: "Violet Beaded Mini Dress",
  description: "A deep-violet beaded mini dress framed by soft flounces.",
  category: "Dress" as const,
  colour: "Deep violet",
  sizeLabel: "S,M",
  condition: "New",
  price: 30_599,
};

test("SAVE_FACTS and ARCHIVE accept optional durable keys without breaking legacy callers", () => {
  assert.equal(garmentLifecycleCommandSchema.safeParse({
    command: "SAVE_FACTS",
    expectedVersion: 3,
    facts,
  }).success, true);
  assert.equal(garmentLifecycleCommandSchema.safeParse({
    command: "SAVE_FACTS",
    expectedVersion: 3,
    facts,
    idempotencyKey: "ask.piece_edit.thread-message-026",
  }).success, true);
  assert.equal(garmentLifecycleCommandSchema.safeParse({
    command: "ARCHIVE",
    confirmation: "ARCHIVE",
    expectedVersion: 4,
  }).success, true);
  assert.equal(garmentLifecycleCommandSchema.safeParse({
    command: "ARCHIVE",
    confirmation: "ARCHIVE",
    expectedVersion: 4,
    idempotencyKey: "ask.archive.thread-message-026",
  }).success, true);
  assert.equal(garmentLifecycleCommandSchema.safeParse({
    command: "SAVE_FACTS",
    expectedVersion: 3,
    facts,
    idempotencyKey: "bad key",
  }).success, false);
});

test("command identity binds exact target, expected version and payload but not retry transport", () => {
  const first = garmentLifecycleCommandRequestFingerprint({
    wardrobeItemId: "11111111-1111-4111-8111-111111111111",
    command: {
      command: "SAVE_FACTS",
      expectedVersion: 3,
      facts,
      idempotencyKey: "ask.piece_edit.first",
    },
  });
  const retry = garmentLifecycleCommandRequestFingerprint({
    wardrobeItemId: "11111111-1111-4111-8111-111111111111",
    command: {
      command: "SAVE_FACTS",
      expectedVersion: 3,
      facts,
      idempotencyKey: "ask.piece_edit.retry-transport",
    },
  });
  const changed = garmentLifecycleCommandRequestFingerprint({
    wardrobeItemId: "11111111-1111-4111-8111-111111111111",
    command: {
      command: "SAVE_FACTS",
      expectedVersion: 3,
      facts: { ...facts, price: 31_000 },
      idempotencyKey: "ask.piece_edit.first",
    },
  });
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first, retry);
  assert.notEqual(first, changed);
});

test("the exact persisted receipt is strict, attributable and sufficient for reconciliation", () => {
  const receipt = {
    actorSubject: "admin:lulu",
    command: "SAVE_FACTS",
    consequence: "The private garment revision is saved.",
    expectedVersion: 3,
    idempotencyKey: "ask.piece_edit.thread-message-026",
    occurredAt: "2026-09-01T18:00:00.000Z",
    receiptId: "22222222-2222-4222-8222-222222222222",
    requestFingerprint: "a".repeat(64),
    result: "PRIVATE_REVISION_SAVED",
    resultingVersion: 4,
    schemaVersion: "juw.studio-garment-lifecycle-command-receipt.v1",
    summary: "Private revision saved",
    wardrobeItemId: "11111111-1111-4111-8111-111111111111",
  } as const;
  assert.equal(garmentLifecycleCommandReceiptSchema.safeParse(receipt).success, true);
  assert.equal(garmentLifecycleCommandReceiptSchema.safeParse({ ...receipt, command: "DELETE" }).success, false);
  assert.equal(garmentLifecycleCommandReceiptSchema.safeParse({ ...receipt, extra: true }).success, false);
  assert.equal(garmentLifecycleCommandReceiptSchema.safeParse({
    ...receipt,
    wardrobeItemId: "caecbc82-ea6d-c870-ece1-0f680551f218",
  }).success, true);
});

test("the existing event ledger atomically owns SAVE_FACTS and ARCHIVE receipts", () => {
  assert.match(repository, /findGarmentLifecycleCommandReceipt/);
  assert.match(repository, /details->'commandReceipt'->>'idempotencyKey'/);
  assert.match(repository, /pg_advisory_xact_lock\(hashtextextended/);
  assert.match(repository, /existing_command as materialized/);
  assert.match(repository, /not exists \(select 1 from existing_command\)/);
  assert.match(repository, /select 'APPLIED' as result_kind, receipt from event[\s\S]*?select 'EXISTING' as result_kind, receipt from existing_command/);
  assert.match(repository, /requestFingerprint[\s\S]*?resultingVersion[\s\S]*?schemaVersion/);
  assert.match(repository, /createDraftGarmentRevisionIdempotently/);
  assert.match(repository, /updateDraftGarmentRevisionIdempotently/);
  assert.match(repository, /updatePrivateGarmentFactsIdempotently/);
  assert.match(repository, /archiveGarmentIdempotently/);
  assert.equal((repository.match(/'actorSubject', \$\{input\.identity\.actorSubject\}::text/g) ?? []).length, 4);
  assert.equal((repository.match(/'command', \$\{input\.identity\.command\}::text/g) ?? []).length, 4);
  assert.equal((repository.match(/'consequence', \$\{consequence\}::text/g) ?? []).length, 4);
  assert.equal((repository.match(/'expectedVersion', \$\{input\.expectedVersion\}::integer/g) ?? []).length, 4);
  assert.equal((repository.match(/'idempotencyKey', \$\{input\.identity\.idempotencyKey\}::text/g) ?? []).length, 4);
  assert.equal((repository.match(/'requestFingerprint', \$\{input\.identity\.requestFingerprint\}::text/g) ?? []).length, 4);
  assert.equal((repository.match(/'schemaVersion', \$\{GARMENT_LIFECYCLE_COMMAND_RECEIPT_SCHEMA_VERSION\}::text/g) ?? []).length, 4);
  assert.doesNotMatch(repository, /create table|alter table/i);
});

test("the service reuses exact receipts before mutation and rejects key collisions", () => {
  assert.match(service, /getGarmentLifecycleCommandReceipt/);
  assert.match(service, /existing\.requestFingerprint !== identity\.requestFingerprint/);
  assert.match(service, /IDEMPOTENCY_CONFLICT/);
  assert.match(service, /updatePrivateGarmentFactsIdempotently/);
  assert.match(service, /createDraftGarmentRevisionIdempotently/);
  assert.match(service, /updateDraftGarmentRevisionIdempotently/);
  assert.match(service, /archiveGarmentIdempotently/);
  assert.match(service, /identity\s*\?\s*await archiveGarmentIdempotently[\s\S]*?: await archiveGarment/);
  assert.match(
    service,
    /if \(!archiveApplied\)[\s\S]*?currentWorkspace\.itemVersion !== input\.command\.expectedVersion[\s\S]*?VERSION_CONFLICT[\s\S]*?review archive again/,
  );
  assert.match(service, /return getGarmentLifecycleWorkspace\(input\.wardrobeItemId, input\.operator\)/);
});

test("publication reconciliation exposes only the exact current publication key", () => {
  assert.match(service, /export async function getGarmentPublishRevisionReceipt/);
  assert.match(service, /publication\.idempotencyKey !== query\.idempotencyKey/);
  assert.match(service, /sourceRevision: publication\.sourceRevision/);
  assert.match(service, /publishedAt: publication\.publishedAt\.toISOString\(\)/);
  const getter = service.slice(
    service.indexOf("export async function getGarmentPublishRevisionReceipt"),
    service.indexOf("function itemFacts"),
  );
  assert.doesNotMatch(getter, /publication\.state/);
});
