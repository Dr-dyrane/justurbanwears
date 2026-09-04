import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  projectStudioAssistantFocus,
  resolveStudioAssistantFocusReference,
} from "../lib/server/studio-assistant-focus";
import {
  resolveStudioAssistantRouteEntry,
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
  }, {
    detail: "34 pieces · active",
    entityId: "11111111-1111-4111-8111-111111111111",
    href: "/studio/wardrobe?collection=drop-02",
    id: "collection:11111111-1111-4111-8111-111111111111",
    identifiers: ["collection:11111111-1111-4111-8111-111111111111", "11111111-1111-4111-8111-111111111111", "drop-02"],
    kind: "Collection",
    label: "Drop 02",
    state: "ACTIVE",
    tokens: "drop-02 drop 2 current drop",
  }, {
    detail: "Violet Beaded Ruffle Romper",
    entityId: "ORD-026",
    href: "/studio/orders/ORD-026",
    id: "order:ORD-026",
    identifiers: ["order:ORD-026", "ORD-026", "JUW-026"],
    kind: "Order",
    label: "ORD-026",
    state: "ACTIVE",
    tokens: "ord-026 juw-026 violet beaded ruffle romper active",
  }, {
    detail: "model try on",
    entityId: "media-026",
    href: "/studio/media/media-026",
    id: "media:media-026",
    identifiers: ["media:media-026", "media-026", "JUW-026"],
    kind: "Media",
    label: "Violet model front",
    state: "COMPLETE",
    tokens: "media-026 juw-026 violet model front complete",
  }, {
    detail: "Approved model authority",
    entityId: "lulu-v4",
    href: "/studio/models?view=authority&model=lulu-v4",
    id: "model:lulu-v4",
    identifiers: ["model:lulu-v4", "lulu-v4"],
    kind: "Model",
    label: "Lulu V4",
    state: "READY",
    tokens: "lulu-v4 lulu v4 ready model",
  }, {
    detail: "Availability, locations, holds and stock count",
    entityId: "inventory",
    href: "/studio/operations?view=inventory",
    id: "service:inventory",
    identifiers: ["service:inventory", "inventory", "stock count"],
    kind: "Service",
    label: "Inventory",
    state: "AVAILABLE",
    tokens: "inventory availability locations holds stock count",
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
  assert.equal(createStudioAssistantThreadSchema.safeParse({ pieceReference: "Violet Beaded Ruffle Romper" }).success, false);
  assert.equal(createStudioAssistantThreadSchema.safeParse({
    idempotencyKey: "ask.thread.create:00000000-0000-4000-8000-000000000001",
    pieceReference: "Violet Beaded Ruffle Romper",
  }).success, true);
  assert.equal(createStudioAssistantThreadSchema.safeParse({
    focusReference: "order:ORD-026",
    idempotencyKey: "ask.thread.create:00000000-0000-4000-8000-000000000002",
  }).success, true);
  assert.equal(updateStudioAssistantThreadSchema.safeParse({
    action: "ARCHIVE",
    expectedVersion: 2,
    idempotencyKey: "ask.thread.archive:00000000-0000-4000-8000-000000000001",
  }).success, true);
  assert.equal(updateStudioAssistantThreadSchema.safeParse({ action: "ARCHIVE" }).success, false);
});

test("route entry and durable focus cover every supported Studio record kind", () => {
  const cases = [
    ["/studio/wardrobe/wardrobe-seed-juw-026", "", "PIECE", "JUW-026"],
    ["/studio/wardrobe", "?collection=drop-02", "DROP", "11111111-1111-4111-8111-111111111111"],
    ["/studio/orders/ORD-026", "", "ORDER", "ORD-026"],
    ["/studio/media/media-026", "", "MEDIA", "media-026"],
    ["/studio/models", "?view=authority&model=lulu-v4", "MODEL", "lulu-v4"],
    ["/studio/operations", "?view=inventory", "SERVICE", "inventory"],
    ["/studio/stocktake", "", "SERVICE", "inventory"],
  ] as const;

  for (const [pathname, search, entityType, reference] of cases) {
    const record = resolveStudioAssistantRouteEntry(context.documents, pathname, search);
    assert.ok(record, `${pathname}${search} should resolve a current Studio record`);
    const focus = resolveStudioAssistantFocusReference(context, record.id);
    assert.equal(focus?.entityType, entityType);
    assert.equal(focus?.reference, reference);
  }

  assert.equal(
    resolveStudioAssistantRouteEntry(context.documents, "/studio/operations", "?view=inventory&piece=JUW-026")?.id,
    "piece:wardrobe-seed-juw-026",
  );
  assert.equal(
    resolveStudioAssistantFocusReference(context, "What can you help with for order:ORD-026?")?.entityType,
    "ORDER",
  );
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
  assert.match(repository, /pageRows\.map\(storedMessage\)/);
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
