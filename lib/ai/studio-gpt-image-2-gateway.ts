import { createHash } from "node:crypto";
import { generateImage } from "ai";
import { z } from "zod";
import { StudioEngineError } from "../studio/engine/errors";
import {
  sanitizeStudioGatewayFailure,
  sanitizeStudioGatewayFailureAccounting,
  StudioGatewayError,
} from "./studio-gateway";
import {
  STUDIO_GPT_IMAGE_2_ADAPTER,
  STUDIO_GPT_IMAGE_2_ADAPTER_VERSION,
  STUDIO_GPT_IMAGE_2_MAX_REFERENCES,
  STUDIO_GPT_IMAGE_2_MODEL,
  STUDIO_GPT_IMAGE_2_SIZE,
  STUDIO_GPT_IMAGE_2_TIMEOUT_MS,
  studioGptImage2ProviderOptions,
} from "./studio-image-policy";

export {
  STUDIO_GPT_IMAGE_2_ADAPTER,
  STUDIO_GPT_IMAGE_2_ADAPTER_VERSION,
  STUDIO_GPT_IMAGE_2_COST_CAP_USD,
  STUDIO_GPT_IMAGE_2_MAX_REFERENCES,
  STUDIO_GPT_IMAGE_2_MODEL,
  STUDIO_GPT_IMAGE_2_POLICY_REVISION,
  STUDIO_GPT_IMAGE_2_QUALITY,
  STUDIO_GPT_IMAGE_2_SIZE,
  STUDIO_GPT_IMAGE_2_TIMEOUT_MS,
} from "./studio-image-policy";

export const studioGptImage2Capabilities = Object.freeze({
  adapterId: STUDIO_GPT_IMAGE_2_ADAPTER,
  adapterVersion: STUDIO_GPT_IMAGE_2_ADAPTER_VERSION,
  provider: "openai",
  model: STUDIO_GPT_IMAGE_2_MODEL,
  generate: true,
  edit: true,
  maxReferences: STUDIO_GPT_IMAGE_2_MAX_REFERENCES,
  maxPhysicalReferences: STUDIO_GPT_IMAGE_2_MAX_REFERENCES,
  supportedStages: Object.freeze([
    "GARMENT_01_FRONT",
    "GARMENT_02_BACK",
    "GARMENT_03_MANNEQUIN",
    "GARMENT_04_DETAIL",
    "SUBJECT_A",
    "SUBJECT_B",
  ] as const),
  acceptedPrivacyClasses: Object.freeze([
    "PUBLIC",
    "PRIVATE_OPERATOR",
    "PRIVATE_IDENTITY",
  ] as const),
  supportedOutputModes: Object.freeze([
    "GENERATIVE_GARMENT_MEDIA",
    "GENERATIVE_FULL_FRAME",
  ] as const),
  supportedGeneratedArtifactFormats: Object.freeze(["JPEG"] as const),
  supportedFinalFormats: Object.freeze(["JPEG"] as const),
  supportsRequiredAlpha: false,
  supportedSizes: Object.freeze([STUDIO_GPT_IMAGE_2_SIZE]),
  outputFormats: Object.freeze(["image/jpeg"]),
  seed: false,
  remoteIdempotency: false,
  remoteJobLookup: false,
  zeroDataRetention: false,
  privateIdentityRequiresRecordedConsent: true,
});

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const safeIdSchema = z.string().min(1).max(180).regex(/^[a-zA-Z0-9._:/-]+$/);

