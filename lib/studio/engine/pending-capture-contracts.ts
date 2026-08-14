import type { GarmentReference } from "../domain/entities";

export const PENDING_DIRECT_CAPTURE_ROLES = [
  "GARMENT_FRONT",
  "GARMENT_BACK",
  "FABRIC_DETAIL",
] as const;

export type PendingDirectCaptureRole = (typeof PENDING_DIRECT_CAPTURE_ROLES)[number];

export type OperatorSafePendingCapture = {
  id: string;
  role: PendingDirectCaptureRole;
  view: GarmentReference["view"];
  mimeType: string;
  width: number | null;
  height: number | null;
  assetUrl: string;
  approvedAt: string;
};

export function pendingCaptureView(role: PendingDirectCaptureRole): GarmentReference["view"] {
  if (role === "GARMENT_FRONT") return "FRONT";
  if (role === "GARMENT_BACK") return "BACK";
  return "DETAIL";
}

export function isPendingDirectCaptureRole(value: unknown): value is PendingDirectCaptureRole {
  return typeof value === "string" && PENDING_DIRECT_CAPTURE_ROLES.includes(value as PendingDirectCaptureRole);
}
