export type IntakeSourceMode = "CAMERA" | "UPLOAD" | "DESCRIBE";

export interface IntakeFacts {
  title: string;
  category: string;
  colour: string;
  sizeLabel: string;
  condition: string;
  price: number;
}

export interface IntakeSnapshot {
  id: string;
  kind: "GARMENT";
  sourceMode: IntakeSourceMode;
  state: string;
  version: number;
  description?: string | null;
  facts?: Partial<IntakeFacts>;
  assets: Array<{
    id: string;
    role: string;
    mimeType: string;
    width?: number;
    height?: number;
  }>;
  candidate?: {
    generationId: string;
    assetId: string;
    status: string;
  };
  wardrobeItemId?: string;
}

export type IntakeDecision = "KEEP" | "EDIT" | "REJECT" | "RETRY";

export interface GarmentIntakeClient {
  listActiveIntakes?(): Promise<{ intakes: IntakeSnapshot[] }>;
  getIntake?(intakeId: string): Promise<{ intake: IntakeSnapshot }>;
  createIntake(sourceMode: IntakeSourceMode, description?: string): Promise<{ intake: IntakeSnapshot }>;
  addSource(intakeId: string, file: File): Promise<{ intake: IntakeSnapshot }>;
  analyzeIntake(intake: IntakeSnapshot, description?: string): Promise<{ intake: IntakeSnapshot }>;
  generateGarment(intake: IntakeSnapshot, correction?: string): Promise<{ intake: IntakeSnapshot; reused: boolean }>;
  decideIntake(intake: IntakeSnapshot, decision: IntakeDecision, note?: string): Promise<{ intake: IntakeSnapshot }>;
  commitIntake(intake: IntakeSnapshot, facts: IntakeFacts): Promise<{
    intake: IntakeSnapshot;
    wardrobeItem: { id: string; state: "DRAFT" };
  }>;
  candidateUrl(intake: IntakeSnapshot): string | undefined;
  sourceUrl?(intake: IntakeSnapshot): string | undefined;
}

interface EngineErrorBody {
  error?: {
    code?: string;
    message?: string;
    recovery?: string;
  };
}

export class StudioEngineError extends Error {
  code: string;
  recovery: string;
  status: number;

  constructor(status: number, code: string, message: string, recovery = "Try again.") {
    super(message);
    this.name = "StudioEngineError";
    this.status = status;
    this.code = code;
    this.recovery = recovery;
  }
}

async function engineRequest<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, {
      cache: "no-store",
      credentials: "same-origin",
      ...init,
      headers: init?.body instanceof FormData
        ? init.headers
        : { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new StudioEngineError(0, "NETWORK_UNAVAILABLE", "Studio could not connect.", "Check your connection and try again.");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as EngineErrorBody;
    throw new StudioEngineError(
      response.status,
      body.error?.code ?? "ENGINE_ERROR",
      body.error?.message ?? "Studio could not finish that action.",
      body.error?.recovery,
    );
  }
  return response.json() as Promise<T>;
}

function key() {
  return globalThis.crypto?.randomUUID?.() ?? `intake-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function createIntake(sourceMode: IntakeSourceMode, description?: string) {
  return engineRequest<{ intake: IntakeSnapshot }>("/api/studio/intakes", {
    method: "POST",
    body: JSON.stringify({ kind: "GARMENT", sourceMode, description, idempotencyKey: key() }),
  });
}

export async function listActiveIntakes() {
  return engineRequest<{ intakes: IntakeSnapshot[] }>("/api/studio/intakes");
}

export async function getIntake(intakeId: string) {
  return engineRequest<{ intake: IntakeSnapshot }>(`/api/studio/intakes/${intakeId}`);
}

export async function addSource(intakeId: string, file: File) {
  const body = new FormData();
  body.set("file", file);
  body.set("role", "SOURCE");
  return engineRequest<{ intake: IntakeSnapshot }>(`/api/studio/intakes/${intakeId}/assets`, { method: "POST", body });
}

export async function analyzeIntake(intake: IntakeSnapshot, description?: string) {
  return engineRequest<{ intake: IntakeSnapshot }>(`/api/studio/intakes/${intake.id}/analyze`, {
    method: "POST",
    body: JSON.stringify({ description, expectedVersion: intake.version }),
  });
}

export async function generateGarment(intake: IntakeSnapshot, correction?: string) {
  return engineRequest<{ intake: IntakeSnapshot; reused: boolean }>(`/api/studio/intakes/${intake.id}/generate`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion: intake.version, operation: "GARMENT_FRONT", correction }),
  });
}

export async function decideIntake(
  intake: IntakeSnapshot,
  decision: IntakeDecision,
  note?: string,
) {
  return engineRequest<{ intake: IntakeSnapshot }>(`/api/studio/intakes/${intake.id}/decision`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion: intake.version, decision, note }),
  });
}

export async function commitIntake(intake: IntakeSnapshot, facts: IntakeFacts) {
  return engineRequest<{ intake: IntakeSnapshot; wardrobeItem: { id: string; state: "DRAFT" } }>(`/api/studio/intakes/${intake.id}/commit`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion: intake.version, facts }),
  });
}

export function candidateUrl(intake: IntakeSnapshot) {
  return intake.candidate?.assetId
    ? `/api/studio/intakes/${intake.id}/assets/${intake.candidate.assetId}`
    : undefined;
}

export function sourceUrl(intake: IntakeSnapshot) {
  const source = intake.assets.find((asset) => asset.role === "SOURCE");
  return source ? `/api/studio/intakes/${intake.id}/assets/${source.id}` : undefined;
}

export const studioEngineIntakeClient: GarmentIntakeClient = {
  listActiveIntakes,
  getIntake,
  createIntake,
  addSource,
  analyzeIntake,
  generateGarment,
  decideIntake,
  commitIntake,
  candidateUrl,
  sourceUrl,
};
