export const STUDIO_GPT_IMAGE_2_MODEL = "openai/gpt-image-2" as const;
export const STUDIO_GPT_IMAGE_2_ADAPTER = "vercel-ai-gateway/openai-gpt-image-2" as const;
export const STUDIO_GPT_IMAGE_2_ADAPTER_VERSION = "atelier-gpt-image-2-v2" as const;
export const STUDIO_GPT_IMAGE_2_POLICY_REVISION = "2026-08-26.3" as const;
export const STUDIO_GPT_IMAGE_2_MAX_REFERENCES = 4 as const;
export const STUDIO_GPT_IMAGE_2_TIMEOUT_MS = 180_000 as const;
export const STUDIO_GPT_IMAGE_2_SIZE = "1024x1536" as const;
export const STUDIO_GPT_IMAGE_2_QUALITY = "medium" as const;
export const STUDIO_GPT_IMAGE_2_COST_CAP_USD = 0.10 as const;

// Media completion remains on the accepted pre-Atelier Gateway policy. Keep
// this lane independent from the legacy Intake/Wear GPT Image 2 policy above.
export const STUDIO_MEDIA_COMPLETION_IMAGE_MODEL = "bfl/flux-2-klein-4b" as const;
export const STUDIO_MEDIA_COMPLETION_IMAGE_ASPECT_RATIO = "4:5" as const;
export const STUDIO_MEDIA_COMPLETION_IMAGE_COST_CAP_USD = 0.025 as const;
export const STUDIO_MEDIA_COMPLETION_IMAGE_TIMEOUT_MS = 60_000 as const;

export function studioGptImage2ProviderOptions(input: {
  tags: readonly string[];
  user?: string;
}) {
  return {
    gateway: {
      only: ["openai"],
      tags: [...input.tags],
      ...(input.user ? { user: input.user } : {}),
      zeroDataRetention: false,
    },
    openai: {
      quality: STUDIO_GPT_IMAGE_2_QUALITY,
      outputFormat: "jpeg" as const,
      background: "opaque" as const,
    },
  };
}

export function studioMediaCompletionProviderOptions() {
  return {
    gateway: {
      sort: "cost" as const,
    },
  };
}
