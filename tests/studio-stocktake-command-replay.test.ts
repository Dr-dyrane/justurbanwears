import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  stocktakeCommandReceiptSchema,
  stocktakeCommandRequestFingerprint,
} from "../lib/server/studio-stocktake-repository";

const root = process.cwd();
const repository = readFileSync(`${root}/lib/server/studio-stocktake-repository.ts`, "utf8");
const route = readFileSync(`${root}/app/api/studio/stocktake/route.ts`, "utf8");
const surface = readFileSync(`${root}/components/studio/stocktake-workspace.tsx`, "utf8");
const migration = readFileSync(`${root}/drizzle/shop-postgres/0028_stocktake-command-receipts.sql`, "utf8");

test("stock count fingerprints bind semantics without binding retry transport", () => {
  const first = stocktakeCommandRequestFingerprint({
    command: "CLOSE_COUNT",
    expectedVersion: 9,
    idempotencyKey: "studio-stocktake:close:first",
    stocktakeId: "11111111-1111-4111-8111-111111111111",
  });
  const retry = stocktakeCommandRequestFingerprint({
    command: "CLOSE_COUNT",
    expectedVersion: 9,
    idempotencyKey: "studio-stocktake:close:retry",
    stocktakeId: "11111111-1111-4111-8111-111111111111",
  });
  const stale = stocktakeCommandRequestFingerprint({
    command: "CLOSE_COUNT",
    expectedVersion: 8,
    idempotencyKey: "studio-stocktake:close:first",
    stocktakeId: "11111111-1111-4111-8111-111111111111",
  });
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first, retry);
  assert.notEqual(first, stale);
});

test("stock count receipts are strict and carry actor, revision, and target", () => {
  const receipt = {
    schemaVersion: "juw.studio-stocktake-command-receipt.v1",
    receiptId: "22222222-2222-4222-8222-222222222222",
    actorSubject: "admin:lulu",
    command: "CLOSE_COUNT",
    stocktakeId: "11111111-1111-4111-8111-111111111111",
    expectedVersion: 9,
    resultingVersion: 10,
    idempotencyKey: "studio-stocktake:close:test-001",
    requestFingerprint: "a".repeat(64),
    locationKey: "WARDROBE_RAIL",
    pieceKey: null,
    occurredAt: "2026-09-03T12:35:00.000Z",
  } as const;
  assert.equal(stocktakeCommandReceiptSchema.safeParse(receipt).success, true);
  assert.equal(stocktakeCommandReceiptSchema.safeParse({ ...receipt, command: "DELETE" }).success, false);
  assert.equal(stocktakeCommandReceiptSchema.safeParse({ ...receipt, extra: true }).success, false);
});

test("start and close use one actor-scoped durable command atom", () => {
  assert.match(migration, /CREATE TABLE "studio_stocktake_command_receipts"/);
  assert.match(migration, /studio_stocktake_command_receipts_actor_idempotency_unique/);
  assert.match(repository, /pg_advisory_xact_lock\(hashtextextended/);
  assert.match(repository, /existing_receipt as materialized/);
  assert.match(repository, /not exists \(select 1 from existing_receipt\)/);
  assert.match(repository, /insert into studio_stocktake_command_receipts/);
  assert.match(repository, /receipt\.requestFingerprint !== requestFingerprint/);
  assert.match(repository, /current\.version !== input\.expectedVersion \|\| current\.state === "CLOSED"/);
});

test("the UI keeps a stable key, validates the exact receipt, and reconciles ambiguity", () => {
  assert.match(route, /export async function GET/);
  assert.match(route, /readStocktakeCommandReceipt/);
  assert.match(surface, /getOrCreateSessionCommandKey/);
  assert.match(surface, /pendingRef\.current/);
  assert.match(surface, /commandReceiptMatches/);
  assert.match(surface, /reconcileStocktakeCommand/);
  assert.match(surface, /\?idempotencyKey=/);
  assert.match(surface, /clearSessionCommandKey/);
  assert.doesNotMatch(surface, /function requestKey/);
});
