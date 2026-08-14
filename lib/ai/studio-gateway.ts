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
import type { WearOperation } from "../studio/engine/contracts";
import type {
  MediaCompletionRole,
  MediaCompletionSourceMode,
} from "../studio/engine/media-completion-contracts";

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
  sourceValidationModel: process.env.STUDIO_AI_SOURCE_VALIDATION_MODEL
    || process.env.STUDIO_AI_TEXT_MODEL
    || DEFAULT_TEXT_MODEL,
  imageModel: process.env.STUDIO_AI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
  imageCostCapUsd: Number(
    process.env.STUDIO_AI_IMAGE_COST_CAP_USD || String(DEFAULT_IMAGE_COST_CAP_USD),
  ),
  promptVersion: "garment-front-v2",
  mediaCompletionPromptVersions: Object.freeze({
    GARMENT_FRONT: "media-full-front-v1",
    GARMENT_BACK: "media-full-back-v2",
    FABRIC_DETAIL: "media-fabric-detail-v2",
  }),
  wearPromptVersions: Object.freeze({
    MANNEQUIN_FRONT: "mannequin-front-v1",
    MODEL_TRY_ON: "model-try-on-v1",
    EDITORIAL_MODEL: "editorial-model-v2",
  }),
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
    readonly accounting: Readonly<{ usage: Record<string, number> | null; costUsd: number | null }> = { usage: null, costUsd: null },
  ) {
    super("GENERATION_FAILED", 502, message, recovery);
  }
}

function failureAccounting(error: unknown): Readonly<{ usage: Record<string, number> | null; costUsd: number | null }> {
  const records = errorChain(error).filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
  const usageRecord = records.map((record) => record.usage).find((value): value is Record<string, unknown> => typeof value === "object" && value !== null);
  const usage = usageRecord
    ? Object.fromEntries(Object.entries(usageRecord).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])))
    : null;
  const costValues = records.flatMap((record) => {
    const metadata = typeof record.providerMetadata === "object" && record.providerMetadata !== null ? record.providerMetadata as Record<string, unknown> : null;
    const gateway = metadata && typeof metadata.gateway === "object" && metadata.gateway !== null ? metadata.gateway as Record<string, unknown> : null;
    return [record.cost, record.costUsd, gateway?.cost];
  });
  const costUsd = costValues.map(Number).find(Number.isFinite) ?? null;
  return Object.freeze({ usage: usage && Object.keys(usage).length ? usage : null, costUsd });
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

const mediaSourceValidationSchema = z.object({
  observedRole: z.enum(["FULL_FRONT", "FULL_BACK", "FABRIC_CLOSEUP", "OTHER"]),
  completeCoverage: z.boolean(),
  unobstructed: z.boolean(),
  surfaceResolved: z.boolean(),
});

export type MediaSourceValidation = z.infer<typeof mediaSourceValidationSchema>;

export async function validateMediaCompletionSource(input: {
  role: MediaCompletionRole;
  source: { bytes: Uint8Array; mimeType: string };
}) {
  const expected = input.role === "GARMENT_FRONT"
    ? "FULL_FRONT"
    : input.role === "GARMENT_BACK" ? "FULL_BACK" : "FABRIC_CLOSEUP";
  const instruction = [
    "Judge only whether this exact photograph is eligible authority for one truthful catalogue transformation.",
    "FULL_FRONT requires the entire garment front from neckline through hem, both sleeves and all outer edges visible and unobstructed.",
    "FULL_BACK requires the entire garment back from back neckline through hem, both sleeves, all outer edges and any visible closure visible and unobstructed.",
    "FABRIC_CLOSEUP requires a close view where the actual fabric surface, texture or print is visibly resolved.",
    "Upper-body crops, model details, front views used as back authority, rear three-quarter views, distant views, descriptions and inferred surfaces are OTHER.",
    `Requested authority: ${expected}. Return the observed role and strict visibility booleans.`,
  ].join("\n");
  try {
    const result = await generateText({
      model: studioGatewayPolicy.sourceValidationModel,
      output: Output.object({ schema: mediaSourceValidationSchema, name: "media_source_validation" }),
      messages: [{
        role: "user",
        content: [
          { type: "text", text: instruction },
          { type: "file", mediaType: input.source.mimeType, data: input.source.bytes },
        ],
      }],
      maxOutputTokens: 100,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(30_000),
      providerOptions: {
        gateway: {
          caching: "auto",
          tags: ["studio:media-completion", "stage:source-validation"],
        },
      },
    });
    const metadata = (result.providerMetadata ?? {}) as Record<string, unknown>;
    const gateway = metadata.gateway && typeof metadata.gateway === "object"
      ? metadata.gateway as Record<string, unknown>
      : {};
    const parsedCost = gatewayCostSchema.safeParse(gateway.cost);
    const validation = result.output;
    const eligible = validation.observedRole === expected
      && (input.role === "FABRIC_DETAIL"
        ? validation.surfaceResolved
        : validation.completeCoverage && validation.unobstructed);
    return {
      validation,
      eligible,
      usage: result.usage as unknown as Record<string, unknown>,
      costUsd: parsedCost.success && Number.isFinite(parsedCost.data) && parsedCost.data >= 0
        ? parsedCost.data
        : null,
    };
  } catch (error) {
    if (error instanceof StudioEngineError) throw error;
    throw new StudioGatewayError(
      "The source photo could not be checked.",
      "Use a clearer role-matching photo.",
      sanitizeStudioGatewayFailure("analysis", studioGatewayPolicy.sourceValidationModel, error),
      failureAccounting(error),
    );
  }
}

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

