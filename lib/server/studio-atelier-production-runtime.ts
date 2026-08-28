import {
  STUDIO_GPT_IMAGE_2_ADAPTER,
  STUDIO_GPT_IMAGE_2_ADAPTER_VERSION,
  STUDIO_GPT_IMAGE_2_COST_CAP_USD,
  STUDIO_GPT_IMAGE_2_MODEL,
  STUDIO_GPT_IMAGE_2_POLICY_REVISION,
} from "../ai/studio-image-policy";
import {
  atelierOperationSchema,
  type AtelierStage,
} from "../studio/atelier/contracts";
import { resolveStudioAtelierRoomCanvasProfile } from "../studio/atelier/canvas-policy";
import {
  STUDIO_ATELIER_G004_CALIBRATION_ASSET_COUNT,
  STUDIO_ATELIER_G004_CALIBRATION_MANIFEST_SHA256,
  STUDIO_ATELIER_G004_CALIBRATION_REVISION,
  STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT,
} from "../studio/atelier/g004-calibration";
import { StudioEngineError } from "../studio/engine/errors";
import {
  createStudioAtelierAgentEngine,
} from "./studio-atelier-agent-engine";
import type { StudioAtelierBackgroundGate } from "./studio-atelier-background-gate";
import {
  createDurableStudioAtelierEngine,
  type CreateDurableStudioAtelierEngineInput,
  type StudioAtelierCorrectionPreparer,
  type StudioAtelierMaterializer,
} from "./studio-atelier-durable-engine";
import type { StudioAtelierEngineFacade } from "./studio-atelier-engine-facade";
import {
  createStudioAtelierExecutionService,
  type ResolveStudioAtelierExecutionContext,
} from "./studio-atelier-execution-service";
import type { StudioAtelierLockedRoomResolver } from "./studio-atelier-lock-service";
import {
  resolveStudioAtelierG004Calibration,
  verifyStudioAtelierG004Calibration,
} from "./studio-atelier-g004-calibration";
import { getAtelierOperation } from "./studio-atelier-repository";
import {
  createStudioAtelierReviewArtifactService,
} from "./studio-atelier-review-artifact";
import { LULU_V4_AUTHORITY_REVISION } from "./studio-lulu-v4-authority";
import {
  isStudioAtelierQualificationReadiness,
  resolveStudioAtelierQualifiedEvaluatorBundle,
  verifyStudioAtelierQualifiedEvaluatorBundle,
  type StudioAtelierQualificationReadiness,
} from "./studio-atelier-qualified-evaluator";

export {
  STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION,
  type StudioAtelierQualificationReadiness,
} from "./studio-atelier-qualified-evaluator";

export const STUDIO_ATELIER_LEDGER_SCHEMA_VERSION =
  "juw.studio-atelier-ledger.v1" as const;
export const STUDIO_ATELIER_LEDGER_MIGRATION_INDEX = 17 as const;
export const STUDIO_ATELIER_LEDGER_MIGRATION_TAG =
  "0017_studio_engine_work_ownership" as const;
export const STUDIO_ATELIER_LEDGER_MIGRATION_CREATED_AT = 1_787_864_076_590 as const;
export const STUDIO_ATELIER_LEDGER_MIGRATION_SHA256 =
  "df62643551e8957498fc082431d003bce275dac9c0dd4402c67336002fd333ba" as const;
export const STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_INDEX = 18 as const;
export const STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_TAG =
  "0018_studio_transactional_authority" as const;
export const STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_CREATED_AT =
  1_787_893_200_000 as const;
export const STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_SHA256 =
  "ba280c8782f6e700c654a968081b8f33a6cd90cca3a192771f8a896f1d2e5c7f" as const;
export const STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_INDEX = 19 as const;
export const STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_TAG =
  "0019_studio_atelier_external_authority" as const;
export const STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_CREATED_AT =
  1_787_893_200_001 as const;
export const STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_SHA256 =
  "066326e3799bede35c4f0f691691ec05a4c0563507ed3aa5d42475eeec44fc0e" as const;
export const STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256 =
  "d245096f4582e6638bbc9ab1c9abe41df9aa447736372824cdc6803d651824bb" as const;
