import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();

test("conversation lifecycle commands are replay-safe at the database boundary", () => {
  const schema = readFileSync(`${root}/db/shop-postgres-schema.ts`, "utf8");
  const migration = readFileSync(`${root}/drizzle/shop-postgres/0031_studio_assistant_thread_commands.sql`, "utf8");
  const repository = readFileSync(`${root}/lib/server/studio-assistant-thread-repository.ts`, "utf8");

  assert.match(schema, /studioAssistantThreadCommands[\s\S]*?workspaceId[\s\S]*?idempotencyKey[\s\S]*?requestFingerprint/);
  assert.match(migration, /CREATE TABLE "studio_assistant_thread_commands"/);
  assert.match(migration, /studio_assistant_thread_commands_workspace_idempotency_unique/);
  assert.match(repository, /createStudioAssistantThread[\s\S]*?pg_advisory_xact_lock[\s\S]*?existing_command[\s\S]*?created_thread[\s\S]*?created_command/);
  assert.match(repository, /updateStudioAssistantThread[\s\S]*?pg_advisory_xact_lock[\s\S]*?existing_command[\s\S]*?mutation[\s\S]*?created_command/);
  assert.match(repository, /command\.request_fingerprint !== requestFingerprint/);
});

test("the connected UI preserves the visible conversation until durable creation succeeds", () => {
  const surface = readFileSync(`${root}/components/studio/navigation/studio-ask-surface.tsx`, "utf8");

  const resetStart = surface.indexOf("async function resetConversation(");
  const openStart = surface.indexOf("async function openConversation", resetStart);
  const reset = surface.slice(resetStart, openStart);
  const createIndex = reset.indexOf("await createStudioAssistantThread");

  assert.ok(createIndex > 0);
  assert.ok(reset.indexOf("setActiveThread(detail)") > createIndex);
  assert.ok(reset.indexOf("setMessages([])", createIndex) > createIndex);
  assert.match(reset, /if \(threadActionFlightRef\.current\) return;[\s\S]*?threadActionFlightRef\.current = true/);
  assert.match(reset, /catch \(threadCreateError\)[\s\S]*?current conversation is unchanged/);
  assert.match(surface, /footer=\{\(\) => \([\s\S]*?disabled=\{threadBusy\}[\s\S]*?void resetConversation\(\)/);
});

test("new, resume, rename, archive and restore share a synchronous client flight guard", () => {
  const surface = readFileSync(`${root}/components/studio/navigation/studio-ask-surface.tsx`, "utf8");

  assert.match(surface, /const threadActionFlightRef = useRef\(false\)/);
  assert.match(surface, /async function openConversation[\s\S]*?threadActionFlightRef\.current = true[\s\S]*?readStudioAssistantThread/);
  assert.match(surface, /const lifecycle = action\.action === "RENAME" \|\| action\.action === "ARCHIVE" \|\| action\.action === "RESTORE"/);
  assert.match(surface, /getOrCreateSessionCommandKey[\s\S]*?ask\.thread\.\$\{action\.action\.toLowerCase\(\)\}/);
  assert.match(surface, /clearSessionCommandKey\(\{ key: idempotencyKey, revision: commandRevision, scope: commandScope \}\)/);
});
