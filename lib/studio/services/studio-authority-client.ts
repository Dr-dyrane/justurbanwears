"use client";

import type { ShopServerOrder } from "../../shop/server-order/types";

export type StudioAuthorityStatus = "idle" | "loading" | "ready" | "error";

export type StudioAuthorityHold = {
  id: string;
  sku: string;
  customerName: string;
  contact: string;
  reason: string;
  status: "ACTIVE" | "RELEASED" | "EXPIRED";
  expiresAt: string;
  createdAt: string;
  releasedAt: string | null;
};

export type StudioAuthorityPiece = {
  pieceKey: string;
  wardrobeItemId: string | null;
  sku: string | null;
  title: string;
  category: string;
  colour: string;
  condition: string;
  sizeLabel: string;
  imageSrc: string | null;
  availability: "PRIVATE" | "AVAILABLE" | "RESERVED" | "SOLD" | "ARCHIVED";
  expectedLocationKey: string;
  expectedLocationLabel: string;
  expectedCustody: "STUDIO" | "COURIER" | "CUSTOMER" | "UNKNOWN";
  orderReference: string | null;
  observedLocationKey: string | null;
  observedLocationLabel: string | null;
  observedAt: string | null;
  hasLocationMismatch: boolean;
  activeHold: StudioAuthorityHold | null;
};

export type StudioAuthorityModel = {
  id: string;
  name: string;
  kind: "LULU_V3" | "AUTHORIZED_STOCK";
  state: "READY" | "ARCHIVED";
  sourceAssetUrl: string;
  licenseUrl: string | null;
  authorityConfirmedAt: string;
  authority: {
    adultConfirmed?: boolean;
    operatorAuthorityConfirmed?: boolean;
    allowedUse?: string;
    restrictedUse?: string;
    styling?: { hair?: string; makeup?: string; direction?: string };
    revokedAt?: string;
    revocationReason?: string;
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
};

export type StudioAuthorityMedia = {
  id: string;
  wardrobeItemId: string;
  title: string;
  sku: string | null;
  operation: "GARMENT_FRONT" | "GARMENT_BACK" | "FABRIC_DETAIL" | "MANNEQUIN_FRONT" | "MODEL_TRY_ON" | "EDITORIAL_MODEL";
  state: "PENDING" | "RUNNING" | "COMPLETE" | "APPROVED" | "REJECTED" | "FAILED";
  outputUrl: string | null;
  modelName: string | null;
  costUsd: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StudioAuthorityNotification = {
  id: string;
  kind: "MODEL" | "WARDROBE" | "PUBLISHING" | "ORDER" | "RETURN" | "HOLD" | "LOCATION" | "MEDIA";
  tone: "critical" | "attention" | "neutral";
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
  createdAt: string;
};

export type StudioAuthoritySnapshot = {
  pieces: StudioAuthorityPiece[];
  orders: ShopServerOrder[];
  holds: StudioAuthorityHold[];
  models: StudioAuthorityModel[];
  media: StudioAuthorityMedia[];
  notifications: StudioAuthorityNotification[];
  generatedAt: string;
};

type ApiFailure = { error?: { message?: string; recovery?: string } };

async function body<T>(response: Response): Promise<T> {
  const value = await response.json().catch(() => ({})) as T | ApiFailure;
  if (response.ok) return value as T;
  const failure = value as ApiFailure;
  throw new Error([failure.error?.message, failure.error?.recovery].filter(Boolean).join(" ") || "Studio could not complete that action.");
}

export async function readStudioAuthority(signal?: AbortSignal): Promise<StudioAuthoritySnapshot> {
  const response = await fetch("/api/studio/authority", {
    cache: "no-store",
    credentials: "same-origin",
    headers: { accept: "application/json" },
    signal,
  });
  return body<StudioAuthoritySnapshot>(response);
}

async function command<T>(path: string, input: Record<string, unknown>, method = "POST"): Promise<T> {
  const response = await fetch(path, {
    body: JSON.stringify(input),
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    method,
  });
  return body<T>(response);
}

export function createStudioHold(input: {
  sku: string;
  customerName: string;
  contact: string;
  reason: string;
  expiresAt: string;
  idempotencyKey: string;
}) {
  return command<{ hold: StudioAuthorityHold; receipt: { consequence: string; next: string } }>("/api/studio/authority/holds", input);
}

export function releaseStudioHold(id: string) {
  return command<{ hold: StudioAuthorityHold; receipt: { consequence: string; next: string } }>(`/api/studio/authority/holds/${encodeURIComponent(id)}`, { action: "RELEASE" }, "PATCH");
}

export function dismissStudioNotification(id: string) {
  return command<{ dismissed: true }>(`/api/studio/authority/notifications/${encodeURIComponent(id)}`, { action: "DISMISS" }, "PATCH");
}

export function recordStudioLocation(input: {
  command: "CONFIRM" | "MOVE";
  pieceKey: string;
  locationKey: "WARDROBE_RAIL" | "PACKING_SHELF" | "RETURN_INSPECTION";
  note?: string;
  idempotencyKey: string;
}) {
  return command<{ receipt: { consequence: string; next: string } }>("/api/studio/authority/location", input);
}