export const STUDIO_ATELIER_PRIVATE_AUTHORITY_ASSET_COUNT = 11 as const;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const FINAL_SCENE_STAGES = new Set<AtelierStage>([
  "ROOM_FINAL_05",
  "SIBLING_06",
  "SIBLING_07_CORE",
  "SIBLING_07_RECOVERY",
]);
const REQUIRED_LEDGER_TABLES = Object.freeze([
  "studio_atelier_adult_verification_receipts",
  "studio_atelier_artifacts",
  "studio_atelier_consent_events",
  "studio_atelier_consent_grants",
  "studio_atelier_consent_projections",
  "studio_atelier_events",
  "studio_atelier_executions",
  "studio_atelier_operation_projections",
  "studio_atelier_operations",
  "studio_atelier_styling_advisories",
  "studio_engine_work_ownership",
] as const);

export type StudioAtelierProductionScope = "ROOT_SUBJECT" | "FINAL_SCENE";

export type StudioAtelierProductionPorts = Readonly<{
  resolveFileVerification: CreateDurableStudioAtelierEngineInput["resolveFileVerification"];
  resolveTrustedTruth: CreateDurableStudioAtelierEngineInput["resolveTrustedTruth"];
  resolveExecutionContext: ResolveStudioAtelierExecutionContext;
  prepareCorrection: StudioAtelierCorrectionPreparer;
  resolveLockedRoom: StudioAtelierLockedRoomResolver;
}>;

export type StudioAtelierDatabaseReadiness = Readonly<{
  status: "VERIFIED";
  ledgerSchemaVersion: typeof STUDIO_ATELIER_LEDGER_SCHEMA_VERSION;
  migrationIndex: typeof STUDIO_ATELIER_LEDGER_MIGRATION_INDEX;
  migrationTag: typeof STUDIO_ATELIER_LEDGER_MIGRATION_TAG;
  migrationCreatedAt: typeof STUDIO_ATELIER_LEDGER_MIGRATION_CREATED_AT;
  migrationSha256: typeof STUDIO_ATELIER_LEDGER_MIGRATION_SHA256;
  transactionalAuthorityMigrationIndex: typeof STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_INDEX;
  transactionalAuthorityMigrationTag: typeof STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_TAG;
  transactionalAuthorityMigrationCreatedAt: typeof STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_CREATED_AT;
  transactionalAuthorityMigrationSha256: typeof STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_SHA256;
  externalAuthorityMigrationIndex: typeof STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_INDEX;
  externalAuthorityMigrationTag: typeof STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_TAG;
  externalAuthorityMigrationCreatedAt: typeof STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_CREATED_AT;
  externalAuthorityMigrationSha256: typeof STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_SHA256;
  tables: readonly string[];
  verifiedAt: string;
}>;

export type StudioAtelierPrivateStoreReadiness = Readonly<{
  status: "VERIFIED_PRIVATE_READ_WRITE";
  contentAddressed: true;
  immutableCreate: true;
  readbackVerified: true;
  verifiedAt: string;
}>;

export type StudioAtelierAiPolicyReadiness = Readonly<{
  status: "VERIFIED";
  gatewayCredentialAvailable: true;
  adapterId: typeof STUDIO_GPT_IMAGE_2_ADAPTER;
  adapterVersion: typeof STUDIO_GPT_IMAGE_2_ADAPTER_VERSION;
  policyRevision: typeof STUDIO_GPT_IMAGE_2_POLICY_REVISION;
  provider: "openai";
  model: typeof STUDIO_GPT_IMAGE_2_MODEL;
  onlyProviders: readonly ["openai"];
  fallbackModels: readonly [];
  maxRetries: 0;
  costCapUsd: typeof STUDIO_GPT_IMAGE_2_COST_CAP_USD;
  verifiedAt: string;
}>;

export type StudioAtelierPrivateAuthorityReadiness = Readonly<{
  status: "VERIFIED_PRIVATE_READBACK";
  authorityRevision: typeof LULU_V4_AUTHORITY_REVISION;
  manifestSha256: typeof STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256;
  assetCount: typeof STUDIO_ATELIER_PRIVATE_AUTHORITY_ASSET_COUNT;
  verifiedAt: string;
}>;

