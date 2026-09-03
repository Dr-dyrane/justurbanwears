import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  studioModelCommandReceiptSchema,
  studioModelCommandRequestFingerprint,
  updateModelAuthoritySchema,
} from "../lib/server/studio-authority-repository";

const root = process.cwd();
const repository = readFileSync(`${root}/lib/server/studio-authority-repository.ts`, "utf8");
const route = readFileSync(`${root}/app/api/studio/models/[id]/route.ts`, "utf8");
const surface = readFileSync(`${root}/components/studio/model-atelier.tsx`, "utf8");
const migration = readFileSync(`${root}/drizzle/shop-postgres/0027_model_command_receipts.sql`, "utf8");

const expectedRevision = "2026-09-03T12:34:56.789Z";
const modelId = "11111111-1111-4111-8111-111111111111";

test("model UPDATE and ARCHIVE require a stable command key and expected revision", () => {
  assert.equal(updateModelAuthoritySchema.safeParse({
    action: "UPDATE",
    name: "Editorial model",
    styling: { direction: "Product first", hair: "Natural", makeup: "Soft" },
  }).success, false);
  assert.equal(updateModelAuthoritySchema.safeParse({
    action: "UPDATE",
    expectedRevision,
    idempotencyKey: "studio-model:update:test-001",
    name: "Editorial model",
    styling: { direction: "Product first", hair: "Natural", makeup: "Soft" },
  }).success, true);
  assert.equal(updateModelAuthoritySchema.safeParse({
    action: "ARCHIVE",
    expectedRevision,
    idempotencyKey: "studio-model:archive:test-001",
    reason: "Usage authority withdrawn",
  }).success, true);
});

test("model command fingerprint binds the target, revision, action, and payload but not retry transport", () => {
  const command = {
    action: "UPDATE" as const,
    expectedRevision,
    idempotencyKey: "studio-model:update:first",
    name: "Editorial model",
    styling: { direction: "Product first", hair: "Natural", makeup: "Soft" },
  };
  const first = studioModelCommandRequestFingerprint({ modelId, command });
  const retry = studioModelCommandRequestFingerprint({
    modelId,
    command: { ...command, idempotencyKey: "studio-model:update:retry" },
  });
  const changed = studioModelCommandRequestFingerprint({
    modelId,
    command: { ...command, name: "Changed model" },
  });
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first, retry);
  assert.notEqual(first, changed);
});

test("the durable model command receipt is strict and sufficient for exact reconciliation", () => {
  const receipt = {
    schemaVersion: "juw.studio-model-command-receipt.v1",
    receiptId: "22222222-2222-4222-8222-222222222222",
    actorSubject: "admin:lulu",
    modelId,
    action: "ARCHIVE",
    expectedRevision,
    resultingRevision: "2026-09-03T12:35:00.000Z",
    idempotencyKey: "studio-model:archive:test-001",
    requestFingerprint: "a".repeat(64),
    summary: "Model authority withdrawn",
    consequence: "The model is unavailable for new Studio work; existing media remains in history.",
    occurredAt: "2026-09-03T12:35:00.000Z",
  } as const;
  assert.equal(studioModelCommandReceiptSchema.safeParse(receipt).success, true);
  assert.equal(studioModelCommandReceiptSchema.safeParse({ ...receipt, action: "DELETE" }).success, false);
  assert.equal(studioModelCommandReceiptSchema.safeParse({ ...receipt, extra: true }).success, false);
});

test("the repository atom owns concurrency, stale revisions, and exact replay", () => {
  assert.match(migration, /CREATE TABLE "studio_model_command_receipts"/);
  assert.match(migration, /studio_model_command_receipts_actor_idempotency_unique/);
  assert.match(repository, /pg_advisory_xact_lock\(hashtextextended/);
  assert.match(repository, /existing_command as materialized/);
  assert.match(repository, /target as materialized/);
  assert.match(repository, /for update of profile/);
  assert.match(repository, /to_char\(target\.updated_at at time zone 'UTC'/);
  assert.match(repository, /not exists \(select 1 from existing_command\)/);
  assert.match(repository, /select created_receipt\.\* from created_receipt[\s\S]*select existing_command\.\* from existing_command/);
  assert.match(repository, /receipt\.requestFingerprint !== requestFingerprint/);
});

test("the Models UI accepts only its exact receipt and reconciles a dropped response", () => {
  assert.match(route, /export async function GET/);
  assert.match(route, /readStudioModelCommandReceipt/);
  assert.match(route, /return engineJson\(await updateStudioModelAuthority/);
  assert.match(surface, /getOrCreateSessionCommandKey/);
  assert.match(surface, /modelReceiptMatchesCommand/);
  assert.match(surface, /reconcileModelCommand/);
  assert.match(surface, /\?idempotencyKey=/);
  assert.match(surface, /clearSessionCommandKey/);
  assert.match(surface, /expectedRevision: model\.authorityRevision/);
  assert.match(surface, /expectedRevision: selected\.authorityRevision/);
});
