import { z } from "zod";
import type { StudioCollectionScope } from "../application/contracts";

const collectionLabelSchema = z.string().trim().min(1).max(120);
const collectionIdSchema = z.string().uuid();
const expectedVersionSchema = z.number().int().positive();

export const studioCollectionIntentSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("CREATE_COLLECTION"), label: collectionLabelSchema }),
  z.object({
    command: z.literal("RENAME_COLLECTION"),
    collectionId: collectionIdSchema,
    expectedVersion: expectedVersionSchema,
    label: collectionLabelSchema,
  }),
  z.object({
    command: z.literal("ACTIVATE_COLLECTION"),
    collectionId: collectionIdSchema,
    expectedVersion: expectedVersionSchema,
  }),
  z.object({
    command: z.literal("ARCHIVE_COLLECTION"),
    collectionId: collectionIdSchema,
    expectedVersion: expectedVersionSchema,
  }),
]);

const idempotencyKeySchema = z.string().trim().min(8).max(160).regex(/^[a-zA-Z0-9._:-]+$/);
const expectedRevisionSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const studioCollectionCommandRequestSchema = z.discriminatedUnion("phase", [
  z.object({
    phase: z.literal("PREVIEW"),
    intent: studioCollectionIntentSchema,
  }),
  z.object({
    phase: z.literal("CONFIRM"),
    confirmation: z.enum([
      "CREATE_COLLECTION",
      "RENAME_COLLECTION",
      "ACTIVATE_COLLECTION",
      "ARCHIVE_COLLECTION",
    ]),
    expectedRevision: expectedRevisionSchema,
    idempotencyKey: idempotencyKeySchema,
    intent: studioCollectionIntentSchema,
  }).superRefine((value, context) => {
    if (value.confirmation !== value.intent.command) {
      context.addIssue({
        code: "custom",
        message: "Confirmation must match the prepared command.",
        path: ["confirmation"],
      });
    }
  }),
]);

export type StudioCollectionIntent = z.infer<typeof studioCollectionIntentSchema>;
export type StudioCollectionCommandRequest = z.infer<typeof studioCollectionCommandRequestSchema>;

export type StudioCollectionChange = {
  label: string;
  before: string;
  after: string;
};

export type StudioCollectionPreview = {
  intent: StudioCollectionIntent;
  collection: StudioCollectionScope;
  previousActive: StudioCollectionScope | null;
  changes: StudioCollectionChange[];
  expectedRevision: string;
  title: string;
  consequence: string;
};

export type StudioCollectionReceipt = {
  id: string;
  command: StudioCollectionIntent["command"];
  collection: StudioCollectionScope;
  consequence: string;
  nextRoute: string;
  occurredAt: string;
  replayed: boolean;
};

export type StudioCollectionCommandResponse = {
  preview?: StudioCollectionPreview;
  receipt?: StudioCollectionReceipt;
  collections?: StudioCollectionScope[];
};
