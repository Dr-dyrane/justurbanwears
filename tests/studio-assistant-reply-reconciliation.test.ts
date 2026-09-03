import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { reconcileStudioAssistantReplySchema } from "../lib/studio/assistant/threads";

const root = process.cwd();

function source(path: string) {
  return readFileSync(`${root}/${path}`, "utf8");
}

test("reply reconciliation requires the current shared-thread version", () => {
  assert.equal(reconcileStudioAssistantReplySchema.safeParse({ expectedThreadVersion: 3 }).success, true);
  assert.equal(reconcileStudioAssistantReplySchema.safeParse({}).success, false);
  assert.equal(reconcileStudioAssistantReplySchema.safeParse({ expectedThreadVersion: 0 }).success, false);
  assert.equal(reconcileStudioAssistantReplySchema.safeParse({ expectedThreadVersion: 3, retry: true }).success, false);
});

test("orphan reconciliation is atomic, workspace scoped and never replays a turn", () => {
  const repository = source("lib/server/studio-assistant-thread-repository.ts");
  const start = repository.indexOf("export async function reconcileStudioAssistantReply");
  const end = repository.indexOf("export async function updateStudioAssistantThreadFocus", start);
  const reconciliation = repository.slice(start, end);

  assert.match(reconciliation, /with owned_thread as \([\s\S]*?candidate as \([\s\S]*?recovered as \([\s\S]*?touched_thread as \(/);
  assert.match(reconciliation, /workspace_id = \$\{input\.operator\.workspaceId\}::uuid/);
  assert.match(reconciliation, /message\.role = 'assistant'/);
  assert.match(reconciliation, /message\.status = 'PENDING'/);
  assert.match(reconciliation, /candidate\.updated_at <= clock_timestamp\(\) - interval/);
  assert.match(reconciliation, /owned_thread\.version = \$\{input\.expectedThreadVersion\}/);
  assert.match(reconciliation, /status = 'ERROR'/);
  assert.match(reconciliation, /response\.status !== "PENDING"[\s\S]*?"RECOVERED" : "TERMINAL"/);
  assert.match(reconciliation, /return \{ outcome: "RUNNING", thread \}/);
  assert.doesNotMatch(reconciliation, /beginStudioAssistantTurn|createStudioAssistantAgent|createDeterministicStudioAssistantStream|executeTool|sendMessage/);
});

test("the authenticated route and client expose an explicit check, never an automatic retry", () => {
  const route = source("app/api/studio/ask/threads/[id]/messages/[messageId]/reconcile/route.ts");
  const client = source("lib/studio/services/studio-assistant-client.ts");
  const surface = source("components/studio/navigation/studio-ask-surface.tsx");
  const start = surface.indexOf("async function reconcileReply");
  const end = surface.indexOf("const entryPieceAction", start);
  const reconciliation = surface.slice(start, end);

  assert.match(route, /requireStudioOperator\(\)/);
  assert.match(route, /parseEngineJson\(request, reconcileStudioAssistantReplySchema\)/);
  assert.match(route, /reconcileStudioAssistantReply\(/);
  assert.doesNotMatch(route, /Agent|Model|Stream|executeTool|beginStudioAssistantTurn/);
  assert.match(client, /export async function reconcileStudioAssistantReply/);
  assert.match(client, /method: "POST"/);
  assert.match(surface, />\{replyCheckingId === message\.id \? "Checking…" : "Check reply"\}<\/button>/);
  assert.match(surface, />Use question again<\/button>/);
  assert.match(reconciliation, /replyFlightRef\.current/);
  assert.match(reconciliation, /reconcileStudioAssistantReply\(/);
  assert.doesNotMatch(reconciliation, /sendMessage\(|submit\(/);
});
