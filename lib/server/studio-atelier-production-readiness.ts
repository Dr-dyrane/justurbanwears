import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import manifestJson from "./private-asset-manifests/lulu-v4.json";
import {
  STUDIO_GPT_IMAGE_2_ADAPTER,
  STUDIO_GPT_IMAGE_2_ADAPTER_VERSION,
  STUDIO_GPT_IMAGE_2_COST_CAP_USD,
  STUDIO_GPT_IMAGE_2_MODEL,
  STUDIO_GPT_IMAGE_2_POLICY_REVISION,
  studioGptImage2ProviderOptions,
} from "../ai/studio-image-policy";
import { getStudioDb } from "../../db/shop-postgres";
import {
  resolveStudioAtelierRoomCanvasProfile,
  STUDIO_ATELIER_ROOM_CANVAS_POLICY_REVISION,
  type StudioAtelierRoomCanvasProfile,
} from "../studio/atelier/canvas-policy";
import { canonicalStringify } from "../studio/atelier/canonical";
import {
  STUDIO_ATELIER_G004_CALIBRATION_ASSET_COUNT,
  STUDIO_ATELIER_G004_CALIBRATION_MANIFEST_SHA256,
  STUDIO_ATELIER_G004_CALIBRATION_REVISION,
  STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT,
  type StudioAtelierG004ReadbackReceipt,
} from "../studio/atelier/g004-calibration";
import {
  putVerifiedPrivateContentAddressedBlob,
  type VerifiedPrivateBlob,
} from "./private-content-addressed-blob";
import {
  STUDIO_ATELIER_PRIVATE_AUTHORITY_ASSET_COUNT,
  STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256,
} from "./studio-atelier-authority-constants";
import {
  resolveStudioAtelierG004Calibration,
  verifyStudioAtelierG004Calibration,
} from "./studio-atelier-g004-calibration";
import {
  LULU_V4_AUTHORITY_ACCEPTANCE,
  LULU_V4_AUTHORITY_LOCKED_STATUS,
  LULU_V4_AUTHORITY_REVISION,
  resolveLuluV4AuthorityAssets,
  validateLuluV4AuthorityManifest,
  type LuluV4AuthorityAsset,
  type LuluV4AuthorityManifest,
} from "./studio-lulu-v4-authority";

export const STUDIO_ATELIER_READINESS_SCHEMA_VERSION =
  "juw.studio-atelier-production-readiness.v1" as const;
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
export {
  STUDIO_ATELIER_PRIVATE_AUTHORITY_ASSET_COUNT,
  STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256,
};

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
const PRIVATE_STORE_PROBE_NAMESPACE = "studio/atelier/readiness-v1";
const PRIVATE_STORE_PROBE_MIME_TYPE = "application/octet-stream";
const PRIVATE_STORE_PROBE_BYTES = new TextEncoder().encode(
  "juw.studio-atelier-private-store-readiness.v1\n",
);
const PRIVATE_STORE_PROBE_SHA256 = sha256(PRIVATE_STORE_PROBE_BYTES);
const PRIVATE_STORE_PROBE_PATHNAME =
  `${PRIVATE_STORE_PROBE_NAMESPACE}/${PRIVATE_STORE_PROBE_SHA256.slice(0, 2)}/${PRIVATE_STORE_PROBE_SHA256}.bin`;
const APPROVED_ROOM_ASSET_ID = "juw.atelier.empty-plate.v1";

const rawAuthorityManifest: unknown = manifestJson;
validateLuluV4AuthorityManifest(rawAuthorityManifest);
const authorityManifest: LuluV4AuthorityManifest = rawAuthorityManifest;
const authorityManifestSha256 = sha256(
  new TextEncoder().encode(JSON.stringify(authorityManifest)),
);
const expectedAuthorityAssets = Object.freeze(
  authorityManifest.assets.map((asset) => Object.freeze({ ...asset })),
);
const expectedAuthorityAssetIds = Object.freeze(
  expectedAuthorityAssets.map((asset) => asset.id),
);

