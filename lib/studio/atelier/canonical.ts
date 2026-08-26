import { createHash } from "node:crypto";
import {
  atelierOperationSchema,
  executionIdentitySchema,
  type AtelierOperation,
  type ExecutionIdentity,
  type PhysicalReferenceBinding,
} from "./contracts";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortByCanonical<T>(values: readonly T[]): T[] {
  return [...values].sort((left, right) =>
    compareText(canonicalStringify(left), canonicalStringify(right))
  );
}

/**
 * JSON canonicalization for hashes and durable records. Object keys are sorted;
 * array order is preserved because execution reference order is meaningful.
 */
export function canonicalStringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON requires finite numbers.");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical JSON accepts plain objects only.");
    }
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalStringify(item)}`);
    return `{${entries.join(",")}}`;
  }
  throw new TypeError(`Canonical JSON does not accept ${typeof value}.`);
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeOperation(operation: AtelierOperation): AtelierOperation {
  const normalized: AtelierOperation = {
    ...operation,
    parentLocks: [...operation.parentLocks]
      .sort((left, right) => compareText(left.role, right.role)),
    authorityStack: [...operation.authorityStack]
      .map((authority) => ({
        ...authority,
        permittedScope: [...authority.permittedScope].sort(compareText),
      }))
      .sort((left, right) => compareText(
        `${left.role}:${left.assetId}:${left.sha256}`,
        `${right.role}:${right.assetId}:${right.sha256}`,
      )),
    changeSet: sortByCanonical(operation.changeSet),
    immutableSet: sortByCanonical(operation.immutableSet),
    garmentFacts: [...operation.garmentFacts].sort(compareText),
    unknownFacts: [...operation.unknownFacts].sort(compareText),
    prohibitedInferences: [...operation.prohibitedInferences].sort(compareText),
    renderQualityContract: {
      ...operation.renderQualityContract,
      artifactRejection: [...operation.renderQualityContract.artifactRejection].sort(compareText),
    },
    failureGates: [...operation.failureGates].sort(compareText),
  };
  if (operation.fashionNovaCheck) {
    normalized.fashionNovaCheck = {
      ...operation.fashionNovaCheck,
      matchedGarmentFacts: [...operation.fashionNovaCheck.matchedGarmentFacts].sort(compareText),
    };
  }
  return normalized;
}

export function canonicalAtelierOperation(rawOperation: unknown): AtelierOperation {
  return normalizeOperation(atelierOperationSchema.parse(rawOperation));
}

export function semanticOperationHash(rawOperation: unknown): string {
  return sha256Text(canonicalStringify(canonicalAtelierOperation(rawOperation)));
}

export function deriveOperationId(rawOperation: unknown): string {
  return `atelier:${semanticOperationHash(rawOperation)}`;
}

export function referenceBindingHash(
  orderedReferences: readonly PhysicalReferenceBinding[],
): string {
  return sha256Text(canonicalStringify(orderedReferences));
}

function executionPayload(execution: ExecutionIdentity) {
  return {
    semanticOperationHash: execution.semanticOperationHash,
    adapterId: execution.adapterId,
    adapterVersion: execution.adapterVersion,
    provider: execution.provider,
    model: execution.model,
    modelRevision: execution.modelRevision,
    compiledPromptHash: sha256Text(execution.compiledPrompt),
    referenceBindingHash: referenceBindingHash(execution.orderedReferences),
    preprocessingVersion: execution.preprocessingVersion,
    seed: execution.seed,
    sampler: execution.sampler,
    parameters: execution.parameters,
    providerPolicyRevision: execution.providerPolicyRevision,
  };
}

/** Provider/model/prompt syntax live only in execution identity. */
export function executionHash(rawExecution: unknown): string {
  const execution = executionIdentitySchema.parse(rawExecution);
  return sha256Text(canonicalStringify(executionPayload(execution)));
}
