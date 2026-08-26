import { createHash } from "node:crypto";

const SHA256 = /^[a-f0-9]{64}$/;
const PROVIDER_FIELDS = new Set([
  "adapter",
  "adapterId",
  "adapterVersion",
  "model",
  "modelRevision",
  "prompt",
  "promptHash",
  "promptVersion",
  "provider",
  "referenceSlots",
  "sampler",
  "seed",
]);

export const ATELIER_LIFECYCLE = Object.freeze([
  "DRAFT",
  "RESOLVED",
  "PREFLIGHTED",
  "CLAIMED",
  "INVOKED",
  "MATERIALIZED",
  "TECH_QA",
  "SEMANTIC_QA",
  "AWAITING_APPROVAL",
  "LOCKED",
  "PACKETED",
  "PUBLISHED",
]);

const SIDE_STATES = new Set([
  "BLOCKED_MISSING_AUTHORITY",
  "BLOCKED_CAPABILITY",
  "FAILED_RETRYABLE",
  "INDETERMINATE_PROVIDER_RESULT",
  "REJECTED_TERMINAL",
  "BLOCKED_USER_DIRECTION",
]);

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalize(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  throw new TypeError(`Unsupported canonical value: ${typeof value}`);
}

export function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function requireString(value, field, errors) {
  if (typeof value !== "string" || value.trim().length === 0) errors.push(`${field} is required`);
}

function requireStringArray(value, field, errors, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((item) => typeof item !== "string" || !item.trim())) {
    errors.push(`${field} must be ${allowEmpty ? "an" : "a non-empty"} array of strings`);
  }
}

function sortCanonical(items) {
  return [...items].map(canonicalize).sort((left, right) => canonicalStringify(left).localeCompare(canonicalStringify(right)));
}

function uniqueSortedStrings(items = []) {
  return [...new Set(items.map((item) => item.trim()))].sort();
}

export function normalizeAtelierOperation(operation) {
  const errors = [];
  if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
    return { pass: false, errors: ["AtelierOperation must be an object"], operation: null };
  }
  for (const key of Object.keys(operation)) {
    if (PROVIDER_FIELDS.has(key)) errors.push(`${key} is provider execution data and may not enter AtelierOperation`);
  }
  for (const field of ["contractVersion", "workflowRevision", "garmentId", "viewRole", "operationType"]) {
    requireString(operation[field], field, errors);
  }
  if (!Array.isArray(operation.authorityStack) || operation.authorityStack.length === 0) {
    errors.push("authorityStack must contain at least one resolved authority");
  }
  requireStringArray(operation.changeSet, "changeSet", errors);
  requireStringArray(operation.immutableSet, "immutableSet", errors);
  requireStringArray(operation.failureGates, "failureGates", errors);
  if (!operation.outputContract || typeof operation.outputContract !== "object" || Array.isArray(operation.outputContract)) {
    errors.push("outputContract must be an object");
  }

  const authorityIds = new Set();
  for (const [index, authority] of (operation.authorityStack || []).entries()) {
    for (const field of ["role", "assetId", "sha256", "provenanceClass", "permittedScope", "dominance", "privacyClass"]) {
      requireString(authority?.[field], `authorityStack[${index}].${field}`, errors);
    }
    if (!SHA256.test(String(authority?.sha256 || ""))) errors.push(`authorityStack[${index}].sha256 must be SHA-256`);
    if (authority?.required !== true && authority?.required !== false) errors.push(`authorityStack[${index}].required must be boolean`);
    if (authorityIds.has(authority?.assetId)) errors.push(`authorityStack contains duplicate asset ${authority?.assetId}`);
    authorityIds.add(authority?.assetId);
  }

  for (const [index, lock] of (operation.parentLocks || []).entries()) {
    for (const field of ["assetId", "sha256", "lockedLayer"]) requireString(lock?.[field], `parentLocks[${index}].${field}`, errors);
    if (!SHA256.test(String(lock?.sha256 || ""))) errors.push(`parentLocks[${index}].sha256 must be SHA-256`);
  }

  if (errors.length) return { pass: false, errors, operation: null };

  const normalized = canonicalize({
    contractVersion: operation.contractVersion,
    workflowRevision: operation.workflowRevision,
    garmentId: operation.garmentId,
    viewRole: operation.viewRole,
    operationType: operation.operationType,
    authorityStack: sortCanonical(operation.authorityStack),
    parentLocks: sortCanonical(operation.parentLocks || []),
    changeSet: uniqueSortedStrings(operation.changeSet),
    immutableSet: uniqueSortedStrings(operation.immutableSet),
    garmentFacts: sortCanonical(operation.garmentFacts || []),
    unknownFacts: uniqueSortedStrings(operation.unknownFacts || []),
    prohibitedInferences: uniqueSortedStrings(operation.prohibitedInferences || []),
    sceneSpec: operation.sceneSpec || {},
    cameraSpec: operation.cameraSpec || {},
    poseSpec: operation.poseSpec || {},
    stylingSpec: operation.stylingSpec || {},
    renderQualityContract: operation.renderQualityContract || {},
    outputContract: operation.outputContract,
    failureGates: uniqueSortedStrings(operation.failureGates),
    correctionOf: operation.correctionOf || null,
    correctionBudget: operation.correctionBudget ?? 1,
  });
  return { pass: true, errors: [], operation: normalized };
}

