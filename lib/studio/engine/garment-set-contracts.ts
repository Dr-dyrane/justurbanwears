import { z } from "zod";

const garmentSetRevisionSchema = z.string().regex(/^[a-f0-9]{24}$/);
const garmentSetCommandBase = {
  expectedRevision: garmentSetRevisionSchema,
  idempotencyKey: z.string().trim().min(8).max(160).regex(/^[a-zA-Z0-9._:-]+$/),
};

export const garmentSetCommandSchema = z.discriminatedUnion("command", [
  z.object({
    ...garmentSetCommandBase,
    command: z.literal("ADVANCE_CURRENT"),
    costConfirmed: z.literal(true),
  }),
  z.object({
    ...garmentSetCommandBase,
    command: z.literal("KEEP_CURRENT"),
  }),
  z.object({
    ...garmentSetCommandBase,
    command: z.literal("FIX_CURRENT"),
    correction: z.string().trim().min(1).max(500),
  }),
  z.object({
    ...garmentSetCommandBase,
    command: z.literal("REJECT_CURRENT"),
  }),
]);

export type GarmentSetCommand = z.infer<typeof garmentSetCommandSchema>;

export const garmentSetSlotKeys = [
  "GARMENT_FRONT",
  "GARMENT_BACK",
  "MANNEQUIN_FRONT",
  "FABRIC_DETAIL",
  "LULU_TRY_ON",
] as const;

export type GarmentSetSlotKey = (typeof garmentSetSlotKeys)[number];
export type GarmentSetSlotState =
  | "MISSING"
  | "WAITING"
  | "BUILDING"
  | "REVIEW"
  | "KEPT"
  | "FAILED";

export type GarmentSetSlot = {
  key: GarmentSetSlotKey;
  view: "01" | "02" | "03" | "04" | "05";
  label: string;
  state: GarmentSetSlotState;
  assetUrl?: string;
  jobId?: string;
  canRetry?: boolean;
  inferred?: boolean;
};

export type GarmentSetNextAction =
  | "ADVANCE"
  | "REVIEW"
  | "WAIT"
  | "BLOCKED"
  | "DONE";

export type GarmentSetReceipt = {
  title: string;
  detail: string;
  visibility: "PRIVATE";
};

export type GarmentSetWorkspace = {
  id: string;
  wardrobeItemId: string;
  title: string;
  state: "INCOMPLETE" | "BUILDING" | "REVIEW" | "BLOCKED" | "COMPLETE";
  stage: "PRODUCT" | "LULU" | "COMPLETE";
  slots: GarmentSetSlot[];
  currentSlotKey: GarmentSetSlotKey | null;
  nextAction: GarmentSetNextAction;
  nextActionLabel: string;
  progress: { kept: number; total: number; percent: number };
  missingEvidence: string | null;
  receipt: GarmentSetReceipt | null;
  revision: string;
  maxAdditionalCostUsd: string;
};
