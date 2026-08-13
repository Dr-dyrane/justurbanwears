import {
  APICallError,
  generateImage,
  generateText,
  InvalidPromptError,
  Output,
  TypeValidationError,
  type FilePart,
} from "ai";
import { z } from "zod";
import { intakeFactsSchema, type IntakeFacts } from "../studio/engine/contracts";
import { StudioEngineError } from "../studio/engine/errors";

const DEFAULT_TEXT_MODEL = "google/gemini-2.5-flash-lite";
const DEFAULT_TEXT_FALLBACK = "google/gemini-2.5-flash";
const DEFAULT_IMAGE_MODEL = "bfl/flux-2-klein-4b";
const DEFAULT_IMAGE_COST_CAP_USD = 0.025;
const APPROVED_IMAGE_MODEL_CEILINGS_USD: Readonly<Record<string, number>> = Object.freeze({
  // AI Gateway currently reports about $0.021 for the 4:5 edit used by
  // Studio. Keep a narrow allowance above that observed price while still
  // failing closed if provider pricing moves materially.
  "bfl/flux-2-klein-4b": DEFAULT_IMAGE_COST_CAP_USD,
});

export const studioGatewayPolicy = {
  textModel: process.env.STUDIO_AI_TEXT_MODEL || DEFAULT_TEXT_MODEL,
  imageModel: process.env.STUDIO_AI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
  imageCostCapUsd: Number(
    process.env.STUDIO_AI_IMAGE_COST_CAP_USD || String(DEFAULT_IMAGE_COST_CAP_USD),
  ),
  promptVersion: "garment-front-v2",
} as const;

export type StudioGatewayFailureMetadata = Readonly<{
  stage: "analysis" | "generation";
  classification: "validation" | "provider" | "gateway" | "timeout" | "unknown";
  model: string;
  errorNames: readonly string[];
  statusCode: number | null;
  gatewayType: string | null;
  generationId: string | null;
  requestId: string | null;
  retryable: boolean | null;
}>;

export class StudioGatewayError extends StudioEngineError {
  constructor(
    message: string,
    recovery: string,
    readonly upstream: StudioGatewayFailureMetadata,
  ) {
    super("GENERATION_FAILED", 502, message, recovery);
  }
}

const SAFE_REQUEST_ID_HEADERS = [
  "x-ai-gateway-generation-id",
  "x-request-id",
  "x-vercel-id",
] as const;

function safeToken(value: unknown, maxLength = 128): string | null {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && /^[a-zA-Z0-9._:/-]+$/.test(value)
    ? value
    : null;
}

function errorChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current = error;
  while (current && chain.length < 4 && !chain.includes(current)) {
    chain.push(current);
    const record = typeof current === "object" && current !== null
      ? current as { cause?: unknown; lastError?: unknown; errors?: unknown[] }
      : null;
    current = record?.lastError
      ?? record?.errors?.at(-1)
      ?? record?.cause;
  }
  return chain;
}

export function sanitizeStudioGatewayFailure(
  stage: StudioGatewayFailureMetadata["stage"],
  model: string,
  error: unknown,
): StudioGatewayFailureMetadata {
  const chain = errorChain(error);
  const records = chain.filter((item): item is Record<string, unknown> =>
    typeof item === "object" && item !== null
  );
  const names = chain.map((item) => item instanceof Error ? item.name : "UnknownError").slice(0, 4);
  const validation = chain.some((item) =>
    TypeValidationError.isInstance(item)
    || InvalidPromptError.isInstance(item)
    || item instanceof z.ZodError
    || (item instanceof Error && ["InvalidDataContentError", "InvalidPromptError"].includes(item.name))
  );
  const timeout = chain.some((item) =>
    item instanceof Error && (item.name === "AbortError" || item.name === "TimeoutError")
  );
  const apiCall = chain.find(APICallError.isInstance);
  const gatewayRecord = records.find((item) =>
    typeof item.name === "string" && item.name.startsWith("Gateway")
  );
  const statusRecord = records.find((item) =>
    typeof item.statusCode === "number" && item.statusCode >= 100 && item.statusCode <= 599
  );
  const retryableRecord = records.find((item) => typeof item.isRetryable === "boolean");
  const headerRecord = records.find((item) =>
    typeof item.responseHeaders === "object" && item.responseHeaders !== null
  );
  const headers = headerRecord?.responseHeaders as Record<string, unknown> | undefined;
  const requestId = headers
    ? SAFE_REQUEST_ID_HEADERS.map((name) => safeToken(headers[name])).find(Boolean) ?? null
    : null;
  const gatewayType = safeToken(gatewayRecord?.type, 64);
  const classification = validation
    ? "validation"
    : timeout
      ? "timeout"
      : apiCall || gatewayType === "failed_dependency"
        ? "provider"
        : gatewayRecord
          ? "gateway"
          : "unknown";
  return Object.freeze({
    stage,
    classification,
    model,
    errorNames: Object.freeze(names),
    statusCode: typeof statusRecord?.statusCode === "number" ? statusRecord.statusCode : null,
    gatewayType,
    generationId: safeToken(gatewayRecord?.generationId),
    requestId,
    retryable: typeof retryableRecord?.isRetryable === "boolean"
      ? retryableRecord.isRetryable
      : null,
  });
}

