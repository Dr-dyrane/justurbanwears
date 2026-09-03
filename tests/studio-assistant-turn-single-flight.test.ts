import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { StudioAssistantUIMessage } from "../lib/ai/studio-assistant-agent";
import { studioAssistantTurnContentFingerprint } from "../lib/server/studio-assistant-thread-repository";

const root = process.cwd();

function source(path: string) {
  return readFileSync(`${root}/${path}`, "utf8");
}

test("turn content fingerprints bind normalized user content", () => {
  const first = {
    id: "message-one",
    parts: [{ text: "What is JUW-026's description?", type: "text" }],
    role: "user",
  } as StudioAssistantUIMessage;
  const sameContent = { ...first, id: "message-two" };
  const differentContent = {
    ...first,
    parts: [{ text: "What is JUW-026's price?", type: "text" }],
  } as StudioAssistantUIMessage;

  assert.equal(
    studioAssistantTurnContentFingerprint(first),
    studioAssistantTurnContentFingerprint(sameContent),
  );
  assert.notEqual(
    studioAssistantTurnContentFingerprint(first),
    studioAssistantTurnContentFingerprint(differentContent),
  );
});

test("prior tool results retain bounded facts but remove actor and hold PII before model conversion", () => {
  const route = source("app/api/studio/ask/route.ts");

  assert.match(route, /function stripSensitiveToolKeys/);
  assert.match(route, /normalized\.includes\("email"\)/);
  assert.match(route, /normalized\.includes\("phone"\)/);
  assert.match(route, /normalized\.includes\("address"\)/);
  assert.match(route, /normalized === "contact"/);
  assert.match(route, /normalized\.startsWith\("customer"\)/);
  assert.match(route, /studioAssistantToolOutputSchema\.safeParse\(stripSensitiveToolKeys\(value\)\)/);
  assert.match(route, /SAFE_PRIOR_TOOL_FIELDS\[record\.type\]\.has\(field\.label\)/);
  assert.match(route, /field\.label === "Hold"[\s\S]*?"Active customer hold"/);
  assert.match(route, /media: \[\]/);
  assert.match(route, /prompt: null/);
  assert.match(route, /createdBy: \{ displayName: "Studio operator" \}/);
  assert.match(route, /export function sanitizeStudioAssistantHistoryForModel/);
});

test("beginTurn atomically claims the user and one pending assistant response", () => {
  const repository = source("lib/server/studio-assistant-thread-repository.ts");

  assert.match(repository, /export async function beginStudioAssistantTurn/);
  assert.match(repository, /with owned_thread as \([\s\S]*?claimed_user as \([\s\S]*?claimed_response as \(/);
  assert.match(repository, /parts = \$\{parts\}::jsonb/);
  assert.match(repository, /on conflict \(thread_id, id\) do update[\s\S]*?updated_at = studio_assistant_messages\.updated_at/);
  assert.match(repository, /returning id, role, status, \(xmax = 0\) as acquired/);
  assert.match(repository, /databaseBoolean\(row\.response_acquired\) \? "ACQUIRED" : row\.response_status/);
  assert.match(repository, /eq\(studioAssistantMessages\.status, "PENDING"\)/);
  assert.doesNotMatch(
    repository.slice(repository.indexOf("export async function saveStudioAssistantResponse"), repository.indexOf("export async function updateStudioAssistantThreadFocus")),
    /insert\(studioAssistantMessages\)/,
  );
});

test("the route replays or joins an existing turn before any paid model call", () => {
  const route = source("app/api/studio/ask/route.ts");
  const singleFlightBranch = route.indexOf('if (turn.kind !== "ACQUIRED")');
  const modelCall = route.indexOf("createStudioAssistantAgent(");

  assert.ok(singleFlightBranch > 0 && modelCall > singleFlightBranch);
  assert.match(route, /claimedResponse\?\.status === "COMPLETE"[\s\S]*?replayStudioAssistantResponse/);
  assert.match(route, /claimedResponse\?\.status === "PENDING"[\s\S]*?joinExistingStudioAssistantTurn/);
  assert.match(route, /const originalMessages = dedupedCompleteMessages\(executionThread\)/);
  assert.match(route, /uiMessages: sanitizeStudioAssistantHistoryForModel\(originalMessages\)/);
  assert.match(route, /totalMs: 20_000/);
  assert.doesNotMatch(route, /totalMs: 30_000/);
});

test("an orphaned reply can only be checked through the non-generating reconciliation route", () => {
  const route = source("app/api/studio/ask/threads/[id]/messages/[messageId]/reconcile/route.ts");
  const repository = source("lib/server/studio-assistant-thread-repository.ts");

  assert.match(route, /export async function POST/);
  assert.match(route, /reconcileStudioAssistantReply/);
  assert.doesNotMatch(route, /createStudioAssistantAgent|createAgentUIStreamResponse|beginStudioAssistantTurn/);
  assert.match(repository, /candidate\.updated_at <= clock_timestamp\(\) - interval/);
  assert.match(repository, /status = 'ERROR'/);
});