export function deriveSemanticOperationIdentity(operation) {
  const normalized = normalizeAtelierOperation(operation);
  if (!normalized.pass) throw new Error(normalized.errors.join("\n"));
  const canonicalOperation = canonicalStringify(normalized.operation);
  const semanticOperationHash = sha256(canonicalOperation);
  const view = normalized.operation.viewRole.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return Object.freeze({
    operationId: `atelier:${normalized.operation.garmentId}:${view}:${semanticOperationHash.slice(0, 24)}`,
    semanticOperationHash,
    canonicalOperation,
    operation: Object.freeze(normalized.operation),
  });
}

export function deriveExecutionIdentity(input) {
  const required = [
    "semanticOperationHash", "adapterId", "adapterVersion", "provider", "model",
    "compiledPromptHash", "referencePackingHash", "preprocessingVersion", "providerPolicyRevision",
  ];
  const errors = [];
  for (const field of required) requireString(input?.[field], field, errors);
  for (const field of ["semanticOperationHash", "compiledPromptHash", "referencePackingHash"]) {
    if (!SHA256.test(String(input?.[field] || ""))) errors.push(`${field} must be SHA-256`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  const executionRecord = canonicalize({
    semanticOperationHash: input.semanticOperationHash,
    adapterId: input.adapterId,
    adapterVersion: input.adapterVersion,
    provider: input.provider,
    model: input.model,
    modelRevision: input.modelRevision || null,
    compiledPromptHash: input.compiledPromptHash,
    referencePackingHash: input.referencePackingHash,
    preprocessingVersion: input.preprocessingVersion,
    seed: input.seed ?? null,
    sampler: input.sampler ?? null,
    parameters: input.parameters || {},
    providerPolicyRevision: input.providerPolicyRevision,
  });
  return Object.freeze({ executionHash: sha256(canonicalStringify(executionRecord)), executionRecord: Object.freeze(executionRecord) });
}

export function deriveArtifactHash(bytes) {
  return sha256(bytes);
}

export function deriveEvaluationHash({ artifactHash, rubricVersion, evaluatorVersion, thresholdVersion, measurements = {} }) {
  if (!SHA256.test(String(artifactHash || ""))) throw new Error("artifactHash must be SHA-256");
  return sha256(canonicalStringify({ artifactHash, rubricVersion, evaluatorVersion, thresholdVersion, measurements }));
}

export function preflightProviderCapabilities({ operation, capabilities, referenceBindings }) {
  const normalized = normalizeAtelierOperation(operation);
  if (!normalized.pass) return { pass: false, status: "BLOCKED_MISSING_AUTHORITY", errors: normalized.errors };
  const errors = [];
  const bindings = Array.isArray(referenceBindings) ? referenceBindings : [];
  const bound = new Set(bindings.map((binding) => binding.assetId));
  for (const authority of normalized.operation.authorityStack) {
    if (authority.required && !bound.has(authority.assetId)) errors.push(`required authority ${authority.assetId} is not bound`);
    if (!capabilities.privacyClasses?.includes(authority.privacyClass)) {
      errors.push(`privacy class ${authority.privacyClass} is unsupported for ${authority.assetId}`);
    }
  }
  for (const parent of normalized.operation.parentLocks) {
    if (!bound.has(parent.assetId)) errors.push(`parent lock ${parent.assetId} is not bound`);
  }
  if (!capabilities.operationTypes?.includes(normalized.operation.operationType)) {
    errors.push(`operation type ${normalized.operation.operationType} is unsupported`);
  }
  if (bindings.length > capabilities.maxReferences) errors.push(`reference count ${bindings.length} exceeds ${capabilities.maxReferences}`);
  const totalBytes = bindings.reduce((sum, binding) => sum + Number(binding.bytes || 0), 0);
  if (totalBytes > capabilities.maxReferenceBytes) errors.push(`reference bytes ${totalBytes} exceed ${capabilities.maxReferenceBytes}`);
  const format = normalized.operation.outputContract.format;
  if (format && !capabilities.outputFormats?.includes(format)) errors.push(`output format ${format} is unsupported`);
  if (normalized.operation.operationType.includes("LOCAL_CORRECTION") && !capabilities.localCorrection) {
    errors.push("local correction isolation is unsupported");
  }
  return {
    pass: errors.length === 0,
    status: errors.length ? "BLOCKED_CAPABILITY" : "PREFLIGHTED",
    errors,
    remoteIdempotency: capabilities.idempotencyKey === true || capabilities.remoteJobLookup === true,
  };
}

export function projectAtelierLedger(events) {
  const operations = new Map();
  let expectedSequence = 1;
  for (const event of events) {
    if (event.sequence !== expectedSequence) throw new Error(`ledger sequence expected ${expectedSequence} got ${event.sequence}`);
    expectedSequence += 1;
    if (!SHA256.test(String(event.semanticOperationHash || ""))) throw new Error("ledger event semanticOperationHash must be SHA-256");
    const previous = operations.get(event.semanticOperationHash) || { state: null, activeClaim: false, lockedArtifactHash: null, indeterminate: false };
    if (event.type === "CLAIMED" && (previous.activeClaim || previous.lockedArtifactHash || previous.indeterminate)) {
      throw new Error("semantic operation cannot acquire a duplicate or unsafe claim");
    }
    if (event.type === "CLAIMED") previous.activeClaim = true;
    if (["LOCKED", "REJECTED_TERMINAL", "BLOCKED_USER_DIRECTION", "FAILED_RETRYABLE"].includes(event.type)) previous.activeClaim = false;
    if (event.type === "INDETERMINATE_PROVIDER_RESULT") {
      previous.activeClaim = false;
      previous.indeterminate = true;
    }
    if (event.type === "PROVIDER_RECONCILED_ABSENT") previous.indeterminate = false;
    if (event.type === "LOCKED") {
      if (!SHA256.test(String(event.artifactHash || ""))) throw new Error("LOCKED event requires artifactHash");
      if (previous.lockedArtifactHash && previous.lockedArtifactHash !== event.artifactHash) throw new Error("locked artifact is immutable");
      previous.lockedArtifactHash = event.artifactHash;
    }
    if (!ATELIER_LIFECYCLE.includes(event.type) && !SIDE_STATES.has(event.type) && event.type !== "PROVIDER_RECONCILED_ABSENT") {
      throw new Error(`unknown Atelier event type ${event.type}`);
    }
    previous.state = event.type;
    operations.set(event.semanticOperationHash, previous);
  }
  return Object.freeze({ nextSequence: expectedSequence, operations });
}

export function appendAtelierEvent(events, event) {
  const next = Object.freeze({ ...event, sequence: events.length + 1 });
  const candidate = [...events, next];
  projectAtelierLedger(candidate);
  return Object.freeze(candidate);
}

export function resolveSemanticRequest(events, semanticOperationHash) {
  const state = projectAtelierLedger(events).operations.get(semanticOperationHash);
  if (state?.lockedArtifactHash) return Object.freeze({ action: "REUSE_LOCKED", artifactHash: state.lockedArtifactHash });
  if (state?.activeClaim) return Object.freeze({ action: "JOIN_ACTIVE" });
  if (state?.indeterminate) return Object.freeze({ action: "RECONCILE_PROVIDER" });
  return Object.freeze({ action: "CLAIM" });
}