export type StudioAtelierReadinessBlockerCode =
  | "DATABASE_UNAVAILABLE"
  | "DATABASE_TABLES_MISMATCH"
  | "DATABASE_MIGRATION_MISMATCH"
  | "PRIVATE_STORE_UNAVAILABLE"
  | "PRIVATE_STORE_READBACK_MISMATCH"
  | "AI_ADAPTER_POLICY_MISMATCH"
  | "AI_ENVIRONMENT_MISMATCH"
  | "AI_CREDENTIAL_UNAVAILABLE"
  | "PRIVATE_AUTHORITY_UNAVAILABLE"
  | "PRIVATE_AUTHORITY_MISMATCH"
  | "G004_CALIBRATION_UNAVAILABLE"
  | "G004_CALIBRATION_MISMATCH"
  | "APPROVED_ROOM_MISMATCH"
  | "QUALIFICATION_NOT_PASSED";

export type StudioAtelierReadinessBlocker = Readonly<{
  code: StudioAtelierReadinessBlockerCode;
  scope: "ALL" | "FINAL_SCENE";
  dependency: string;
  message: string;
}>;

export type StudioAtelierDatabaseReadinessEvidence = Readonly<{
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

export type StudioAtelierPrivateStoreReadinessEvidence = Readonly<{
  status: "VERIFIED_PRIVATE_READ_WRITE";
  contentAddressed: true;
  immutableCreate: true;
  readbackVerified: true;
  verifiedAt: string;
}>;

export type StudioAtelierAiPolicyReadinessEvidence = Readonly<{
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

export type StudioAtelierPrivateAuthorityReadinessEvidence = Readonly<{
  status: "VERIFIED_PRIVATE_READBACK";
  authorityRevision: typeof LULU_V4_AUTHORITY_REVISION;
  manifestSha256: typeof STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256;
  assetCount: typeof STUDIO_ATELIER_PRIVATE_AUTHORITY_ASSET_COUNT;
  verifiedAt: string;
}>;

export type StudioAtelierG004ReadinessEvidence = Readonly<{
  status: "VERIFIED_PUBLIC_DERIVATIVE_READBACK";
  calibrationRevision: typeof STUDIO_ATELIER_G004_CALIBRATION_REVISION;
  manifestSha256: typeof STUDIO_ATELIER_G004_CALIBRATION_MANIFEST_SHA256;
  readbackReceiptSha256: typeof STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT.receiptSha256;
  assetCount: typeof STUDIO_ATELIER_G004_CALIBRATION_ASSET_COUNT;
  canonicalOriginalsStatus: "UNAVAILABLE";
  derivativeDecision: "VERSION_LOCK_PUBLIC_SHOP_DERIVATIVES";
  verifiedAt: string;
}>;

export type StudioAtelierApprovedRoomReadinessEvidence = Readonly<{
  status: "VERIFIED_PRIVATE_READBACK";
  assetId: typeof APPROVED_ROOM_ASSET_ID;
  sha256: string;
  mimeType: "image/png";
  width: 1024;
  height: 1280 | 1536;
  authorityRevision: typeof LULU_V4_AUTHORITY_REVISION;
  manifestSha256: typeof STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256;
  profileId: StudioAtelierRoomCanvasProfile["profileId"];
  canvasPolicyRevision: typeof STUDIO_ATELIER_ROOM_CANVAS_POLICY_REVISION;
  verifiedAt: string;
}>;

export type StudioAtelierPrequalificationEvidence = Readonly<{
  database?: StudioAtelierDatabaseReadinessEvidence;
  privateStore?: StudioAtelierPrivateStoreReadinessEvidence;
  aiPolicy?: StudioAtelierAiPolicyReadinessEvidence;
  privateAuthority?: StudioAtelierPrivateAuthorityReadinessEvidence;
  g004Calibration?: StudioAtelierG004ReadinessEvidence;
  approvedRoom?: StudioAtelierApprovedRoomReadinessEvidence;
}>;

export type StudioAtelierProductionReadinessProbeReport = Readonly<{
  schemaVersion: typeof STUDIO_ATELIER_READINESS_SCHEMA_VERSION;
  prequalificationStatus: "VERIFIED" | "BLOCKED";
  qualificationStatus: "NOT_VERIFIED";
  productionStatus: "BLOCKED";
  readyForQualification: boolean;
  constructionAllowed: false;
  evidence: StudioAtelierPrequalificationEvidence;
  blockers: readonly StudioAtelierReadinessBlocker[];
}>;

export type StudioAtelierDatabaseObservation = Readonly<{
  tables: readonly unknown[];
  appliedMigrations: readonly Readonly<{
    hash: unknown;
    createdAt: unknown;
  }>[];
}>;

export type StudioAtelierPrivateStoreProbeInput = Readonly<{
  bytes: Uint8Array;
  mimeType: typeof PRIVATE_STORE_PROBE_MIME_TYPE;
  namespace: typeof PRIVATE_STORE_PROBE_NAMESPACE;
}>;

export type StudioAtelierAiAdapterPolicyObservation = Readonly<{
  adapterId: unknown;
  adapterVersion: unknown;
  policyRevision: unknown;
  provider: unknown;
  model: unknown;
  onlyProviders: readonly unknown[];
  fallbackModels: readonly unknown[];
  maxRetries: unknown;
  costCapUsd: unknown;
}>;

export type StudioAtelierAiEnvironmentObservation = Readonly<{
  imageModel: string | undefined;
  imageCostCapUsd: string | undefined;
  gatewayApiKey: string | undefined;
  vercelOidcToken: string | undefined;
}>;

export type StudioAtelierAuthorityReadbackObservation = Readonly<{
  authorityRevision: unknown;
  manifestSha256: unknown;
  assets: readonly StudioAtelierAuthorityAssetObservation[];
}>;

export type StudioAtelierAuthorityAssetObservation = Readonly<{
  id: unknown;
  role: unknown;
  authority: unknown;
  acceptance: unknown;
  lockedStatus: unknown;
  sha256: unknown;
  byteSize: unknown;
  width: unknown;
  height: unknown;
  mimeType: unknown;
}>;

export type StudioAtelierG004ReadbackObservation = Readonly<{
  receipt: unknown;
  assetCount: unknown;
}>;

export type StudioAtelierProductionReadinessProbePorts = Readonly<{
  readDatabase: () => Promise<StudioAtelierDatabaseObservation>;
  verifyPrivateStore: (
    input: StudioAtelierPrivateStoreProbeInput,
  ) => Promise<VerifiedPrivateBlob>;
  readAiAdapterPolicy: () => StudioAtelierAiAdapterPolicyObservation;
  readAiEnvironment: () => StudioAtelierAiEnvironmentObservation;
  readPrivateAuthority: (
    assetIds: readonly string[],
  ) => Promise<StudioAtelierAuthorityReadbackObservation>;
  readG004Calibration: () => Promise<StudioAtelierG004ReadbackObservation>;
  now: () => Date;
}>;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function rowsOf<T>(value: unknown): readonly T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && "rows" in value) {
    const rows = (value as { rows?: unknown }).rows;
    return Array.isArray(rows) ? rows as T[] : [];
  }
  return [];
}