export type StudioAtelierG004CalibrationReadiness = Readonly<{
  status: "VERIFIED_PUBLIC_DERIVATIVE_READBACK";
  calibrationRevision: typeof STUDIO_ATELIER_G004_CALIBRATION_REVISION;
  manifestSha256: string;
  readbackReceiptSha256: string;
  assetCount: typeof STUDIO_ATELIER_G004_CALIBRATION_ASSET_COUNT;
  canonicalOriginalsStatus: "UNAVAILABLE";
  derivativeDecision: "VERSION_LOCK_PUBLIC_SHOP_DERIVATIVES";
  verifiedAt: string;
}>;

export type StudioAtelierApprovedRoomReadiness =
  | Readonly<{
    status: "VERIFIED_PRIVATE_READBACK";
    assetId: string;
    sha256: string;
    mimeType: "image/png";
    width: 1024;
    height: 1280 | 1536;
    authorityRevision: string;
    manifestSha256: string;
    verifiedAt: string;
  }>
  | Readonly<{
    status: "BLOCKED";
    reason: "MISSING_APPROVED_ROOM" | "APPROVED_ROOM_CANVAS_MISMATCH";
  }>;

export type StudioAtelierProductionReadinessEvidence = Readonly<{
  database: StudioAtelierDatabaseReadiness;
  privateStore: StudioAtelierPrivateStoreReadiness;
  aiPolicy: StudioAtelierAiPolicyReadiness;
  privateAuthority: StudioAtelierPrivateAuthorityReadiness;
  g004Calibration: StudioAtelierG004CalibrationReadiness;
  qualification: StudioAtelierQualificationReadiness;
  approvedRoom: StudioAtelierApprovedRoomReadiness;
}>;

export type StudioAtelierProductionReadinessDeclarations = Omit<
  StudioAtelierProductionReadinessEvidence,
  "g004Calibration" | "qualification"
>;

export type StudioAtelierProductionBlockerCode =
  | "MISSING_TYPED_PORT"
  | "DATABASE_NOT_VERIFIED"
  | "PRIVATE_STORE_NOT_VERIFIED"
  | "AI_POLICY_NOT_VERIFIED"
  | "PRIVATE_AUTHORITY_NOT_VERIFIED"
  | "G004_CALIBRATION_NOT_VERIFIED"
  | "QUALIFICATION_NOT_PASSED"
  | "ROOM_READINESS_UNDECLARED"
  | "FINAL_SCENE_ROOM_NOT_READY"
  | "APPROVED_ROOM_INVALID";

export type StudioAtelierProductionBlocker = Readonly<{
  code: StudioAtelierProductionBlockerCode;
  scope: StudioAtelierProductionScope | "ALL";
  dependency: string;
  message: string;
}>;

export type StudioAtelierProductionReadinessReport = Readonly<{
  rootSubject: "READY" | "BLOCKED";
  finalScene: "READY" | "BLOCKED";
  constructionAllowed: boolean;
  blockers: readonly StudioAtelierProductionBlocker[];
}>;

type ProductionReadinessCandidate = Readonly<{
  ports?: Partial<StudioAtelierProductionPorts> | null;
  readiness?: Partial<StudioAtelierProductionReadinessEvidence> | null;
}>;

export type CreateStudioAtelierProductionRuntimeInput = Readonly<{
  ports: StudioAtelierProductionPorts;
  readiness: StudioAtelierProductionReadinessDeclarations;
}>;

export type StudioAtelierProductionRuntime = Readonly<{
  readiness: StudioAtelierProductionReadinessReport;
  facade: StudioAtelierEngineFacade;
  agent: StudioAtelierBackgroundGate;
  readReviewArtifact: ReturnType<typeof createStudioAtelierReviewArtifactService>;
}>;

function validTimestamp(value: unknown): boolean {
  return typeof value === "string"
    && value.length > 0
    && !Number.isNaN(Date.parse(value));
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && new Set(left).size === left.length
    && left.every((value) => right.includes(value));
}

