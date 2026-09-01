import {
  STUDIO_ATELIER_SHOP_ADOPTION_SCHEMA_VERSION,
  STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER,
  studioAtelierShopListingFactsSchema,
  type StudioAtelierShopAdoptionReceipt,
  type StudioAtelierShopAdoptionReview,
  type StudioAtelierShopMediaRole,
} from "../../../lib/studio/atelier/publication-adoption-contracts";

type ServerErrorBody = Readonly<{
  error?: Readonly<{
    message?: unknown;
    recovery?: unknown;
  }>;
}>;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactRoleOrder(value: unknown): value is readonly StudioAtelierShopMediaRole[] {
  return Array.isArray(value)
    && value.length === STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER.length
    && STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER.every((role, index) => value[index] === role);
}

export function studioAtelierAdoptionErrorDetail(body: unknown, fallback: string): string {
  const error = isRecord(body) && isRecord((body as ServerErrorBody).error)
    ? (body as ServerErrorBody).error
    : null;
  const message = typeof error?.message === "string" ? error.message.trim() : "";
  const recovery = typeof error?.recovery === "string" ? error.recovery.trim() : "";
  return [message, recovery].filter(Boolean).join(" ") || fallback;
}

export function parseStudioAtelierAdoptionReviewEnvelope(
  body: unknown,
  wardrobeItemId: string,
): StudioAtelierShopAdoptionReview | null {
  if (!isRecord(body) || !isRecord(body.adoption)) return null;
  const adoption = body.adoption;
  if (adoption.wardrobeItemId !== wardrobeItemId) return null;

  if (
    adoption.state === "BLOCKED"
    && Array.isArray(adoption.blockers)
    && adoption.blockers.length > 0
    && adoption.blockers.every((blocker) => typeof blocker === "string" && blocker.trim().length > 0)
  ) {
    return Object.freeze({
      state: "BLOCKED",
      wardrobeItemId,
      blockers: Object.freeze(adoption.blockers.map((blocker) => blocker.trim())),
    });
  }

  if (
    adoption.state === "READY"
    && typeof adoption.garmentId === "string"
    && adoption.garmentId.length > 0
    && typeof adoption.expectedRevision === "string"
    && SHA256_PATTERN.test(adoption.expectedRevision)
    && exactRoleOrder(adoption.roles)
  ) {
    const listingFacts = studioAtelierShopListingFactsSchema.safeParse(adoption.listingFacts);
    if (!listingFacts.success) return null;
    return Object.freeze({
      state: "READY",
      wardrobeItemId,
      garmentId: adoption.garmentId,
      expectedRevision: adoption.expectedRevision,
      listingFacts: Object.freeze(listingFacts.data),
      roles: STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER,
    });
  }
  return null;
}

export function parseStudioAtelierAdoptionReceiptEnvelope(
  body: unknown,
  wardrobeItemId: string,
  expectedRevision: string,
): StudioAtelierShopAdoptionReceipt | null {
  if (!isRecord(body) || !isRecord(body.adoption)) return null;
  const adoption = body.adoption;
  if (
    adoption.schemaVersion !== STUDIO_ATELIER_SHOP_ADOPTION_SCHEMA_VERSION
    || adoption.wardrobeItemId !== wardrobeItemId
    || typeof adoption.receiptId !== "string"
    || !SHA256_PATTERN.test(adoption.receiptId)
    || typeof adoption.garmentId !== "string"
    || adoption.garmentId.length === 0
    || adoption.adoptionRevision !== expectedRevision
    || !Array.isArray(adoption.media)
    || adoption.media.length !== STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER.length
  ) return null;

  const media = adoption.media.map((value, index) => {
    if (!isRecord(value)) return null;
    const role = STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER[index];
    if (
      value.role !== role
      || typeof value.operationId !== "string"
      || !UUID_PATTERN.test(value.operationId)
      || !Number.isInteger(value.projectionVersion)
      || Number(value.projectionVersion) <= 0
      || typeof value.lockedArtifactSha256 !== "string"
      || !SHA256_PATTERN.test(value.lockedArtifactSha256)
      || (value.mimeType !== "image/jpeg" && value.mimeType !== "image/png")
      || !Number.isInteger(value.byteSize)
      || Number(value.byteSize) <= 0
      || !Number.isInteger(value.width)
      || Number(value.width) <= 0
      || !Number.isInteger(value.height)
      || Number(value.height) <= 0
    ) return null;
    return Object.freeze({
      role,
      operationId: value.operationId,
      projectionVersion: Number(value.projectionVersion),
      lockedArtifactSha256: value.lockedArtifactSha256,
      mimeType: value.mimeType,
      byteSize: Number(value.byteSize),
      width: Number(value.width),
      height: Number(value.height),
    });
  });
  if (media.some((item) => item === null)) return null;

  return Object.freeze({
    schemaVersion: STUDIO_ATELIER_SHOP_ADOPTION_SCHEMA_VERSION,
    receiptId: adoption.receiptId,
    wardrobeItemId,
    garmentId: adoption.garmentId,
    adoptionRevision: expectedRevision,
    media: Object.freeze(media as StudioAtelierShopAdoptionReceipt["media"]),
  });
}