async function readDatabase(): Promise<StudioAtelierDatabaseObservation> {
  const database = await getStudioDb();
  const [tableResult, migrationResult] = await Promise.all([
    database.execute<{ tableName: string }>(sql`
      select table_name::text as "tableName"
      from information_schema.tables
      where table_schema = 'public'
        and table_name in (
          'studio_atelier_adult_verification_receipts',
          'studio_atelier_artifacts',
          'studio_atelier_consent_events',
          'studio_atelier_consent_grants',
          'studio_atelier_consent_projections',
          'studio_atelier_events',
          'studio_atelier_executions',
          'studio_atelier_operation_projections',
          'studio_atelier_operations',
          'studio_atelier_styling_advisories',
          'studio_engine_work_ownership'
        )
      order by table_name asc
    `),
    database.execute<{ hash: string; createdAt: string | number }>(sql`
      select hash::text as hash, created_at::text as "createdAt"
      from "drizzle"."__drizzle_migrations"
      order by created_at asc, hash asc
    `),
  ]);
  return Object.freeze({
    tables: Object.freeze(rowsOf<{ tableName: string }>(tableResult).map(
      (row) => row.tableName,
    )),
    appliedMigrations: Object.freeze(
      rowsOf<{ hash: string; createdAt: string | number }>(migrationResult).map(
        (row) => Object.freeze({ hash: row.hash, createdAt: row.createdAt }),
      ),
    ),
  });
}

