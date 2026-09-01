export type IntakeSourceMode = "CAMERA" | "UPLOAD" | "DESCRIBE";

export interface IntakeFacts {
  title: string;
  description?: string;
  category: string;
  colour: string;
  sizeLabel: string;
  condition: string;
  price: number;
}

export interface StudioDecisionReceipt {
  receiptId: string;
  generationId: string;
  decision: "KEEP" | "EDIT" | "REJECT" | "RETRY";
  noteSha256: string;
  decidedAt: string;
}

export interface StudioCorrectionAuthority {
  generationId: string;
  decisionReceiptId: string;
}

export async function studioDecisionNoteSha256(note?: string) {
  const normalized = note?.trim() || "";
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function studioDecisionReceiptMatches(input: {
  receipt?: StudioDecisionReceipt | null;
  generationId: string;
  decision: StudioDecisionReceipt["decision"];
  noteSha256: string;
}) {
  return input.receipt?.generationId === input.generationId
    && input.receipt.decision === input.decision
    && input.receipt.noteSha256 === input.noteSha256;
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
  decisionReceipt?: StudioDecisionReceipt;
  wardrobeItemId?: string;
  reconciliation?: {
    state: "INDETERMINATE";
    retryAllowed: false;
    message: string;
  };
}

export type IntakeDecision = "KEEP" | "EDIT" | "REJECT" | "RETRY";

export interface GarmentIntakeClient {
  listActiveIntakes?(): Promise<{ intakes: IntakeSnapshot[] }>;
  getIntake?(intakeId: string): Promise<{ intake: IntakeSnapshot }>;
  createIntake(sourceMode: IntakeSourceMode, description?: string, idempotencyKey?: string): Promise<{ intake: IntakeSnapshot }>;
  addSource(intakeId: string, file: File): Promise<{ intake: IntakeSnapshot }>;
  analyzeIntake(intake: IntakeSnapshot, description?: string): Promise<{ intake: IntakeSnapshot }>;
  generateGarment(
    intake: IntakeSnapshot,
    correction?: string,
    correctionAuthority?: StudioCorrectionAuthority,
  ): Promise<{ intake: IntakeSnapshot; reused: boolean }>;
  decideIntake(intake: IntakeSnapshot, decision: IntakeDecision, note?: string): Promise<{ intake: IntakeSnapshot }>;
  commitIntake(intake: IntakeSnapshot, facts: IntakeFacts): Promise<{
    intake: IntakeSnapshot;
    wardrobeItem: { id: string; state: "DRAFT" };
  }>;
  candidateUrl(intake: IntakeSnapshot): string | undefined;
  sourceUrl?(intake: IntakeSnapshot): string | undefined;
}

const STUDIO_CLIENT_REQUEST_TIMEOUT_MS = 60_000;

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
      signal: init?.signal ?? AbortSignal.timeout(STUDIO_CLIENT_REQUEST_TIMEOUT_MS),
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

export async function createIntake(sourceMode: IntakeSourceMode, description?: string, idempotencyKey?: string) {
  return engineRequest<{ intake: IntakeSnapshot }>("/api/studio/intakes", {
    method: "POST",
    body: JSON.stringify({ kind: "GARMENT", sourceMode, description, idempotencyKey: idempotencyKey ?? key() }),
  });
}

export type IntakeRecoveryStep = "build" | "confirm" | "receipt" | "reconcile" | "source";

export function intakeRecoveryStep(intake: IntakeSnapshot): IntakeRecoveryStep {
  if (intake.reconciliation?.state === "INDETERMINATE") return "reconcile";
  if (intake.wardrobeItemId || intake.state === "COMMITTED") return "receipt";
  if (["ANALYZING", "GENERATING"].includes(intake.state)) return "build";
  if (
    intake.state === "DECISION"
    && intake.candidate
    && ["COMPLETE", "APPROVED"].includes(intake.candidate.status)
  ) return "confirm";
  return "source";
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

export async function generateGarment(
  intake: IntakeSnapshot,
  correction?: string,
  correctionAuthority?: StudioCorrectionAuthority,
) {
  return engineRequest<{ intake: IntakeSnapshot; reused: boolean }>(`/api/studio/intakes/${intake.id}/generate`, {
    method: "POST",
    body: JSON.stringify({
      expectedVersion: intake.version,
      operation: "GARMENT_FRONT",
      correction,
      correctionGenerationId: correctionAuthority?.generationId,
      decisionReceiptId: correctionAuthority?.decisionReceiptId,
    }),
  });
}

function requireCandidateGenerationId(intake: IntakeSnapshot): string {
  if (intake.candidate?.generationId) return intake.candidate.generationId;
  throw new StudioEngineError(409, "INVALID_TRANSITION", "The exact garment candidate is unavailable.", "Reload the current intake before deciding or saving.");
}

export async function decideIntake(
  intake: IntakeSnapshot,
  decision: IntakeDecision,
  note?: string,
) {
  return engineRequest<{ intake: IntakeSnapshot }>(`/api/studio/intakes/${intake.id}/decision`, {
    method: "POST",
    body: JSON.stringify({
      expectedVersion: intake.version,
      generationId: requireCandidateGenerationId(intake),
      decision,
      note,
    }),
  });
}

export async function commitIntake(intake: IntakeSnapshot, facts: IntakeFacts) {
  return engineRequest<{ intake: IntakeSnapshot; wardrobeItem: { id: string; state: "DRAFT" } }>(`/api/studio/intakes/${intake.id}/commit`, {
    method: "POST",
    body: JSON.stringify({
      expectedVersion: intake.version,
      generationId: requireCandidateGenerationId(intake),
      facts,
    }),
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
