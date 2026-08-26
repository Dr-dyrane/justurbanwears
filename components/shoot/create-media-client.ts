import {
  generateWear,
  readWear,
  type WearGeneration,
  type WearWorkspace,
} from "../studio/garment-intake/wear-client";

export type CreateMediaOperation = "MANNEQUIN_FRONT" | "MODEL_TRY_ON";

export interface CreateMediaIntent {
  version: 1;
  requestId: string;
  wardrobeItemId: string;
  operation: CreateMediaOperation;
  modelProfileId?: string;
}

export interface CreateMediaModelOption {
  id: string;
  name: string;
  kind: "LULU_V3" | "AUTHORIZED_STOCK";
  state: "READY" | "ARCHIVED";
}

export type CreateMediaWearPayload =
  | { requestId: string; operation: "MANNEQUIN_FRONT" }
  | { requestId: string; operation: "MODEL_TRY_ON"; modelProfileId: string };

export type CreateMediaCommandResult =
  | {
      kind: "resolved";
      generation: WearGeneration;
      workspace: WearWorkspace;
      reconciled: boolean;
      reused: boolean;
    }
  | { kind: "rejected"; error: Error }
  | {
      kind: "unconfirmed";
      error: Error;
      resolution: "MISSING" | "UNKNOWN";
      workspace?: WearWorkspace;
    };

export type CreateMediaReconciliationResult =
  | { kind: "resolved"; generation: WearGeneration; workspace: WearWorkspace }
  | { kind: "missing"; workspace: WearWorkspace }
  | { kind: "unconfirmed"; error?: Error; workspace?: WearWorkspace };

type CreateMediaStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

type CreateMediaPorts = {
  generate: typeof generateWear;
  read: typeof readWear;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPERATOR_SCOPE_PATTERN = /^[0-9a-f]{64}$/;
export const CREATE_MEDIA_INTENT_STORAGE_PREFIX = "juw.studio.create-media.intent.v2";

function asError(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause : new Error(fallback);
}

function browserSessionStorage(): CreateMediaStorage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function createMediaIntentStorageKey(operatorScope: string) {
  if (!OPERATOR_SCOPE_PATTERN.test(operatorScope)) {
    throw new Error("Studio could not verify the operator storage scope.");
  }
  return `${CREATE_MEDIA_INTENT_STORAGE_PREFIX}:${operatorScope}`;
}

function isCreateMediaIntent(value: unknown): value is CreateMediaIntent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CreateMediaIntent>;
  if (
    candidate.version !== 1
    || !isUuid(candidate.requestId)
    || typeof candidate.wardrobeItemId !== "string"
    || !candidate.wardrobeItemId
    || (candidate.operation !== "MANNEQUIN_FRONT" && candidate.operation !== "MODEL_TRY_ON")
  ) return false;
  if (candidate.operation === "MODEL_TRY_ON") return isUuid(candidate.modelProfileId);
  return candidate.modelProfileId === undefined;
}

function generationMatchesIntent(generation: WearGeneration, intent: CreateMediaIntent) {
  return generation.operation === intent.operation
    && generation.modelProfileId === (intent.modelProfileId ?? null);
}

function exactGeneration(workspace: WearWorkspace, intent: CreateMediaIntent) {
  const generation = workspace.generations.find((candidate) => candidate.requestId === intent.requestId);
  return generation && generationMatchesIntent(generation, intent) ? generation : undefined;
}

