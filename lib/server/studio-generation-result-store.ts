import { createHash } from "node:crypto";
import { z } from "zod";
import { getShopBlob, putShopBlob } from "./vercel-blob";
import type { StudioProviderEvidence } from "../ai/studio-provider-evidence";

const providerEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  requestedModel: z.string().min(1).max(180),
  requestedProvider: z.string().min(1).max(180).nullable(),
  servedModels: z.array(z.string().min(1).max(180)),
  servedProvider: z.string().min(1).max(180).nullable(),
  gatewayGenerationId: z.string().min(1).max(180).nullable(),
  requestId: z.string().min(1).max(180).nullable(),
  warnings: z.array(z.object({
    type: z.string().min(1).max(80),
    setting: z.string().min(1).max(80).nullable(),
    message: z.string().max(500).nullable(),
  })),
  durationMs: z.number().int().nonnegative().nullable(),
});

const resultEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  payloadMimeType: z.string().min(1).max(80),
  payloadByteSize: z.number().int().positive(),
  payloadSha256: z.string().regex(/^[0-9a-f]{64}$/),
  payloadBase64: z.string().min(1),
  usage: z.record(z.string(), z.unknown()).nullable(),
  costUsd: z.number().finite().nullable(),
  providerEvidence: providerEvidenceSchema.nullable().optional(),
});

export type StudioGenerationProviderResult = Readonly<{
  bytes: Uint8Array;
  mimeType: string;
  usage: Record<string, unknown> | null;
  costUsd: number | null;
  providerEvidence?: StudioProviderEvidence | null;
}>;

export type StudioGenerationProviderResultManifest = Readonly<{
  blobPathname: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  usage: Record<string, unknown> | null;
  costUsd: number | null;
  providerEvidence: StudioProviderEvidence | null;
}>;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function persistedUsageSignature(usage: Record<string, unknown> | null): string | null {
  try {
    const roundTripped = JSON.parse(JSON.stringify(usage)) as unknown;
    return stableJson(roundTripped);
  } catch {
    return null;
  }
}

function persistedEvidenceSignature(evidence: StudioProviderEvidence | null | undefined): string | null {
  try {
    const roundTripped = JSON.parse(JSON.stringify(evidence ?? null)) as unknown;
    return stableJson(roundTripped);
  } catch {
    return null;
  }
}

export function studioGenerationProviderResultsMatch(
  left: StudioGenerationProviderResult,
  right: StudioGenerationProviderResult,
): boolean {
  const leftUsage = persistedUsageSignature(left.usage);
  const rightUsage = persistedUsageSignature(right.usage);
  const leftEvidence = persistedEvidenceSignature(left.providerEvidence);
  const rightEvidence = persistedEvidenceSignature(right.providerEvidence);
  return leftUsage !== null
    && rightUsage !== null
    && leftEvidence !== null
    && rightEvidence !== null
    && sha256(left.bytes) === sha256(right.bytes)
    && left.mimeType === right.mimeType
    && left.costUsd === right.costUsd
    && leftUsage === rightUsage
    && leftEvidence === rightEvidence;
}

export function studioGenerationResultPathname(intakeId: string, generationId: string): string {
  return `studio/intakes/${intakeId}/generations/${generationId}/provider-result.v1.json`;
}

export function encodeStudioGenerationResultEnvelope(
  result: StudioGenerationProviderResult,
): Uint8Array {
  const envelope = {
    schemaVersion: 1 as const,
    payloadMimeType: result.mimeType,
    payloadByteSize: result.bytes.byteLength,
    payloadSha256: sha256(result.bytes),
    payloadBase64: Buffer.from(result.bytes).toString("base64"),
    usage: result.usage,
    costUsd: result.costUsd,
    providerEvidence: result.providerEvidence ?? null,
  };
  return new TextEncoder().encode(JSON.stringify(envelope));
}

export function decodeStudioGenerationResultEnvelope(
  bytes: Uint8Array,
): StudioGenerationProviderResult & { sha256: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("Studio generation result envelope is not valid UTF-8 JSON.");
  }
  const envelope = resultEnvelopeSchema.parse(parsed);
  const payload = new Uint8Array(Buffer.from(envelope.payloadBase64, "base64"));
  const payloadSha256 = sha256(payload);
  if (payload.byteLength !== envelope.payloadByteSize || payloadSha256 !== envelope.payloadSha256) {
    throw new Error("Studio generation result envelope payload did not verify.");
  }
  return {
    bytes: payload,
    mimeType: envelope.payloadMimeType,
    usage: envelope.usage,
    costUsd: envelope.costUsd,
    providerEvidence: envelope.providerEvidence ?? null,
    sha256: payloadSha256,
  };
}