function privateStoreProbeInput(): StudioAtelierPrivateStoreProbeInput {
  return Object.freeze({
    bytes: new Uint8Array(PRIVATE_STORE_PROBE_BYTES),
    mimeType: PRIVATE_STORE_PROBE_MIME_TYPE,
    namespace: PRIVATE_STORE_PROBE_NAMESPACE,
  });
}

function verifyPrivateStore(
  input: StudioAtelierPrivateStoreProbeInput,
): Promise<VerifiedPrivateBlob> {
  return putVerifiedPrivateContentAddressedBlob(input);
}

function readAiAdapterPolicy(): StudioAtelierAiAdapterPolicyObservation {
  const providerOptions = studioGptImage2ProviderOptions({
    tags: ["studio:atelier-readiness"],
  });
  return Object.freeze({
    adapterId: STUDIO_GPT_IMAGE_2_ADAPTER,
    adapterVersion: STUDIO_GPT_IMAGE_2_ADAPTER_VERSION,
    policyRevision: STUDIO_GPT_IMAGE_2_POLICY_REVISION,
    provider: "openai",
    model: STUDIO_GPT_IMAGE_2_MODEL,
    onlyProviders: Object.freeze([...providerOptions.gateway.only]),
    fallbackModels: Object.freeze([]),
    maxRetries: 0,
    costCapUsd: STUDIO_GPT_IMAGE_2_COST_CAP_USD,
  });
}

function readAiEnvironment(): StudioAtelierAiEnvironmentObservation {
  return Object.freeze({
    imageModel: process.env.STUDIO_AI_IMAGE_MODEL,
    imageCostCapUsd: process.env.STUDIO_AI_IMAGE_COST_CAP_USD,
    gatewayApiKey: process.env.AI_GATEWAY_API_KEY,
    vercelOidcToken: process.env.VERCEL_OIDC_TOKEN,
  });
}

async function readPrivateAuthority(
  assetIds: readonly string[],
): Promise<StudioAtelierAuthorityReadbackObservation> {
  const assets = await resolveLuluV4AuthorityAssets(assetIds);
  return Object.freeze({
    authorityRevision: LULU_V4_AUTHORITY_REVISION,
    manifestSha256: authorityManifestSha256,
    assets: Object.freeze(assets.map((asset) => Object.freeze({
      id: asset.id,
      role: asset.role,
      authority: asset.authority,
      acceptance: asset.acceptance,
      lockedStatus: asset.lockedStatus,
      sha256: asset.sha256,
      byteSize: asset.bytes.byteLength,
      width: asset.width,
      height: asset.height,
      mimeType: asset.mimeType,
    }))),
  });
}

async function readG004Calibration(): Promise<StudioAtelierG004ReadbackObservation> {
  const calibration = await verifyStudioAtelierG004Calibration(
    await resolveStudioAtelierG004Calibration(),
  );
  return Object.freeze({
    receipt: calibration.receipt,
    assetCount: calibration.assets.length,
  });
}

const defaultPorts: StudioAtelierProductionReadinessProbePorts = Object.freeze({
  readDatabase,
  verifyPrivateStore,
  readAiAdapterPolicy,
  readAiEnvironment,
  readPrivateAuthority,
  readG004Calibration,
  now: () => new Date(),
});

function blocker(
  code: StudioAtelierReadinessBlockerCode,
  scope: StudioAtelierReadinessBlocker["scope"],
  dependency: string,
  message: string,
): StudioAtelierReadinessBlocker {
  return Object.freeze({ code, scope, dependency, message });
}

function sameStringSet(actual: readonly unknown[], expected: readonly string[]): boolean {
  return actual.length === expected.length
    && actual.every((value): value is string => typeof value === "string")
    && new Set(actual).size === actual.length
    && expected.every((value) => actual.includes(value));
}

function exactMigrationCreatedAt(value: unknown, expected: number): boolean {
  if (typeof value === "bigint") {
    return value === BigInt(expected);
  }
  if (typeof value === "number") {
    return Number.isSafeInteger(value)
      && value === expected;
  }
  return typeof value === "string"
    && value === String(expected);
}