function analysisSourcePart(sourceDataUrl: string): FilePart {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/i.exec(sourceDataUrl);
  const mediaType = match?.[1]?.toLowerCase();
  if (!mediaType || !match?.[2]) {
    throw new StudioEngineError(
      "INVALID_ASSET",
      415,
      "That image cannot be read.",
      "Choose a JPEG, PNG or WebP.",
    );
  }
  return {
    type: "file",
    mediaType,
    data: Uint8Array.from(Buffer.from(match[2], "base64")),
  };
}

export function assertStudioImageBudget(): void {
  const modelCeiling = APPROVED_IMAGE_MODEL_CEILINGS_USD[studioGatewayPolicy.imageModel];
  if (modelCeiling === undefined || studioGatewayPolicy.imageCostCapUsd < modelCeiling) {
    throw new StudioEngineError(
      "GENERATION_FAILED",
      503,
      "The image model is outside the Studio budget.",
      "Ask an administrator to approve the image model and budget.",
    );
  }
}

export function buildGarmentFrontPrompt(input: {
  facts: Partial<IntakeFacts>;
  correction?: string;
}): string {
  return [
    "Create one clean product-only straight-on front catalogue image of the exact garment.",
    "Use the supplied source image as the primary construction authority when present; otherwise use only the confirmed facts.",
    "Reproduce the visible front construction exactly: neckline, shoulder line, sleeve cut, sleeve length and volume, waist seam or gathering, silhouette, garment length and hem treatment.",
    "Preserve the visible fabric surface and drape; never infer or name a material or fibre composition that is not confirmed.",
    "Do not reinterpret, simplify, lengthen, shorten, smooth or add those features. Never turn a dolman or batwing sleeve into a long or puff sleeve, and never remove a visible gathered or elastic waist.",
    "Neutral warm-paper background, even soft light, complete visible edges, no person, mannequin, hanger, text, logo, label, brand tag or invented closure, pocket, seam, lining or back construction.",
    `Confirmed facts: ${JSON.stringify(input.facts)}.`,
    input.correction ? `Operator correction: ${input.correction}.` : "",
  ].filter(Boolean).join(" ");
}

export async function analyzeGarmentFacts(input: {
  description: string;
  sourceDataUrl?: string;
}): Promise<{ facts: IntakeFacts; usage: Record<string, unknown>; model: string }> {
  const instruction = [
    "Extract the garment facts into the required schema.",
    "Describe only visible or supplied garment truth. Use Size on request when unknown; use Excellent · real-worn wardrobe piece when condition is not supplied; use price 0 when unknown.",
    `Operator description: ${input.description || "No description supplied."}`,
  ].join("\n");
  try {
    const result = await generateText({
      model: studioGatewayPolicy.textModel,
      output: Output.object({ schema: intakeFactsSchema, name: "garment_facts" }),
      messages: [{
        role: "user",
        content: input.sourceDataUrl
          ? [{ type: "text", text: instruction }, analysisSourcePart(input.sourceDataUrl)]
          : instruction,
      }],
      maxOutputTokens: 180,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(30_000),
      providerOptions: {
        gateway: {
          caching: "auto",
          sort: "cost",
          models: [DEFAULT_TEXT_FALLBACK],
          tags: ["studio:garment-intake", "stage:analysis"],
        },
      },
    });
    return {
      facts: result.output,
      usage: result.usage as unknown as Record<string, unknown>,
      model: studioGatewayPolicy.textModel,
    };
  } catch (error) {
    if (error instanceof StudioEngineError) throw error;
    throw new StudioGatewayError(
      "The garment details could not be read safely.",
      "Edit the description or use a clearer photo.",
      sanitizeStudioGatewayFailure("analysis", studioGatewayPolicy.textModel, error),
    );
  }
}

const gatewayCostSchema = z.union([z.string(), z.number()]).transform(Number);

export async function generateGarmentFront(input: {
  facts: Partial<IntakeFacts>;
  source?: { bytes: Uint8Array; mimeType: string };
  correction?: string;
  prompt?: string;
}) {
  const prompt = input.prompt ?? buildGarmentFrontPrompt(input);
  assertStudioImageBudget();
  try {
    const result = await generateImage({
      model: studioGatewayPolicy.imageModel,
      prompt: input.source
        ? { images: [input.source.bytes], text: prompt }
        : prompt,
      aspectRatio: "4:5",
      n: 1,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(60_000),
      providerOptions: { gateway: { sort: "cost" } },
    });
    const metadata = result.providerMetadata as Record<string, unknown>;
    const gateway = metadata.gateway && typeof metadata.gateway === "object"
      ? metadata.gateway as Record<string, unknown>
      : {};
    const parsedCost = gatewayCostSchema.safeParse(gateway.cost);
    const costUsd = parsedCost.success && Number.isFinite(parsedCost.data)
      ? parsedCost.data
      : null;
    return {
      bytes: result.image.uint8Array,
      mimeType: result.image.mediaType,
      usage: result.usage as unknown as Record<string, unknown>,
      costUsd,
      prompt,
    };
  } catch (error) {
    if (error instanceof StudioEngineError) throw error;
    throw new StudioGatewayError(
      "The garment image was not created.",
      "Try once more or edit the garment details.",
      sanitizeStudioGatewayFailure("generation", studioGatewayPolicy.imageModel, error),
    );
  }
}