export const studioGptImage2ReferenceSchema = z.object({
  slot: safeIdSchema,
  role: safeIdSchema,
  assetId: safeIdSchema,
  sha256: sha256Schema,
  bytes: z.instanceof(Uint8Array),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

export type StudioGptImage2Reference = z.infer<typeof studioGptImage2ReferenceSchema>;

export const studioGptImage2InvocationSchema = z.object({
  executionId: z.string().uuid(),
  garmentId: z.string().min(1).max(40).regex(/^[a-zA-Z0-9._-]+$/),
  view: z.enum(["01", "02", "03", "04", "SUBJECT", "05", "06", "07"]),
  operationType: safeIdSchema,
  prompt: z.string().min(1).max(30_000),
  references: z.array(studioGptImage2ReferenceSchema)
    .min(1)
    .max(STUDIO_GPT_IMAGE_2_MAX_REFERENCES),
  operatorSubject: z.string().min(1).max(500),
  privacy: z.object({
    containsPrivateIdentity: z.boolean(),
    providerRetentionAcknowledged: z.boolean(),
    approvalRecordedAt: z.string().datetime({ offset: true }),
  }),
});

export type StudioGptImage2Invocation = z.infer<typeof studioGptImage2InvocationSchema>;

type GenerateImageRequest = Parameters<typeof generateImage>[0];
type GenerateImageResponse = Awaited<ReturnType<typeof generateImage>>;
export type StudioImageGenerator = (request: GenerateImageRequest) => Promise<GenerateImageResponse>;

const SAFE_RESPONSE_HEADERS = [
  "x-ai-gateway-generation-id",
  "x-request-id",
  "x-vercel-id",
] as const;

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeToken(value: unknown, maxLength = 180): string | null {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && /^[a-zA-Z0-9._:/-]+$/.test(value)
    ? value
    : null;
}

function safeHeaderRecord(headers: Record<string, string> | undefined) {
  if (!headers) return Object.freeze({});
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return Object.freeze(Object.fromEntries(
    SAFE_RESPONSE_HEADERS.flatMap((name) => {
      const value = safeToken(normalized[name]);
      return value ? [[name, value] as const] : [];
    }),
  ));
}

function safeTimestamp(value: unknown): string | null {
  const timestamp = value instanceof Date
    ? value
    : typeof value === "string" || typeof value === "number"
      ? new Date(value)
      : null;
  return timestamp && !Number.isNaN(timestamp.getTime())
    ? timestamp.toISOString()
    : null;
}

function safeWarning(warning: unknown) {
  try {
    const record = typeof warning === "object" && warning !== null
      ? warning as Record<string, unknown>
      : {};
    return Object.freeze({
      type: safeToken(record.type, 80) ?? "provider-warning",
      setting: safeToken(record.setting, 80),
      message: typeof record.message === "string"
        && record.message.length <= 500
        && !/data:image|base64|authorization|bearer\s/i.test(record.message)
        ? record.message
        : null,
    });
  } catch {
    return Object.freeze({
      type: "provider-warning",
      setting: null,
      message: null,
    });
  }
}

function gatewayRecord(metadata: unknown): Record<string, unknown> {
  try {
    if (typeof metadata !== "object" || metadata === null) return {};
    const gateway = (metadata as Record<string, unknown>).gateway;
    return typeof gateway === "object" && gateway !== null
      ? gateway as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function safeArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function safeResponse(response: unknown) {
  try {
    const record = typeof response === "object" && response !== null
      ? response as Record<string, unknown>
      : {};
    const headers = safeHeaderRecord(
      typeof record.headers === "object" && record.headers !== null
        ? record.headers as Record<string, string>
        : undefined,
    );
    return Object.freeze({
      modelId: safeToken(record.modelId),
      timestamp: safeTimestamp(record.timestamp),
      headers,
    });
  } catch {
    return Object.freeze({
      modelId: null,
      timestamp: null,
      headers: Object.freeze({}),
    });
  }
}

function finiteCost(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value !== "string" || !/^[0-9]+(?:[.][0-9]+)?$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function assertReferenceHashes(references: readonly StudioGptImage2Reference[]): void {
  for (const reference of references) {
    if (sha256(reference.bytes) !== reference.sha256) {
      throw new StudioEngineError(
        "INVALID_ASSET",
        503,
        `The ${reference.role} authority did not verify.`,
        "Restore the approved private authority before generating.",
      );
    }
  }
}

function attribution(subject: string): string {
  return `studio-operator:${sha256(subject).slice(0, 32)}`;
}

export function createStudioGptImage2Adapter(dependencies: {
  generate?: StudioImageGenerator;
  timeoutSignal?: (milliseconds: number) => AbortSignal;
  now?: () => number;
} = {}) {
  const invokeImage = dependencies.generate ?? generateImage;
  const timeoutSignal = dependencies.timeoutSignal ?? AbortSignal.timeout;
  const now = dependencies.now ?? (() => performance.now());

  return Object.freeze({
    capabilities: studioGptImage2Capabilities,
    async invoke(rawInput: StudioGptImage2Invocation) {
      const input = studioGptImage2InvocationSchema.parse(rawInput);
      if (input.privacy.containsPrivateIdentity && !input.privacy.providerRetentionAcknowledged) {
        throw new StudioEngineError(
          "INVALID_TRANSITION",
          409,
          "Private identity transfer is not approved for this provider.",
          "Record the non-ZDR provider acknowledgement before generating.",
        );
      }
      assertReferenceHashes(input.references);
      const startedAt = now();
      try {
        const result = await invokeImage({
          model: STUDIO_GPT_IMAGE_2_MODEL,
          prompt: {
            images: input.references.map((reference) => reference.bytes),
            text: input.prompt,
          },
          size: STUDIO_GPT_IMAGE_2_SIZE,
          n: 1,
          maxRetries: 0,
          abortSignal: timeoutSignal(STUDIO_GPT_IMAGE_2_TIMEOUT_MS),
          providerOptions: studioGptImage2ProviderOptions({
            tags: [
              "studio:virtual-atelier",
              `garment:${input.garmentId.toLowerCase()}`,
              `view:${input.view.toLowerCase()}`,
              `operation:${input.operationType.toLowerCase()}`,
            ],
            user: attribution(input.operatorSubject),
          }),
        });
        const gateway = gatewayRecord(result.providerMetadata);
        // Raw image extraction must not depend on optional response metadata.
        // A malformed timestamp or warning still represents a paid result and
        // must reach the persistence layer so it can be retained/quarantined.
        const images = result.images.map((image, ordinal) => Object.freeze({
          ordinal,
          bytes: image.uint8Array,
          mimeType: image.mediaType,
        }));
        const responses = safeArray(result.responses).map(safeResponse);
        const responseHeaders = responses.flatMap((response) => Object.entries(response.headers));
        const gatewayGenerationId = safeToken(gateway.generationId)
          ?? responseHeaders.find(([name]) => name === "x-ai-gateway-generation-id")?.[1]
          ?? null;
        const requestId = responseHeaders.find(([name]) => name === "x-request-id")?.[1]
          ?? responseHeaders.find(([name]) => name === "x-vercel-id")?.[1]
          ?? null;
        return Object.freeze({
          requestedModel: STUDIO_GPT_IMAGE_2_MODEL,
          servedModels: Object.freeze(responses.flatMap((response) => (
            response.modelId === null ? [] : [response.modelId]
          ))),
          images: Object.freeze(images),
          usage: result.usage as unknown as Record<string, unknown>,
          costUsd: finiteCost(gateway.cost),
          warnings: Object.freeze(safeArray(result.warnings).map(safeWarning)),
          responses: Object.freeze(responses),
          gatewayGenerationId,
          requestId,
          durationMs: Math.max(0, Math.round(now() - startedAt)),
        });
      } catch (error) {
        if (error instanceof StudioEngineError) throw error;
        throw new StudioGatewayError(
          "The Atelier image was not created.",
          "Keep the last locked view and inspect the private execution record.",
          sanitizeStudioGatewayFailure("generation", STUDIO_GPT_IMAGE_2_MODEL, error),
          sanitizeStudioGatewayFailureAccounting(error),
          Math.max(0, Math.round(now() - startedAt)),
        );
      }
    },
  });
}

export const studioGptImage2Adapter = createStudioGptImage2Adapter();
