export type StudioProviderWarningEvidence = Readonly<{
  type: string;
  setting: string | null;
  message: string | null;
}>;

export type StudioProviderEvidence = Readonly<{
  schemaVersion: 1;
  requestedModel: string;
  requestedProvider: string | null;
  servedModels: readonly string[];
  servedProvider: string | null;
  gatewayGenerationId: string | null;
  requestId: string | null;
  warnings: readonly StudioProviderWarningEvidence[];
  durationMs: number | null;
}>;

const SAFE_RESPONSE_HEADERS = [
  "x-ai-gateway-generation-id",
  "x-request-id",
  "x-vercel-id",
] as const;

function safeToken(value: unknown, maxLength = 180): string | null {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && /^[a-zA-Z0-9._:/-]+$/.test(value)
    ? value
    : null;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : {};
}

function safeHeaders(value: unknown): Readonly<Record<string, string>> {
  const headers = record(value);
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, item]) => [key.toLowerCase(), item]),
  );
  return Object.freeze(Object.fromEntries(
    SAFE_RESPONSE_HEADERS.flatMap((name) => {
      const value = safeToken(normalized[name]);
      return value ? [[name, value] as const] : [];
    }),
  ));
}

function safeWarning(value: unknown): StudioProviderWarningEvidence {
  const warning = record(value);
  const message = typeof warning.message === "string"
    && warning.message.length <= 500
    && !/data:image|base64|authorization|bearer\s/i.test(warning.message)
    ? warning.message
    : null;
  return Object.freeze({
    type: safeToken(warning.type, 80) ?? "provider-warning",
    setting: safeToken(warning.setting, 80),
    message,
  });
}

export function sanitizeStudioProviderEvidence(input: {
  result: unknown;
  requestedModel: string;
  requestedProvider?: string | null;
  durationMs?: number | null;
}): StudioProviderEvidence {
  const result = record(input.result);
  const metadata = record(result.providerMetadata);
  const gateway = record(metadata.gateway);
  const rawResponses = Array.isArray(result.responses)
    ? result.responses
    : result.response ? [result.response] : [];
  const responses = rawResponses.map((value) => {
    const response = record(value);
    return {
      modelId: safeToken(response.modelId),
      headers: safeHeaders(response.headers),
    };
  });
  const headerEntries = responses.flatMap((response) => Object.entries(response.headers));
  const gatewayGenerationId = safeToken(gateway.generationId)
    ?? headerEntries.find(([name]) => name === "x-ai-gateway-generation-id")?.[1]
    ?? null;
  const requestId = headerEntries.find(([name]) => name === "x-request-id")?.[1]
    ?? headerEntries.find(([name]) => name === "x-vercel-id")?.[1]
    ?? null;
  const servedModels = responses.flatMap((response) => response.modelId ? [response.modelId] : []);
  const durationMs = typeof input.durationMs === "number"
    && Number.isFinite(input.durationMs)
    && input.durationMs >= 0
    ? Math.round(input.durationMs)
    : null;
  return Object.freeze({
    schemaVersion: 1 as const,
    requestedModel: input.requestedModel,
    requestedProvider: safeToken(input.requestedProvider),
    servedModels: Object.freeze(servedModels),
    servedProvider: safeToken(gateway.provider) ?? safeToken(gateway.providerName),
    gatewayGenerationId,
    requestId,
    warnings: Object.freeze((Array.isArray(result.warnings) ? result.warnings : []).map(safeWarning)),
    durationMs,
  });
}