function databaseReady(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const evidence = value as Partial<StudioAtelierDatabaseReadiness>;
  return evidence.status === "VERIFIED"
    && evidence.ledgerSchemaVersion === STUDIO_ATELIER_LEDGER_SCHEMA_VERSION
    && evidence.migrationIndex === STUDIO_ATELIER_LEDGER_MIGRATION_INDEX
    && evidence.migrationTag === STUDIO_ATELIER_LEDGER_MIGRATION_TAG
    && evidence.migrationCreatedAt === STUDIO_ATELIER_LEDGER_MIGRATION_CREATED_AT
    && evidence.migrationSha256 === STUDIO_ATELIER_LEDGER_MIGRATION_SHA256
    && evidence.transactionalAuthorityMigrationIndex
      === STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_INDEX
    && evidence.transactionalAuthorityMigrationTag
      === STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_TAG
    && evidence.transactionalAuthorityMigrationCreatedAt
      === STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_CREATED_AT
    && evidence.transactionalAuthorityMigrationSha256
      === STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_SHA256
    && evidence.externalAuthorityMigrationIndex
      === STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_INDEX
    && evidence.externalAuthorityMigrationTag
      === STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_TAG
    && evidence.externalAuthorityMigrationCreatedAt
      === STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_CREATED_AT
    && evidence.externalAuthorityMigrationSha256
      === STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_SHA256
    && Array.isArray(evidence.tables)
    && sameSet(evidence.tables, REQUIRED_LEDGER_TABLES)
    && validTimestamp(evidence.verifiedAt);
}

function privateStoreReady(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const evidence = value as Partial<StudioAtelierPrivateStoreReadiness>;
  return evidence.status === "VERIFIED_PRIVATE_READ_WRITE"
    && evidence.contentAddressed === true
    && evidence.immutableCreate === true
    && evidence.readbackVerified === true
    && validTimestamp(evidence.verifiedAt);
}

function aiPolicyReady(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const evidence = value as Partial<StudioAtelierAiPolicyReadiness>;
  return evidence.status === "VERIFIED"
    && evidence.gatewayCredentialAvailable === true
    && evidence.adapterId === STUDIO_GPT_IMAGE_2_ADAPTER
    && evidence.adapterVersion === STUDIO_GPT_IMAGE_2_ADAPTER_VERSION
    && evidence.policyRevision === STUDIO_GPT_IMAGE_2_POLICY_REVISION
    && evidence.provider === "openai"
    && evidence.model === STUDIO_GPT_IMAGE_2_MODEL
    && Array.isArray(evidence.onlyProviders)
    && evidence.onlyProviders.length === 1
    && evidence.onlyProviders[0] === "openai"
    && Array.isArray(evidence.fallbackModels)
    && evidence.fallbackModels.length === 0
    && evidence.maxRetries === 0
    && evidence.costCapUsd === STUDIO_GPT_IMAGE_2_COST_CAP_USD
    && validTimestamp(evidence.verifiedAt);
}

function privateAuthorityReady(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const evidence = value as Partial<StudioAtelierPrivateAuthorityReadiness>;
  return evidence.status === "VERIFIED_PRIVATE_READBACK"
    && evidence.authorityRevision === LULU_V4_AUTHORITY_REVISION
    && evidence.manifestSha256 === STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256
    && evidence.assetCount === STUDIO_ATELIER_PRIVATE_AUTHORITY_ASSET_COUNT
    && validTimestamp(evidence.verifiedAt);
}

function g004CalibrationReady(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const evidence = value as Partial<StudioAtelierG004CalibrationReadiness>;
  return evidence.status === "VERIFIED_PUBLIC_DERIVATIVE_READBACK"
    && evidence.calibrationRevision === STUDIO_ATELIER_G004_CALIBRATION_REVISION
    && evidence.manifestSha256 === STUDIO_ATELIER_G004_CALIBRATION_MANIFEST_SHA256
    && evidence.readbackReceiptSha256
      === STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT.receiptSha256
    && evidence.assetCount === STUDIO_ATELIER_G004_CALIBRATION_ASSET_COUNT
    && evidence.canonicalOriginalsStatus === "UNAVAILABLE"
    && evidence.derivativeDecision === "VERSION_LOCK_PUBLIC_SHOP_DERIVATIVES"
    && validTimestamp(evidence.verifiedAt);
}