function exactDatabase(
  observation: StudioAtelierDatabaseObservation,
  verifiedAt: string,
): Readonly<{
  evidence?: StudioAtelierDatabaseReadinessEvidence;
  blockers: readonly StudioAtelierReadinessBlocker[];
}> {
  const blockers: StudioAtelierReadinessBlocker[] = [];
  if (!sameStringSet(observation.tables, REQUIRED_LEDGER_TABLES)) {
    blockers.push(blocker(
      "DATABASE_TABLES_MISMATCH",
      "ALL",
      "database.tables",
      "The exact ownership-fenced Atelier ledger is not installed.",
    ));
  }
  const migration = observation.appliedMigrations[STUDIO_ATELIER_LEDGER_MIGRATION_INDEX];
  const transactionalAuthorityMigration =
    observation.appliedMigrations[STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_INDEX];
  const externalAuthorityMigration =
    observation.appliedMigrations[STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_INDEX];
  if (
    !migration
    || migration.hash !== STUDIO_ATELIER_LEDGER_MIGRATION_SHA256
    || !exactMigrationCreatedAt(
      migration.createdAt,
      STUDIO_ATELIER_LEDGER_MIGRATION_CREATED_AT,
    )
    || !transactionalAuthorityMigration
    || transactionalAuthorityMigration.hash
      !== STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_SHA256
    || !exactMigrationCreatedAt(
      transactionalAuthorityMigration.createdAt,
      STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_CREATED_AT,
    )
    || !externalAuthorityMigration
    || externalAuthorityMigration.hash
      !== STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_SHA256
    || !exactMigrationCreatedAt(
      externalAuthorityMigration.createdAt,
      STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_CREATED_AT,
    )
  ) {
    blockers.push(blocker(
      "DATABASE_MIGRATION_MISMATCH",
      "ALL",
      "database.migration",
      "The required Studio and Atelier migration lineage is missing or does not match.",
    ));
  }
  if (blockers.length > 0) return Object.freeze({ blockers: Object.freeze(blockers) });
  return Object.freeze({
    evidence: Object.freeze({
      status: "VERIFIED",
      ledgerSchemaVersion: STUDIO_ATELIER_LEDGER_SCHEMA_VERSION,
      migrationIndex: STUDIO_ATELIER_LEDGER_MIGRATION_INDEX,
      migrationTag: STUDIO_ATELIER_LEDGER_MIGRATION_TAG,
      migrationCreatedAt: STUDIO_ATELIER_LEDGER_MIGRATION_CREATED_AT,
      migrationSha256: STUDIO_ATELIER_LEDGER_MIGRATION_SHA256,
      transactionalAuthorityMigrationIndex:
        STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_INDEX,
      transactionalAuthorityMigrationTag:
        STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_TAG,
      transactionalAuthorityMigrationCreatedAt:
        STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_CREATED_AT,
      transactionalAuthorityMigrationSha256:
        STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_SHA256,
      externalAuthorityMigrationIndex:
        STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_INDEX,
      externalAuthorityMigrationTag:
        STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_TAG,
      externalAuthorityMigrationCreatedAt:
        STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_CREATED_AT,
      externalAuthorityMigrationSha256:
        STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_SHA256,
      tables: Object.freeze([...REQUIRED_LEDGER_TABLES]),
      verifiedAt,
    }),
    blockers: Object.freeze([]),
  });
}

function exactPrivateBlob(value: VerifiedPrivateBlob): boolean {
  return value.pathname === PRIVATE_STORE_PROBE_PATHNAME
    && value.mimeType === PRIVATE_STORE_PROBE_MIME_TYPE
    && value.byteSize === PRIVATE_STORE_PROBE_BYTES.byteLength
    && value.sha256 === PRIVATE_STORE_PROBE_SHA256
    && typeof value.blobUrl === "string"
    && value.blobUrl.length > 0;
}

