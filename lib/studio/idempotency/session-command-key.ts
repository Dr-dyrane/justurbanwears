export interface SessionCommandKeyStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

interface StoredSessionCommandKey {
  key: string;
  revision: string;
  version: 1;
}

function storageKey(scope: string) {
  return `juw.studio.command.v1:${encodeURIComponent(scope)}`;
}

function browserSessionStorage(): SessionCommandKeyStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readStored(
  storage: SessionCommandKeyStorage,
  scope: string,
): StoredSessionCommandKey | null {
  try {
    const parsed = JSON.parse(storage.getItem(storageKey(scope)) ?? "null") as Partial<StoredSessionCommandKey> | null;
    return parsed?.version === 1
      && typeof parsed.key === "string"
      && parsed.key.length > 0
      && typeof parsed.revision === "string"
      && parsed.revision.length > 0
      ? parsed as StoredSessionCommandKey
      : null;
  } catch {
    return null;
  }
}

export function getOrCreateSessionCommandKey(input: {
  keyPrefix: string;
  revision: string;
  scope: string;
  storage?: SessionCommandKeyStorage | null;
  uuid?: () => string;
}) {
  const storage = input.storage === undefined ? browserSessionStorage() : input.storage;
  const existing = storage ? readStored(storage, input.scope) : null;
  if (existing?.revision === input.revision && existing.key.startsWith(`${input.keyPrefix}:`)) {
    return existing.key;
  }

  const uuid = input.uuid ?? (() => crypto.randomUUID());
  const key = `${input.keyPrefix}:${uuid()}`;
  if (storage) {
    try {
      storage.setItem(storageKey(input.scope), JSON.stringify({
        key,
        revision: input.revision,
        version: 1,
      } satisfies StoredSessionCommandKey));
    } catch {
      // A blocked storage API may reduce reload recovery, but must not block the command.
    }
  }
  return key;
}

export function clearSessionCommandKey(input: {
  key?: string;
  revision?: string;
  scope: string;
  storage?: SessionCommandKeyStorage | null;
}) {
  const storage = input.storage === undefined ? browserSessionStorage() : input.storage;
  if (!storage) return;
  try {
    const existing = readStored(storage, input.scope);
    if (!existing) {
      storage.removeItem(storageKey(input.scope));
      return;
    }
    if (input.key && existing.key !== input.key) return;
    if (input.revision && existing.revision !== input.revision) return;
    storage.removeItem(storageKey(input.scope));
  } catch {
    // Clearing recovery metadata is best-effort after authoritative completion.
  }
}
