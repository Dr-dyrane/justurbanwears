import { z } from "zod";

export const startGarmentSetSchema = z.object({
  costConfirmed: z.literal(true),
});

export const garmentSetSlotKeys = [
  "GARMENT_FRONT",
  "GARMENT_BACK",
  "FABRIC_DETAIL",
  "MANNEQUIN_FRONT",
  "LULU_TRY_ON",
  "EDITORIAL_LULU",
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
  label: string;
  state: GarmentSetSlotState;
  assetUrl?: string;
  jobId?: string;
  canRetry?: boolean;
  inferred?: boolean;
};

export type GarmentSetWorkspace = {
  id: string;
  wardrobeItemId: string;
  title: string;
  state: "INCOMPLETE" | "BUILDING" | "REVIEW" | "COMPLETE";
  slots: GarmentSetSlot[];
  nextAction: "BUILD" | "REVIEW" | "DONE";
  maxAdditionalCostUsd: string;
};
