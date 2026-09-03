import { z } from "zod";
import type { StudioAssistantUIMessage } from "../../ai/studio-assistant-agent";

export const studioAssistantFocusSchema = z.object({
  canonicalId: z.string().trim().min(1).max(240).nullable(),
  entityType: z.enum(["PIECE", "DROP", "ORDER", "INVENTORY", "MEDIA", "MODEL", "SERVICE"]),
  label: z.string().trim().min(1).max(240).nullable(),
  lastKnownRevision: z.string().trim().max(160).nullable(),
  reference: z.string().trim().min(1).max(240).nullable(),
  route: z.string().trim().min(1).max(500).nullable(),
  unresolvedCandidates: z.array(z.object({
    canonicalId: z.string().trim().min(1).max(240),
    entityType: z.enum(["PIECE", "DROP", "ORDER", "INVENTORY", "MEDIA", "MODEL", "SERVICE"]).default("PIECE"),
    label: z.string().trim().min(1).max(240),
    reference: z.string().trim().min(1).max(240),
    route: z.string().trim().min(1).max(500).nullable().default(null),
  }).strict()).max(6),
}).strict();

export type StudioAssistantFocus = z.infer<typeof studioAssistantFocusSchema>;

export const studioAssistantThreadTaskSchema = z.object({
  action: z.object({
    href: z.string().trim().min(1).max(500),
    label: z.string().trim().min(1).max(160),
  }).strict(),
  consequence: z.string().trim().min(1).max(1_200),
  createdAt: z.string().datetime(),
  id: z.string().trim().min(1).max(160),
  objective: z.string().trim().min(1).max(1_200),
  risk: z.enum(["R0", "R1", "R2", "R3"]),
  status: z.enum(["OPEN", "DONE"]),
  steps: z.array(z.object({
    id: z.string().trim().min(1).max(160),
    label: z.string().trim().min(1).max(500),
  }).strict()).min(1).max(8),
  title: z.string().trim().min(1).max(240),
}).strict();

export type StudioAssistantThreadTask = z.infer<typeof studioAssistantThreadTaskSchema>;

export type StudioAssistantMessageAuthor = Readonly<{
  actorSubject: string | null;
  displayName: string;
  email: string | null;
}>;

export type StudioAssistantStoredMessage = Readonly<{
  author: StudioAssistantMessageAuthor;
  createdAt: string;
  message: StudioAssistantUIMessage;
  model: string | null;
  status: "ABORTED" | "COMPLETE" | "ERROR" | "PENDING";
  tokenUsage: Record<string, number> | null;
}>;

export type StudioAssistantThreadSummary = Readonly<{
  archivedAt: string | null;
  createdAt: string;
  createdBy: StudioAssistantMessageAuthor;
  focus: StudioAssistantFocus | null;
  id: string;
  pendingTaskCount: number;
  state: "ARCHIVED" | "OPEN";
  title: string;
  updatedAt: string;
  updatedBy: StudioAssistantMessageAuthor;
  version: number;
}>;

export type StudioAssistantThreadDetail = StudioAssistantThreadSummary & Readonly<{
  messages: StudioAssistantStoredMessage[];
  pendingWork: StudioAssistantThreadTask[];
}>;

export const createStudioAssistantThreadSchema = z.object({
  pieceReference: z.string().trim().min(1).max(240).optional(),
  title: z.string().trim().min(1).max(120).optional(),
}).strict();

export const updateStudioAssistantThreadSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("RENAME"),
    expectedVersion: z.number().int().positive(),
    title: z.string().trim().min(1).max(120),
  }).strict(),
  z.object({
    action: z.literal("ARCHIVE"),
    expectedVersion: z.number().int().positive(),
  }).strict(),
  z.object({
    action: z.literal("RESTORE"),
    expectedVersion: z.number().int().positive(),
  }).strict(),
  z.object({
    action: z.literal("SAVE_TASK"),
    expectedVersion: z.number().int().positive(),
    task: studioAssistantThreadTaskSchema,
  }).strict(),
  z.object({
    action: z.literal("SET_TASK_STATUS"),
    expectedVersion: z.number().int().positive(),
    status: z.enum(["OPEN", "DONE"]),
    taskId: z.string().trim().min(1).max(160),
  }).strict(),
  z.object({
    action: z.literal("DELETE_TASK"),
    expectedVersion: z.number().int().positive(),
    taskId: z.string().trim().min(1).max(160),
  }).strict(),
]);

export const reconcileStudioAssistantReplySchema = z.object({
  expectedThreadVersion: z.number().int().positive(),
}).strict();

export const studioAssistantReplyReconcileOutcomeSchema = z.enum([
  "RUNNING",
  "RECOVERED",
  "TERMINAL",
]);

export type StudioAssistantReplyReconcileOutcome = z.infer<
  typeof studioAssistantReplyReconcileOutcomeSchema
>;

export const sendStudioAssistantMessageSchema = z.object({
  message: z.unknown(),
  scenario: z.string().trim().max(80).optional(),
  threadId: z.string().uuid().optional(),
}).strict().superRefine((input, context) => {
  if (!input.scenario && !input.threadId) {
    context.addIssue({
      code: "custom",
      message: "Connected Ask Studio requires a conversation.",
      path: ["threadId"],
    });
  }
});