function isAmbiguousCommandError(cause: unknown) {
  const status = typeof cause === "object" && cause !== null && "status" in cause
    ? Number((cause as { status?: unknown }).status)
    : Number.NaN;
  return !Number.isFinite(status) || status === 0 || status === 409 || status >= 500;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isEligibleCreateMediaModel(
  model: CreateMediaModelOption,
): model is CreateMediaModelOption & { state: "READY" } {
  return model.state === "READY" && isUuid(model.id);
}

export function resolveCreateMediaModel(
  models: readonly CreateMediaModelOption[],
  requestedModelId: string | null,
) {
  if (requestedModelId === null) return { kind: "absent" as const };
  const model = models.find((candidate) => candidate.id === requestedModelId);
  if (!isUuid(requestedModelId) || !model || !isEligibleCreateMediaModel(model)) {
    return { kind: "invalid" as const, requestedModelId };
  }
  return { kind: "selected" as const, model };
}

export function createMediaIntent(input: {
  wardrobeItemId: string;
  operation: CreateMediaOperation;
  modelProfileId?: string;
  requestId?: string;
}): CreateMediaIntent {
  const intent: CreateMediaIntent = {
    version: 1,
    requestId: input.requestId ?? globalThis.crypto.randomUUID(),
    wardrobeItemId: input.wardrobeItemId,
    operation: input.operation,
    ...(input.operation === "MODEL_TRY_ON" ? { modelProfileId: input.modelProfileId } : {}),
  };
  createMediaWearPayload(intent);
  if (!intent.wardrobeItemId) throw new Error("Choose a garment before building a view.");
  return intent;
}

export function createMediaWearPayload(intent: CreateMediaIntent): CreateMediaWearPayload {
  if (!isUuid(intent.requestId)) throw new Error("Studio could not create a valid request ID.");
  if (intent.operation === "MODEL_TRY_ON") {
    if (!isUuid(intent.modelProfileId)) throw new Error("Choose an eligible Wear model.");
    return {
      requestId: intent.requestId,
      operation: "MODEL_TRY_ON",
      modelProfileId: intent.modelProfileId,
    };
  }
  if (intent.operation !== "MANNEQUIN_FRONT") throw new Error("Choose a supported media view.");
  return { requestId: intent.requestId, operation: "MANNEQUIN_FRONT" };
}

export function persistCreateMediaIntent(
  intent: CreateMediaIntent,
  operatorScope: string,
  storage: CreateMediaStorage | undefined = browserSessionStorage(),
) {
  if (!storage) throw new Error("This browser cannot preserve a recovery key, so Studio did not start generation.");
  const storageKey = createMediaIntentStorageKey(operatorScope);
  const serialized = JSON.stringify(intent);
  storage.setItem(storageKey, serialized);
  if (storage.getItem(storageKey) !== serialized) {
    throw new Error("Studio could not preserve the recovery key, so generation did not start.");
  }
}

export function readCreateMediaIntent(
  operatorScope: string,
  storage: CreateMediaStorage | undefined = browserSessionStorage(),
) {
  if (!storage) return undefined;
  try {
    const serialized = storage.getItem(createMediaIntentStorageKey(operatorScope));
    if (!serialized) return undefined;
    const parsed: unknown = JSON.parse(serialized);
    return isCreateMediaIntent(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function clearCreateMediaIntent(
  expectedRequestId: string,
  operatorScope: string,
  storage: CreateMediaStorage | undefined = browserSessionStorage(),
) {
  if (!storage) return;
  try {
    const storageKey = createMediaIntentStorageKey(operatorScope);
    const current = readCreateMediaIntent(operatorScope, storage);
    if (current?.requestId === expectedRequestId) storage.removeItem(storageKey);
  } catch {
    // A stale recovery key is safer than erasing a concurrent intent.
  }
}

export async function runCreateMediaSingleFlight<T>(
  guard: { current: boolean },
  command: () => Promise<T>,
): Promise<T | undefined> {
  if (guard.current) return undefined;
  guard.current = true;
  try {
    return await command();
  } finally {
    guard.current = false;
  }
}

export async function reconcileCreateMediaIntent(
  intent: CreateMediaIntent,
  read: typeof readWear = readWear,
): Promise<CreateMediaReconciliationResult> {
  try {
    const { workspace } = await read(intent.wardrobeItemId);
    const generation = exactGeneration(workspace, intent);
    return generation
      ? { kind: "resolved", generation, workspace }
      : { kind: "missing", workspace };
  } catch (cause) {
    return {
      kind: "unconfirmed",
      error: asError(cause, "Studio could not check the saved media request."),
    };
  }
}

export async function executeCreateMediaCommand(
  intent: CreateMediaIntent,
  ports: CreateMediaPorts = { generate: generateWear, read: readWear },
): Promise<CreateMediaCommandResult> {
  try {
    const result = await ports.generate(intent.wardrobeItemId, createMediaWearPayload(intent));
    const generation = result.workspace.generations.find((candidate) => candidate.id === result.generationId);
    const reusable = generation
      && result.reused
      && ["PENDING", "RUNNING", "COMPLETE", "APPROVED"].includes(generation.state);
    if (
      !generation
      || !generationMatchesIntent(generation, intent)
      || (generation.requestId !== intent.requestId && !reusable)
    ) throw new Error("Studio returned a media result that did not match this request.");
    return {
      kind: "resolved",
      generation,
      workspace: result.workspace,
      reconciled: false,
      reused: result.reused,
    };
  } catch (cause) {
    const commandError = asError(cause, "Studio could not build that view.");
    if (!isAmbiguousCommandError(cause)) return { kind: "rejected", error: commandError };
    const reconciliation = await reconcileCreateMediaIntent(intent, ports.read);
    if (reconciliation.kind === "resolved") {
      return {
        ...reconciliation,
        kind: "resolved",
        reconciled: true,
        reused: false,
      };
    }
    return {
      kind: "unconfirmed",
      error: commandError,
      resolution: reconciliation.kind === "missing" ? "MISSING" : "UNKNOWN",
      workspace: reconciliation.workspace,
    };
  }
}
