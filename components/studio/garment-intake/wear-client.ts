import { StudioEngineError } from "./engine-client";

export type WearOperation = "MANNEQUIN_FRONT" | "MODEL_TRY_ON" | "EDITORIAL_MODEL";

export interface WearModel {
  id: string;
  name: string;
  kind: "LULU_V3" | "AUTHORIZED_STOCK";
  state: "READY";
  sourceAssetUrl: string;
}

export interface WearGeneration {
  id: string;
  operation: WearOperation;
  state: "PENDING" | "RUNNING" | "COMPLETE" | "APPROVED" | "REJECTED" | "FAILED";
  modelProfileId: string | null;
  parentGenerationId: string | null;
  outputAssetId: string | null;
  outputUrl: string | null;
  retryAvailable: boolean;
  createdAt: string;
}

export interface WearWorkspace {
  wardrobeItemId: string;
  intakeId: string;
  title: string;
  garmentAssetUrl: string;
  models: WearModel[];
  generations: WearGeneration[];
  missingViews: ["GARMENT_BACK", "FABRIC_DETAIL"];
  publicationState: "PRIVATE_DRAFT";
}

interface EngineErrorBody { error?: { code?: string; message?: string; recovery?: string } }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      credentials: "same-origin",
      ...init,
      headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new StudioEngineError(0, "NETWORK_UNAVAILABLE", "Studio could not connect.", "Check your connection and try again.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as EngineErrorBody;
    throw new StudioEngineError(response.status, body.error?.code || "ENGINE_ERROR", body.error?.message || "Studio could not finish that action.", body.error?.recovery);
  }
  return response.json() as Promise<T>;
}

export function readWear(wardrobeItemId: string) {
  return request<{ workspace: WearWorkspace }>(`/api/studio/wardrobe/${wardrobeItemId}/wear`);
}

export function generateWear(wardrobeItemId: string, input: {
  operation: WearOperation;
  modelProfileId?: string;
  parentGenerationId?: string;
  correction?: string;
}) {
  return request<{ workspace: WearWorkspace; reused: boolean }>(`/api/studio/wardrobe/${wardrobeItemId}/wear`, { method: "POST", body: JSON.stringify(input) });
}

export function decideWear(wardrobeItemId: string, generationId: string, decision: "KEEP" | "EDIT" | "REJECT" | "RETRY", note?: string) {
  return request<{ workspace: WearWorkspace }>(`/api/studio/wardrobe/${wardrobeItemId}/wear/${generationId}/decision`, { method: "POST", body: JSON.stringify({ decision, note }) });
}

export function addWearModel(wardrobeItemId: string, input: { name: string; licenseUrl: string; file: File }) {
  const body = new FormData();
  body.set("name", input.name);
  body.set("licenseUrl", input.licenseUrl);
  body.set("authorityConfirmed", "true");
  body.set("file", input.file);
  return request<{ model: WearModel; workspace: WearWorkspace }>(`/api/studio/wardrobe/${wardrobeItemId}/models`, { method: "POST", body });
}
