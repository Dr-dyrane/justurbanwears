import { z } from "zod";
import {
  STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER,
  studioAtelierShopMediaRoleSchema,
  type StudioAtelierShopMediaRole,
} from "../atelier/publication-adoption-contracts";

export const publishStudioPieceSchema = z.object({
  expectedRevision: z.string().regex(/^[0-9a-f]{64}$/),
  idempotencyKey: z.string().trim().min(8).max(160).regex(/^[a-zA-Z0-9._:-]+$/),
  confirmation: z.literal("PUBLISH"),
  publicMediaConfirmed: z.literal(true),
});

export type PublicationMediaSlot = "GARMENT_FRONT" | "GARMENT_BACK" | "FABRIC_DETAIL";

/**
 * Live Shop projections may expose the exact seven-role Atelier receipt, while
 * legacy Studio publication commands continue to accept only the three roles
 * above. Keeping these types separate prevents receipt media from weakening
 * the existing three-WebP intake contract.
 */
export type StudioPublishedMediaSlot = PublicationMediaSlot | StudioAtelierShopMediaRole;

export type StudioAtelierPublicationMedia = Readonly<{
  slot: StudioAtelierShopMediaRole;
  src: string;
  sourceSha256: string;
  sha256: string;
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
  operationId: string;
  projectionVersion: number;
}>;

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const studioAtelierPublicationMediaSchema = z.object({
  slot: studioAtelierShopMediaRoleSchema,
  src: z.string().min(1),
  sourceSha256: sha256Schema,
  sha256: sha256Schema,
  mimeType: z.enum(["image/jpeg", "image/png"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  operationId: z.string().uuid(),
  projectionVersion: z.number().int().positive(),
}).strict();

const studioAtelierMediaPrefix = "/api/shop/atelier-media/";

export function studioAtelierPublicationMediaPath(
  receiptId: string,
  role: StudioAtelierShopMediaRole,
): string {
  if (!/^[0-9a-f]{64}$/.test(receiptId)) {
    throw new Error("Invalid Atelier adoption receipt identity.");
  }
  return `${studioAtelierMediaPrefix}${receiptId}/${role}`;
}

export function parseStudioAtelierPublicationMediaPath(value: unknown): Readonly<{
  receiptId: string;
  role: StudioAtelierShopMediaRole;
}> | null {
  if (typeof value !== "string" || !value.startsWith(studioAtelierMediaPrefix)) return null;
  const suffix = value.slice(studioAtelierMediaPrefix.length);
  const separator = suffix.indexOf("/");
  if (separator < 0 || suffix.indexOf("/", separator + 1) >= 0) return null;
  const receiptId = suffix.slice(0, separator);
  const role = studioAtelierShopMediaRoleSchema.safeParse(suffix.slice(separator + 1));
  if (!/^[0-9a-f]{64}$/.test(receiptId) || !role.success) return null;
  return Object.freeze({ receiptId, role: role.data });
}

export function parseStudioAtelierPublicationMediaSet(value: unknown): Readonly<{
  receiptId: string;
  media: readonly StudioAtelierPublicationMedia[];
}> {
  const result = z.array(studioAtelierPublicationMediaSchema)
    .length(STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER.length)
    .safeParse(value);
  if (!result.success) throw new Error("Invalid Atelier publication media set.");

  let receiptId: string | undefined;
  const media = result.data.map((item, index) => {
    const expectedRole = STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER[index];
    const path = parseStudioAtelierPublicationMediaPath(item.src);
    if (
      item.slot !== expectedRole
      || !path
      || path.role !== item.slot
      || item.sourceSha256 !== item.sha256
      || (receiptId !== undefined && receiptId !== path.receiptId)
    ) throw new Error("Atelier publication media drifted from its exact receipt.");
    receiptId ??= path.receiptId;
    return Object.freeze({ ...item });
  });
  if (!receiptId) throw new Error("Atelier publication receipt identity is missing.");
  return Object.freeze({ receiptId, media: Object.freeze(media) });
}

export function parseStudioAtelierAdoptionRevision(
  facts: unknown,
  sourceRevision: unknown,
): string | null {
  if (
    !facts
    || typeof facts !== "object"
    || !Object.hasOwn(facts, "atelierAdoptionRevision")
  ) return null;
  const value = (facts as Record<string, unknown>).atelierAdoptionRevision;
  if (
    typeof value !== "string"
    || !/^[0-9a-f]{64}$/.test(value)
    || value !== sourceRevision
  ) throw new Error("Atelier adoption revision drifted from its publication receipt.");
  return value;
}

export type StudioPublicationPreviewMedia = {
  id: string;
  slot: PublicationMediaSlot;
  label: string;
  assetUrl: string;
  width: number;
  height: number;
};

export type StudioPublicationReceipt = {
  publicationId: string;
  wardrobeItemId: string;
  sku: string;
  slug: string;
  origin: "STUDIO_NATIVE" | "CATALOGUE_ADOPTED";
  state: "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED";
  publishedAt: string;
  shopUrl: string;
  /** Exact collection label stored with the public catalogue row. */
  drop?: string;
  inventory?: {
    availability: "AVAILABLE" | "RESERVED" | "SOLD" | "ARCHIVED";
    onHand: number;
    reserved: number;
    sold: number;
    returned: number;
    writeOff: number;
    updatedAt: string;
  };
};

export type StudioPublicationReview =
  | {
      state: "BLOCKED";
      wardrobeItemId: string;
      blockers: string[];
    }
  | {
      state: "READY";
      wardrobeItemId: string;
      expectedRevision: string;
      title: string;
      description: string;
      category: string;
      colour: string;
      sizeLabel: string;
      condition: string;
      price: number;
      quantity: 1;
      media: StudioPublicationPreviewMedia[];
    }
  | {
      state: "PUBLISHED";
      receipt: StudioPublicationReceipt;
    };
