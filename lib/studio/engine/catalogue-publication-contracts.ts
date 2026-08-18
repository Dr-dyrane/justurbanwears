import { z } from "zod";

export const publishStudioPieceSchema = z.object({
  expectedRevision: z.string().regex(/^[0-9a-f]{64}$/),
  idempotencyKey: z.string().trim().min(8).max(160).regex(/^[a-zA-Z0-9._:-]+$/),
  confirmation: z.literal("PUBLISH"),
  publicMediaConfirmed: z.literal(true),
});

export type PublicationMediaSlot = "GARMENT_FRONT" | "GARMENT_BACK" | "FABRIC_DETAIL";

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
