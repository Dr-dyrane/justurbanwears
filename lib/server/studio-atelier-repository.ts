import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import {
  studioAtelierArtifacts,
  studioAtelierEvents,
  studioAtelierExecutions,
  studioAtelierOperationProjections,
  studioAtelierOperations,
} from "../../db/shop-postgres-schema";
import { getStudioDb } from "../../db/shop-postgres";
import type { ParentLock } from "../studio/atelier/contracts";
import type { VerifiedPrivateBlob } from "./private-content-addressed-blob";

const DEFAULT_EXECUTION_LEASE_MS = 10 * 60 * 1_000;
const MAX_EXECUTION_LEASE_MS = 30 * 60 * 1_000;
const ACTIVE_EXECUTION_UNIQUE_INDEX = "studio_atelier_executions_active_operation_unique";
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export type AtelierOperationRow = typeof studioAtelierOperations.$inferSelect;
export type AtelierExecutionRow = typeof studioAtelierExecutions.$inferSelect;
export type AtelierArtifactRow = typeof studioAtelierArtifacts.$inferSelect;
export type AtelierOperationProjectionRow = typeof studioAtelierOperationProjections.$inferSelect;
export type AtelierLifecycleEventRow = typeof studioAtelierEvents.$inferSelect;
export type AtelierExecutionTerminalState = "COMPLETE" | "FAILED" | "QUARANTINED" | "INDETERMINATE";
export type AtelierArtifactKind =
  | "PROVIDER_RAW"
  | "NORMALIZED"
  | "SUBJECT_LAYER"
  | "COMPOSITE"
  | "DIAGNOSTIC";
export type AtelierLifecycleState =
  | "DRAFT"
  | "MATERIALIZED"
  | "TECHNICAL_PASS"
  | "TECHNICAL_FAIL"
  | "SEMANTIC_PASS"
  | "SEMANTIC_FAIL"
  | "USER_APPROVED"
  | "USER_REJECTED"
  | "LOCKED"
  | "SUPERSEDED"
  | "BLOCKED_USER_DIRECTION";
export type AtelierLifecycleEventType =
  | "MATERIALIZED"
  | "TECHNICAL_PASS"
  | "TECHNICAL_FAIL"
  | "SEMANTIC_PASS"
  | "SEMANTIC_FAIL"
  | "USER_APPROVED"
  | "USER_REJECTED"
  | "LOCKED"
  | "SUPERSEDED"
  | "CORRECTION_AUTHORIZED"
  | "BLOCKED_USER_DIRECTION";

export interface AtelierDeclarationReceipt {
  sourceHash: string;
  schemaVersion: string;
  validatorRevision: string;
  fileVerification: {
    status: "PASS";
    receiptHash: string;
    verifiedAssetCount: number;
    verifiedAt: string;
    manifestHash: string;
  };
}

export interface AtelierTruthReceipt {
  bundleVersion: string;
  stateFileHash: string;
  manifestRevision: string;
  manifestHash: string;
  garmentTruthRevision: string;
  garmentTruthSourceHash: string;
}

export interface AtelierExecutionLease {
  executionId: string;
  executionToken: string;
  leaseFence: number;
  leaseExpiresAt: Date;
}

export interface AtelierProviderResponse {
  modelId?: unknown;
  timestamp?: unknown;
  headers?: Headers | Record<string, string | string[] | undefined>;
}

/** Exact app-owned coordinates for paid bytes staged before result checkpointing. */
export type AtelierProviderResultBlob = Readonly<VerifiedPrivateBlob>;

export interface AtelierProviderResultManifest {
  schemaVersion: "juw.atelier-provider-result.v1";
  requestedModel: string;
  servedModels: string[];
  images: Array<{
    ordinal: number;
    mimeType: string;
    byteSize: number;
    sha256: string;
    blob: AtelierProviderResultBlob;
  }>;
  gatewayGenerationId?: string;
  requestId?: string;
}

export type AtelierProviderModerationStage = "input" | "output" | "unknown";
export type AtelierProviderModerationCategory =
  | "sexual"
  | "violence"
  | "self_harm"
  | "hate"
  | "harassment"
  | "illicit";

export const ATELIER_PROVIDER_MODERATION_ERROR_MESSAGE =
  "The provider declined the image request and returned no output." as const;

/**
 * Private, no-byte provider evidence for a deterministic moderation terminal.
 * `manifestSha256` binds the complete structure other than the hash itself.
 */
export interface AtelierProviderFailureManifest {
  schemaVersion: "juw.atelier-provider-failure.v1";
  outcome: "NO_OUTPUT";
  requestedModel: string;
  providerCode: "moderation_blocked";
  moderation: {
    stage: AtelierProviderModerationStage;
    categories: AtelierProviderModerationCategory[];
    noOutput: true;
  };
  gatewayGenerationId?: string;
  requestId?: string;
  manifestSha256: string;
}

export type CreateAtelierOperationInput = Omit<
  typeof studioAtelierOperations.$inferInsert,
  | "rootSemanticHash"
  | "correctionOfSemanticHash"
  | "correctionOrdinal"
  | "state"
  | "createdAt"
  | "updatedAt"
> & {
  declarationReceipt: AtelierDeclarationReceipt;
  truthReceipt: AtelierTruthReceipt;
};

export type CreateAtelierExecutionIntentInput = Omit<
  typeof studioAtelierExecutions.$inferInsert,
  | "state"
  | "executionToken"
  | "leaseFence"
  | "startedAt"
  | "leaseExpiresAt"
  | "providerInvocationStartedAt"
  | "providerResultReceivedAt"
  | "providerResultManifest"
  | "usage"
  | "costUsd"
  | "warnings"
  | "sanitizedResponses"
  | "requestIds"
  | "durationMs"
  | "errorCode"
  | "errorMessage"
  | "completedAt"
  | "createdAt"
  | "updatedAt"
>;

export type AtelierParentLockRequest = Readonly<{
  role: ParentLock["role"];
  assetId: string;
  sha256: string;
}>;

export type AtelierLifecycleCommand = Readonly<{
  operatorSubject: string;
  operationId: string;
  expectedVersion: number;
  eventType: AtelierLifecycleEventType;
  actorSubject: string;
  executionId?: string | null;
  artifactId?: string | null;
  lockedAssetId?: string | null;
  lockedParentDescriptor?: Readonly<{
    lockedLayer: ParentLock["lockedLayer"];
    privacyClass: ParentLock["privacyClass"];
  }> | null;
  supersededByOperationId?: string | null;
  reasonCode?: string | null;
  evidence?: Record<string, unknown>;
}>;

export type AtelierRecoveryClass =
  | "SAFE_PRE_DISPATCH_REQUEUE"
  | "UNCERTAIN_PROVIDER_INVOCATION"
  | "COMPLETE_RAW_RESUME"
  | "INCOMPLETE_MATERIALIZATION";

export interface AtelierRecoverySummary {
  total: number;
  safePreDispatchRequeue: number;
  uncertainProviderInvocation: number;
  completeRawResume: number;
  incompleteMaterialization: number;
}

const persistedResponseHeaders = new Set([
  "openai-request-id",
  "request-id",
  "traceparent",
  "x-ai-gateway-request-id",
  "x-correlation-id",
  "x-request-id",
  "x-vercel-id",
]);

function requireLeaseDuration(value = DEFAULT_EXECUTION_LEASE_MS): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_EXECUTION_LEASE_MS) {
    throw new Error(`Atelier execution leases must be 1-${MAX_EXECUTION_LEASE_MS}ms.`);
  }
  return value;
}

function isActiveExecutionUniqueConflict(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as Record<string, unknown>;
    const code = typeof record.code === "string" ? record.code : null;
    const constraint = typeof record.constraint === "string"
      ? record.constraint
      : typeof record.constraint_name === "string" ? record.constraint_name : null;
    const message = typeof record.message === "string" ? record.message : "";
    if (
      code === "23505"
      && (
        constraint === null
        || constraint === ACTIVE_EXECUTION_UNIQUE_INDEX
        || message.includes(ACTIVE_EXECUTION_UNIQUE_INDEX)
      )
    ) {
      return true;
    }
    current = record.cause;
  }
  return false;
}