export function buildMediaCompletionPrompt(input: {
  role: MediaCompletionRole;
  facts: Partial<IntakeFacts>;
  correction?: string;
  sourceMode?: MediaCompletionSourceMode;
}): string {
  const sourceMode = input.sourceMode ?? "UPLOADED_AUTHORITY";
  const inferredInstruction = input.role === "GARMENT_BACK"
    ? [
      "Create one private, provisional straight-on back preview inferred from the supplied approved full-front product image.",
      "The back is not visible in the source. Continue only the visible silhouette, sleeves, side seams, hem, colour and material cues conservatively.",
      "Use the simplest plausible rear construction. Do not add decorative seams, pockets, cut-outs, fasteners, labels or trim that are not visible.",
      "This is an unverified suggestion for the operator to compare with the physical garment, never a factual record of the back.",
    ]
    : input.role === "FABRIC_DETAIL"
      ? [
        "Create one private, provisional fabric-detail preview using only a clearly visible surface region from the supplied approved full-front product image.",
        "Crop and enlarge visible colour, print and surface cues conservatively; do not invent fibre, weave, texture, sheen or material claims beyond the source resolution.",
        "This is an unverified suggestion for the operator to compare with the physical garment, never a factual material record.",
      ]
      : [
        "Create one clean product-only straight-on front catalogue view from the supplied approved full-front product image.",
        "Preserve every visible front construction detail, proportion, length, surface, print, colour and drape exactly.",
      ];
  const authorityInstruction = input.role === "GARMENT_FRONT"
    ? [
      "Create one clean product-only straight-on front catalogue view from the supplied full-front authority photo.",
      "The source must already show the complete front from neckline through hem with both sleeves and outer edges visible.",
      "Preserve every visible front construction detail, proportion, length, surface, print, colour and drape exactly.",
    ]
    : input.role === "GARMENT_BACK"
      ? [
        "Create one clean product-only straight-on back catalogue view from the supplied full-back authority photo.",
        "The source must already show the complete back from neckline through hem with both sleeves, outer edges and any visible closure visible.",
        "Preserve every visible back construction detail, proportion, length, surface, print, colour and drape exactly.",
      ]
      : [
        "Create one clean catalogue fabric close-up from the supplied close-up authority photo of this exact garment.",
        "Preserve the photographed surface, weave, print, colour, texture, wear and scale exactly.",
        "Do not sharpen, regularize, extend, synthesize or replace the fabric pattern or surface.",
      ];
  const roleInstruction = sourceMode === "APPROVED_FRONT" ? inferredInstruction : authorityInstruction;
  return [
    ...roleInstruction,
    sourceMode === "APPROVED_FRONT"
      ? "Preserve all visible source evidence. Infer only the minimum needed for the requested provisional view and keep every uncertainty reviewable."
      : "Use only what is visible in the supplied authority image. Never infer, invent, mirror, extrapolate, complete or reinterpret unseen garment construction.",
    "Remove only the surrounding person, hanger or background when necessary; use an even warm-paper background and soft neutral light.",
    "No person, mannequin, hanger, text, logo, watermark, brand tag or added accessory.",
    "Never add or alter closures, pockets, seams, lining, labels, fibre composition, material claims or concealed surfaces.",
    `Confirmed garment facts: ${JSON.stringify(input.facts)}.`,
    input.correction ? `Operator correction: ${input.correction}.` : "",
  ].filter(Boolean).join(" ");
}