function qualificationReady(value: unknown): boolean {
  return isStudioAtelierQualificationReadiness(value);
}

function roomReady(
  value: unknown,
  privateAuthority: unknown,
  qualification: unknown,
): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const evidence = value as Partial<Extract<
    StudioAtelierApprovedRoomReadiness,
    { status: "VERIFIED_PRIVATE_READBACK" }
  >>;
  const authority = privateAuthority && typeof privateAuthority === "object"
    && !Array.isArray(privateAuthority)
    ? privateAuthority as Partial<StudioAtelierPrivateAuthorityReadiness>
    : {};
  const profile = typeof evidence.width === "number"
    && typeof evidence.height === "number"
    ? resolveStudioAtelierRoomCanvasProfile({
        width: evidence.width,
        height: evidence.height,
      })
    : null;
  const qualifiedProfile = isStudioAtelierQualificationReadiness(qualification)
    ? qualification.transparentCompositeQualification.roomProfileCases.find(
        (candidate) => candidate.profileId === profile?.profileId,
      )
    : null;
  return evidence.status === "VERIFIED_PRIVATE_READBACK"
    && typeof evidence.assetId === "string"
    && evidence.assetId.length > 0
    && evidence.assetId.length <= 200
    && typeof evidence.sha256 === "string"
    && SHA256_PATTERN.test(evidence.sha256)
    && evidence.mimeType === "image/png"
    && profile !== null
    && qualifiedProfile !== undefined
    && qualifiedProfile !== null
    && typeof evidence.authorityRevision === "string"
    && evidence.authorityRevision === authority.authorityRevision
    && typeof evidence.manifestSha256 === "string"
    && SHA256_PATTERN.test(evidence.manifestSha256)
    && evidence.manifestSha256 === authority.manifestSha256
    && validTimestamp(evidence.verifiedAt);
}

function addBlocker(
  blockers: StudioAtelierProductionBlocker[],
  blocker: StudioAtelierProductionBlocker,
): void {
  blockers.push(Object.freeze(blocker));
}

/**
 * Pure, sanitized diagnostic inspection. It checks only evidence shape and
 * port presence; it is not a construction or dispatch authority. The
 * production factory independently derives G004 readiness from exact bytes.
 * This function never calls a dependency, opens a database, reads private Blob,
 * or includes credentials, locators, hashes or evaluator payloads in output.
 */
