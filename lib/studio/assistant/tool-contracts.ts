import { z } from "zod";

export const STUDIO_ASSISTANT_TOOL_NAMES = [
  "searchStudio",
  "getPiece",
  "getDrop",
  "getOrder",
  "getInventory",
  "getMedia",
  "getModel",
  "preparePieceEdit",
  "preparePublishRevision",
  "prepareDropMove",
  "prepareArchive",
  "preparePermanentDelete",
] as const;

export const studioAssistantToolNameSchema = z.enum(STUDIO_ASSISTANT_TOOL_NAMES);
export type StudioAssistantToolName = z.infer<typeof studioAssistantToolNameSchema>;

export const STUDIO_ASSISTANT_OPERATION_KINDS = [
  "PIECE_EDIT",
  "PUBLISH_REVISION",
  "DROP_MOVE",
  "ARCHIVE",
  "PERMANENT_DELETE",
] as const;

export const studioAssistantOperationKindSchema = z.enum(STUDIO_ASSISTANT_OPERATION_KINDS);
export type StudioAssistantOperationKind = z.infer<typeof studioAssistantOperationKindSchema>;

export const STUDIO_ASSISTANT_OPERATION_STATES = [
  "PREPARED",
  "EXECUTING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
] as const;

export const studioAssistantOperationStateSchema = z.enum(STUDIO_ASSISTANT_OPERATION_STATES);
export type StudioAssistantOperationState = z.infer<typeof studioAssistantOperationStateSchema>;

export const studioAssistantChangeSchema = z.object({
  after: z.string().max(4_000),
  before: z.string().max(4_000),
  field: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
}).strict();

export type StudioAssistantChange = z.infer<typeof studioAssistantChangeSchema>;

export const studioAssistantTargetSchema = z.object({
  href: z.string().trim().min(1).max(500),
  id: z.string().trim().min(1).max(240),
  label: z.string().trim().min(1).max(240),
  reference: z.string().trim().min(1).max(120),
  type: z.enum(["PIECE", "DROP", "ORDER", "INVENTORY", "MEDIA", "MODEL"]),
}).strict();

export type StudioAssistantTarget = z.infer<typeof studioAssistantTargetSchema>;

export const studioAssistantOperationMediaSchema = z.object({
  id: z.string().trim().min(1).max(240),
  label: z.string().trim().min(1).max(240),
  sourceRevision: z.string().trim().min(1).max(240),
  src: z.string().trim().min(1).max(1_000),
}).strict();

export const studioAssistantOperationPreviewSchema = z.object({
  changes: z.array(studioAssistantChangeSchema).max(16),
  confirmationLabel: z.string().trim().min(1).max(120),
  consequence: z.string().trim().min(1).max(2_000),
  destructive: z.boolean(),
  media: z.array(studioAssistantOperationMediaSchema).max(12).optional(),
  risk: z.enum(["R0", "R1", "R2", "R3"]),
  summary: z.string().trim().min(1).max(2_000),
}).strict();

export type StudioAssistantOperationPreview = z.infer<typeof studioAssistantOperationPreviewSchema>;

export const studioAssistantOperationReceiptSchema = z.object({
  actor: z.object({
    displayName: z.string().trim().min(1).max(160),
  }).strict(),
  detail: z.string().trim().min(1).max(2_000),
  nextPrompt: z.string().trim().min(1).max(1_200).nullable(),
  occurredAt: z.string().datetime(),
  outcome: z.enum(["APPLIED", "RECONCILED", "REPLAYED"]),
  receiptId: z.string().trim().min(1).max(240),
  route: z.string().trim().min(1).max(500).nullable(),
  title: z.string().trim().min(1).max(240),
}).strict();

export type StudioAssistantOperationReceipt = z.infer<typeof studioAssistantOperationReceiptSchema>;

export const studioAssistantOperationErrorSchema = z.object({
  code: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(1_000),
  recovery: z.string().trim().min(1).max(1_000),
}).strict();

export type StudioAssistantOperationError = z.infer<typeof studioAssistantOperationErrorSchema>;

export const studioAssistantOperationSchema = z.object({
  createdAt: z.string().datetime(),
  createdBy: z.object({
    displayName: z.string().trim().min(1).max(160),
  }).strict(),
  executedAt: z.string().datetime().nullable(),
  executedBy: z.object({
    displayName: z.string().trim().min(1).max(160),
  }).strict().nullable(),
  expectedRevision: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  expectedVersion: z.number().int().positive().nullable(),
  expiresAt: z.string().datetime(),
  id: z.string().uuid(),
  kind: studioAssistantOperationKindSchema,
  lastError: studioAssistantOperationErrorSchema.nullable(),
  preview: studioAssistantOperationPreviewSchema,
  receipt: studioAssistantOperationReceiptSchema.nullable(),
  state: studioAssistantOperationStateSchema,
  target: studioAssistantTargetSchema,
  threadId: z.string().uuid(),
  updatedAt: z.string().datetime(),
  version: z.number().int().positive(),
}).strict();

export type StudioAssistantOperation = z.infer<typeof studioAssistantOperationSchema>;

export const studioAssistantToolFieldSchema = z.object({
  label: z.string().trim().min(1).max(120),
  value: z.string().max(4_000),
}).strict();

