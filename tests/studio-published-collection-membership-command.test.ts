import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  studioCollectionCommandRequestSchema,
  studioCollectionIntentSchema,
} from "../lib/studio/collections/contracts";
import { previewStudioCollectionCommand } from "../lib/server/studio-collection-repository";
import { StudioEngineError } from "../lib/studio/engine/errors";

const root = process.cwd();
const contracts = readFileSync(`${root}/lib/studio/collections/contracts.ts`, "utf8");
const applicationContracts = readFileSync(`${root}/lib/studio/application/contracts.ts`, "utf8");
const repository = readFileSync(`${root}/lib/server/studio-collection-repository.ts`, "utf8");
const schema = readFileSync(`${root}/db/shop-postgres-schema.ts`, "utf8");
const migration = readFileSync(`${root}/drizzle/shop-postgres/0022_melodic_crusher_hogan.sql`, "utf8");

const destinationId = "00000000-0000-4000-8000-000000000001";
const intent = {
  command: "CORRECT_PUBLISHED_COLLECTION_MEMBERSHIP" as const,
  sku: "JUW-026",
  collectionId: destinationId,
  expectedVersion: 3,
};

test("published drop correction requires elevated Studio permission", async () => {
  await assert.rejects(
    () => previewStudioCollectionCommand({
      actorSubject: "operator-actor",
      displayName: "Operator",
      email: "operator@example.com",
      role: "operator",
      subject: "studio-workspace",
      workspaceId: "studio-workspace",
      workspaceSubject: "studio-workspace",
    }, intent),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "OPERATOR_FORBIDDEN"
      && error.status === 403,
  );
});

test("published drop correction uses the existing typed preview and confirmation envelope", () => {
  assert.equal(studioCollectionIntentSchema.safeParse(intent).success, true);
  assert.equal(studioCollectionIntentSchema.safeParse({ ...intent, sku: "026" }).success, false);
  assert.equal(studioCollectionIntentSchema.safeParse({ ...intent, expectedVersion: 0 }).success, false);
  assert.equal(studioCollectionCommandRequestSchema.safeParse({
    phase: "PREVIEW",
    intent,
  }).success, true);
  assert.equal(studioCollectionCommandRequestSchema.safeParse({
    phase: "CONFIRM",
    confirmation: intent.command,
    expectedRevision: "a".repeat(64),
    idempotencyKey: "studio-drop:juw-026:drop-01",
    intent,
  }).success, true);
  assert.equal(studioCollectionCommandRequestSchema.safeParse({
    phase: "CONFIRM",
    confirmation: "ARCHIVE_COLLECTION",
    expectedRevision: "a".repeat(64),
    idempotencyKey: "studio-drop:juw-026:drop-01",
    intent,
  }).success, false);
});

test("collection projection exposes exact ordered catalogue membership", () => {
  assert.match(applicationContracts, /memberSkus: string\[\]/);
  assert.match(repository, /jsonb_agg\(catalogue\.sku order by catalogue\.sku\)/);
  assert.match(repository, /memberSkus: stringArray\(row\.member_skus/);
  assert.match(contracts, /sourceCollection: StudioCollectionReference/);
  assert.match(contracts, /destinationCollection: StudioCollectionReference/);
  assert.match(contracts, /publicationState: "PUBLISHED" \| "ARCHIVED"/);
  assert.match(contracts, /inventory:[\s\S]*?consequence: string/);
});

test("published membership correction is exact, audited, and custody preserving", () => {
  const branch = repository.slice(
    repository.indexOf('if (intent.command === "CORRECT_PUBLISHED_COLLECTION_MEMBERSHIP") {', repository.indexOf("let result")),
    repository.indexOf('} else if (intent.command === "CREATE_COLLECTION")'),
  );
  assert.match(branch, /catalogue\.collection_id = \$\{source\.id\}::uuid/);
  assert.match(branch, /source\.version = \$\{source\.version\}/);
  assert.match(branch, /source\.state = \$\{source\.state\}::shop_collection_state/);
  assert.match(branch, /catalogue\.drop_label = \$\{source\.label\}/);
  assert.match(repository, /catalogue\.updated_at::text as catalogue_revision/);
  assert.match(branch, /catalogue\.updated_at = \$\{preparedMembership\.catalogueRevision\}::timestamptz/);
  assert.match(branch, /publication\.state = \$\{membership\.publicationState\}/);
  assert.match(branch, /collection\.version = \$\{intent\.expectedVersion\}/);
  assert.match(branch, /set collection_id = destination\.id,[\s\S]*?drop_label = destination\.label/);
  assert.match(branch, /insert into studio_collection_commands/);
  assert.match(branch, /before_state, after_state/);
  assert.doesNotMatch(branch, /update shop_inventory/);
  assert.doesNotMatch(branch, /update shop_orders/);
  assert.doesNotMatch(branch, /\bmedia\s*=/);
  assert.match(repository, /will leave the current Shop/);
  assert.match(repository, /will join the current Shop/);
  assert.match(repository, /row\.publication_state === "PUBLISHED" \|\| row\.publication_state === "ARCHIVED"/);
  assert.match(repository, /archived publication remains unavailable/);
  assert.match(repository, /inventory record stays unchanged/);
  assert.doesNotMatch(repository, /row\.publication_state === "UNPUBLISHED"/);
});

test("the durable command ledger accepts the correction without weakening other command constraints", () => {
  for (const source of [schema, migration]) {
    assert.match(source, /CORRECT_PUBLISHED_COLLECTION_MEMBERSHIP/);
    assert.match(source, /CREATE_COLLECTION/);
    assert.match(source, /RENAME_COLLECTION/);
    assert.match(source, /ACTIVATE_COLLECTION/);
    assert.match(source, /ARCHIVE_COLLECTION/);
  }
  assert.match(migration, /DROP CONSTRAINT "studio_collection_commands_known"/);
  assert.match(migration, /ADD CONSTRAINT "studio_collection_commands_known" CHECK/);
});