export function inspectStudioAtelierProductionReadiness(
  input: ProductionReadinessCandidate,
): StudioAtelierProductionReadinessReport {
  const blockers: StudioAtelierProductionBlocker[] = [];
  const ports = input?.ports ?? {};
  const readiness = input?.readiness ?? {};
  const requiredPorts = [
    "resolveFileVerification",
    "resolveTrustedTruth",
    "resolveExecutionContext",
    "prepareCorrection",
    "resolveLockedRoom",
  ] as const satisfies readonly (keyof StudioAtelierProductionPorts)[];
  for (const name of requiredPorts) {
    if (typeof ports[name] !== "function") {
      addBlocker(blockers, {
        code: "MISSING_TYPED_PORT",
        scope: "ALL",
        dependency: name,
        message: `The server-owned ${name} dependency is unavailable.`,
      });
    }
  }
  if (!databaseReady(readiness.database)) {
    addBlocker(blockers, {
      code: "DATABASE_NOT_VERIFIED",
      scope: "ALL",
      dependency: "database",
      message: "The durable Atelier ledger migration has not been verified.",
    });
  }
  if (!privateStoreReady(readiness.privateStore)) {
    addBlocker(blockers, {
      code: "PRIVATE_STORE_NOT_VERIFIED",
      scope: "ALL",
      dependency: "privateStore",
      message: "Immutable private artifact write/readback has not been verified.",
    });
  }
  if (!aiPolicyReady(readiness.aiPolicy)) {
    addBlocker(blockers, {
      code: "AI_POLICY_NOT_VERIFIED",
      scope: "ALL",
      dependency: "aiPolicy",
      message: "The exact OpenAI-only GPT Image 2 policy is not verified.",
    });
  }
  if (!privateAuthorityReady(readiness.privateAuthority)) {
    addBlocker(blockers, {
      code: "PRIVATE_AUTHORITY_NOT_VERIFIED",
      scope: "ALL",
      dependency: "privateAuthority",
      message: "The exact Lulu V4 private authority readback is not verified.",
    });
  }
  if (!g004CalibrationReady(readiness.g004Calibration)) {
    addBlocker(blockers, {
      code: "G004_CALIBRATION_NOT_VERIFIED",
      scope: "ALL",
      dependency: "g004Calibration",
      message: "The exact version-locked G004 derivative pixels have not passed readback.",
    });
  }
  if (!qualificationReady(readiness.qualification)) {
    addBlocker(blockers, {
      code: "QUALIFICATION_NOT_PASSED",
      scope: "ALL",
      dependency: "qualification",
      message: "The closed multi-era adapter and evaluator qualification has not passed.",
    });
  }

  const approvedRoom = readiness.approvedRoom;
  if (!approvedRoom || typeof approvedRoom !== "object") {
    addBlocker(blockers, {
      code: "ROOM_READINESS_UNDECLARED",
      scope: "ALL",
      dependency: "approvedRoom",
      message: "The final-scene room readiness state has not been declared.",
    });
  } else if (approvedRoom.status === "BLOCKED") {
    addBlocker(blockers, {
      code: "FINAL_SCENE_ROOM_NOT_READY",
      scope: "FINAL_SCENE",
      dependency: "approvedRoom",
      message: "Final-scene generation remains blocked by approved-room authority.",
    });
  } else if (!roomReady(
    approvedRoom,
    readiness.privateAuthority,
    readiness.qualification,
  )) {
    addBlocker(blockers, {
      code: "APPROVED_ROOM_INVALID",
      scope: "FINAL_SCENE",
      dependency: "approvedRoom",
      message: "The approved room is not an exact private-readback authority on a qualified native canvas profile.",
    });
  }

  const rootSubject = blockers.some((blocker) => blocker.scope === "ALL")
    ? "BLOCKED" as const
    : "READY" as const;
  const finalScene = rootSubject === "READY"
    && !blockers.some((blocker) => blocker.scope === "FINAL_SCENE")
    ? "READY" as const
    : "BLOCKED" as const;
  return Object.freeze({
    rootSubject,
    finalScene,
    constructionAllowed: rootSubject === "READY",
    blockers: Object.freeze(blockers),
  });
}

export function studioAtelierProductionScopeForStage(
  stage: AtelierStage,
): StudioAtelierProductionScope {
  return FINAL_SCENE_STAGES.has(stage) ? "FINAL_SCENE" : "ROOT_SUBJECT";
}

export function isStudioAtelierStageDispatchReady(
  report: StudioAtelierProductionReadinessReport,
  stage: AtelierStage,
): boolean {
  return studioAtelierProductionScopeForStage(stage) === "FINAL_SCENE"
    ? report.finalScene === "READY"
    : report.rootSubject === "READY";
}

function unavailableRuntime(report: StudioAtelierProductionReadinessReport): StudioEngineError {
  const codes = [...new Set(report.blockers
    .filter((blocker) => blocker.scope === "ALL")
    .map((blocker) => blocker.code))];
  return new StudioEngineError(
    "ENGINE_DISABLED",
    503,
    "The durable Atelier production runtime is not ready.",
    `Resolve the server readiness gates: ${codes.join(", ") || "UNKNOWN"}.`,
  );
}

function unavailableStage(stage: AtelierStage): StudioEngineError {
  return new StudioEngineError(
    "ENGINE_DISABLED",
    503,
    "That Atelier stage is not ready for paid dispatch.",
    studioAtelierProductionScopeForStage(stage) === "FINAL_SCENE"
      ? "Approve and privately verify an exact 1024x1536 or 1024x1280 native-room profile, then rerun readiness."
      : "Restore the durable database, private authority, policy and qualification evidence.",
  );
}

