import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  projectStudioAssistantFocus,
  resolveStudioAssistantFocusReference,
} from "../lib/server/studio-assistant-focus";
import {
  resolveStudioAssistantWorkflow,
  type StudioAssistantContext,
} from "../lib/studio/assistant/experience";
import {
  createStudioAssistantThreadSchema,
  sendStudioAssistantMessageSchema,
  updateStudioAssistantThreadSchema,
} from "../lib/studio/assistant/threads";

const root = process.cwd();
const context: StudioAssistantContext = {
  capabilities: [
    { id: "PROJECTION", state: "AVAILABLE" },
    { id: "SEARCH", state: "AVAILABLE" },
    { id: "ASK_READ", state: "AVAILABLE" },
    { id: "WARDROBE_READ", state: "AVAILABLE" },
  ],
  documents: [{
    detail: "A deep-violet beaded romper framed by soft flounces and an asymmetric ruffled hem.",
    entityId: "wardrobe-seed-juw-026",
    href: "/studio/wardrobe/wardrobe-seed-juw-026",
    id: "piece:wardrobe-seed-juw-026",
    identifiers: ["wardrobe-seed-juw-026", "JUW-026", "Violet Beaded Ruffle Romper"],
    kind: "Piece",
    label: "Violet Beaded Ruffle Romper",
    mediaTargetId: "wardrobe-seed-juw-026",
    state: "PUBLISHED",
    tokens: "wardrobe-seed-juw-026 juw-026 violet beaded ruffle romper deep violet published",
  }],
  provenance: {
    detail: "Connected Studio application snapshot",
    generatedAt: "2026-09-01T12:00:00.000Z",
    label: "Live Studio",
    status: "connected",
  },
  summary: { attention: 0, available: 1, drafts: 0, live: 1, orders: 0, review: 0 },
};

test("thread contracts require a durable conversation outside the simulator", () => {
  assert.equal(sendStudioAssistantMessageSchema.safeParse({
    message: { id: "message-1", parts: [{ text: "JUW-026", type: "text" }], role: "user" },
  }).success, false);
  assert.equal(sendStudioAssistantMessageSchema.safeParse({
    message: { id: "message-1", parts: [{ text: "JUW-026", type: "text" }], role: "user" },
    threadId: "0b00e8ec-b0a5-4ea8-84ee-40fae68c644f",
  }).success, true);
  assert.equal(sendStudioAssistantMessageSchema.safeParse({
    message: { id: "message-1", parts: [{ text: "JUW-026", type: "text" }], role: "user" },
    scenario: "lifecycle",
  }).success, true);
  assert.equal(createStudioAssistantThreadSchema.safeParse({ pieceReference: "Violet Beaded Ruffle Romper" }).success, true);
  assert.equal(updateStudioAssistantThreadSchema.safeParse({
    action: "ARCHIVE",
    expectedVersion: 2,
  }).success, true);
  assert.equal(updateStudioAssistantThreadSchema.safeParse({ action: "ARCHIVE" }).success, false);
});

test("thread focus resolves SKU or exact name and refreshes from the current projection", () => {
  const bySku = resolveStudioAssistantFocusReference(context, "juw026");
  const byName = resolveStudioAssistantFocusReference(context, "Violet Beaded Ruffle Romper");
  assert.equal(bySku?.canonicalId, "wardrobe-seed-juw-026");
  assert.deepEqual(byName, bySku);

  const workflow = resolveStudioAssistantWorkflow("JUW-026", context);
  assert.deepEqual(projectStudioAssistantFocus({
    context,
    current: null,
    query: "JUW-026",
    workflow,
  }), bySku);
});

test("the persistence boundary is workspace-owned, attributed and revision guarded", () => {
  const schema = readFileSync(`${root}/db/shop-postgres-schema.ts`, "utf8");
  const repository = readFileSync(`${root}/lib/server/studio-assistant-thread-repository.ts`, "utf8");
  const migration = readFileSync(`${root}/drizzle/shop-postgres/0024_amazing_shiver_man.sql`, "utf8");

  assert.match(schema, /studioAssistantThreads[\s\S]*?workspaceId:[\s\S]*?studioWorkspaces\.id/);
  assert.match(schema, /studioAssistantMessages[\s\S]*?authorDisplayName/);
  assert.match(repository, /eq\(studioAssistantThreads\.workspaceId, operator\.workspaceId\)/);
  assert.match(repository, /updatedBySubject: input\.operator\.actorSubject/);
  assert.match(repository, /eq\(studioAssistantThreads\.version, input\.expectedVersion\)/);
  assert.match(repository, /orderBy\(desc\(studioAssistantMessages\.sequence\)\)/);
  assert.match(repository, /messageRows\.reverse\(\)\.map\(storedMessage\)/);
  assert.match(migration, /CREATE TABLE "studio_assistant_threads"/);
  assert.match(migration, /CREATE TABLE "studio_assistant_messages"/);
  assert.doesNotMatch(migration, /DROP (?:COLUMN|TABLE)/);
});

test("switching a durable conversation seeds the newly keyed chat with its stored messages", () => {
  const surface = readFileSync(`${root}/components/studio/navigation/studio-ask-surface.tsx`, "utf8");
  assert.match(surface, /id: studio\.scenario \? `studio-ask-scenario-/);
  assert.match(surface, /messages: studio\.scenario \? \[\] : activeThread\?\.messages\.map\(\(stored\) => stored\.message\) \?\? \[\]/);
  assert.match(surface, /async function openConversation[\s\S]*?readStudioAssistantThread\(threadId\)[\s\S]*?setActiveThread\(detail\)/);
});