async function readEnvelope(pathname: string): Promise<(StudioGenerationProviderResult & { sha256: string }) | null> {
  const blob = await getShopBlob("private", pathname, { useCache: false });
  if (!blob || blob.statusCode !== 200) return null;
  const bytes = new Uint8Array(await new Response(blob.stream).arrayBuffer());
  return decodeStudioGenerationResultEnvelope(bytes);
}

export async function readStudioGenerationProviderResult(input: {
  intakeId: string;
  generationId: string;
}): Promise<(StudioGenerationProviderResult & StudioGenerationProviderResultManifest) | null> {
  const blobPathname = studioGenerationResultPathname(input.intakeId, input.generationId);
  const result = await readEnvelope(blobPathname);
  return result ? {
    ...result,
    providerEvidence: result.providerEvidence ?? null,
    blobPathname,
    byteSize: result.bytes.byteLength,
  } : null;
}

export async function persistStudioGenerationProviderResult(input: {
  intakeId: string;
  generationId: string;
  result: StudioGenerationProviderResult;
}): Promise<StudioGenerationProviderResult & StudioGenerationProviderResultManifest> {
  const blobPathname = studioGenerationResultPathname(input.intakeId, input.generationId);
  const envelope = encodeStudioGenerationResultEnvelope(input.result);
  const existing = await readEnvelope(blobPathname);
  if (existing) {
    if (!studioGenerationProviderResultsMatch(existing, input.result)) {
      throw new Error("A different provider result is already retained for this generation attempt.");
    }
    return {
      ...existing,
      providerEvidence: existing.providerEvidence ?? null,
      blobPathname,
      byteSize: existing.bytes.byteLength,
    };
  }
  try {
    await putShopBlob("private", blobPathname, Buffer.from(envelope), {
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/json",
      cacheControlMaxAge: 31_536_000,
    });
  } catch (error) {
    const raced = await readEnvelope(blobPathname).catch(() => null);
    if (!raced || !studioGenerationProviderResultsMatch(raced, input.result)) throw error;
    return {
      ...raced,
      providerEvidence: raced.providerEvidence ?? null,
      blobPathname,
      byteSize: raced.bytes.byteLength,
    };
  }
  const retained = await readEnvelope(blobPathname);
  if (!retained || !studioGenerationProviderResultsMatch(retained, input.result)) {
    throw new Error("The retained provider result did not verify after write.");
  }
  return {
    ...retained,
    providerEvidence: retained.providerEvidence ?? null,
    blobPathname,
    byteSize: retained.bytes.byteLength,
  };
}

export async function persistStudioGenerationOutput(input: {
  pathname: string;
  bytes: Uint8Array;
  mimeType: string;
  sha256: string;
}): Promise<{ pathname: string; url: string }> {
  const existing = await getShopBlob("private", input.pathname, { useCache: false });
  if (existing?.statusCode === 200) {
    const bytes = new Uint8Array(await new Response(existing.stream).arrayBuffer());
    if (sha256(bytes) !== input.sha256 || existing.blob.contentType !== input.mimeType) {
      throw new Error("A different Studio image already occupies the content-addressed output path.");
    }
    return { pathname: existing.blob.pathname, url: existing.blob.url };
  }
  try {
    const blob = await putShopBlob("private", input.pathname, Buffer.from(input.bytes), {
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: input.mimeType,
      cacheControlMaxAge: 31_536_000,
    });
    return { pathname: blob.pathname, url: blob.url };
  } catch (error) {
    const raced = await getShopBlob("private", input.pathname, { useCache: false }).catch(() => null);
    if (!raced || raced.statusCode !== 200) throw error;
    const bytes = new Uint8Array(await new Response(raced.stream).arrayBuffer());
    if (sha256(bytes) !== input.sha256 || raced.blob.contentType !== input.mimeType) throw error;
    return { pathname: raced.blob.pathname, url: raced.blob.url };
  }
}
