import { z } from "zod";
import type { OperatorSafePendingCapture } from "./pending-capture-contracts";
import type { StudioPublicationReceipt } from "./catalogue-publication-contracts";

export const intakeFactsSchema = z.object({
  title: z.string().trim().min(1).max(100),
  category: z.enum(["Dress", "Shirt", "Set", "Knitwear", "Skirt", "Trousers", "Other"]),
  colour: z.string().trim().min(1).max(60),
  sizeLabel: z.string().trim().min(1).max(60).default("Size on request"),
  condition: z.string().trim().min(1).max(100).default("Excellent · real-worn wardrobe piece"),
  price: z.number().int().min(0).max(10_000_000).default(0),
});

export type IntakeFacts = z.infer<typeof intakeFactsSchema>;

export const createIntakeSchema = z.object({
  kind: z.literal("GARMENT"),
  sourceMode: z.enum(["CAMERA", "UPLOAD", "DESCRIBE"]),
  description: z.string().trim().max(2_000).optional(),
  idempotencyKey: z.string().trim().min(8).max(160).regex(/^[a-zA-Z0-9._:-]+$/),
}).superRefine((value, context) => {
  if (value.sourceMode === "DESCRIBE" && !value.description) {
    context.addIssue({ code: "custom", path: ["description"], message: "Describe the garment." });
  }
});

export const analyzeIntakeSchema = z.object({
  description: z.string().trim().max(2_000).optional(),
  expectedVersion: z.number().int().positive(),
});

export const generateIntakeSchema = z.object({
  expectedVersion: z.number().int().positive(),
  operation: z.literal("GARMENT_FRONT"),
  correction: z.string().trim().max(500).optional(),
});

export const decisionSchema = z.object({
  expectedVersion: z.number().int().positive(),
  decision: z.enum(["KEEP", "EDIT", "REJECT", "RETRY"]),
  note: z.string().trim().max(500).optional(),
});

export const commitIntakeSchema = z.object({
  expectedVersion: z.number().int().positive(),
  facts: intakeFactsSchema,
});

export const wearOperationSchema = z.enum([
  "MANNEQUIN_FRONT",
  "MODEL_TRY_ON",
  "EDITORIAL_MODEL",
]);
export type WearOperation = z.infer<typeof wearOperationSchema>;

export const createWearGenerationSchema = z.object({
  operation: wearOperationSchema,
  modelProfileId: z.string().uuid().optional(),
  parentGenerationId: z.string().uuid().optional(),
  correction: z.string().trim().max(500).optional(),
}).superRefine((value, context) => {
  if (value.operation === "MODEL_TRY_ON" && !value.modelProfileId) {
    context.addIssue({ code: "custom", path: ["modelProfileId"], message: "Choose a model." });
  }
  if (value.operation === "EDITORIAL_MODEL" && !value.parentGenerationId) {
    context.addIssue({ code: "custom", path: ["parentGenerationId"], message: "Choose a model view." });
  }
});

export const wearDecisionSchema = z.object({
  decision: z.enum(["KEEP", "EDIT", "REJECT", "RETRY"]),
  note: z.string().trim().max(500).optional(),
});

export const createModelProfileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  licenseUrl: z.string().trim().url().max(500),
  authorityConfirmed: z.literal("true"),
});

export type OperatorSafeModelProfile = {
  id: string;
  name: string;
  kind: "LULU_V3" | "AUTHORIZED_STOCK";
  state: "READY";
  sourceAssetUrl: string;
};

export type OperatorSafeWearGeneration = {
  id: string;
  operation: WearOperation;
  state: "PENDING" | "RUNNING" | "COMPLETE" | "APPROVED" | "REJECTED" | "FAILED";
  modelProfileId: string | null;
  parentGenerationId: string | null;
  outputAssetId: string | null;
  outputUrl: string | null;
  retryAvailable: boolean;
  createdAt: string;
};

export type OperatorSafeWearWorkspace = {
  wardrobeItemId: string;
  intakeId: string;
  title: string;
  garmentAssetUrl: string;
  models: OperatorSafeModelProfile[];
  generations: OperatorSafeWearGeneration[];
  missingViews: ["GARMENT_BACK", "FABRIC_DETAIL"];
  publicationState: "PRIVATE_DRAFT";
};

export type OperatorSafeAsset = {
  id: string;
  role: "SOURCE" | "GARMENT_FRONT" | "MANNEQUIN_FRONT" | "MODEL_TRY_ON" | "EDITORIAL_MODEL";
  mimeType: string;
  width: number | null;
  height: number | null;
};

export type OperatorSafeIntake = {
  id: string;
  kind: "GARMENT" | "MODEL";
  sourceMode: "CAMERA" | "UPLOAD" | "DESCRIBE";
  state: "DRAFT" | "ANALYZING" | "REVIEW" | "GENERATING" | "DECISION" | "COMMITTED" | "FAILED" | "ARCHIVED";
  version: number;
  description: string | null;
  facts: Partial<IntakeFacts>;
  assets: OperatorSafeAsset[];
  candidate?: { generationId: string; assetId: string; status: "COMPLETE" | "APPROVED" | "REJECTED" };
  wardrobeItemId?: string;
};

export type OperatorSafeWardrobeItem = IntakeFacts & {
  id: string;
  intakeId: string;
  quantity: 1;
  state: "DRAFT" | "READY" | "ARCHIVED";
  approvedAssetId: string | null;
  directCaptures?: OperatorSafePendingCapture[];
  publication?: StudioPublicationReceipt;
  createdAt: string;
  updatedAt: string;
};