export async function generateMediaCompletionImage(input: {
  prompt: string;
  source: { bytes: Uint8Array; mimeType: string };
}) {
  assertStudioImageBudget();
  try {
    const result = await generateImage({
      model: studioGatewayPolicy.imageModel,
      prompt: { images: [input.source.bytes], text: input.prompt },
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
    return {
      bytes: result.image.uint8Array,
      mimeType: result.image.mediaType,
      usage: result.usage as unknown as Record<string, unknown>,
      costUsd: parsedCost.success && Number.isFinite(parsedCost.data) && parsedCost.data >= 0
        ? parsedCost.data
        : null,
    };
  } catch (error) {
    if (error instanceof StudioEngineError) throw error;
    throw new StudioGatewayError(
      "The AI view was not created.",
      "Use the source photo or try once more.",
      sanitizeStudioGatewayFailure("generation", studioGatewayPolicy.imageModel, error),
      failureAccounting(error),
    );
  }
}

export function buildWearPrompt(input: {
  operation: WearOperation;
  facts: Partial<IntakeFacts>;
  modelName?: string;
  correction?: string;
}): string {
  const truth = input.operation === "EDITORIAL_MODEL"
    ? [
      "Treat the supplied approved model try-on as the sole person and garment authority.",
      "Keep the complete subject silhouette, identity, face, body, hair, pose, hands, accessories and every visible garment detail unchanged; edit only pixels outside that silhouette.",
      "Do not infer or show a back, closure, lining, pockets, label, brand, fibre or unseen construction.",
      "Never add text, logo or watermark.",
    ]
    : [
      "Treat the supplied approved garment front as the only garment-construction authority.",
      "Preserve its exact visible front neckline, shoulders, sleeve cut and volume, waist gathering, silhouette, length, hem treatment, surface and drape.",
      "Do not infer or show a back, closure, lining, pockets, label, brand, fibre or unseen construction.",
      "Never add text, logo or watermark.",
    ];
  const operation = input.operation === "MANNEQUIN_FRONT"
    ? [
      "Create one straight-on catalogue front of the exact garment on an anonymous headless neutral mannequin.",
      "Warm-paper background, even soft light, complete garment edges. No human identity.",
    ]
    : input.operation === "MODEL_TRY_ON"
      ? [
        `Create one straight-on full-body private try-on of the exact garment on ${input.modelName || "the supplied adult model"}.`,
        "Source image 1 is garment-only construction authority. Source image 2 is adult identity/body/pose authority. Never blend, swap or reinterpret their authority roles.",
        "Preserve the supplied adult model identity, face, body proportions, skin tone and hair without reshaping.",
        "Use a restrained warm neutral studio background and natural editorial light.",
      ]
      : [
        "Replace the complete existing background of the supplied approved model try-on with a visibly distinct restrained editorial interior.",
        "The new environment must read clearly: matte warm-plaster wall, one shallow architectural arch, pale terracotta floor and a soft diagonal window-light shadow; keep it quiet, uncluttered and photorealistic.",
        "Do not retain the original neutral backdrop. Do not add furniture, handheld props, accessories or change the camera, crop or pose.",
      ];
  return [
    ...operation,
    ...truth,
    `Confirmed garment facts: ${JSON.stringify(input.facts)}.`,
    input.correction ? `Operator correction: ${input.correction}.` : "",
  ].filter(Boolean).join(" ");
}

export async function generateWearImage(input: {
  prompt: string;
  sources: Array<{ bytes: Uint8Array; mimeType: string }>;
}) {
  assertStudioImageBudget();
  try {
    const result = await generateImage({
      model: studioGatewayPolicy.imageModel,
      prompt: { images: input.sources.map((source) => source.bytes), text: input.prompt },
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
    return {
      bytes: result.image.uint8Array,
      mimeType: result.image.mediaType,
      usage: result.usage as unknown as Record<string, unknown>,
      costUsd: parsedCost.success && Number.isFinite(parsedCost.data) ? parsedCost.data : null,
    };
  } catch (error) {
    if (error instanceof StudioEngineError) throw error;
    throw new StudioGatewayError(
      "The Wear image was not created.",
      "Try once more or keep the last view.",
      sanitizeStudioGatewayFailure("generation", studioGatewayPolicy.imageModel, error),
      failureAccounting(error),
    );
  }
}
