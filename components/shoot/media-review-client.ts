import {
  readStudioAuthority,
  type StudioAuthorityMedia,
  type StudioAuthoritySnapshot,
} from "../../lib/studio/services/studio-authority-client";

export type MediaReviewDecision = "FIX" | "KEEP" | "REJECT";

export type MediaReviewIntent = {
  baselineMediaIds: string[];
  decision: MediaReviewDecision;
  id: string;
  mediaId: string;
  operation: StudioAuthorityMedia["operation"];
  version: 1;
  wardrobeItemId: string;
};

type MediaReviewStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

const OPERATOR_SCOPE_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEDIA_OPERATIONS: ReadonlySet<string> = new Set([
  "GARMENT_FRONT",
  "GARMENT_BACK",
  "FABRIC_DETAIL",
  "MANNEQUIN_FRONT",
  "MODEL_TRY_ON",
  "EDITORIAL_MODEL",
]);
export const MEDIA_REVIEW_INTENT_STORAGE_PREFIX = "juw.studio.media-review.intent.v1";

function browserSessionStorage(): MediaReviewStorage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

function mediaReviewStorageKey(operatorScope: string, mediaId: string) {
  if (!OPERATOR_SCOPE_PATTERN.test(operatorScope) || !mediaId || mediaId.length > 200) {
    throw new Error("Studio could not verify this review recovery key.");
  }
  return `${MEDIA_REVIEW_INTENT_STORAGE_PREFIX}:${operatorScope}:${encodeURIComponent(mediaId)}`;
}

function isMediaReviewIntent(value: unknown): value is MediaReviewIntent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MediaReviewIntent>;
  return candidate.version === 1
    && typeof candidate.id === "string" && UUID_PATTERN.test(candidate.id)
    && typeof candidate.mediaId === "string" && candidate.mediaId.length > 0 && candidate.mediaId.length <= 200
    && typeof candidate.wardrobeItemId === "string" && candidate.wardrobeItemId.length > 0 && candidate.wardrobeItemId.length <= 200
    && typeof candidate.operation === "string" && MEDIA_OPERATIONS.has(candidate.operation)
    && (candidate.decision === "FIX" || candidate.decision === "KEEP" || candidate.decision === "REJECT")
    && Array.isArray(candidate.baselineMediaIds)
    && candidate.baselineMediaIds.length <= 100
    && candidate.baselineMediaIds.every((id) => typeof id === "string" && id.length > 0 && id.length <= 200);
}

export function createMediaReviewIntent(input: {
  decision: MediaReviewDecision;
  media: StudioAuthorityMedia;
  snapshot: StudioAuthoritySnapshot;
  id?: string;
}): MediaReviewIntent {
  return {
    baselineMediaIds: input.snapshot.media
      .filter((candidate) => (
        candidate.wardrobeItemId === input.media.wardrobeItemId
        && candidate.operation === input.media.operation
      ))
      .map((candidate) => candidate.id)
      .slice(-100),
    decision: input.decision,
    id: input.id ?? globalThis.crypto.randomUUID(),
    mediaId: input.media.id,
    operation: input.media.operation,
    version: 1,
    wardrobeItemId: input.media.wardrobeItemId,
  };
}

export function persistMediaReviewIntent(
  intent: MediaReviewIntent,
  operatorScope: string,
  storage: MediaReviewStorage | undefined = browserSessionStorage(),
) {
  if (!storage) throw new Error("This browser cannot preserve the review recovery key, so Studio did not send the decision.");
  const key = mediaReviewStorageKey(operatorScope, intent.mediaId);
  const serialized = JSON.stringify(intent);
  storage.setItem(key, serialized);
  if (storage.getItem(key) !== serialized) {
    throw new Error("Studio could not preserve the review recovery key, so the decision was not sent.");
  }
}

export function readMediaReviewIntent(
  operatorScope: string,
  mediaId: string,
  storage: MediaReviewStorage | undefined = browserSessionStorage(),
) {
  if (!storage) return undefined;
  try {
    const serialized = storage.getItem(mediaReviewStorageKey(operatorScope, mediaId));
    if (!serialized) return undefined;
    const parsed: unknown = JSON.parse(serialized);
    return isMediaReviewIntent(parsed) && parsed.mediaId === mediaId ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function clearMediaReviewIntent(
  intent: Pick<MediaReviewIntent, "id" | "mediaId">,
  operatorScope: string,
  storage: MediaReviewStorage | undefined = browserSessionStorage(),
) {
  if (!storage) return;
  try {
    const key = mediaReviewStorageKey(operatorScope, intent.mediaId);
    if (readMediaReviewIntent(operatorScope, intent.mediaId, storage)?.id === intent.id) {
      storage.removeItem(key);
    }
  } catch {
    // Preserve an uncertain recovery key rather than erase a concurrent intent.
  }
}

export function mediaReviewIntentReflected(
  intent: MediaReviewIntent,
  snapshot: StudioAuthoritySnapshot,
) {
  const current = snapshot.media.find((candidate) => candidate.id === intent.mediaId);
  if (intent.decision === "KEEP") return current?.state === "APPROVED";
  if (intent.decision === "REJECT") return current?.state === "REJECTED";
  if (current?.state === "REJECTED") return true;
  const baseline = new Set(intent.baselineMediaIds);
  return snapshot.media.some((candidate) => (
    candidate.wardrobeItemId === intent.wardrobeItemId
    && candidate.operation === intent.operation
    && !baseline.has(candidate.id)
  ));
}

export async function reconcileMediaReviewIntent(
  intent: MediaReviewIntent,
  read: typeof readStudioAuthority = readStudioAuthority,
) {
  try {
    const snapshot = await read();
    return {
      kind: mediaReviewIntentReflected(intent, snapshot) ? "reflected" as const : "unconfirmed" as const,
      snapshot,
    };
  } catch (cause) {
    return {
      error: cause instanceof Error ? cause : new Error("Studio could not check the saved review decision."),
      kind: "unconfirmed" as const,
    };
  }
}

export function isAmbiguousMediaReviewError(cause: unknown) {
  const status = typeof cause === "object" && cause !== null && "status" in cause
    ? Number((cause as { status?: unknown }).status)
    : Number.NaN;
  return !Number.isFinite(status) || status === 0 || status === 409 || status >= 500;
}