function exactAiAdapterPolicy(value: StudioAtelierAiAdapterPolicyObservation): boolean {
  return value.adapterId === STUDIO_GPT_IMAGE_2_ADAPTER
    && value.adapterVersion === STUDIO_GPT_IMAGE_2_ADAPTER_VERSION
    && value.policyRevision === STUDIO_GPT_IMAGE_2_POLICY_REVISION
    && value.provider === "openai"
    && value.model === STUDIO_GPT_IMAGE_2_MODEL
    && value.onlyProviders.length === 1
    && value.onlyProviders[0] === "openai"
    && value.fallbackModels.length === 0
    && value.maxRetries === 0
    && value.costCapUsd === STUDIO_GPT_IMAGE_2_COST_CAP_USD;
}

function usableCredential(value: string | undefined): boolean {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0
    && trimmed !== "[SENSITIVE]"
    && !/^(?:change-?me|placeholder|replace-?me|undefined|null)$/i.test(trimmed);
}

function exactAuthorityAsset(
  actual: StudioAtelierAuthorityAssetObservation,
  expected: LuluV4AuthorityAsset,
): boolean {
  return actual.id === expected.id
    && actual.role === expected.role
    && actual.authority === expected.authority
    && actual.acceptance === LULU_V4_AUTHORITY_ACCEPTANCE
    && actual.lockedStatus === LULU_V4_AUTHORITY_LOCKED_STATUS
    && actual.sha256 === expected.sha256
    && actual.byteSize === expected.byteSize
    && actual.width === expected.width
    && actual.height === expected.height
    && actual.mimeType === expected.mimeType;
}

function exactG004Receipt(value: unknown): value is StudioAtelierG004ReadbackReceipt {
  try {
    return canonicalStringify(value)
      === canonicalStringify(STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT);
  } catch {
    return false;
  }
}

function roomEvidence(
  observation: StudioAtelierAuthorityReadbackObservation,
  verifiedAt: string,
): StudioAtelierApprovedRoomReadinessEvidence | null {
  const roomIndex = expectedAuthorityAssets.findIndex(
    (asset) => asset.id === APPROVED_ROOM_ASSET_ID,
  );
  const expected = expectedAuthorityAssets[roomIndex];
  const actual = observation.assets[roomIndex];
  if (
    !expected
    || !actual
    || observation.authorityRevision !== LULU_V4_AUTHORITY_REVISION
    || observation.manifestSha256 !== STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256
    || authorityManifestSha256 !== STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256
    || !exactAuthorityAsset(actual, expected)
    || actual.id !== APPROVED_ROOM_ASSET_ID
    || actual.mimeType !== "image/png"
    || actual.width !== 1024
    || actual.height !== 1280 && actual.height !== 1536
  ) {
    return null;
  }
  const profile = resolveStudioAtelierRoomCanvasProfile({
    width: actual.width,
    height: actual.height,
  });
  if (!profile) return null;
  return Object.freeze({
    status: "VERIFIED_PRIVATE_READBACK",
    assetId: APPROVED_ROOM_ASSET_ID,
    sha256: String(actual.sha256),
    mimeType: actual.mimeType,
    width: actual.width,
    height: actual.height,
    authorityRevision: LULU_V4_AUTHORITY_REVISION,
    manifestSha256: STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256,
    profileId: profile.profileId,
    canvasPolicyRevision: profile.policyRevision,
    verifiedAt,
  });
}

function mergePorts(
  overrides: Partial<StudioAtelierProductionReadinessProbePorts>,
): StudioAtelierProductionReadinessProbePorts {
  return Object.freeze({ ...defaultPorts, ...overrides });
}

/**
 * Creates a server-owned readiness preflight. Test seams return raw observations,
 * never readiness booleans. The default ports do not execute until the returned
 * probe is called; importing this module cannot query Postgres, write Blob, read
 * private authority, decode G004, or invoke an image provider.
 *
 * Qualification is deliberately outside this preflight. Even when every
 * zero-spend prerequisite verifies, this report remains non-authoritative for
 * runtime construction and paid dispatch until the separate closed evaluator
 * qualification resolver supplies its canonical receipt-bound bundle.
 */
