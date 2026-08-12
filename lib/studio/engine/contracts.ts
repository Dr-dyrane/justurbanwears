import { z } from "zod";

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

export type OperatorSafeAsset = {
  id: string;
  role: "SOURCE" | "GARMENT_FRONT" | "MANNEQUIN_FRONT" | "MODEL_TRY_ON";
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
  createdAt: string;
  updatedAt: string;
};
