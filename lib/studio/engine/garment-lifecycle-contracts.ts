import { z } from "zod";
import { intakeFactsSchema, type IntakeFacts } from "./contracts";
import type {
  StudioPublishedMediaSlot,
  StudioPublicationPreviewMedia,
  StudioPublicationReceipt,
} from "./catalogue-publication-contracts";

const expectedRevisionSchema = z.string().regex(/^[0-9a-f]{64}$/);
const idempotencyKeySchema = z.string().trim().min(8).max(160).regex(/^[a-zA-Z0-9._:-]+$/);
const postgresUuidSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
);

export const garmentLifecycleCommandSchema = z.discriminatedUnion("command", [
  z.object({
    command: z.literal("SAVE_FACTS"),
    expectedVersion: z.number().int().positive(),
    facts: intakeFactsSchema,
    idempotencyKey: idempotencyKeySchema.optional(),
  }),
  z.object({
    command: z.literal("DISCARD_REVISION"),
    expectedRevision: expectedRevisionSchema,
  }),
  z.object({
    command: z.literal("PUBLISH_REVISION"),
    expectedRevision: expectedRevisionSchema,
    idempotencyKey: idempotencyKeySchema,
    confirmation: z.literal("PUBLISH_REVISION"),
    publicMediaConfirmed: z.literal(true),
  }),
  z.object({
    command: z.literal("UNPUBLISH"),
    expectedRevision: expectedRevisionSchema,
    confirmation: z.literal("UNPUBLISH"),
  }),
  z.object({
    command: z.literal("REPUBLISH"),
    expectedRevision: expectedRevisionSchema,
    confirmation: z.literal("REPUBLISH"),
  }),
  z.object({
    command: z.literal("ARCHIVE"),
    expectedVersion: z.number().int().positive(),
    confirmation: z.literal("ARCHIVE"),
    idempotencyKey: idempotencyKeySchema.optional(),
  }),
]);

export const garmentLifecycleCommandReceiptSchema = z.object({
  actorSubject: z.string().trim().min(1),
  command: z.enum(["SAVE_FACTS", "ARCHIVE"]),
  consequence: z.string().trim().min(1),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: idempotencyKeySchema,
  occurredAt: z.string().datetime({ offset: true }),
  receiptId: z.string().uuid(),
  requestFingerprint: expectedRevisionSchema,
  result: z.enum(["PRIVATE_FACTS_SAVED", "PRIVATE_REVISION_SAVED", "ARCHIVED"]),
  resultingVersion: z.number().int().positive(),
  schemaVersion: z.literal("juw.studio-garment-lifecycle-command-receipt.v1"),
  summary: z.string().trim().min(1),
  // Legacy deterministic wardrobe IDs are valid PostgreSQL UUID values but do
  // not encode an RFC version/variant nibble, which Zod's uuid() rejects.
  wardrobeItemId: postgresUuidSchema,
}).strict();

export const garmentLifecycleCommandReceiptQuerySchema = z.object({
  idempotencyKey: idempotencyKeySchema,
}).strict();

export const garmentPermanentDeleteSchema = z.object({
  confirmation: z.literal("DELETE_PERMANENTLY"),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: idempotencyKeySchema,
});

export const garmentPermanentDeleteReceiptQuerySchema = z.object({
  idempotencyKey: idempotencyKeySchema,
});

export const garmentRevisionMediaRoleSchema = z.enum([
  "GARMENT_FRONT",
  "GARMENT_BACK",
  "FABRIC_DETAIL",
]);

export type GarmentLifecycleCommand = z.infer<typeof garmentLifecycleCommandSchema>;
export type GarmentLifecycleCommandReceipt = z.infer<typeof garmentLifecycleCommandReceiptSchema>;
export type GarmentPermanentDeleteCommand = z.infer<typeof garmentPermanentDeleteSchema>;
export type GarmentRevisionMediaRole = z.infer<typeof garmentRevisionMediaRoleSchema>;

export type GarmentPermanentDeleteReceipt = {
  wardrobeItemId: string;
  title: string;
  consequence: string;
  deletedAt: string;
};

export type GarmentPublishRevisionReceipt = {
  wardrobeItemId: string;
  publicationId: string;
  idempotencyKey: string;
  sourceRevision: string;
  sku: string;
  slug: string;
  publishedAt: string;
};

export type GarmentRevisionDiff = {
  field: "title" | "description" | "category" | "colour" | "sizeLabel" | "condition" | "price" | "media";
  label: string;
  before: string;
  after: string;
};

export type GarmentLifecycleEvent = {
  id: string;
  type: "COMMITTED" | "FACTS_UPDATED" | "REVISION_STARTED" | "REVISION_DISCARDED" | "REVISION_PUBLISHED" | "PUBLISHED" | "UNPUBLISHED" | "REPUBLISHED" | "ARCHIVED" | "MEDIA_REPLACED";
  summary: string;
  detail?: string;
  occurredAt: string;
};

export type GarmentLifecycleDraft = {
  id: string;
  revisionNumber: number;
  version: number;
  expectedRevision: string;
  facts: IntakeFacts;
  media: StudioPublicationPreviewMedia[];
  diff: GarmentRevisionDiff[];
  updatedAt: string;
};

export type GarmentLifecycleWorkspace = {
  wardrobeItemId: string;
  itemVersion: number;
  state: "PRIVATE" | "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED";
  facts: IntakeFacts;
  editableFacts: IntakeFacts;
  mediaEditable: boolean;
  live?: {
    receipt: Omit<StudioPublicationReceipt, "state">;
    sourceRevision: string;
    facts: IntakeFacts;
    media: Array<{
      slot: StudioPublishedMediaSlot;
      label: string;
      src: string;
    }>;
  };
  draft?: GarmentLifecycleDraft;
  history: GarmentLifecycleEvent[];
  permanentDelete: {
    eligible: boolean;
    blockers: string[];
  };
  allowedActions: Array<"EDIT" | "PUBLISH_REVISION" | "DISCARD_REVISION" | "UNPUBLISH" | "REPUBLISH" | "ARCHIVE">;
};