export function createStudioAtelierProductionReadinessProbe(
  overrides: Partial<StudioAtelierProductionReadinessProbePorts> = {},
): () => Promise<StudioAtelierProductionReadinessProbeReport> {
  const ports = mergePorts(overrides);
  return async () => {
    const verifiedAt = ports.now().toISOString();
    const blockers: StudioAtelierReadinessBlocker[] = [];
    const evidence: {
      database?: StudioAtelierDatabaseReadinessEvidence;
      privateStore?: StudioAtelierPrivateStoreReadinessEvidence;
      aiPolicy?: StudioAtelierAiPolicyReadinessEvidence;
      privateAuthority?: StudioAtelierPrivateAuthorityReadinessEvidence;
      g004Calibration?: StudioAtelierG004ReadinessEvidence;
      approvedRoom?: StudioAtelierApprovedRoomReadinessEvidence;
    } = {};

    try {
      const database = exactDatabase(await ports.readDatabase(), verifiedAt);
      blockers.push(...database.blockers);
      if (database.evidence) evidence.database = database.evidence;
    } catch {
      blockers.push(blocker(
        "DATABASE_UNAVAILABLE",
        "ALL",
        "database",
        "The durable Atelier database could not be inspected.",
      ));
    }

    try {
      const first = await ports.verifyPrivateStore(privateStoreProbeInput());
      const second = await ports.verifyPrivateStore(privateStoreProbeInput());
      if (!exactPrivateBlob(first) || !exactPrivateBlob(second)) {
        blockers.push(blocker(
          "PRIVATE_STORE_READBACK_MISMATCH",
          "ALL",
          "privateStore",
          "The immutable private content-addressed store did not return the exact probe object.",
        ));
      } else {
        evidence.privateStore = Object.freeze({
          status: "VERIFIED_PRIVATE_READ_WRITE",
          contentAddressed: true,
          immutableCreate: true,
          readbackVerified: true,
          verifiedAt,
        });
      }
    } catch {
      blockers.push(blocker(
        "PRIVATE_STORE_UNAVAILABLE",
        "ALL",
        "privateStore",
        "The immutable private content-addressed store could not be verified.",
      ));
    }

    try {
      const policy = ports.readAiAdapterPolicy();
      const environment = ports.readAiEnvironment();
      const adapterReady = exactAiAdapterPolicy(policy);
      const environmentReady = environment.imageModel?.trim() === STUDIO_GPT_IMAGE_2_MODEL
        && Number(environment.imageCostCapUsd?.trim()) === STUDIO_GPT_IMAGE_2_COST_CAP_USD;
      const credentialReady = usableCredential(environment.gatewayApiKey)
        || usableCredential(environment.vercelOidcToken);
      if (!adapterReady) {
        blockers.push(blocker(
          "AI_ADAPTER_POLICY_MISMATCH",
          "ALL",
          "aiPolicy.adapter",
          "The installed image adapter does not match the OpenAI-only GPT Image 2 policy.",
        ));
      }
      if (!environmentReady) {
        blockers.push(blocker(
          "AI_ENVIRONMENT_MISMATCH",
          "ALL",
          "aiPolicy.environment",
          "The server image model or cost cap does not match the approved policy.",
        ));
      }
      if (!credentialReady) {
        blockers.push(blocker(
          "AI_CREDENTIAL_UNAVAILABLE",
          "ALL",
          "aiPolicy.credential",
          "No usable server-side AI Gateway credential is available.",
        ));
      }
      if (adapterReady && environmentReady && credentialReady) {
        evidence.aiPolicy = Object.freeze({
          status: "VERIFIED",
          gatewayCredentialAvailable: true,
          adapterId: STUDIO_GPT_IMAGE_2_ADAPTER,
          adapterVersion: STUDIO_GPT_IMAGE_2_ADAPTER_VERSION,
          policyRevision: STUDIO_GPT_IMAGE_2_POLICY_REVISION,
          provider: "openai",
          model: STUDIO_GPT_IMAGE_2_MODEL,
          onlyProviders: Object.freeze(["openai"] as const),
          fallbackModels: Object.freeze([] as const),
          maxRetries: 0,
          costCapUsd: STUDIO_GPT_IMAGE_2_COST_CAP_USD,
          verifiedAt,
        });
      }
    } catch {
      blockers.push(blocker(
        "AI_ADAPTER_POLICY_MISMATCH",
        "ALL",
        "aiPolicy",
        "The server image adapter policy could not be verified.",
      ));
    }

    try {
      const authority = await ports.readPrivateAuthority(expectedAuthorityAssetIds);
      const authorityReady = authority.authorityRevision === LULU_V4_AUTHORITY_REVISION
        && authority.manifestSha256 === STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256
        && authorityManifestSha256 === STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256
        && authority.assets.length === expectedAuthorityAssets.length
        && authority.assets.every((asset, index) => {
          const expected = expectedAuthorityAssets[index];
          return expected !== undefined && exactAuthorityAsset(asset, expected);
        });
      if (!authorityReady) {
        blockers.push(blocker(
          "PRIVATE_AUTHORITY_MISMATCH",
          "ALL",
          "privateAuthority",
          "The exact eleven-asset Lulu V4 private authority did not pass readback.",
        ));
      } else {
        evidence.privateAuthority = Object.freeze({
          status: "VERIFIED_PRIVATE_READBACK",
          authorityRevision: LULU_V4_AUTHORITY_REVISION,
          manifestSha256: STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256,
          assetCount: STUDIO_ATELIER_PRIVATE_AUTHORITY_ASSET_COUNT,
          verifiedAt,
        });
      }
      const room = roomEvidence(authority, verifiedAt);
      if (room) {
        evidence.approvedRoom = room;
      } else {
        blockers.push(blocker(
          "APPROVED_ROOM_MISMATCH",
          "FINAL_SCENE",
          "approvedRoom",
          "The approved room does not match its exact private hash, MIME, dimensions and native canvas profile.",
        ));
      }
    } catch {
      blockers.push(blocker(
        "PRIVATE_AUTHORITY_UNAVAILABLE",
        "ALL",
        "privateAuthority",
        "The Lulu V4 private authority could not be read back.",
      ));
      blockers.push(blocker(
        "APPROVED_ROOM_MISMATCH",
        "FINAL_SCENE",
        "approvedRoom",
        "The approved room could not be verified on an approved native canvas profile.",
      ));
    }

    try {
      const calibration = await ports.readG004Calibration();
      if (
        calibration.assetCount !== STUDIO_ATELIER_G004_CALIBRATION_ASSET_COUNT
        || !exactG004Receipt(calibration.receipt)
      ) {
        blockers.push(blocker(
          "G004_CALIBRATION_MISMATCH",
          "ALL",
          "g004Calibration",
          "The exact G004 derivative calibration receipt did not pass readback.",
        ));
      } else {
        evidence.g004Calibration = Object.freeze({
          status: "VERIFIED_PUBLIC_DERIVATIVE_READBACK",
          calibrationRevision: STUDIO_ATELIER_G004_CALIBRATION_REVISION,
          manifestSha256: STUDIO_ATELIER_G004_CALIBRATION_MANIFEST_SHA256,
          readbackReceiptSha256: STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT.receiptSha256,
          assetCount: STUDIO_ATELIER_G004_CALIBRATION_ASSET_COUNT,
          canonicalOriginalsStatus: "UNAVAILABLE",
          derivativeDecision: "VERSION_LOCK_PUBLIC_SHOP_DERIVATIVES",
          verifiedAt,
        });
      }
    } catch {
      blockers.push(blocker(
        "G004_CALIBRATION_UNAVAILABLE",
        "ALL",
        "g004Calibration",
        "The exact G004 derivative calibration could not be read back.",
      ));
    }

    const prequalificationStatus = blockers.length === 0 ? "VERIFIED" : "BLOCKED";
    blockers.push(blocker(
      "QUALIFICATION_NOT_PASSED",
      "ALL",
      "qualification",
      "The canonical closed evaluator qualification bundle is not installed.",
    ));
    return Object.freeze({
      schemaVersion: STUDIO_ATELIER_READINESS_SCHEMA_VERSION,
      prequalificationStatus,
      qualificationStatus: "NOT_VERIFIED",
      productionStatus: "BLOCKED",
      readyForQualification: prequalificationStatus === "VERIFIED",
      constructionAllowed: false,
      evidence: Object.freeze(evidence),
      blockers: Object.freeze(blockers),
    });
  };
}

export const probeStudioAtelierProductionReadiness =
  createStudioAtelierProductionReadinessProbe();
