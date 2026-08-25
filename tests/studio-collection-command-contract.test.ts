import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  studioCollectionCommandRequestSchema,
  studioCollectionIntentSchema,
} from "../lib/studio/collections/contracts";

const root = process.cwd();
const api = readFileSync(`${root}/app/api/studio/collections/route.ts`, "utf8");
const repository = readFileSync(`${root}/lib/server/studio-collection-repository.ts`, "utf8");
const sheet = readFileSync(`${root}/components/studio/collections/studio-drop-sheet.tsx`, "utf8");
const migration = readFileSync(`${root}/drizzle/shop-postgres/0013_flowery_nicolaos.sql`, "utf8");
const css = readFileSync(`${root}/app/studio-stack-navigation.css`, "utf8");

test("drop commands require a typed preview and exact confirmation", () => {
  assert.equal(studioCollectionIntentSchema.safeParse({ command: "CREATE_COLLECTION", label: "Drop 03" }).success, true);
  assert.equal(studioCollectionIntentSchema.safeParse({ command: "CREATE_COLLECTION", label: "" }).success, false);
  assert.equal(studioCollectionCommandRequestSchema.safeParse({
    phase: "CONFIRM",
    confirmation: "CREATE_COLLECTION",
    expectedRevision: "a".repeat(64),
    idempotencyKey: "studio-drop:create:one",
    intent: { command: "CREATE_COLLECTION", label: "Drop 03" },
  }).success, true);
  assert.equal(studioCollectionCommandRequestSchema.safeParse({
    phase: "CONFIRM",
    confirmation: "ARCHIVE_COLLECTION",
    expectedRevision: "a".repeat(64),
    idempotencyKey: "studio-drop:create:one",
    intent: { command: "CREATE_COLLECTION", label: "Drop 03" },
  }).success, false);
});

test("the API and repository keep preview, idempotency and durable receipts together", () => {
  assert.match(api, /phase === "PREVIEW"/);
  assert.match(api, /applyStudioCollectionCommand/);
  assert.match(repository, /pg_advisory_xact_lock/);
  assert.match(repository, /idempotency_key/);
  assert.match(repository, /before_state, after_state/);
  assert.match(repository, /VERSION_CONFLICT/);
  assert.match(migration, /CREATE TABLE "studio_collection_commands"/);
  assert.match(migration, /studio_collection_commands_operator_idempotency_unique/);
});

test("one flat sheet renders browse, preview, recovery and receipt states", () => {
  assert.match(sheet, /New drop/);
  assert.match(sheet, /"pending" \| "preview" \| "receipt" \| "error"/);
  assert.match(sheet, /idempotencyKeyRef\.current \?\?=/);
  assert.match(sheet, /Try again/);
  assert.match(sheet, /Open \{receipt\.collection\.label\}/);
  assert.match(css, /Native Studio surface contract/);
  assert.match(css, /\.studio-drop-row:not\(:last-child\)::after/);
  assert.match(css, /\.studio-settings-section:not\(:last-of-type\)::after/);
  assert.match(css, /\.studio-native-canvas \{[\s\S]*?padding-inline: 0;/);
});