function parseDatabaseTimestamp(value: Date | string, field: string): Date {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`The Atelier ${field} timestamp returned by the database is invalid.`);
  }
  return parsed;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { message: String(value ?? "") };
  }
  const cloned: unknown = JSON.parse(JSON.stringify(value));
  return cloned && typeof cloned === "object" && !Array.isArray(cloned)
    ? cloned as Record<string, unknown>
    : { message: String(value) };
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${stableJson(record[key])}`
  ).join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeRequestId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!candidate || candidate.length > 256 || /[^\x20-\x7e]/.test(candidate)) return null;
  return candidate;
}

const MODERATION_CATEGORIES = Object.freeze([
  "sexual",
  "violence",
  "self_harm",
  "hate",
  "harassment",
  "illicit",
] as const satisfies readonly AtelierProviderModerationCategory[]);

function providerFailureManifestBody(input: Readonly<{
  requestedModel: string;
  moderationStage: AtelierProviderModerationStage;
  categories: readonly AtelierProviderModerationCategory[];
  gatewayGenerationId?: string | null;
  requestId?: string | null;
}>): Omit<AtelierProviderFailureManifest, "manifestSha256"> {
  const gatewayGenerationId = safeRequestId(input.gatewayGenerationId);
  const requestId = safeRequestId(input.requestId);
  return {
    schemaVersion: "juw.atelier-provider-failure.v1",
    outcome: "NO_OUTPUT",
    requestedModel: input.requestedModel,
    providerCode: "moderation_blocked",
    moderation: {
      stage: input.moderationStage,
      categories: [...input.categories],
      noOutput: true,
    },
    ...(gatewayGenerationId ? { gatewayGenerationId } : {}),
    ...(requestId ? { requestId } : {}),
  };
}

export function createAtelierProviderFailureManifest(input: Readonly<{
  requestedModel: string;
  moderationStage: AtelierProviderModerationStage;
  categories: readonly AtelierProviderModerationCategory[];
  gatewayGenerationId?: string | null;
  requestId?: string | null;
}>): AtelierProviderFailureManifest {
  const requestedModel = input.requestedModel.trim();
  const allowedCategories = new Set<string>(MODERATION_CATEGORIES);
  const categories = MODERATION_CATEGORIES.filter((category) =>
    input.categories.includes(category)
  );
  if (
    !requestedModel
    || !["input", "output", "unknown"].includes(input.moderationStage)
    || input.categories.some((category) => !allowedCategories.has(category))
    || new Set(input.categories).size !== input.categories.length
    || categories.length !== input.categories.length
  ) {
    throw new Error("The Atelier provider-failure evidence is invalid.");
  }
  const body = providerFailureManifestBody({
    ...input,
    requestedModel,
    categories,
  });
  return {
    ...body,
    manifestSha256: sha256(stableJson(body)),
  };
}

export function assertAtelierProviderFailureManifest(
  value: unknown,
): asserts value is AtelierProviderFailureManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The Atelier provider-failure manifest is invalid.");
  }
  const manifest = value as Partial<AtelierProviderFailureManifest> & Record<string, unknown>;
  const moderation = manifest.moderation
    && typeof manifest.moderation === "object"
    && !Array.isArray(manifest.moderation)
    ? manifest.moderation as Partial<AtelierProviderFailureManifest["moderation"]>
      & Record<string, unknown>
    : null;
  const keys = Object.keys(manifest).sort();
  const expectedKeys = [
    "manifestSha256",
    "moderation",
    "outcome",
    "providerCode",
    "requestedModel",
    "schemaVersion",
    ...(manifest.gatewayGenerationId === undefined ? [] : ["gatewayGenerationId"]),
    ...(manifest.requestId === undefined ? [] : ["requestId"]),
  ].sort();
  const moderationKeys = moderation ? Object.keys(moderation).sort() : [];
  if (
    stableJson(keys) !== stableJson(expectedKeys)
    || stableJson(moderationKeys) !== stableJson(["categories", "noOutput", "stage"])
    || manifest.schemaVersion !== "juw.atelier-provider-failure.v1"
    || manifest.outcome !== "NO_OUTPUT"
    || manifest.providerCode !== "moderation_blocked"
    || moderation?.noOutput !== true
    || !Array.isArray(moderation.categories)
    || typeof manifest.requestedModel !== "string"
    || typeof manifest.manifestSha256 !== "string"
    || !SHA256_PATTERN.test(manifest.manifestSha256)
  ) {
    throw new Error("The Atelier provider-failure manifest is invalid.");
  }
  const expected = createAtelierProviderFailureManifest({
    requestedModel: manifest.requestedModel,
    moderationStage: moderation.stage as AtelierProviderModerationStage,
    categories: moderation.categories as AtelierProviderModerationCategory[],
    gatewayGenerationId: manifest.gatewayGenerationId,
    requestId: manifest.requestId,
  });
  if (stableJson(expected) !== stableJson(manifest)) {
    throw new Error("The Atelier provider-failure manifest hash is invalid.");
  }
}

function responseHeaderEntries(headers: AtelierProviderResponse["headers"]): Array<[string, string]> {
  if (!headers) return [];
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return Array.from(headers.entries());
  }
  return Object.entries(headers).flatMap(([name, value]) => {
    if (Array.isArray(value)) return value.map((item) => [name, item] as [string, string]);
    return typeof value === "string" ? [[name, value]] : [];
  });
}

/** Keep response diagnostics useful without persisting authorization or cookie headers. */
export function sanitizeAtelierProviderResponses(responses: readonly AtelierProviderResponse[]): {
  responses: Array<Record<string, unknown>>;
  requestIds: string[];
} {
  const requestIds = new Set<string>();
  const sanitized = responses.map((response) => {
    const headers: Record<string, string> = {};
    for (const [rawName, rawValue] of responseHeaderEntries(response.headers)) {
      const name = rawName.toLowerCase();
      if (!persistedResponseHeaders.has(name)) continue;
      const value = safeRequestId(rawValue);
      if (!value) continue;
      headers[name] = value;
      if (name.includes("request-id")) requestIds.add(value);
    }
    const record: Record<string, unknown> = { headers };
    if (typeof response.modelId === "string" && response.modelId.trim()) {
      record.modelId = response.modelId.trim();
    }
    const timestamp = response.timestamp instanceof Date
      ? response.timestamp
      : typeof response.timestamp === "string" || typeof response.timestamp === "number"
        ? new Date(response.timestamp)
        : null;
    if (timestamp && !Number.isNaN(timestamp.getTime())) record.timestamp = timestamp.toISOString();
    return record;
  });
  return { responses: sanitized, requestIds: Array.from(requestIds) };
}

function normalizeCostUsd(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error("Atelier execution cost must be nonnegative.");
    }
    return value.toFixed(12).replace(/0+$/, "").replace(/[.]$/, "") || "0";
  }
  const normalized = value.trim();
  if (!/^[0-9]+([.][0-9]+)?$/.test(normalized)) {
    throw new Error("Atelier execution cost must be a nonnegative decimal string.");
  }
  return normalized;
}

function assertDeclarationReceipt(value: AtelierDeclarationReceipt): void {
  const rootKeys = Object.keys(value).sort();
  if (rootKeys.join(",") !== "fileVerification,schemaVersion,sourceHash,validatorRevision") {
    throw new Error("The Atelier declaration receipt contains unsupported fields.");
  }
  if (!SHA256_PATTERN.test(value.sourceHash) || !value.schemaVersion.trim() || !value.validatorRevision.trim()) {
    throw new Error("The Atelier declaration receipt is invalid.");
  }
  const verification = value.fileVerification;
  const allowedVerificationKeys = new Set([
    "manifestHash",
    "receiptHash",
    "status",
    "verifiedAssetCount",
    "verifiedAt",
  ]);
  if (
    !verification
    || Object.keys(verification).some((key) => !allowedVerificationKeys.has(key))
    || verification.status !== "PASS"
    || !SHA256_PATTERN.test(verification.receiptHash)
    || !SHA256_PATTERN.test(verification.manifestHash)
    || !Number.isSafeInteger(verification.verifiedAssetCount)
    || verification.verifiedAssetCount < 0
    || Number.isNaN(new Date(verification.verifiedAt).getTime())
  ) {
    throw new Error("The Atelier file-verification receipt is invalid.");
  }
}

function assertTruthReceipt(value: AtelierTruthReceipt): void {
  if (
    Object.keys(value).sort().join(",")
      !== "bundleVersion,garmentTruthRevision,garmentTruthSourceHash,manifestHash,manifestRevision,stateFileHash"
    || !value.bundleVersion.trim()
    || !SHA256_PATTERN.test(value.stateFileHash)
    || !value.manifestRevision.trim()
    || !SHA256_PATTERN.test(value.manifestHash)
    || !/^[a-zA-Z0-9._:/-]+$/.test(value.garmentTruthRevision)
    || value.garmentTruthRevision.length > 240
    || !SHA256_PATTERN.test(value.garmentTruthSourceHash)
  ) {
    throw new Error("The Atelier truth-bundle receipt is invalid.");
  }
}

function correctionOf(canonicalOperation: Record<string, unknown>): string | null {
  const value = canonicalOperation.correctionOf;
  if (value === undefined) return null;
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error("The Atelier correction lineage hash is invalid.");
  }
  return value;
}

function usesTransparentSubjectComposite(outputContract: Record<string, unknown>): boolean {
  return outputContract.mode === "TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE";
}

export function areAtelierDeclarationReceiptsCompatible(
  existing: Record<string, unknown>,
  incoming: AtelierDeclarationReceipt,
): boolean {
  const existingVerification = jsonRecord(existing.fileVerification);
  const existingManifestHash = typeof existingVerification.manifestHash === "string"
    ? existingVerification.manifestHash
    : null;
  return existing.sourceHash === incoming.sourceHash
    && existing.schemaVersion === incoming.schemaVersion
    && existing.validatorRevision === incoming.validatorRevision
    && existingManifestHash === incoming.fileVerification.manifestHash;
}

export function areAtelierTruthReceiptsCompatible(
  existing: Record<string, unknown>,
  incoming: AtelierTruthReceipt,
): boolean {
  return existing.bundleVersion === incoming.bundleVersion
    && existing.stateFileHash === incoming.stateFileHash
    && existing.manifestRevision === incoming.manifestRevision
    && existing.manifestHash === incoming.manifestHash
    && existing.garmentTruthRevision === incoming.garmentTruthRevision
    && existing.garmentTruthSourceHash === incoming.garmentTruthSourceHash;
}

export async function getAtelierOperation(input: {
  operatorSubject: string;
  operationId: string;
}): Promise<AtelierOperationRow | null> {
  const [operation] = await (await getStudioDb()).select().from(studioAtelierOperations).where(and(
    eq(studioAtelierOperations.id, input.operationId),
    eq(studioAtelierOperations.operatorSubject, input.operatorSubject),
  )).limit(1);
  return operation ?? null;
}

export async function getAtelierOperationByKey(input: {
  operatorSubject: string;
  operationKey: string;
}): Promise<AtelierOperationRow | null> {
  const [operation] = await (await getStudioDb()).select().from(studioAtelierOperations).where(and(
    eq(studioAtelierOperations.operatorSubject, input.operatorSubject),
    eq(studioAtelierOperations.operationKey, input.operationKey),
  )).limit(1);
  return operation ?? null;
}

/** Resolve the single durable correction child for one root operation. */
export async function getAtelierCorrectionOperation(input: {
  operatorSubject: string;
  operationId: string;
}): Promise<AtelierOperationRow | null> {
  const source = await getAtelierOperation(input);
  if (!source || source.correctionOrdinal !== 0) return null;
  const [correction] = await (await getStudioDb()).select().from(studioAtelierOperations).where(and(
    eq(studioAtelierOperations.operatorSubject, input.operatorSubject),
    eq(studioAtelierOperations.rootSemanticHash, source.rootSemanticHash),
    eq(studioAtelierOperations.correctionOrdinal, 1),
  )).limit(1);
  return correction ?? null;
}

export async function createAtelierOperation(
  input: CreateAtelierOperationInput,
): Promise<AtelierOperationRow> {
  assertDeclarationReceipt(input.declarationReceipt);
  assertTruthReceipt(input.truthReceipt);
  const database = await getStudioDb();
  const correctionHash = correctionOf(input.canonicalOperation);
  let rootSemanticHash = input.semanticHash;
  let correctionOrdinal = 0;
  if (correctionHash) {
    const [source] = await database.select({
      rootSemanticHash: studioAtelierOperations.rootSemanticHash,
      correctionOrdinal: studioAtelierOperations.correctionOrdinal,
      wardrobeItemId: studioAtelierOperations.wardrobeItemId,
      correctionAuthorized: studioAtelierOperationProjections.correctionAuthorized,
    }).from(studioAtelierOperations).innerJoin(
      studioAtelierOperationProjections,
      eq(studioAtelierOperationProjections.operationId, studioAtelierOperations.id),
    ).where(and(
      eq(studioAtelierOperations.operatorSubject, input.operatorSubject),
      eq(studioAtelierOperations.semanticHash, correctionHash),
    )).limit(1);
    if (!source) throw new Error("The Atelier correction source does not exist in this operator scope.");
    if (!source.correctionAuthorized) {
      throw new Error("The Atelier correction has not been authorized by the lifecycle projection.");
    }
    if (source.correctionOrdinal !== 0) {
      throw new Error("An Atelier correction cannot create another correction lineage.");
    }
    if (!input.wardrobeItemId || source.wardrobeItemId !== input.wardrobeItemId) {
      throw new Error("The Atelier correction must retain the exact Wardrobe item ownership.");
    }
    rootSemanticHash = source.rootSemanticHash;
    correctionOrdinal = 1;
  }

  const operationId = randomUUID();
  const inserted = await database.execute<{ id: string }>(sql`
    with inserted_operation as (
      insert into studio_atelier_operations (
        id, operator_subject, wardrobe_item_id, operation_key, garment_id, view, stage,
        contract_version, workflow_revision, semantic_hash, root_semantic_hash,
        correction_of_semantic_hash, correction_ordinal, declaration_receipt, truth_receipt,
        canonical_operation, parent_assets, authority_stack, change_set,
        immutable_set, output_contract, failure_gates, state, created_at, updated_at
      ) values (
        ${operationId}::uuid, ${input.operatorSubject}, ${input.wardrobeItemId}::uuid, ${input.operationKey},
        ${input.garmentId}, ${input.view}, ${input.stage}, ${input.contractVersion},
        ${input.workflowRevision}, ${input.semanticHash}, ${rootSemanticHash},
        ${correctionHash}, ${correctionOrdinal}, ${JSON.stringify(input.declarationReceipt)}::jsonb,
        ${JSON.stringify(input.truthReceipt)}::jsonb,
        ${JSON.stringify(input.canonicalOperation)}::jsonb, ${JSON.stringify(input.parentAssets)}::jsonb,
        ${JSON.stringify(input.authorityStack)}::jsonb, ${JSON.stringify(input.changeSet)}::jsonb,
        ${JSON.stringify(input.immutableSet)}::jsonb, ${JSON.stringify(input.outputContract)}::jsonb,
        ${JSON.stringify(input.failureGates)}::jsonb, 'PLANNED', now(), now()
      )
      on conflict do nothing
      returning id
    ), inserted_projection as (
      insert into studio_atelier_operation_projections (operation_id)
      select id from inserted_operation
      on conflict (operation_id) do nothing
      returning operation_id
    )
    select id from inserted_operation where exists (select 1 from inserted_projection)
  `);

  if (inserted.rows.length === 0) {
    const [byOperationKey] = await database.select().from(studioAtelierOperations).where(and(
      eq(studioAtelierOperations.operatorSubject, input.operatorSubject),
      eq(studioAtelierOperations.operationKey, input.operationKey),
    )).limit(1);
    const [bySemanticHash] = await database.select().from(studioAtelierOperations).where(and(
      eq(studioAtelierOperations.operatorSubject, input.operatorSubject),
      eq(studioAtelierOperations.semanticHash, input.semanticHash),
    )).limit(1);
    if (
      (!byOperationKey && !bySemanticHash)
      || (byOperationKey && byOperationKey.semanticHash !== input.semanticHash)
      || (bySemanticHash && bySemanticHash.operationKey !== input.operationKey)
      || (byOperationKey && bySemanticHash && byOperationKey.id !== bySemanticHash.id)
    ) {
      throw new Error("The Atelier operation idempotency key or correction budget conflicts.");
    }
    const existing = byOperationKey ?? bySemanticHash!;
    if (
      existing.rootSemanticHash !== rootSemanticHash
      || existing.correctionOfSemanticHash !== correctionHash
      || existing.wardrobeItemId !== input.wardrobeItemId
      || !areAtelierDeclarationReceiptsCompatible(existing.declarationReceipt, input.declarationReceipt)
      || !areAtelierTruthReceiptsCompatible(existing.truthReceipt, input.truthReceipt)
    ) {
      throw new Error("The Atelier operation idempotency key conflicts with a different declaration.");
    }
    await database.insert(studioAtelierOperationProjections).values({
      operationId: existing.id,
    }).onConflictDoNothing();
    return existing;
  }

  const [created] = await database.select().from(studioAtelierOperations).where(
    eq(studioAtelierOperations.id, operationId),
  ).limit(1);
  if (!created) throw new Error("The Atelier operation was not readable after creation.");
  return created;
}

/** Persist the exact provider plan before any remote invocation checkpoint. */
export async function createAtelierExecutionIntent(
  input: CreateAtelierExecutionIntentInput,
): Promise<AtelierExecutionRow> {
  const database = await getStudioDb();
  const [created] = await database.insert(studioAtelierExecutions).values({
    ...input,
    state: "INTENT",
  }).onConflictDoNothing().returning();
  if (created) return created;

  const [existing] = await database.select().from(studioAtelierExecutions).where(and(
    eq(studioAtelierExecutions.operationId, input.operationId),
    eq(studioAtelierExecutions.attempt, input.attempt),
  )).limit(1);
  if (!existing || existing.executionHash !== input.executionHash) {
    throw new Error("The Atelier execution attempt conflicts with a different provider request.");
  }
  return existing;
}

export async function getAtelierExecution(id: string): Promise<AtelierExecutionRow | null> {
  const [execution] = await (await getStudioDb()).select().from(studioAtelierExecutions).where(
    eq(studioAtelierExecutions.id, id),
  ).limit(1);
  return execution ?? null;
}

export async function listAtelierArtifacts(executionId: string): Promise<AtelierArtifactRow[]> {
  return (await getStudioDb()).select().from(studioAtelierArtifacts).where(
    eq(studioAtelierArtifacts.executionId, executionId),
  ).orderBy(studioAtelierArtifacts.ordinal);
}

export async function getAtelierOperationProjection(input: {
  operatorSubject: string;
  operationId: string;
}): Promise<AtelierOperationProjectionRow | null> {
  const [projection] = await (await getStudioDb()).select({
    projection: studioAtelierOperationProjections,
  }).from(studioAtelierOperationProjections).innerJoin(
    studioAtelierOperations,
    eq(studioAtelierOperations.id, studioAtelierOperationProjections.operationId),
  ).where(and(
    eq(studioAtelierOperationProjections.operationId, input.operationId),
    eq(studioAtelierOperations.operatorSubject, input.operatorSubject),
  )).limit(1);
  return projection?.projection ?? null;
}

export async function listAtelierOperationEvents(input: {
  operatorSubject: string;
  operationId: string;
}): Promise<AtelierLifecycleEventRow[]> {
  const rows = await (await getStudioDb()).select({ event: studioAtelierEvents }).from(
    studioAtelierEvents,
  ).innerJoin(
    studioAtelierOperations,
    eq(studioAtelierOperations.id, studioAtelierEvents.operationId),
  ).where(and(
    eq(studioAtelierEvents.operationId, input.operationId),
    eq(studioAtelierOperations.operatorSubject, input.operatorSubject),
  )).orderBy(studioAtelierEvents.sequence);
  return rows.map((row) => row.event);
}

export async function getReusableAtelierResult(input: {
  operatorSubject: string;
  operationId: string;
}): Promise<{
  operation: AtelierOperationRow;
  projection: AtelierOperationProjectionRow;
  execution: AtelierExecutionRow;
  artifact: AtelierArtifactRow;
} | null> {
  const operation = await getAtelierOperation(input);
  const projection = await getAtelierOperationProjection(input);
  if (!operation || !projection?.materializedExecutionId || !projection.materializedArtifactId) return null;
  const execution = await getAtelierExecution(projection.materializedExecutionId);
  const [artifact] = await (await getStudioDb()).select().from(studioAtelierArtifacts).where(and(
    eq(studioAtelierArtifacts.id, projection.materializedArtifactId),
    eq(studioAtelierArtifacts.executionId, projection.materializedExecutionId),
    eq(studioAtelierArtifacts.state, "STORED"),
  )).limit(1);
  const requiredKind = usesTransparentSubjectComposite(operation.outputContract)
    ? "COMPOSITE"
    : "NORMALIZED";
  if (
    !execution
    || execution.state !== "COMPLETE"
    || !artifact
    || artifact.kind !== requiredKind
    || artifact.sha256 !== projection.materializedArtifactSha256
  ) return null;
  return { operation, projection, execution, artifact };
}

/** Claims only a durable INTENT and increments the monotonic fencing value. */
export async function claimAtelierExecution(
  id: string,
  leaseDurationMs = DEFAULT_EXECUTION_LEASE_MS,
): Promise<AtelierExecutionLease | null> {
  const duration = requireLeaseDuration(leaseDurationMs);
  const executionToken = randomUUID();
  const startedAt = new Date();
  const leaseExpiresAt = new Date(startedAt.getTime() + duration);
  let claimed: {
    executionId: string;
    executionToken: string | null;
    leaseFence: number;
    leaseExpiresAt: Date | string | null;
  } | undefined;
  try {
    const result = await (await getStudioDb()).execute<{
      executionId: string;
      executionToken: string | null;
      leaseFence: number;
      leaseExpiresAt: Date | string | null;
    }>(sql`
      with claimed_execution as (
        update studio_atelier_executions execution
        set state = case
              when execution.provider_result_received_at is not null then 'PERSISTING'
              else 'RUNNING'
            end,
            execution_token = ${executionToken}::uuid,
            lease_fence = execution.lease_fence + 1,
            started_at = ${startedAt},
            lease_expires_at = ${leaseExpiresAt},
            updated_at = ${startedAt}
        where execution.id = ${id}::uuid
          and execution.state = 'INTENT'
          and not exists (
            select 1 from studio_atelier_executions materialized
            where materialized.operation_id = execution.operation_id
              and materialized.state = 'COMPLETE'
              and materialized.id <> execution.id
          )
        returning execution.id, execution.operation_id, execution.execution_token,
          execution.lease_fence, execution.lease_expires_at
      ), activated_operation as (
        update studio_atelier_operations operation
        set state = 'ACTIVE', updated_at = ${startedAt}
        where operation.id = (select operation_id from claimed_execution)
          and operation.state <> 'COMPLETE'
        returning operation.id
      )
      select id as "executionId", execution_token as "executionToken",
        lease_fence as "leaseFence", lease_expires_at as "leaseExpiresAt"
      from claimed_execution
    `);
    claimed = result.rows[0];
  } catch (error) {
    if (isActiveExecutionUniqueConflict(error)) return null;
    throw error;
  }
  if (!claimed?.executionToken || !claimed.leaseExpiresAt) return null;
  return {
    executionId: claimed.executionId,
    executionToken: claimed.executionToken,
    leaseFence: claimed.leaseFence,
    leaseExpiresAt: parseDatabaseTimestamp(claimed.leaseExpiresAt, "execution lease expiry"),
  };
}

export async function renewAtelierExecutionLease(
  lease: AtelierExecutionLease,
  leaseDurationMs = DEFAULT_EXECUTION_LEASE_MS,
): Promise<AtelierExecutionLease | null> {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + requireLeaseDuration(leaseDurationMs));
  const [renewed] = await (await getStudioDb()).update(studioAtelierExecutions).set({
    leaseExpiresAt,
    updatedAt: now,
  }).where(and(
    eq(studioAtelierExecutions.id, lease.executionId),
    inArray(studioAtelierExecutions.state, ["RUNNING", "PERSISTING"]),
    eq(studioAtelierExecutions.executionToken, lease.executionToken),
    eq(studioAtelierExecutions.leaseFence, lease.leaseFence),
    gt(studioAtelierExecutions.leaseExpiresAt, now),
  )).returning({ id: studioAtelierExecutions.id });
  return renewed ? { ...lease, leaseExpiresAt } : null;
}

/** This fenced write is the last durable action before dispatching a paid call. */
export async function checkpointAtelierProviderInvocationStarted(
  lease: AtelierExecutionLease,
): Promise<boolean> {
  const now = new Date();
  const [updated] = await (await getStudioDb()).update(studioAtelierExecutions).set({
    providerInvocationStartedAt: now,
    updatedAt: now,
  }).where(and(
    eq(studioAtelierExecutions.id, lease.executionId),
    eq(studioAtelierExecutions.state, "RUNNING"),
    eq(studioAtelierExecutions.executionToken, lease.executionToken),
    eq(studioAtelierExecutions.leaseFence, lease.leaseFence),
    gt(studioAtelierExecutions.leaseExpiresAt, now),
    sql`${studioAtelierExecutions.providerInvocationStartedAt} is null`,
    sql`${studioAtelierExecutions.providerResultReceivedAt} is null`,
  )).returning({ id: studioAtelierExecutions.id });
  return Boolean(updated);
}

function assertProviderResultManifest(manifest: AtelierProviderResultManifest): void {
  if (
    manifest.schemaVersion !== "juw.atelier-provider-result.v1"
    || !manifest.requestedModel.trim()
    || manifest.images.length === 0
    || manifest.images.length > 64
  ) {
    throw new Error("The Atelier provider-result manifest is invalid.");
  }
  const ordinals = new Set<number>();
  for (const image of manifest.images) {
    if (
      !Number.isSafeInteger(image.ordinal)
      || image.ordinal < 0
      || image.ordinal >= 64
      || ordinals.has(image.ordinal)
      || !image.mimeType.trim()
      || !Number.isSafeInteger(image.byteSize)
      || image.byteSize <= 0
      || !SHA256_PATTERN.test(image.sha256)
      || !image.blob
      || !image.blob.pathname.trim()
      || !image.blob.blobUrl.trim()
      || !image.blob.mimeType.trim()
      || image.blob.byteSize !== image.byteSize
      || image.blob.sha256 !== image.sha256
    ) {
      throw new Error("The Atelier provider-result image manifest is invalid.");
    }
    ordinals.add(image.ordinal);
  }
}

/** Persist provider success/accounting before Blob materialization or policy. */
export async function checkpointAtelierProviderResult(input: {
  lease: AtelierExecutionLease;
  manifest: AtelierProviderResultManifest;
  usage: Record<string, unknown> | null;
  costUsd: number | string | null;
  warnings?: unknown[];
  responses?: AtelierProviderResponse[];
  requestIds?: string[];
  durationMs: number;
}): Promise<boolean> {
  assertProviderResultManifest(input.manifest);
  if (!Number.isSafeInteger(input.durationMs) || input.durationMs < 0) {
    throw new Error("Atelier execution duration must be a nonnegative integer.");
  }
  const costUsd = normalizeCostUsd(input.costUsd);
  const sanitized = sanitizeAtelierProviderResponses(input.responses ?? []);
  const requestIds = Array.from(new Set([
    ...sanitized.requestIds,
    ...(input.requestIds ?? []).flatMap((value) => safeRequestId(value) ?? []),
  ]));
  const now = new Date();
  const [updated] = await (await getStudioDb()).update(studioAtelierExecutions).set({
    state: "PERSISTING",
    providerResultReceivedAt: now,
    providerResultManifest: jsonRecord(input.manifest),
    usage: input.usage ? jsonRecord(input.usage) : null,
    costUsd,
    warnings: (input.warnings ?? []).map(jsonRecord),
    sanitizedResponses: sanitized.responses,
    requestIds,
    durationMs: input.durationMs,
    updatedAt: now,
  }).where(and(
    eq(studioAtelierExecutions.id, input.lease.executionId),
    eq(studioAtelierExecutions.state, "RUNNING"),
    eq(studioAtelierExecutions.executionToken, input.lease.executionToken),
    eq(studioAtelierExecutions.leaseFence, input.lease.leaseFence),
    gt(studioAtelierExecutions.leaseExpiresAt, now),
    sql`${studioAtelierExecutions.providerInvocationStartedAt} is not null`,
    sql`${studioAtelierExecutions.providerResultReceivedAt} is null`,
  )).returning({ id: studioAtelierExecutions.id });
  return Boolean(updated);
}

export async function recordAtelierArtifact(input: {
  lease: AtelierExecutionLease;
  ordinal: number;
  kind: AtelierArtifactKind;
  role: string;
  blob: VerifiedPrivateBlob;
  width?: number | null;
  height?: number | null;
  metadata?: Record<string, unknown>;
  quarantineReason?: string | null;
}): Promise<AtelierArtifactRow> {
  const id = randomUUID();
  const state = input.quarantineReason ? "QUARANTINED" : "STORED";
  const metadata = JSON.stringify(input.metadata ?? {});
  const result = await (await getStudioDb()).execute<{ id: string }>(sql`
    insert into studio_atelier_artifacts (
      id, execution_id, ordinal, kind, role, state, blob_pathname, blob_url,
      mime_type, byte_size, width, height, sha256, metadata,
      quarantine_reason, privacy, created_at
    )
    select
      ${id}::uuid, execution.id, ${input.ordinal}, ${input.kind}, ${input.role}, ${state},
      ${input.blob.pathname}, ${input.blob.blobUrl}, ${input.blob.mimeType},
      ${input.blob.byteSize}, ${input.width ?? null}, ${input.height ?? null},
      ${input.blob.sha256}, ${metadata}::jsonb, ${input.quarantineReason ?? null},
      'PRIVATE', now()
    from studio_atelier_executions execution
    where execution.id = ${input.lease.executionId}::uuid
      and execution.state = 'PERSISTING'
      and execution.execution_token = ${input.lease.executionToken}::uuid
      and execution.lease_fence = ${input.lease.leaseFence}
      and execution.lease_expires_at > now()
      and execution.provider_result_received_at is not null
      and execution.provider_result_manifest is not null
    on conflict (execution_id, kind, ordinal) do nothing
    returning id
  `);

  const [artifact] = await (await getStudioDb()).select().from(studioAtelierArtifacts).where(and(
    eq(studioAtelierArtifacts.executionId, input.lease.executionId),
    eq(studioAtelierArtifacts.kind, input.kind),
    eq(studioAtelierArtifacts.ordinal, input.ordinal),
  )).limit(1);
  const inserted = result.rows.some((row) => row.id === id);
  if (
    !artifact
    || (!inserted && (
      artifact.sha256 !== input.blob.sha256
      || artifact.blobPathname !== input.blob.pathname
      || artifact.blobUrl !== input.blob.blobUrl
      || artifact.mimeType !== input.blob.mimeType
      || artifact.byteSize !== input.blob.byteSize
      || artifact.kind !== input.kind
      || artifact.role !== input.role
      || artifact.state !== state
    ))
  ) {
    throw new Error("The Atelier artifact write lost its execution fence or conflicts with another output.");
  }
  return artifact;
}

function eventPayload(input: AtelierLifecycleCommand): Record<string, unknown> {
  return {
    ...(input.executionId ? { executionId: input.executionId } : {}),
    ...(input.artifactId ? { artifactId: input.artifactId } : {}),
    ...(input.lockedAssetId ? { lockedAssetId: input.lockedAssetId } : {}),
    ...(input.lockedParentDescriptor ? { lockedParentDescriptor: input.lockedParentDescriptor } : {}),
    ...(input.supersededByOperationId ? { supersededByOperationId: input.supersededByOperationId } : {}),
    ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
    evidence: jsonRecord(input.evidence ?? {}),
  };
}

export function assertAtelierLifecycleTransition(
  projection: AtelierOperationProjectionRow,
  input: AtelierLifecycleCommand,
): void {
  const allowed: Record<AtelierLifecycleEventType, readonly AtelierLifecycleState[]> = {
    MATERIALIZED: ["DRAFT"],
    TECHNICAL_PASS: ["MATERIALIZED"],
    TECHNICAL_FAIL: ["MATERIALIZED"],
    SEMANTIC_PASS: ["TECHNICAL_PASS"],
    SEMANTIC_FAIL: ["TECHNICAL_PASS"],
    USER_APPROVED: ["SEMANTIC_PASS"],
    USER_REJECTED: ["SEMANTIC_PASS"],
    LOCKED: ["USER_APPROVED"],
    SUPERSEDED: ["LOCKED"],
    CORRECTION_AUTHORIZED: ["TECHNICAL_FAIL", "SEMANTIC_FAIL", "USER_REJECTED"],
    // DRAFT is eligible only for a server-authored terminal execution block;
    // recordAtelierLifecycleEvent validates that binding below.
    BLOCKED_USER_DIRECTION: ["DRAFT", "TECHNICAL_FAIL", "SEMANTIC_FAIL", "USER_REJECTED"],
  };
  if (!allowed[input.eventType].includes(projection.state as AtelierLifecycleState)) {
    throw new Error(`${input.eventType} cannot follow Atelier lifecycle state ${projection.state}.`);
  }
  if (input.eventType === "CORRECTION_AUTHORIZED" && projection.correctionAuthorized) {
    throw new Error("The Atelier correction budget was already authorized.");
  }
  if (
    ["TECHNICAL_FAIL", "SEMANTIC_FAIL", "USER_REJECTED", "BLOCKED_USER_DIRECTION"].includes(
      input.eventType,
    )
    && !input.reasonCode?.trim()
  ) {
    throw new Error(`${input.eventType} requires a bounded reason code.`);
  }
  if (
    input.eventType === "BLOCKED_USER_DIRECTION"
    && projection.state === "DRAFT"
    && (
      input.actorSubject !== "system:atelier-execution"
      || !input.executionId
      || !/^EXECUTION_(FAILED|QUARANTINED|INDETERMINATE):[A-Z0-9_:-]+$/
        .test(input.reasonCode ?? "")
    )
  ) {
    throw new Error("A DRAFT Atelier projection may be blocked only by a bound terminal execution.");
  }
}

function nextLifecycleProjection(
  projection: AtelierOperationProjectionRow,
  input: AtelierLifecycleCommand,
  artifact: AtelierArtifactRow | null,
) {
  const next = {
    state: projection.state,
    technicalDecision: projection.technicalDecision,
    semanticDecision: projection.semanticDecision,
    userDecision: projection.userDecision,
    correctionAuthorized: projection.correctionAuthorized,
    materializedExecutionId: projection.materializedExecutionId,
    materializedArtifactId: projection.materializedArtifactId,
    materializedArtifactSha256: projection.materializedArtifactSha256,
    lockedArtifactId: projection.lockedArtifactId,
    lockedAssetId: projection.lockedAssetId,
    lockedArtifactSha256: projection.lockedArtifactSha256,
    lockedParentDescriptor: projection.lockedParentDescriptor,
    supersededByOperationId: projection.supersededByOperationId,
    blockedReason: projection.blockedReason,
  };
  switch (input.eventType) {
    case "MATERIALIZED":
      return {
        ...next,
        state: "MATERIALIZED",
        materializedExecutionId: input.executionId!,
        materializedArtifactId: artifact!.id,
        materializedArtifactSha256: artifact!.sha256,
      };
    case "TECHNICAL_PASS":
      return { ...next, state: "TECHNICAL_PASS", technicalDecision: "PASS" };
    case "TECHNICAL_FAIL":
      return { ...next, state: "TECHNICAL_FAIL", technicalDecision: "FAIL" };
    case "SEMANTIC_PASS":
      return { ...next, state: "SEMANTIC_PASS", semanticDecision: "PASS" };
    case "SEMANTIC_FAIL":
      return { ...next, state: "SEMANTIC_FAIL", semanticDecision: "FAIL" };
    case "USER_APPROVED":
      return { ...next, state: "USER_APPROVED", userDecision: "APPROVED" };
    case "USER_REJECTED":
      return { ...next, state: "USER_REJECTED", userDecision: "REJECTED" };
    case "LOCKED":
      return {
        ...next,
        state: "LOCKED",
        lockedArtifactId: artifact!.id,
        lockedAssetId: input.lockedAssetId!,
        lockedArtifactSha256: artifact!.sha256,
        lockedParentDescriptor: input.lockedParentDescriptor!,
      };
    case "SUPERSEDED":
      return { ...next, state: "SUPERSEDED", supersededByOperationId: input.supersededByOperationId! };
    case "CORRECTION_AUTHORIZED":
      return { ...next, correctionAuthorized: true };
    case "BLOCKED_USER_DIRECTION":
      return { ...next, state: "BLOCKED_USER_DIRECTION", blockedReason: input.reasonCode! };
  }
}

/** Append one event and advance its projection under one version CAS. */
export async function recordAtelierLifecycleEvent(input: AtelierLifecycleCommand): Promise<{
  projection: AtelierOperationProjectionRow;
  event: AtelierLifecycleEventRow;
}> {
  if (
    !Number.isSafeInteger(input.expectedVersion)
    || input.expectedVersion < 0
    || !input.actorSubject.trim()
  ) {
    throw new Error("The Atelier lifecycle CAS declaration is invalid.");
  }
  const database = await getStudioDb();
  const operation = await getAtelierOperation(input);
  const projection = await getAtelierOperationProjection(input);
  if (!operation || !projection) throw new Error("The scoped Atelier operation projection was not found.");
  if (projection.version !== input.expectedVersion) {
    throw new Error("The Atelier lifecycle projection changed; reload before issuing another command.");
  }
  assertAtelierLifecycleTransition(projection, input);

  if (input.eventType === "BLOCKED_USER_DIRECTION" && projection.state === "DRAFT") {
    const execution = await getAtelierExecution(input.executionId!);
    if (
      !execution
      || execution.operationId !== operation.id
      || !["FAILED", "QUARANTINED", "INDETERMINATE"].includes(execution.state)
      || !input.reasonCode?.startsWith(`EXECUTION_${execution.state}:`)
    ) {
      throw new Error("The DRAFT block is not bound to a terminal execution of this operation.");
    }
  }

  let artifact: AtelierArtifactRow | null = null;
  if (input.eventType === "MATERIALIZED" || input.eventType === "LOCKED") {
    if (!input.executionId || !input.artifactId) {
      throw new Error(`${input.eventType} requires an execution and artifact.`);
    }
    const [candidate] = await database.select({
      artifact: studioAtelierArtifacts,
      executionState: studioAtelierExecutions.state,
    }).from(studioAtelierArtifacts).innerJoin(
      studioAtelierExecutions,
      eq(studioAtelierExecutions.id, studioAtelierArtifacts.executionId),
    ).where(and(
      eq(studioAtelierArtifacts.id, input.artifactId),
      eq(studioAtelierArtifacts.executionId, input.executionId),
      eq(studioAtelierExecutions.operationId, input.operationId),
      eq(studioAtelierArtifacts.state, "STORED"),
    )).limit(1);
    if (!candidate || candidate.executionState !== "COMPLETE") {
      throw new Error("The lifecycle artifact is not a stored result of a COMPLETE execution.");
    }
    artifact = candidate.artifact;
  }
  if (input.eventType === "MATERIALIZED" && artifact?.kind === "PROVIDER_RAW") {
    throw new Error("Raw provider bytes cannot be the materialized review artifact.");
  }
  if (input.eventType === "MATERIALIZED") {
    const requiredMaterializedKind = usesTransparentSubjectComposite(operation.outputContract)
      ? "COMPOSITE"
      : "NORMALIZED";
    if (artifact?.kind !== requiredMaterializedKind) {
      throw new Error(`The operation requires a stored ${requiredMaterializedKind} review artifact.`);
    }
  }
  if (input.eventType === "LOCKED") {
    const descriptor = input.lockedParentDescriptor;
    const descriptorKeys = descriptor ? Object.keys(descriptor).sort().join(",") : "";
    const validLayers = new Set([
      "IDENTITY", "BODY", "GARMENT", "HAIR", "POSE", "HANDS", "FOOTWEAR",
      "STYLING", "ATELIER", "BRAND_ICON", "CAMERA", "LIGHTING", "COMPOSITION",
      "OUTPUT_GEOMETRY",
    ]);
    const validPrivacy = new Set(["PUBLIC", "PRIVATE_OPERATOR", "PRIVATE_IDENTITY"]);
    if (
      !input.lockedAssetId
      || !/^[a-zA-Z0-9._:/-]{1,200}$/.test(input.lockedAssetId)
      || !descriptor
      || descriptorKeys !== "lockedLayer,privacyClass"
      || !validLayers.has(descriptor.lockedLayer)
      || !validPrivacy.has(descriptor.privacyClass)
    ) {
      throw new Error("A lock requires a logical asset ID and trusted parent descriptor.");
    }
    const requiredLockedKind = usesTransparentSubjectComposite(operation.outputContract)
      ? "COMPOSITE"
      : "NORMALIZED";
    if (artifact?.kind !== requiredLockedKind) {
      throw new Error("The selected artifact kind cannot be locked for this Atelier stage.");
    }
  }
  if (input.eventType === "SUPERSEDED") {
    if (!input.supersededByOperationId || input.supersededByOperationId === input.operationId) {
      throw new Error("A supersession requires a different replacement operation.");
    }
    const replacement = await getAtelierOperationProjection({
      operatorSubject: input.operatorSubject,
      operationId: input.supersededByOperationId,
    });
    if (replacement?.state !== "LOCKED") {
      throw new Error("An Atelier operation can be superseded only by another locked operation.");
    }
  }

  const next = nextLifecycleProjection(projection, input, artifact);
  const payload = eventPayload(input);
  const createdAt = new Date();
  const resultingVersion = input.expectedVersion + 1;
  const eventHash = sha256(stableJson({
    operationId: input.operationId,
    sequence: resultingVersion,
    eventType: input.eventType,
    actorSubject: input.actorSubject,
    payload,
    previousEventHash: projection.lastEventHash,
    createdAt: createdAt.toISOString(),
  }));
  const eventId = randomUUID();
  const parentDescriptorJson = next.lockedParentDescriptor
    ? JSON.stringify(next.lockedParentDescriptor)
    : null;
  const result = await database.execute<{ id: string }>(sql`
    with advanced_projection as (
      update studio_atelier_operation_projections projection
      set version = ${resultingVersion},
          state = ${next.state},
          technical_decision = ${next.technicalDecision},
          semantic_decision = ${next.semanticDecision},
          user_decision = ${next.userDecision},
          correction_authorized = ${next.correctionAuthorized},
          materialized_execution_id = ${next.materializedExecutionId}::uuid,
          materialized_artifact_id = ${next.materializedArtifactId}::uuid,
          materialized_artifact_sha256 = ${next.materializedArtifactSha256},
          locked_artifact_id = ${next.lockedArtifactId}::uuid,
          locked_asset_id = ${next.lockedAssetId},
          locked_artifact_sha256 = ${next.lockedArtifactSha256},
          locked_parent_descriptor = ${parentDescriptorJson}::jsonb,
          superseded_by_operation_id = ${next.supersededByOperationId}::uuid,
          blocked_reason = ${next.blockedReason},
          last_event_hash = ${eventHash},
          updated_at = ${createdAt}
      from studio_atelier_operations operation
      where projection.operation_id = ${input.operationId}::uuid
        and projection.version = ${input.expectedVersion}
        and operation.id = projection.operation_id
        and operation.operator_subject = ${input.operatorSubject}
      returning projection.operation_id
    ), appended_event as (
      insert into studio_atelier_events (
        id, operation_id, sequence, event_type, expected_version,
        resulting_version, execution_id, artifact_id, actor_subject, payload,
        previous_event_hash, event_hash, created_at
      )
      select ${eventId}::uuid, operation_id, ${resultingVersion}, ${input.eventType},
        ${input.expectedVersion}, ${resultingVersion}, ${input.executionId ?? null}::uuid,
        ${input.artifactId ?? null}::uuid, ${input.actorSubject}, ${JSON.stringify(payload)}::jsonb,
        ${projection.lastEventHash}, ${eventHash}, ${createdAt}
      from advanced_projection
      returning id
    )
    select id from appended_event
  `);
  if (result.rows.length !== 1) {
    throw new Error("The Atelier lifecycle projection changed before the event could commit.");
  }
  const updatedProjection = await getAtelierOperationProjection(input);
  const [event] = await database.select().from(studioAtelierEvents).where(
    eq(studioAtelierEvents.id, eventId),
  ).limit(1);
  if (!updatedProjection || !event) throw new Error("The committed Atelier event was not readable.");
  return { projection: updatedProjection, event };
}

export async function resolveAtelierParentLocks(input: {
  operatorSubject: string;
  requested: readonly AtelierParentLockRequest[];
}): Promise<ParentLock[]> {
  const database = await getStudioDb();
  const resolved: ParentLock[] = [];
  for (const request of input.requested) {
    const [match] = await database.select({
      operation: studioAtelierOperations,
      projection: studioAtelierOperationProjections,
    }).from(studioAtelierOperationProjections).innerJoin(
      studioAtelierOperations,
      eq(studioAtelierOperations.id, studioAtelierOperationProjections.operationId),
    ).where(and(
      eq(studioAtelierOperations.operatorSubject, input.operatorSubject),
      eq(studioAtelierOperationProjections.state, "LOCKED"),
      eq(studioAtelierOperationProjections.lockedAssetId, request.assetId),
      eq(studioAtelierOperationProjections.lockedArtifactSha256, request.sha256),
    )).limit(1);
    const descriptor = match?.projection.lockedParentDescriptor;
    if (
      !match
      || !descriptor
      || typeof descriptor.lockedLayer !== "string"
      || typeof descriptor.privacyClass !== "string"
    ) {
      throw new Error(`The Atelier parent ${request.assetId} is not locked in the durable projection.`);
    }
    resolved.push({
      role: request.role,
      assetId: match.projection.lockedAssetId!,
      sha256: match.projection.lockedArtifactSha256!,
      garmentId: match.operation.garmentId,
      sourceStage: match.operation.stage as ParentLock["sourceStage"],
      sourceView: match.operation.view as ParentLock["sourceView"],
      reviewState: "LOCKED",
      lockedLayer: descriptor.lockedLayer as ParentLock["lockedLayer"],
      privacyClass: descriptor.privacyClass as ParentLock["privacyClass"],
    });
  }
  return resolved;
}

export async function finalizeAtelierExecution(input: {
  lease: AtelierExecutionLease;
  state: AtelierExecutionTerminalState;
  providerFailureManifest?: AtelierProviderFailureManifest | null;
  usage?: Record<string, unknown> | null;
  costUsd?: number | string | null;
  warnings?: unknown[];
  responses?: AtelierProviderResponse[];
  requestIds?: string[];
  durationMs?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}): Promise<AtelierExecutionRow> {
  const durationMs = input.durationMs ?? null;
  if (durationMs !== null && (!Number.isSafeInteger(durationMs) || durationMs < 0)) {
    throw new Error("Atelier execution duration must be a nonnegative integer.");
  }
  const costUsd = normalizeCostUsd(input.costUsd);
  if (input.state === "COMPLETE" && (!input.usage || costUsd === null || durationMs === null)) {
    throw new Error("A complete Atelier execution requires usage, cost and duration accounting.");
  }
  const errorCode = input.errorCode?.trim() || null;
  if (["QUARANTINED", "INDETERMINATE"].includes(input.state) && !errorCode) {
    throw new Error(`${input.state} Atelier executions require a reason code.`);
  }
  const providerFailureManifest = input.providerFailureManifest ?? null;
  if (providerFailureManifest) {
    assertAtelierProviderFailureManifest(providerFailureManifest);
    const expectedErrorCode = `PROVIDER_MODERATION_BLOCKED_${providerFailureManifest.moderation.stage.toUpperCase()}`;
    if (
      input.state !== "FAILED"
      || errorCode !== expectedErrorCode
      || input.errorMessage !== ATELIER_PROVIDER_MODERATION_ERROR_MESSAGE
      || (input.warnings?.length ?? 0) > 0
      || (input.responses?.length ?? 0) > 0
    ) {
      throw new Error("Provider moderation evidence requires the exact FAILED terminal contract.");
    }
  }

  const sanitized = sanitizeAtelierProviderResponses(input.responses ?? []);
  const requestIds = Array.from(new Set([
    ...sanitized.requestIds,
    ...(providerFailureManifest
      ? [providerFailureManifest.gatewayGenerationId, providerFailureManifest.requestId]
        .filter((value): value is string => Boolean(value))
      : []),
    ...(input.requestIds ?? []).flatMap((value) => safeRequestId(value) ?? []),
  ]));
  const warnings = (input.warnings ?? []).map(jsonRecord);
  const usage = input.usage ? JSON.stringify(jsonRecord(input.usage)) : null;
  const responses = JSON.stringify(sanitized.responses);
  const requestIdsJson = JSON.stringify(requestIds);
  const warningsJson = JSON.stringify(warnings);
  const providerFailureManifestJson = providerFailureManifest
    ? JSON.stringify(providerFailureManifest)
    : null;
  const database = await getStudioDb();

  let materializedProjection: AtelierOperationProjectionRow | null = null;
  let materializedArtifact: AtelierArtifactRow | null = null;
  let materializedEventId: string | null = null;
  let materializedEventHash: string | null = null;
  let materializedEventAt: Date | null = null;
  let materializedPayloadJson: string | null = null;
  if (input.state === "COMPLETE") {
    const [context] = await database.select({
      projection: studioAtelierOperationProjections,
      operationId: studioAtelierExecutions.operationId,
      outputContract: studioAtelierOperations.outputContract,
    }).from(studioAtelierExecutions).innerJoin(
      studioAtelierOperationProjections,
      eq(studioAtelierOperationProjections.operationId, studioAtelierExecutions.operationId),
    ).innerJoin(
      studioAtelierOperations,
      eq(studioAtelierOperations.id, studioAtelierExecutions.operationId),
    ).where(eq(studioAtelierExecutions.id, input.lease.executionId)).limit(1);
    if (!context || context.projection.state !== "DRAFT") {
      throw new Error("A COMPLETE execution requires a DRAFT lifecycle projection.");
    }
    const requiredArtifactKind = usesTransparentSubjectComposite(context.outputContract)
      ? "COMPOSITE"
      : "NORMALIZED";
    const candidates = await listAtelierArtifacts(input.lease.executionId);
    materializedArtifact = candidates.find((artifact) =>
      artifact.kind === requiredArtifactKind && artifact.state === "STORED"
    ) ?? null;
    if (!materializedArtifact) {
      throw new Error(`A COMPLETE execution requires a stored ${requiredArtifactKind} review artifact.`);
    }
    materializedProjection = context.projection;
    materializedEventId = randomUUID();
    materializedEventAt = new Date();
    const materializedPayload = {
      executionId: input.lease.executionId,
      artifactId: materializedArtifact.id,
      artifactKind: materializedArtifact.kind,
      artifactSha256: materializedArtifact.sha256,
      evidence: {},
    };
    materializedPayloadJson = JSON.stringify(materializedPayload);
    materializedEventHash = sha256(stableJson({
      operationId: context.operationId,
      sequence: context.projection.version + 1,
      eventType: "MATERIALIZED",
      actorSubject: "system:atelier-execution",
      payload: materializedPayload,
      previousEventHash: context.projection.lastEventHash,
      createdAt: materializedEventAt.toISOString(),
    }));
  }

  const result = await database.execute<{ id: string }>(sql`
    with eligible_execution as materialized (
      select execution.id, execution.operation_id
      from studio_atelier_executions execution
      where execution.id = ${input.lease.executionId}::uuid
        and execution.state in ('RUNNING', 'PERSISTING')
        and execution.execution_token = ${input.lease.executionToken}::uuid
        and execution.lease_fence = ${input.lease.leaseFence}
        and execution.lease_expires_at > now()
      for update
    ), quarantined_artifacts as (
      update studio_atelier_artifacts artifact
      set state = 'QUARANTINED', quarantine_reason = ${errorCode}
      where ${input.state} = 'QUARANTINED'
        and artifact.execution_id = (select id from eligible_execution)
        and artifact.kind = 'PROVIDER_RAW'
      returning artifact.id
    ), finalized_execution as (
      update studio_atelier_executions execution
      set state = ${input.state},
          provider_result_received_at = case
            when ${providerFailureManifestJson}::jsonb is null
              then execution.provider_result_received_at
            else now()
          end,
          provider_result_manifest = case
            when ${providerFailureManifestJson}::jsonb is null
              then execution.provider_result_manifest
            else ${providerFailureManifestJson}::jsonb
          end,
          usage = coalesce(${usage}::jsonb, execution.usage),
          cost_usd = coalesce(${costUsd}, execution.cost_usd),
          warnings = case when ${warningsJson}::jsonb = '[]'::jsonb
            then execution.warnings else ${warningsJson}::jsonb end,
          sanitized_responses = case when ${responses}::jsonb = '[]'::jsonb
            then execution.sanitized_responses else ${responses}::jsonb end,
          request_ids = case when ${requestIdsJson}::jsonb = '[]'::jsonb
            then execution.request_ids else ${requestIdsJson}::jsonb end,
          duration_ms = coalesce(${durationMs}, execution.duration_ms),
          error_code = ${errorCode},
          error_message = ${input.errorMessage ?? null},
          execution_token = null,
          lease_expires_at = null,
          completed_at = now(),
          updated_at = now()
      where execution.id = (select id from eligible_execution)
        and execution.state in ('RUNNING', 'PERSISTING')
        and execution.execution_token = ${input.lease.executionToken}::uuid
        and execution.lease_fence = ${input.lease.leaseFence}
        and execution.lease_expires_at > now()
        and (
          ${providerFailureManifestJson}::jsonb is null
          or (
            ${input.state} = 'FAILED'
            and execution.provider_invocation_started_at is not null
            and execution.provider_result_received_at is null
            and execution.provider_result_manifest is null
            and not exists (
              select 1 from studio_atelier_artifacts artifact
              where artifact.execution_id = execution.id
            )
          )
        )
        and (
          ${input.state} <> 'COMPLETE'
          or (
            execution.provider_invocation_started_at is not null
            and execution.provider_result_received_at is not null
            and execution.provider_result_manifest is not null
            and exists (
              select 1 from studio_atelier_artifacts artifact
              where artifact.execution_id = execution.id
                and artifact.kind = 'PROVIDER_RAW'
                and artifact.state = 'STORED'
            )
            and exists (
              select 1 from studio_atelier_artifacts artifact
              where artifact.id = ${materializedArtifact?.id ?? null}::uuid
                and artifact.execution_id = execution.id
                and artifact.kind in ('NORMALIZED', 'COMPOSITE')
                and artifact.state = 'STORED'
            )
          )
        )
        and (
          ${input.state} <> 'QUARANTINED'
          or exists (select 1 from quarantined_artifacts)
        )
      returning execution.id, execution.operation_id
    ), projected_operation as (
      select finalized.operation_id,
        case
          when ${input.state} = 'COMPLETE' or exists (
            select 1 from studio_atelier_executions existing
            where existing.operation_id = finalized.operation_id and existing.state = 'COMPLETE'
          ) then 'COMPLETE'
          when ${input.state} = 'QUARANTINED' or exists (
            select 1 from studio_atelier_executions existing
            where existing.operation_id = finalized.operation_id and existing.state = 'QUARANTINED'
          ) then 'QUARANTINED'
          when ${input.state} = 'INDETERMINATE' or exists (
            select 1 from studio_atelier_executions existing
            where existing.operation_id = finalized.operation_id and existing.state = 'INDETERMINATE'
          ) then 'INDETERMINATE'
          else 'FAILED'
        end as state
      from finalized_execution finalized
    ), finalized_operation as (
      update studio_atelier_operations operation
      set state = case
            when operation.state = 'COMPLETE' or projection.state = 'COMPLETE' then 'COMPLETE'
            when operation.state = 'QUARANTINED' or projection.state = 'QUARANTINED' then 'QUARANTINED'
            when operation.state = 'INDETERMINATE' or projection.state = 'INDETERMINATE' then 'INDETERMINATE'
            else 'FAILED'
          end,
          updated_at = now()
      from projected_operation projection
      where operation.id = projection.operation_id
      returning operation.id
    ), materialized_projection as (
      update studio_atelier_operation_projections projection
      set version = projection.version + 1,
          state = 'MATERIALIZED',
          materialized_execution_id = finalized.id,
          materialized_artifact_id = ${materializedArtifact?.id ?? null}::uuid,
          materialized_artifact_sha256 = ${materializedArtifact?.sha256 ?? null},
          last_event_hash = ${materializedEventHash},
          updated_at = ${materializedEventAt}
      from finalized_execution finalized
      where ${input.state} = 'COMPLETE'
        and projection.operation_id = finalized.operation_id
        and projection.version = ${materializedProjection?.version ?? -1}
        and projection.state = 'DRAFT'
      returning projection.operation_id, projection.version
    ), materialized_event as (
      insert into studio_atelier_events (
        id, operation_id, sequence, event_type, expected_version,
        resulting_version, execution_id, artifact_id, actor_subject, payload,
        previous_event_hash, event_hash, created_at
      )
      select ${materializedEventId}::uuid, operation_id, version, 'MATERIALIZED',
        ${materializedProjection?.version ?? -1}, version, ${input.lease.executionId}::uuid,
        ${materializedArtifact?.id ?? null}::uuid, 'system:atelier-execution',
        ${materializedPayloadJson}::jsonb, ${materializedProjection?.lastEventHash ?? null},
        ${materializedEventHash}, ${materializedEventAt}
      from materialized_projection
      returning id
    )
    select finalized_execution.id
    from finalized_execution, finalized_operation
    where ${input.state} <> 'COMPLETE' or exists (select 1 from materialized_event)
  `);
  if (result.rows.length !== 1) {
    throw new Error("The Atelier execution could not finalize because its fence or materialization CAS failed.");
  }
  const execution = await getAtelierExecution(input.lease.executionId);
  if (!execution) throw new Error("The finalized Atelier execution was not found.");
  return execution;
}

/**
 * Recovery never spends automatically after a dispatch checkpoint. It can
 * safely requeue a pre-dispatch claim or resume only from a complete raw set.
 */
export async function recoverExpiredAtelierExecutions(input: {
  operatorSubject: string;
  operationId?: string | null;
}): Promise<AtelierRecoverySummary> {
  const result = await (await getStudioDb()).execute<{
    recoveryClass: AtelierRecoveryClass;
  }>(sql`
    with candidates as materialized (
      select execution.id,
        case
          when execution.provider_invocation_started_at is null
            then 'SAFE_PRE_DISPATCH_REQUEUE'
          when execution.provider_result_received_at is null
            then 'UNCERTAIN_PROVIDER_INVOCATION'
              when jsonb_typeof(execution.provider_result_manifest->'images') = 'array'
                and jsonb_array_length(execution.provider_result_manifest->'images') > 0
                and not exists (
                  select 1
                  from jsonb_array_elements(execution.provider_result_manifest->'images') expected
                  where coalesce(jsonb_typeof(expected->'blob'), 'null') <> 'object'
                    or nullif(expected->'blob'->>'pathname', '') is null
                    or nullif(expected->'blob'->>'blobUrl', '') is null
                    or nullif(expected->'blob'->>'mimeType', '') is null
                    or expected->'blob'->>'sha256' is distinct from expected->>'sha256'
                    or expected->'blob'->>'byteSize' is distinct from expected->>'byteSize'
                ) then 'COMPLETE_RAW_RESUME'
          else 'INCOMPLETE_MATERIALIZATION'
        end as recovery_class
      from studio_atelier_executions execution
      join studio_atelier_operations operation on operation.id = execution.operation_id
      where operation.operator_subject = ${input.operatorSubject}
        and (${input.operationId ?? null}::uuid is null or operation.id = ${input.operationId ?? null}::uuid)
        and execution.state in ('RUNNING', 'PERSISTING')
        and execution.lease_expires_at <= now()
      for update of execution skip locked
    ), recovered as (
      update studio_atelier_executions execution
      set state = case
            when candidate.recovery_class in ('SAFE_PRE_DISPATCH_REQUEUE', 'COMPLETE_RAW_RESUME')
              then 'INTENT'
            else 'INDETERMINATE'
          end,
          execution_token = null,
          started_at = case
            when candidate.recovery_class in ('SAFE_PRE_DISPATCH_REQUEUE', 'COMPLETE_RAW_RESUME')
              then null else execution.started_at end,
          lease_expires_at = null,
          error_code = case candidate.recovery_class
            when 'SAFE_PRE_DISPATCH_REQUEUE' then 'SAFE_PRE_DISPATCH_REQUEUE'
            when 'COMPLETE_RAW_RESUME' then 'COMPLETE_RAW_RESUME'
            when 'UNCERTAIN_PROVIDER_INVOCATION' then 'LEASE_EXPIRED_AFTER_DISPATCH'
            else 'MATERIALIZATION_INCOMPLETE'
          end,
          error_message = case candidate.recovery_class
            when 'SAFE_PRE_DISPATCH_REQUEUE' then 'No provider dispatch checkpoint exists; the intent may be claimed again.'
            when 'COMPLETE_RAW_RESUME' then 'All provider raw outputs are durable; resume normalization without invoking the provider.'
            when 'UNCERTAIN_PROVIDER_INVOCATION' then 'Dispatch began without a durable provider result; reconciliation is required.'
            else 'A provider result exists but the complete raw artifact set is not durable; do not invoke again.'
          end,
          completed_at = case
            when candidate.recovery_class in ('SAFE_PRE_DISPATCH_REQUEUE', 'COMPLETE_RAW_RESUME')
              then null else now() end,
          updated_at = now()
      from candidates candidate
      where execution.id = candidate.id
          returning execution.operation_id, candidate.recovery_class
        ), marked_operations as (
          update studio_atelier_operations operation
          set state = 'INDETERMINATE', updated_at = now()
          where operation.id in (
            select recovered.operation_id
            from recovered
            where recovered.recovery_class in (
              'UNCERTAIN_PROVIDER_INVOCATION', 'INCOMPLETE_MATERIALIZATION'
            )
          )
          returning operation.id
        )
        select recovered.recovery_class as "recoveryClass"
        from recovered
        left join marked_operations on marked_operations.id = recovered.operation_id
      `);
  const classes = result.rows.map((row) => row.recoveryClass);
  return {
    total: classes.length,
    safePreDispatchRequeue: classes.filter((value) => value === "SAFE_PRE_DISPATCH_REQUEUE").length,
    uncertainProviderInvocation: classes.filter((value) => value === "UNCERTAIN_PROVIDER_INVOCATION").length,
    completeRawResume: classes.filter((value) => value === "COMPLETE_RAW_RESUME").length,
    incompleteMaterialization: classes.filter((value) => value === "INCOMPLETE_MATERIALIZATION").length,
  };
}

export async function latestAtelierExecution(operationId: string): Promise<AtelierExecutionRow | null> {
  const [execution] = await (await getStudioDb()).select().from(studioAtelierExecutions).where(
    eq(studioAtelierExecutions.operationId, operationId),
  ).orderBy(desc(studioAtelierExecutions.createdAt)).limit(1);
  return execution ?? null;
}

/** Latest execution scoped through the owning operator, for server command recovery. */
export async function getLatestAtelierExecutionForOperation(input: {
  operatorSubject: string;
  operationId: string;
}): Promise<AtelierExecutionRow | null> {
  const [row] = await (await getStudioDb()).select({
    execution: studioAtelierExecutions,
  }).from(studioAtelierExecutions).innerJoin(
    studioAtelierOperations,
    eq(studioAtelierOperations.id, studioAtelierExecutions.operationId),
  ).where(and(
    eq(studioAtelierExecutions.operationId, input.operationId),
    eq(studioAtelierOperations.operatorSubject, input.operatorSubject),
  )).orderBy(desc(studioAtelierExecutions.createdAt)).limit(1);
  return row?.execution ?? null;
}
