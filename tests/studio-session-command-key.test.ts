import assert from "node:assert/strict";
import test from "node:test";
import {
  clearSessionCommandKey,
  getOrCreateSessionCommandKey,
  type SessionCommandKeyStorage,
} from "../lib/studio/idempotency/session-command-key";

function memoryStorage(): SessionCommandKeyStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

test("a seller command retains one reload-stable key for the same revision", () => {
  const storage = memoryStorage();
  let sequence = 0;
  const input = {
    keyPrefix: "studio-publish:item-1",
    revision: "revision-7",
    scope: "publication:item-1",
    storage,
    uuid: () => `uuid-${++sequence}`,
  };
  const first = getOrCreateSessionCommandKey(input);
  const remounted = getOrCreateSessionCommandKey(input);

  assert.equal(first, "studio-publish:item-1:uuid-1");
  assert.equal(remounted, first);
  assert.equal(sequence, 1);
});

test("a new authoritative revision rotates the key and stale completion cannot clear it", () => {
  const storage = memoryStorage();
  let sequence = 0;
  const base = {
    keyPrefix: "studio-publish:item-1",
    scope: "publication:item-1",
    storage,
    uuid: () => `uuid-${++sequence}`,
  };
  const stale = getOrCreateSessionCommandKey({ ...base, revision: "revision-7" });
  const current = getOrCreateSessionCommandKey({ ...base, revision: "revision-8" });

  clearSessionCommandKey({
    key: stale,
    revision: "revision-7",
    scope: base.scope,
    storage,
  });
  assert.equal(getOrCreateSessionCommandKey({ ...base, revision: "revision-8" }), current);

  clearSessionCommandKey({
    key: current,
    revision: "revision-8",
    scope: base.scope,
    storage,
  });
  assert.notEqual(getOrCreateSessionCommandKey({ ...base, revision: "revision-8" }), current);
});
