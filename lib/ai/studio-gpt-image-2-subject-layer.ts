import { generateImage } from "ai";
import {
  createStudioGptImage2Adapter,
  STUDIO_GPT_IMAGE_2_COST_CAP_USD,
  STUDIO_GPT_IMAGE_2_MODEL,
  STUDIO_GPT_IMAGE_2_POLICY_REVISION,
  STUDIO_GPT_IMAGE_2_QUALITY,
  STUDIO_GPT_IMAGE_2_SIZE,
  STUDIO_GPT_IMAGE_2_TIMEOUT_MS,
  studioGptImage2Capabilities,
  type StudioImageGenerator,
} from "./studio-gpt-image-2-gateway";

export const STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_ADAPTER =
  "vercel-ai-gateway/openai-gpt-image-2/transparent-subject" as const;
export const STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_ADAPTER_VERSION =
  "atelier-gpt-image-2-transparent-subject-v1" as const;
export const STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE_REVISION =
  "2026-08-27.1" as const;

export const STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE = Object.freeze({
  profileId: "atelier-transparent-subject-png-v1",
  revision: STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE_REVISION,
  gatewayPolicyRevision: STUDIO_GPT_IMAGE_2_POLICY_REVISION,
  provider: "openai",
  model: STUDIO_GPT_IMAGE_2_MODEL,
  onlyProviders: Object.freeze(["openai"]),
  fallbackModels: Object.freeze([]),
  maxRetries: 0,
  timeoutMs: STUDIO_GPT_IMAGE_2_TIMEOUT_MS,
  imageCount: 1,
  costCapUsd: STUDIO_GPT_IMAGE_2_COST_CAP_USD,
  accountingRequired: true,
  persistRawBeforeAccountingPolicy: true,
  size: STUDIO_GPT_IMAGE_2_SIZE,
  width: 1024,
  height: 1536,
  mediaType: "image/png",
  providerOutputFormat: "png",
  background: "transparent",
  quality: STUDIO_GPT_IMAGE_2_QUALITY,
  alphaRequired: true,
  roomPixelsGenerated: false,
} as const);

export const studioGptImage2TransparentSubjectCapabilities = Object.freeze({
  ...studioGptImage2Capabilities,
  adapterId: STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_ADAPTER,
  adapterVersion: STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_ADAPTER_VERSION,
  supportedStages: Object.freeze([
    "ROOM_FINAL_05",
    "SIBLING_06",
    "SIBLING_07_CORE",
    "SIBLING_07_RECOVERY",
  ] as const),
  supportedOutputModes: Object.freeze([
    "TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE",
  ] as const),
  supportedGeneratedArtifactFormats: Object.freeze(["PNG"] as const),
  supportedFinalFormats: Object.freeze(["PNG"] as const),
  supportsRequiredAlpha: true,
  outputFormats: Object.freeze([STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE.mediaType]),
  outputProfiles: Object.freeze([STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE]),
  costCapUsd: STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE.costCapUsd,
  accountingRequired: STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE.accountingRequired,
});

export function createStudioGptImage2TransparentSubjectAdapter(dependencies: {
  generate?: StudioImageGenerator;
  timeoutSignal?: (milliseconds: number) => AbortSignal;
  now?: () => number;
} = {}) {
  const generate = dependencies.generate ?? generateImage;
  const base = createStudioGptImage2Adapter({
    timeoutSignal: dependencies.timeoutSignal,
    now: dependencies.now,
    generate: async (request) => {
      const providerOptions = request.providerOptions ?? {};
      return generate({
        ...request,
        providerOptions: {
          ...providerOptions,
          gateway: { ...(providerOptions.gateway ?? {}) },
          openai: {
            ...(providerOptions.openai ?? {}),
            quality: STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE.quality,
            outputFormat: STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE.providerOutputFormat,
            background: STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE.background,
          },
        },
      });
    },
  });

  return Object.freeze({
    capabilities: studioGptImage2TransparentSubjectCapabilities,
    outputProfile: STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE,
    invoke: base.invoke,
  });
}

export const studioGptImage2TransparentSubjectAdapter =
  createStudioGptImage2TransparentSubjectAdapter();
