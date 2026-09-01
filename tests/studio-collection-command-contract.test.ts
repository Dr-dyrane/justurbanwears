import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  studioCollectionCommandRequestSchema,
  studioCollectionIntentSchema,
  type StudioCollectionIntent,
} from "../lib/studio/collections/contracts";
import { StudioEngineError } from "../lib/studio/engine/errors";
import {
  applyStudioCollectionCommand,
  previewStudioCollectionCommand,
} from "../lib/server/studio-collection-repository";
import type { StudioOperator } from "../lib/server/studio-operator";

const root = process.cwd();
const api = readFileSync(`${root}/app/api/studio/collections/route.ts`, "utf8");
const repository = readFileSync(`${root}/lib/server/studio-collection-repository.ts`, "utf8");
const sheet = readFileSync(`${root}/components/studio/collections/studio-drop-sheet.tsx`, "utf8");
const migration = readFileSync(`${root}/drizzle/shop-postgres/0013_flowery_nicolaos.sql`, "utf8");
const css = readFileSync(`${root}/app/studio-stack-navigation.css`, "utf8");

const operator = {
  actorSubject: "actor:collection-policy-test",
  workspaceId: "workspace-juw",
  workspaceSubject: "operator:collection-policy-test",
  subject: "operator:collection-policy-test",
  email: "operator@example.com",
  displayName: "Collection policy test",
  role: "operator",
} as const satisfies StudioOperator;

const fixedCollectionIntents: StudioCollectionIntent[] = [
  { command: "CREATE_COLLECTION", label: "Drop 03" },
  {
    command: "RENAME_COLLECTION",
    collectionId: "00000000-0000-4000-8000-000000000002",
    expectedVersion: 1,
    label: "Renamed Drop 02",
  },
  {
    command: "ACTIVATE_COLLECTION",
    collectionId: "00000000-0000-4000-8000-000000000003",
    expectedVersion: 1,
  },
  {
    command: "ARCHIVE_COLLECTION",
    collectionId: "00000000-0000-4000-8000-000000000002",
    expectedVersion: 1,
  },
];

function assertFixedCollectionError(error: unknown) {
  assert.ok(error instanceof StudioEngineError);
  assert.equal(error.code, "INVALID_TRANSITION");
  assert.equal(error.status, 409);
  assert.match(error.message, /Drop 02|Drop 01 and Drop 02/);
  assert.match(error.recovery, /Use Drop 02 for active work/);
  return true;
}

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

test("fixed collection policy rejects every preview and confirmation before database access", async () => {
  for (const intent of fixedCollectionIntents) {
    await assert.rejects(
      () => previewStudioCollectionCommand(operator, intent),
      assertFixedCollectionError,
    );
    await assert.rejects(
      () => applyStudioCollectionCommand({
        operator,
        intent,
        expectedRevision: "a".repeat(64),
        idempotencyKey: `studio-drop:fixed:${intent.command.toLowerCase()}`,
      }),
      assertFixedCollectionError,
    );
  }
});

test("the drop sheet preserves read selection and counts without collection mutation controls", () => {
  assert.match(sheet, /Drop 02 stays active and Drop 01 stays archived/);
  assert.match(sheet, /\{allCount\} total/);
  assert.match(sheet, /\{collection\.counts\.pieces \?\? "—"\} pieces/);
  assert.match(sheet, /\{privateCount\} pieces/);
  assert.match(sheet, /onSelect\(collection\.key\)/);
  assert.match(sheet, /data-read-only="true"/);
  assert.doesNotMatch(sheet, /studio-drop-new|beginCreate|beginRename/);
  assert.doesNotMatch(sheet, /<strong>Rename<\/strong>|<strong>Activate<\/strong>|<strong>Archive<\/strong>/);
  assert.doesNotMatch(sheet, /aria-label=\{`Manage \$\{collection\.label\}`\}/);
  assert.match(css, /Native Studio surface contract/);
  assert.match(css, /\.studio-drop-row:not\(:last-child\)::after/);
  assert.match(css, /\.studio-settings-group \{[\s\S]*?background: var\(--studio-panel-muted\)/);
  assert.match(css, /\.studio-native-canvas \{[\s\S]*?padding-inline: 0;/);
});