/**
 * Server-only production composition. Before construction it derives G004
 * readiness from the internally owned exact byte/pixel resolver; callers
 * cannot submit that readiness claim or replace the production resolver.
 * Construction is denied until every executable port and every root/subject
 * readiness gate is closed. A declared
 * room blocker may coexist with a root/subject-ready runtime; final-scene
 * dispatch is then stopped before the execution service can create an intent,
 * claim a fence or invoke the provider.
 */
export function createStudioAtelierProductionRuntime(
  input: CreateStudioAtelierProductionRuntimeInput,
): Promise<StudioAtelierProductionRuntime> {
  return createVerifiedStudioAtelierProductionRuntime(input);
}

async function createVerifiedStudioAtelierProductionRuntime(
  input: CreateStudioAtelierProductionRuntimeInput,
): Promise<StudioAtelierProductionRuntime> {
  const qualifiedEvaluators = verifyStudioAtelierQualifiedEvaluatorBundle(
    resolveStudioAtelierQualifiedEvaluatorBundle(),
  );
  let g004Calibration: StudioAtelierG004CalibrationReadiness | undefined;
  try {
    const verified = await verifyStudioAtelierG004Calibration(
      await resolveStudioAtelierG004Calibration(),
    );
    g004Calibration = Object.freeze({
      status: "VERIFIED_PUBLIC_DERIVATIVE_READBACK",
      calibrationRevision: verified.receipt.calibrationRevision,
      manifestSha256: verified.receipt.manifestSha256,
      readbackReceiptSha256: verified.receipt.receiptSha256,
      assetCount: STUDIO_ATELIER_G004_CALIBRATION_ASSET_COUNT,
      canonicalOriginalsStatus: verified.receipt.canonicalOriginalsStatus,
      derivativeDecision: verified.receipt.derivativeDecision,
      verifiedAt: new Date().toISOString(),
    });
  } catch {
    g004Calibration = undefined;
  }
  const readiness = inspectStudioAtelierProductionReadiness({
    ports: input.ports,
    readiness: {
      ...input.readiness,
      g004Calibration,
      qualification: qualifiedEvaluators?.qualification,
    },
  });
  if (!readiness.constructionAllowed) throw unavailableRuntime(readiness);
  if (!qualifiedEvaluators) throw unavailableRuntime(readiness);

  const execute = createStudioAtelierExecutionService({
    resolveExecutionContext: input.ports.resolveExecutionContext,
  });
  const materializeOnce: StudioAtelierMaterializer = async (command) => {
    const operationRow = await getAtelierOperation(command);
    const operation = atelierOperationSchema.safeParse(operationRow?.canonicalOperation);
    if (
      !operationRow
      || !operation.success
      || operationRow.stage !== operation.data.stage
    ) {
      throw new StudioEngineError(
        "ENGINE_UNAVAILABLE",
        503,
        "The prepared Atelier operation is unavailable for dispatch.",
        "Prepare it again from the current trusted declaration and truth bundle.",
      );
    }
    if (!isStudioAtelierStageDispatchReady(readiness, operation.data.stage)) {
      throw unavailableStage(operation.data.stage);
    }
    return execute(command);
  };

  const facade = createDurableStudioAtelierEngine({
    resolveFileVerification: input.ports.resolveFileVerification,
    resolveTrustedTruth: input.ports.resolveTrustedTruth,
    materializeOnce,
    evaluateTechnicalQuality: qualifiedEvaluators.evaluateTechnicalQuality,
    evaluateSemanticQuality: qualifiedEvaluators.evaluateSemanticQuality,
    technicalEvaluator: qualifiedEvaluators.technicalEvaluator,
    semanticEvaluator: qualifiedEvaluators.semanticEvaluator,
    resolveG004Calibration: resolveStudioAtelierG004Calibration,
    prepareCorrection: input.ports.prepareCorrection,
    resolveLockedRoom: input.ports.resolveLockedRoom,
  });
  return Object.freeze({
    readiness,
    facade,
    agent: createStudioAtelierAgentEngine(facade),
    readReviewArtifact: createStudioAtelierReviewArtifactService(),
  });
}