export const studioAssistantToolRecordSchema = z.object({
  detail: z.string().max(2_000),
  fields: z.array(studioAssistantToolFieldSchema).max(24),
  href: z.string().trim().min(1).max(500),
  id: z.string().trim().min(1).max(240),
  label: z.string().trim().min(1).max(240),
  media: z.array(z.object({
    alt: z.string().trim().min(1).max(240),
    src: z.string().trim().min(1).max(1_000),
  }).strict()).max(12),
  reference: z.string().trim().max(120).nullable(),
  state: z.string().trim().max(160).nullable(),
  type: z.enum(["PIECE", "DROP", "ORDER", "INVENTORY", "MEDIA", "MODEL", "SERVICE"]),
}).strict();

export type StudioAssistantToolRecord = z.infer<typeof studioAssistantToolRecordSchema>;

export const studioAssistantToolActionSchema = z.object({
  href: z.string().trim().min(1).max(500).nullable(),
  label: z.string().trim().min(1).max(160),
  prompt: z.string().trim().min(1).max(1_200).nullable(),
}).strict();

export const studioAssistantToolOutputSchema = z.object({
  actions: z.array(studioAssistantToolActionSchema).max(8),
  generatedAt: z.string().datetime(),
  operation: studioAssistantOperationSchema.nullable(),
  outcome: z.enum(["OK", "NEEDS_CLARIFICATION", "BLOCKED"]),
  records: z.array(studioAssistantToolRecordSchema).max(12),
  schemaVersion: z.literal("juw.studio-assistant-tool.v1"),
  summary: z.string().trim().min(1).max(2_000),
  title: z.string().trim().min(1).max(240),
  tool: studioAssistantToolNameSchema,
}).strict();

export type StudioAssistantToolOutput = z.infer<typeof studioAssistantToolOutputSchema>;

const studioAssistantOperationExpectedVersionSchema = z.number().int().positive();

const studioAssistantCancelOperationCommandSchema = z.object({
  action: z.literal("CANCEL"),
  expectedVersion: studioAssistantOperationExpectedVersionSchema,
}).strict();

const studioAssistantConfirmOperationCommandSchema = z.union([
  z.object({
    action: z.literal("CONFIRM"),
    confirmation: z.literal("SAVE_PRIVATE_REVISION"),
    expectedVersion: studioAssistantOperationExpectedVersionSchema,
  }).strict(),
  z.object({
    action: z.literal("CONFIRM"),
    confirmation: z.literal("PUBLISH_REVISION"),
    expectedVersion: studioAssistantOperationExpectedVersionSchema,
    publicMediaConfirmed: z.literal(true),
  }).strict(),
  z.object({
    action: z.literal("CONFIRM"),
    confirmation: z.literal("MOVE_DROP"),
    expectedVersion: studioAssistantOperationExpectedVersionSchema,
  }).strict(),
  z.object({
    action: z.literal("CONFIRM"),
    confirmation: z.literal("ARCHIVE"),
    expectedVersion: studioAssistantOperationExpectedVersionSchema,
  }).strict(),
  z.object({
    action: z.literal("CONFIRM"),
    confirmation: z.literal("DELETE_PERMANENTLY"),
    expectedVersion: studioAssistantOperationExpectedVersionSchema,
  }).strict(),
]);

export const studioAssistantOperationCommandSchema = z.union([
  studioAssistantCancelOperationCommandSchema,
  studioAssistantConfirmOperationCommandSchema,
  z.object({
    action: z.literal("RECONCILE"),
    expectedVersion: studioAssistantOperationExpectedVersionSchema,
  }).strict(),
]);

export type StudioAssistantOperationCommand = z.infer<typeof studioAssistantOperationCommandSchema>;
export type StudioAssistantConfirmOperationCommand = Extract<
  StudioAssistantOperationCommand,
  { action: "CONFIRM" }
>;

export const studioAssistantOperationListQuerySchema = z.object({
  threadId: z.string().uuid(),
}).strict();

export const studioAssistantSearchInputSchema = z.object({
  kinds: z.array(z.enum(["PIECE", "DROP", "ORDER", "INVENTORY", "MEDIA", "MODEL", "SERVICE"])).max(7).optional(),
  query: z.string().trim().min(1).max(1_200),
}).strict();

export const studioAssistantReferenceInputSchema = z.object({
  reference: z.string().trim().min(1).max(240).optional(),
}).strict();

export const studioAssistantMediaInputSchema = z.object({
  pieceReference: z.string().trim().min(1).max(240).optional(),
}).strict();

export const studioAssistantPieceEditInputSchema = z.object({
  changes: z.object({
    description: z.string().trim().min(1).max(2_000).nullable().optional(),
    name: z.string().trim().min(1).max(100).optional(),
    price: z.number().int().nonnegative().optional(),
  }).strict().refine((value) => Object.keys(value).length > 0, "Add at least one garment change."),
  reference: z.string().trim().min(1).max(240).optional(),
}).strict();

export const studioAssistantDropMoveInputSchema = z.object({
  destination: z.string().trim().min(1).max(120),
  pieceReference: z.string().trim().min(1).max(240).optional(),
}).strict();
