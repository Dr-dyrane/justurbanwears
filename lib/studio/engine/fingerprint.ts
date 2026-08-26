import { createHash } from "node:crypto";

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function generationFingerprint(input: {
  sourceHashes: string[];
  facts: unknown;
  operation: string;
  promptVersion: string;
  model: string;
  parameters: unknown;
}): string {
  return sha256(stable({ ...input, sourceHashes: [...input.sourceHashes].sort() }));
}

export function generationExecutionFingerprint(input: {
  semanticFingerprint: string;
  adapterId: string;
  adapterVersion: string;
  provider: string;
  model: string;
  modelRevision?: string | null;
  promptHash: string;
  referencePackingHash: string;
  parameters: unknown;
  providerPolicyRevision: string;
}): string {
  return sha256(stable(input));
}
