import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getStudioDb } from "../../db/shop-postgres";
import {
  STUDIO_GPT_IMAGE_2_MODEL,
  STUDIO_GPT_IMAGE_2_POLICY_REVISION,
} from "../ai/studio-image-policy";
import {
  canonicalStringify,
  sha256Text,
} from "../studio/atelier/canonical";
import type { AtelierStage } from "../studio/atelier/contracts";
import { StudioEngineError } from "../studio/engine/errors";
import type { StudioAtelierNonZdrConsentReceipt } from "./studio-atelier-execution-service";
import type {
  ResolveStudioAtelierAdultLikenessAuthority,
  ResolveStudioAtelierProviderRetentionConsent,
  StudioAtelierAdultLikenessAuthorityReceipt,
} from "./studio-atelier-production-ports";
import { STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256 } from "./studio-atelier-production-runtime";
import {
  LULU_V4_AUTHORITY_REVISION,
} from "./studio-lulu-v4-authority";
import type { StudioOperator } from "./studio-operator";

export const STUDIO_ATELIER_ADULT_VERIFICATION_VERSION =
  "juw.atelier-adult-verification-evidence.v1" as const;
export const STUDIO_ATELIER_CONSENT_AFFIRMATION_VERSION =
  "juw.atelier-likeness-consent-affirmation.v1" as const;
export const STUDIO_ATELIER_PROVIDER_NOTICE_VERSION =
  "juw.atelier-provider-retention-notice.v1" as const;
export const STUDIO_ATELIER_CONSENT_STATUS_VERSION =
  "juw.atelier-consent-status.v1" as const;
export const STUDIO_ATELIER_MODEL_REVISION =
  "gateway-openai-gpt-image-2-2026-04-21" as const;

const STUDIO_ATELIER_NON_ZDR_CONSENT_VERSION =
  "juw.atelier-non-zdr-consent.v1" as const;
const STUDIO_ATELIER_ADULT_LIKENESS_AUTHORITY_VERSION =
  "juw.atelier-adult-likeness-authority.v1" as const;

export const STUDIO_ATELIER_CONSENT_AFFIRMATIONS = Object.freeze([
  "I am Lulu and I confirm that I am 18 or older.",
  "I authorize JustUrbanWears to use the locked Lulu V4 identity and body references to create fully clothed, non-sexual JUW retail-fashion catalogue images.",
  "I understand that Studio sends private reference images and generated results to OpenAI GPT Image 2 through Vercel AI Gateway. This workflow is not configured for zero data retention. I acknowledge the provider-retention notice shown for the current provider policy revision.",
] as const);

export const STUDIO_ATELIER_PROVIDER_RETENTION_NOTICE =
  "Studio uses OpenAI GPT Image 2 through Vercel AI Gateway with zero data retention disabled. This acknowledgment authorizes future private Atelier processing under the displayed JUW provider policy revision; it does not claim a provider retention duration." as const;

export const STUDIO_ATELIER_CONSENT_AFFIRMATION_SHA256 = sha256Text(
  canonicalStringify(STUDIO_ATELIER_CONSENT_AFFIRMATIONS),
);
export const STUDIO_ATELIER_PROVIDER_NOTICE_SHA256 = sha256Text(
  STUDIO_ATELIER_PROVIDER_RETENTION_NOTICE,
);

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_RECEIPT_ID_PATTERN = /^[a-zA-Z0-9._:/-]{1,180}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const atelierStageSchema = z.enum([
  "GARMENT_01_FRONT",
  "GARMENT_02_BACK",
  "GARMENT_03_MANNEQUIN",
  "GARMENT_04_DETAIL",
  "SUBJECT_A",
  "SUBJECT_B",
  "ROOM_FINAL_05",
  "SIBLING_06",
  "SIBLING_07_CORE",
  "SIBLING_07_RECOVERY",
]);

type DatabaseRow = Record<string, unknown>;

function resultRows(result: unknown): DatabaseRow[] {
  if (!result || typeof result !== "object") return [];
  const rows = "rows" in result ? result.rows : result;
  return Array.isArray(rows) ? rows as DatabaseRow[] : [];
}

function iso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function nullableIso(value: unknown): string | null {
  return value === null || value === undefined ? null : iso(value) || null;
}

function validActorSubject(value: string): boolean {
  return value.length >= 1 && value.length <= 512 && value === value.trim();
}

const adultVerificationBodySchema = z.object({
  schemaVersion: z.literal(STUDIO_ATELIER_ADULT_VERIFICATION_VERSION),
  operatorSubject: z.string().trim().min(1),
  subjectAuthorityId: z.literal("lulu-v4"),
  authorityRevision: z.literal(LULU_V4_AUTHORITY_REVISION),
  authorityManifestSha256: z.literal(STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256),
  subjectAge: z.literal("VERIFIED_ADULT_18_PLUS"),
  verificationMethod: z.enum([
    "TRUSTED_IDENTITY_PROVIDER",
    "AUTHORIZED_HUMAN_REVIEW",
  ]),
  evidenceReceiptId: z.string().regex(SAFE_RECEIPT_ID_PATTERN),
  evidenceReceiptSha256: z.string().regex(SHA256_PATTERN),
  verifiedAt: z.string().regex(ISO_TIMESTAMP_PATTERN),
  expiresAt: z.string().regex(ISO_TIMESTAMP_PATTERN).nullable(),
  recordedBySubject: z.string().trim().min(1),
}).strict().superRefine((value, context) => {
  if (value.expiresAt && Date.parse(value.expiresAt) <= Date.parse(value.verifiedAt)) {
    context.addIssue({
      code: "custom",
      path: ["expiresAt"],
      message: "Adult-verification expiry must follow verification.",
    });
  }
});

export type StudioAtelierAdultVerificationBody = z.infer<
  typeof adultVerificationBodySchema
>;

export type StudioAtelierAdultVerificationRecord = Readonly<
  StudioAtelierAdultVerificationBody & {
    id: string;
    recordSha256: string;
    revokedAt: string | null;
    createdAt: string;
  }
>;

export function deriveStudioAtelierAdultVerificationRecordHash(
  raw: StudioAtelierAdultVerificationBody,
): string {
  const body = adultVerificationBodySchema.parse(raw);
  return sha256Text(canonicalStringify(body));
}

const consentGrantBodySchema = z.object({
  operatorSubject: z.string().trim().min(1),
  adultVerificationId: z.string().uuid(),
  adultVerificationRecordSha256: z.string().regex(SHA256_PATTERN),
  subjectAuthorityId: z.literal("lulu-v4"),
  authorityRevision: z.literal(LULU_V4_AUTHORITY_REVISION),
  authorityManifestSha256: z.literal(STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256),
  affirmationVersion: z.literal(STUDIO_ATELIER_CONSENT_AFFIRMATION_VERSION),
  affirmationSha256: z.literal(STUDIO_ATELIER_CONSENT_AFFIRMATION_SHA256),
  provider: z.literal("openai"),
  model: z.literal(STUDIO_GPT_IMAGE_2_MODEL),
  modelRevision: z.literal(STUDIO_ATELIER_MODEL_REVISION),
  providerPolicyRevision: z.literal(STUDIO_GPT_IMAGE_2_POLICY_REVISION),
  providerNoticeVersion: z.literal(STUDIO_ATELIER_PROVIDER_NOTICE_VERSION),
  providerNoticeSha256: z.literal(STUDIO_ATELIER_PROVIDER_NOTICE_SHA256),
  zeroDataRetention: z.literal(false),
  providerRetentionAcknowledged: z.literal(true),
  likenessUseAuthorized: z.literal(true),
  purpose: z.literal("NON_SEXUAL_RETAIL_FASHION_CATALOGUE"),
  createdAt: z.string().regex(ISO_TIMESTAMP_PATTERN),
}).strict();

export type StudioAtelierConsentGrantBody = z.infer<typeof consentGrantBodySchema>;

export function deriveStudioAtelierConsentGrantHash(
  raw: StudioAtelierConsentGrantBody,
): string {
  return sha256Text(canonicalStringify(consentGrantBodySchema.parse(raw)));
}

export const studioAtelierConsentCommandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("GRANT"),
    expectedRevision: z.number().int().nonnegative(),
    idempotencyKey: z.string().trim().min(8).max(160),
    affirmationVersion: z.literal(STUDIO_ATELIER_CONSENT_AFFIRMATION_VERSION),
    adultSelfAttested: z.literal(true),
    likenessUseAuthorized: z.literal(true),
    providerRetentionAcknowledged: z.literal(true),
  }).strict(),
  z.object({
    action: z.literal("REVOKE"),
    expectedRevision: z.number().int().positive(),
    idempotencyKey: z.string().trim().min(8).max(160),
    reason: z.string().trim().min(1).max(240),
  }).strict(),
]);

export type StudioAtelierConsentCommand = z.infer<
  typeof studioAtelierConsentCommandSchema
>;
export type StudioAtelierConsentGrantCommand = Extract<
  StudioAtelierConsentCommand,
  { action: "GRANT" }
>;
export type StudioAtelierConsentRevokeCommand = Extract<
  StudioAtelierConsentCommand,
  { action: "REVOKE" }
>;

export function deriveStudioAtelierConsentCommandFingerprint(
  raw: StudioAtelierConsentCommand,
): string {
  return sha256Text(canonicalStringify(studioAtelierConsentCommandSchema.parse(raw)));
}

type ConsentEventHashInput = Readonly<{
  operatorSubject: string;
  sequence: number;
  eventType: "GRANTED" | "REVOKED";
  grantId: string;
  actorSubject: string;
  payload: Record<string, unknown>;
  previousEventHash: string | null;
  createdAt: string;
}>;

export function deriveStudioAtelierConsentEventHash(
  input: ConsentEventHashInput,
): string {
  return sha256Text(canonicalStringify(input));
}

export type StudioAtelierConsentStatusCode =
  | "VERIFICATION_REQUIRED"
  | "NOT_RECORDED"
  | "ACTIVE"
  | "REVOKED"
  | "RECONFIRMATION_REQUIRED";

export type StudioAtelierConsentStatus = Readonly<{
  schemaVersion: typeof STUDIO_ATELIER_CONSENT_STATUS_VERSION;
  status: StudioAtelierConsentStatusCode;
  revision: number;
  canGrant: boolean;
  canRevoke: boolean;
  recordedAt: string | null;
  updatedAt: string | null;
  affirmationVersion: typeof STUDIO_ATELIER_CONSENT_AFFIRMATION_VERSION;
  affirmations: typeof STUDIO_ATELIER_CONSENT_AFFIRMATIONS;
  providerNoticeVersion: typeof STUDIO_ATELIER_PROVIDER_NOTICE_VERSION;
  providerNotice: typeof STUDIO_ATELIER_PROVIDER_RETENTION_NOTICE;
  providerPolicyRevision: typeof STUDIO_GPT_IMAGE_2_POLICY_REVISION;
}>;

export type StudioAtelierConsentCommandReceipt = Readonly<{
  eventType: "GRANTED" | "REVOKED";
  replayed: boolean;
  status: StudioAtelierConsentStatus;
}>;

function adultVerificationFromRow(row: DatabaseRow): StudioAtelierAdultVerificationRecord | null {
  const body = adultVerificationBodySchema.safeParse({
    schemaVersion: STUDIO_ATELIER_ADULT_VERIFICATION_VERSION,
    operatorSubject: String(row.operator_subject ?? ""),
    subjectAuthorityId: row.subject_authority_id,
    authorityRevision: row.authority_revision,
    authorityManifestSha256: row.authority_manifest_sha256,
    subjectAge: row.subject_age,
    verificationMethod: row.verification_method,
    evidenceReceiptId: row.evidence_receipt_id,
    evidenceReceiptSha256: row.evidence_receipt_sha256,
    verifiedAt: iso(row.verified_at),
    expiresAt: nullableIso(row.expires_at),
    recordedBySubject: String(row.recorded_by_subject ?? ""),
  });
  const recordSha256 = String(row.record_sha256 ?? "");
  const id = String(row.id ?? "");
  if (
    !body.success
    || !z.string().uuid().safeParse(id).success
    || !SHA256_PATTERN.test(recordSha256)
    || deriveStudioAtelierAdultVerificationRecordHash(body.data) !== recordSha256
  ) return null;
  return Object.freeze({
    ...body.data,
    id,
    recordSha256,
    revokedAt: nullableIso(row.revoked_at),
    createdAt: iso(row.created_at),
  });
}

async function readCurrentAdultVerification(
  operatorSubject: string,
): Promise<StudioAtelierAdultVerificationRecord | null> {
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    select *
    from studio_atelier_adult_verification_receipts
    where operator_subject = ${operatorSubject}
      and subject_authority_id = 'lulu-v4'
      and authority_revision = ${LULU_V4_AUTHORITY_REVISION}
      and authority_manifest_sha256 = ${STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256}
      and revoked_at is null
      and verified_at <= now()
      and (expires_at is null or expires_at > now())
    order by verified_at desc, created_at desc
    limit 1
  `);
  const row = resultRows(result)[0];
  const record = row ? adultVerificationFromRow(row) : null;
  return record?.revokedAt ? null : record;
}

async function readActiveAdultVerificationById(
  operatorSubject: string,
  verificationId: string,
): Promise<StudioAtelierAdultVerificationRecord | null> {
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    select *
    from studio_atelier_adult_verification_receipts
    where id = ${verificationId}::uuid
      and operator_subject = ${operatorSubject}
      and subject_authority_id = 'lulu-v4'
      and authority_revision = ${LULU_V4_AUTHORITY_REVISION}
      and authority_manifest_sha256 = ${STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256}
      and revoked_at is null
      and verified_at <= now()
      and (expires_at is null or expires_at > now())
    limit 1
  `);
  const row = resultRows(result)[0];
  const record = row ? adultVerificationFromRow(row) : null;
  return record?.revokedAt ? null : record;
}

/**
 * Trusted server-only ingestion boundary. No public route calls this function;
 * its evidence receipt must come from an independent verifier or authorized
 * human review, never from the seller consent form itself.
 */
export async function recordStudioAtelierAdultVerificationEvidence(
  raw: StudioAtelierAdultVerificationBody,
): Promise<StudioAtelierAdultVerificationRecord> {
  const body = adultVerificationBodySchema.parse(raw);
  const recordSha256 = deriveStudioAtelierAdultVerificationRecordHash(body);
  const id = randomUUID();
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    insert into studio_atelier_adult_verification_receipts (
      id, operator_subject, subject_authority_id, authority_revision,
      authority_manifest_sha256, subject_age, verification_method,
      evidence_receipt_id, evidence_receipt_sha256, verified_at, expires_at,
      recorded_by_subject, record_sha256, created_at
    ) values (
      ${id}::uuid, ${body.operatorSubject}, ${body.subjectAuthorityId},
      ${body.authorityRevision}, ${body.authorityManifestSha256}, ${body.subjectAge},
      ${body.verificationMethod}, ${body.evidenceReceiptId},
      ${body.evidenceReceiptSha256}, ${body.verifiedAt}, ${body.expiresAt},
      ${body.recordedBySubject}, ${recordSha256}, now()
    )
    on conflict (operator_subject, evidence_receipt_id) do nothing
    returning *
  `);
  let row = resultRows(result)[0];
  if (!row) {
    const existing = await (await getStudioDb()).execute<DatabaseRow>(sql`
      select * from studio_atelier_adult_verification_receipts
      where operator_subject = ${body.operatorSubject}
        and evidence_receipt_id = ${body.evidenceReceiptId}
      limit 1
    `);
    row = resultRows(existing)[0];
  }
  const record = row ? adultVerificationFromRow(row) : null;
  if (!record || record.recordSha256 !== recordSha256) {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      409,
      "That adult-verification receipt was already recorded with different evidence.",
      "Resolve the trusted verification record before recording consent.",
    );
  }
  return record;
}

function grantBodyFromRow(row: DatabaseRow): StudioAtelierConsentGrantBody | null {
  const parsed = consentGrantBodySchema.safeParse({
    operatorSubject: String(row.operator_subject ?? ""),
    adultVerificationId: String(row.adult_verification_id ?? ""),
    adultVerificationRecordSha256: String(row.adult_verification_record_sha256 ?? ""),
    subjectAuthorityId: row.subject_authority_id,
    authorityRevision: row.authority_revision,
    authorityManifestSha256: row.authority_manifest_sha256,
    affirmationVersion: row.affirmation_version,
    affirmationSha256: row.affirmation_sha256,
    provider: row.provider,
    model: row.model,
    modelRevision: row.model_revision,
    providerPolicyRevision: row.provider_policy_revision,
    providerNoticeVersion: row.provider_notice_version,
    providerNoticeSha256: row.provider_notice_sha256,
    zeroDataRetention: row.zero_data_retention,
    providerRetentionAcknowledged: row.provider_retention_acknowledged,
    likenessUseAuthorized: row.likeness_use_authorized,
    purpose: row.purpose,
    createdAt: iso(row.grant_created_at ?? row.created_at),
  });
  return parsed.success ? parsed.data : null;
}

type ActiveConsentAuthority = Readonly<{
  grantId: string;
  grantSha256: string;
  grant: StudioAtelierConsentGrantBody;
  verification: StudioAtelierAdultVerificationRecord;
}>;

function verificationFromAuthorityRow(
  row: DatabaseRow,
): StudioAtelierAdultVerificationRecord | null {
  return adultVerificationFromRow({
    id: row.verification_id,
    operator_subject: row.verification_operator_subject,
    subject_authority_id: row.verification_subject_authority_id,
    authority_revision: row.verification_authority_revision,
    authority_manifest_sha256: row.verification_authority_manifest_sha256,
    subject_age: row.verification_subject_age,
    verification_method: row.verification_method,
    evidence_receipt_id: row.verification_evidence_receipt_id,
    evidence_receipt_sha256: row.verification_evidence_receipt_sha256,
    verified_at: row.verification_verified_at,
    expires_at: row.verification_expires_at,
    revoked_at: row.verification_revoked_at,
    recorded_by_subject: row.verification_recorded_by_subject,
    record_sha256: row.verification_record_sha256,
    created_at: row.verification_created_at,
  });
}

async function readActiveConsentAuthority(
  operatorSubject: string,
): Promise<ActiveConsentAuthority | null> {
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    select
      projection.revision as projection_revision,
      projection.last_event_hash as projection_last_event_hash,
      grant.*,
      grant.created_at as grant_created_at,
      verification.id as verification_id,
      verification.operator_subject as verification_operator_subject,
      verification.subject_authority_id as verification_subject_authority_id,
      verification.authority_revision as verification_authority_revision,
      verification.authority_manifest_sha256 as verification_authority_manifest_sha256,
      verification.subject_age as verification_subject_age,
      verification.verification_method as verification_method,
      verification.evidence_receipt_id as verification_evidence_receipt_id,
      verification.evidence_receipt_sha256 as verification_evidence_receipt_sha256,
      verification.verified_at as verification_verified_at,
      verification.expires_at as verification_expires_at,
      verification.revoked_at as verification_revoked_at,
      verification.recorded_by_subject as verification_recorded_by_subject,
      verification.record_sha256 as verification_record_sha256,
      verification.created_at as verification_created_at,
      event.sequence as consent_event_sequence,
      event.event_type as consent_event_type,
      event.expected_revision as consent_event_expected_revision,
      event.resulting_revision as consent_event_resulting_revision,
      event.actor_subject as consent_event_actor_subject,
      event.request_fingerprint as consent_event_request_fingerprint,
      event.payload as consent_event_payload,
      event.previous_event_hash as consent_event_previous_hash,
      event.event_hash as consent_event_hash,
      event.created_at as consent_event_created_at
    from studio_atelier_consent_projections projection
    inner join studio_atelier_consent_grants grant
      on grant.id = projection.current_grant_id
    inner join studio_atelier_adult_verification_receipts verification
      on verification.id = grant.adult_verification_id
    inner join studio_atelier_consent_events event
      on event.operator_subject = projection.operator_subject
      and event.sequence = projection.revision
      and event.grant_id = projection.current_grant_id
      and event.event_hash = projection.last_event_hash
      and event.event_type = 'GRANTED'
    where projection.operator_subject = ${operatorSubject}
      and projection.state = 'ACTIVE'
      and grant.operator_subject = projection.operator_subject
      and verification.operator_subject = projection.operator_subject
      and verification.revoked_at is null
      and verification.verified_at <= now()
      and (verification.expires_at is null or verification.expires_at > now())
    limit 1
  `);
  const row = resultRows(result)[0];
  if (!row) return null;

  const grant = grantBodyFromRow(row);
  const verification = verificationFromAuthorityRow(row);
  const grantId = String(row.id ?? "");
  const grantSha256 = String(row.grant_sha256 ?? "");
  const revision = Number(row.projection_revision);
  const eventSequence = Number(row.consent_event_sequence);
  const eventExpectedRevision = Number(row.consent_event_expected_revision);
  const eventResultingRevision = Number(row.consent_event_resulting_revision);
  const eventActor = String(row.consent_event_actor_subject ?? "");
  const eventFingerprint = String(row.consent_event_request_fingerprint ?? "");
  const previousEventHash = row.consent_event_previous_hash === null
    ? null
    : String(row.consent_event_previous_hash ?? "");
  const eventHash = String(row.consent_event_hash ?? "");
  const projectionLastEventHash = String(row.projection_last_event_hash ?? "");
  const eventCreatedAt = iso(row.consent_event_created_at);
  const payload = row.consent_event_payload;
  const payloadIsObject = Boolean(payload)
    && typeof payload === "object"
    && !Array.isArray(payload);
  const payloadRecord = payloadIsObject ? payload as Record<string, unknown> : null;
  const valid = Boolean(grant)
    && Boolean(verification)
    && z.string().uuid().safeParse(grantId).success
    && SHA256_PATTERN.test(grantSha256)
    && grant?.operatorSubject === operatorSubject
    && grant?.adultVerificationId === verification?.id
    && grant?.adultVerificationRecordSha256 === verification?.recordSha256
    && deriveStudioAtelierConsentGrantHash(grant!) === grantSha256
    && Number.isSafeInteger(revision)
    && revision > 0
    && eventSequence === revision
    && eventResultingRevision === revision
    && eventExpectedRevision === revision - 1
    && String(row.consent_event_type) === "GRANTED"
    && validActorSubject(eventActor)
    && SHA256_PATTERN.test(eventFingerprint)
    && (previousEventHash === null || SHA256_PATTERN.test(previousEventHash))
    && eventHash === projectionLastEventHash
    && SHA256_PATTERN.test(eventHash)
    && Boolean(eventCreatedAt)
    && payloadRecord?.grantSha256 === grantSha256
    && payloadRecord?.adultVerificationRecordSha256 === verification?.recordSha256
    && payloadRecord?.affirmationSha256 === STUDIO_ATELIER_CONSENT_AFFIRMATION_SHA256
    && payloadRecord?.providerNoticeSha256 === STUDIO_ATELIER_PROVIDER_NOTICE_SHA256
    && payloadRecord?.providerPolicyRevision === STUDIO_GPT_IMAGE_2_POLICY_REVISION
    && deriveStudioAtelierConsentEventHash({
      operatorSubject,
      sequence: eventSequence,
      eventType: "GRANTED",
      grantId,
      actorSubject: eventActor,
      payload: payloadRecord!,
      previousEventHash,
      createdAt: eventCreatedAt,
    }) === eventHash;
  if (!valid || !grant || !verification) return null;
  return Object.freeze({ grantId, grantSha256, grant, verification });
}

const operationAuthorityInputSchema = z.object({
  operatorSubject: z.string().trim().min(1).max(512),
  operationId: z.string().uuid(),
  semanticOperationHash: z.string().regex(SHA256_PATTERN),
  stage: atelierStageSchema,
}).strict();

/**
 * Derives the strict execution-service receipt from the exact active ledger.
 * The source grant hash is carried in the deterministic receipt ID because the
 * existing v1 receipt body intentionally permits no additional provenance key.
 */
export const resolveStudioAtelierProviderRetentionConsent:
  ResolveStudioAtelierProviderRetentionConsent = async (rawInput) => {
    const parsed = operationAuthorityInputSchema.extend({
      provider: z.literal("openai"),
      model: z.literal(STUDIO_GPT_IMAGE_2_MODEL),
      zeroDataRetention: z.literal(false),
    }).safeParse(rawInput);
    if (!parsed.success) return null;
    const authority = await readActiveConsentAuthority(parsed.data.operatorSubject);
    if (!authority) return null;
    const receiptId = `atelier-consent:${authority.grantSha256}:${parsed.data.operationId}`;
    const body: Omit<StudioAtelierNonZdrConsentReceipt, "receiptSha256"> = {
      schemaVersion: STUDIO_ATELIER_NON_ZDR_CONSENT_VERSION,
      receiptId,
      operatorSubject: parsed.data.operatorSubject,
      operationId: parsed.data.operationId,
      provider: "openai",
      model: STUDIO_GPT_IMAGE_2_MODEL,
      zeroDataRetention: false,
      providerRetentionAcknowledged: true,
      recordedAt: authority.grant.createdAt,
    };
    return Object.freeze({
      ...body,
      receiptSha256: sha256Text(canonicalStringify(body)),
    });
  };

/** Derives the operation-bound adult/likeness receipt from the same ledger. */
export const resolveStudioAtelierAdultLikenessAuthority:
  ResolveStudioAtelierAdultLikenessAuthority = async (rawInput) => {
    const parsed = operationAuthorityInputSchema.safeParse(rawInput);
    if (!parsed.success) return null;
    const authority = await readActiveConsentAuthority(parsed.data.operatorSubject);
    if (!authority) return null;
    const body: Omit<
      StudioAtelierAdultLikenessAuthorityReceipt,
      "receiptId" | "receiptSha256"
    > = {
      schemaVersion: STUDIO_ATELIER_ADULT_LIKENESS_AUTHORITY_VERSION,
      operatorSubjectSha256: sha256Text(parsed.data.operatorSubject),
      operationId: parsed.data.operationId,
      semanticOperationHash: parsed.data.semanticOperationHash,
      stage: parsed.data.stage as AtelierStage,
      authorityRevision: LULU_V4_AUTHORITY_REVISION,
      subjectAuthorityId: "lulu-v4",
      subjectAge: "VERIFIED_ADULT_18_PLUS",
      subjectConsent: "VERIFIED_FOR_THIS_OPERATION",
      likenessUse: "AUTHORIZED_FOR_THIS_OPERATION",
      purpose: "NON_SEXUAL_RETAIL_FASHION_CATALOGUE",
      recordedAt: authority.grant.createdAt,
    };
    const receiptSha256 = sha256Text(canonicalStringify(body));
    return Object.freeze({
      ...body,
      receiptId: `atelier-adult-likeness:${receiptSha256}`,
      receiptSha256,
    });
  };

function emptyStatus(
  verificationAvailable: boolean,
): StudioAtelierConsentStatus {
  return Object.freeze({
    schemaVersion: STUDIO_ATELIER_CONSENT_STATUS_VERSION,
    status: verificationAvailable ? "NOT_RECORDED" : "VERIFICATION_REQUIRED",
    revision: 0,
    canGrant: verificationAvailable,
    canRevoke: false,
    recordedAt: null,
    updatedAt: null,
    affirmationVersion: STUDIO_ATELIER_CONSENT_AFFIRMATION_VERSION,
    affirmations: STUDIO_ATELIER_CONSENT_AFFIRMATIONS,
    providerNoticeVersion: STUDIO_ATELIER_PROVIDER_NOTICE_VERSION,
    providerNotice: STUDIO_ATELIER_PROVIDER_RETENTION_NOTICE,
    providerPolicyRevision: STUDIO_GPT_IMAGE_2_POLICY_REVISION,
  });
}

export async function readStudioAtelierConsentStatus(
  operator: StudioOperator,
): Promise<StudioAtelierConsentStatus> {
  const [projectionResult, verification] = await Promise.all([
    (await getStudioDb()).execute<DatabaseRow>(sql`
      select
        projection.revision,
        projection.state,
        projection.last_event_hash,
        projection.updated_at,
        grant.*,
        grant.created_at as grant_created_at,
        verification.record_sha256 as adult_verification_record_sha256,
        verification.revoked_at as adult_verification_revoked_at,
        verification.expires_at as adult_verification_expires_at
      from studio_atelier_consent_projections projection
      inner join studio_atelier_consent_grants grant
        on grant.id = projection.current_grant_id
      inner join studio_atelier_adult_verification_receipts verification
        on verification.id = grant.adult_verification_id
      where projection.operator_subject = ${operator.subject}
        and grant.operator_subject = projection.operator_subject
        and verification.operator_subject = projection.operator_subject
      limit 1
    `),
    readCurrentAdultVerification(operator.subject),
  ]);
  const row = resultRows(projectionResult)[0];
  if (!row) return emptyStatus(Boolean(verification));

  const revision = Number(row.revision);
  const projectionState = String(row.state);
  const grantBody = grantBodyFromRow(row);
  const grantHash = String(row.grant_sha256 ?? "");
  const lastEventHash = String(row.last_event_hash ?? "");
  const structurallyValid = Number.isSafeInteger(revision)
    && revision > 0
    && ["ACTIVE", "REVOKED"].includes(projectionState)
    && Boolean(grantBody)
    && SHA256_PATTERN.test(grantHash)
    && SHA256_PATTERN.test(lastEventHash)
    && grantBody !== null
    && deriveStudioAtelierConsentGrantHash(grantBody) === grantHash;
  const grantVerification = grantBody
    ? await readActiveAdultVerificationById(
        operator.subject,
        grantBody.adultVerificationId,
      )
    : null;
  const verificationStillActive = Boolean(grantVerification)
    && grantVerification?.recordSha256 === grantBody?.adultVerificationRecordSha256;

  let status: StudioAtelierConsentStatusCode;
  if (projectionState === "REVOKED" && structurallyValid) status = "REVOKED";
  else if (projectionState === "ACTIVE" && structurallyValid && verificationStillActive) status = "ACTIVE";
  else status = "RECONFIRMATION_REQUIRED";

  return Object.freeze({
    schemaVersion: STUDIO_ATELIER_CONSENT_STATUS_VERSION,
    status,
    revision: Number.isSafeInteger(revision) && revision > 0 ? revision : 0,
    canGrant: Boolean(verification) && status !== "ACTIVE",
    canRevoke: status === "ACTIVE",
    recordedAt: grantBody?.createdAt ?? null,
    updatedAt: nullableIso(row.updated_at),
    affirmationVersion: STUDIO_ATELIER_CONSENT_AFFIRMATION_VERSION,
    affirmations: STUDIO_ATELIER_CONSENT_AFFIRMATIONS,
    providerNoticeVersion: STUDIO_ATELIER_PROVIDER_NOTICE_VERSION,
    providerNotice: STUDIO_ATELIER_PROVIDER_RETENTION_NOTICE,
    providerPolicyRevision: STUDIO_GPT_IMAGE_2_POLICY_REVISION,
  });
}

async function readCommandEvent(
  operatorSubject: string,
  idempotencyKey: string,
): Promise<DatabaseRow | null> {
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    select * from studio_atelier_consent_events
    where operator_subject = ${operatorSubject}
      and idempotency_key = ${idempotencyKey}
    limit 1
  `);
  return resultRows(result)[0] ?? null;
}

async function replayedReceipt(
  operator: StudioOperator,
  command: StudioAtelierConsentCommand,
  fingerprint: string,
): Promise<StudioAtelierConsentCommandReceipt | null> {
  const event = await readCommandEvent(operator.subject, command.idempotencyKey);
  if (!event) return null;
  if (String(event.request_fingerprint) !== fingerprint) {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      409,
      "That authorization confirmation was already used for a different request.",
      "Reload the current authorization state before trying again.",
    );
  }
  const eventType = String(event.event_type);
  const expectedEventType = command.action === "GRANT" ? "GRANTED" : "REVOKED";
  const sequence = Number(event.sequence);
  const expectedRevision = Number(event.expected_revision);
  const resultingRevision = Number(event.resulting_revision);
  const grantId = String(event.grant_id ?? "");
  const actorSubject = String(event.actor_subject ?? "");
  const previousEventHash = event.previous_event_hash === null
    ? null
    : String(event.previous_event_hash ?? "");
  const eventHash = String(event.event_hash ?? "");
  const createdAt = iso(event.created_at);
  const payload = event.payload;
  const payloadIsObject = Boolean(payload)
    && typeof payload === "object"
    && !Array.isArray(payload);
  const eventIsValid = eventType === expectedEventType
    && Number.isSafeInteger(sequence)
    && sequence > 0
    && Number.isSafeInteger(expectedRevision)
    && expectedRevision >= 0
    && resultingRevision === expectedRevision + 1
    && sequence === resultingRevision
    && z.string().uuid().safeParse(grantId).success
    && actorSubject === operator.actorSubject
    && (previousEventHash === null || SHA256_PATTERN.test(previousEventHash))
    && SHA256_PATTERN.test(eventHash)
    && Boolean(createdAt)
    && payloadIsObject
    && deriveStudioAtelierConsentEventHash({
      operatorSubject: operator.subject,
      sequence,
      eventType: expectedEventType,
      grantId,
      actorSubject,
      payload: payload as Record<string, unknown>,
      previousEventHash,
      createdAt,
    }) === eventHash;
  if (!eventIsValid) {
    throw new StudioEngineError(
      "ENGINE_UNAVAILABLE",
      503,
      "The durable Atelier authorization audit record failed verification.",
      "Restore the exact consent event chain before processing another command.",
    );
  }
  return Object.freeze({
    eventType: expectedEventType,
    replayed: true,
    status: await readStudioAtelierConsentStatus(operator),
  });
}

async function readProjection(operatorSubject: string): Promise<DatabaseRow | null> {
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    select * from studio_atelier_consent_projections
    where operator_subject = ${operatorSubject}
    limit 1
  `);
  return resultRows(result)[0] ?? null;
}

function versionConflict(): StudioEngineError {
  return new StudioEngineError(
    "VERSION_CONFLICT",
    409,
    "Atelier authorization changed in another Studio session.",
    "Review the current authorization state before confirming again.",
  );
}

export async function grantStudioAtelierConsent(input: Readonly<{
  operator: StudioOperator;
  command: StudioAtelierConsentGrantCommand;
}>): Promise<StudioAtelierConsentCommandReceipt> {
  const command = studioAtelierConsentCommandSchema.parse(input.command) as StudioAtelierConsentGrantCommand;
  const fingerprint = deriveStudioAtelierConsentCommandFingerprint(command);
  const replayed = await replayedReceipt(input.operator, command, fingerprint);
  if (replayed) return replayed;

  const [verification, projection, currentStatus] = await Promise.all([
    readCurrentAdultVerification(input.operator.subject),
    readProjection(input.operator.subject),
    readStudioAtelierConsentStatus(input.operator),
  ]);
  if (!verification) {
    throw new StudioEngineError(
      "ENGINE_UNAVAILABLE",
      503,
      "Trusted adult-verification evidence has not been installed. No authorization was recorded.",
      "Complete independent adult verification before confirming Atelier provider use.",
    );
  }
  const currentRevision = projection ? Number(projection.revision) : 0;
  if (currentRevision !== command.expectedRevision || currentStatus.status === "ACTIVE") {
    throw versionConflict();
  }

  const createdAt = new Date().toISOString();
  const grantId = randomUUID();
  const eventId = randomUUID();
  const resultingRevision = command.expectedRevision + 1;
  const previousEventHash = projection ? String(projection.last_event_hash) : null;
  const grantBody = consentGrantBodySchema.parse({
    operatorSubject: input.operator.subject,
    adultVerificationId: verification.id,
    adultVerificationRecordSha256: verification.recordSha256,
    subjectAuthorityId: "lulu-v4",
    authorityRevision: LULU_V4_AUTHORITY_REVISION,
    authorityManifestSha256: STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256,
    affirmationVersion: STUDIO_ATELIER_CONSENT_AFFIRMATION_VERSION,
    affirmationSha256: STUDIO_ATELIER_CONSENT_AFFIRMATION_SHA256,
    provider: "openai",
    model: STUDIO_GPT_IMAGE_2_MODEL,
    modelRevision: STUDIO_ATELIER_MODEL_REVISION,
    providerPolicyRevision: STUDIO_GPT_IMAGE_2_POLICY_REVISION,
    providerNoticeVersion: STUDIO_ATELIER_PROVIDER_NOTICE_VERSION,
    providerNoticeSha256: STUDIO_ATELIER_PROVIDER_NOTICE_SHA256,
    zeroDataRetention: false,
    providerRetentionAcknowledged: true,
    likenessUseAuthorized: true,
    purpose: "NON_SEXUAL_RETAIL_FASHION_CATALOGUE",
    createdAt,
  });
  const grantSha256 = deriveStudioAtelierConsentGrantHash(grantBody);
  const payload = Object.freeze({
    grantSha256,
    adultVerificationRecordSha256: verification.recordSha256,
    affirmationSha256: STUDIO_ATELIER_CONSENT_AFFIRMATION_SHA256,
    providerNoticeSha256: STUDIO_ATELIER_PROVIDER_NOTICE_SHA256,
    providerPolicyRevision: STUDIO_GPT_IMAGE_2_POLICY_REVISION,
  });
  const eventHash = deriveStudioAtelierConsentEventHash({
    operatorSubject: input.operator.subject,
    sequence: resultingRevision,
    eventType: "GRANTED",
    grantId,
    actorSubject: input.operator.actorSubject,
    payload,
    previousEventHash,
    createdAt,
  });
  const database = await getStudioDb();
  const result = command.expectedRevision === 0
    ? await database.execute<DatabaseRow>(sql`
        with lifecycle_lock as (
          select pg_advisory_xact_lock(hashtextextended(
            'studio_atelier_consent:' || ${input.operator.subject}, 0
          ))
        ), verified as (
          select verification.id
          from studio_atelier_adult_verification_receipts verification
          cross join lifecycle_lock
          where verification.id = ${verification.id}::uuid
            and verification.operator_subject = ${input.operator.subject}
            and verification.record_sha256 = ${verification.recordSha256}
            and verification.revoked_at is null
            and verification.verified_at <= now()
            and (verification.expires_at is null or verification.expires_at > now())
            and not exists (
              select 1 from studio_atelier_consent_projections
              where operator_subject = ${input.operator.subject}
            )
        ), inserted_grant as (
          insert into studio_atelier_consent_grants (
            id, operator_subject, adult_verification_id, subject_authority_id,
            authority_revision, authority_manifest_sha256, affirmation_version,
            affirmation_sha256, provider, model, model_revision,
            provider_policy_revision, provider_notice_version, provider_notice_sha256,
            zero_data_retention, provider_retention_acknowledged,
            likeness_use_authorized, purpose, grant_sha256, created_at
          )
          select
            ${grantId}::uuid, ${grantBody.operatorSubject}, verified.id,
            ${grantBody.subjectAuthorityId}, ${grantBody.authorityRevision},
            ${grantBody.authorityManifestSha256}, ${grantBody.affirmationVersion},
            ${grantBody.affirmationSha256}, ${grantBody.provider}, ${grantBody.model},
            ${grantBody.modelRevision}, ${grantBody.providerPolicyRevision},
            ${grantBody.providerNoticeVersion}, ${grantBody.providerNoticeSha256},
            ${grantBody.zeroDataRetention}, ${grantBody.providerRetentionAcknowledged},
            ${grantBody.likenessUseAuthorized}, ${grantBody.purpose},
            ${grantSha256}, ${createdAt}
          from verified
          returning id
        ), inserted_projection as (
          insert into studio_atelier_consent_projections (
            operator_subject, revision, state, current_grant_id,
            last_event_hash, created_at, updated_at
          )
          select ${input.operator.subject}, ${resultingRevision}, 'ACTIVE', id,
            ${eventHash}, ${createdAt}, ${createdAt}
          from inserted_grant
          returning current_grant_id
        ), appended_event as (
          insert into studio_atelier_consent_events (
            id, operator_subject, sequence, event_type, grant_id,
            expected_revision, resulting_revision, actor_subject,
            idempotency_key, request_fingerprint, payload,
            previous_event_hash, event_hash, created_at
          )
          select ${eventId}::uuid, ${input.operator.subject}, ${resultingRevision},
            'GRANTED', current_grant_id, ${command.expectedRevision},
            ${resultingRevision}, ${input.operator.actorSubject}, ${command.idempotencyKey},
            ${fingerprint}, ${JSON.stringify(payload)}::jsonb, null, ${eventHash}, ${createdAt}
          from inserted_projection
          returning *
        )
        select * from appended_event
      `)
    : await database.execute<DatabaseRow>(sql`
        with lifecycle_lock as (
          select pg_advisory_xact_lock(hashtextextended(
            'studio_atelier_consent:' || ${input.operator.subject}, 0
          ))
        ), eligible_projection as (
          select projection.*
          from studio_atelier_consent_projections projection
          cross join lifecycle_lock
          where projection.operator_subject = ${input.operator.subject}
            and projection.revision = ${command.expectedRevision}
          for update of projection
        ), verified as (
          select verification.id
          from studio_atelier_adult_verification_receipts verification
          where verification.id = ${verification.id}::uuid
            and verification.operator_subject = ${input.operator.subject}
            and verification.record_sha256 = ${verification.recordSha256}
            and verification.revoked_at is null
            and verification.verified_at <= now()
            and (verification.expires_at is null or verification.expires_at > now())
        ), inserted_grant as (
          insert into studio_atelier_consent_grants (
            id, operator_subject, adult_verification_id, subject_authority_id,
            authority_revision, authority_manifest_sha256, affirmation_version,
            affirmation_sha256, provider, model, model_revision,
            provider_policy_revision, provider_notice_version, provider_notice_sha256,
            zero_data_retention, provider_retention_acknowledged,
            likeness_use_authorized, purpose, grant_sha256, created_at
          )
          select
            ${grantId}::uuid, ${grantBody.operatorSubject}, verified.id,
            ${grantBody.subjectAuthorityId}, ${grantBody.authorityRevision},
            ${grantBody.authorityManifestSha256}, ${grantBody.affirmationVersion},
            ${grantBody.affirmationSha256}, ${grantBody.provider}, ${grantBody.model},
            ${grantBody.modelRevision}, ${grantBody.providerPolicyRevision},
            ${grantBody.providerNoticeVersion}, ${grantBody.providerNoticeSha256},
            ${grantBody.zeroDataRetention}, ${grantBody.providerRetentionAcknowledged},
            ${grantBody.likenessUseAuthorized}, ${grantBody.purpose},
            ${grantSha256}, ${createdAt}
          from verified cross join eligible_projection
          returning id
        ), advanced_projection as (
          update studio_atelier_consent_projections projection
          set revision = ${resultingRevision}, state = 'ACTIVE',
              current_grant_id = inserted_grant.id,
              last_event_hash = ${eventHash}, updated_at = ${createdAt}
          from inserted_grant
          where projection.operator_subject = ${input.operator.subject}
            and projection.revision = ${command.expectedRevision}
          returning projection.current_grant_id
        ), appended_event as (
          insert into studio_atelier_consent_events (
            id, operator_subject, sequence, event_type, grant_id,
            expected_revision, resulting_revision, actor_subject,
            idempotency_key, request_fingerprint, payload,
            previous_event_hash, event_hash, created_at
          )
          select ${eventId}::uuid, ${input.operator.subject}, ${resultingRevision},
            'GRANTED', current_grant_id, ${command.expectedRevision},
            ${resultingRevision}, ${input.operator.actorSubject}, ${command.idempotencyKey},
            ${fingerprint}, ${JSON.stringify(payload)}::jsonb,
            ${previousEventHash}, ${eventHash}, ${createdAt}
          from advanced_projection
          returning *
        )
        select * from appended_event
      `);
  if (resultRows(result).length !== 1) {
    const racedReplay = await replayedReceipt(input.operator, command, fingerprint);
    if (racedReplay) return racedReplay;
    throw versionConflict();
  }
  return Object.freeze({
    eventType: "GRANTED",
    replayed: false,
    status: await readStudioAtelierConsentStatus(input.operator),
  });
}

export async function revokeStudioAtelierConsent(input: Readonly<{
  operator: StudioOperator;
  command: StudioAtelierConsentRevokeCommand;
}>): Promise<StudioAtelierConsentCommandReceipt> {
  const command = studioAtelierConsentCommandSchema.parse(input.command) as StudioAtelierConsentRevokeCommand;
  const fingerprint = deriveStudioAtelierConsentCommandFingerprint(command);
  const replayed = await replayedReceipt(input.operator, command, fingerprint);
  if (replayed) return replayed;
  const projection = await readProjection(input.operator.subject);
  if (
    !projection
    || Number(projection.revision) !== command.expectedRevision
    || String(projection.state) !== "ACTIVE"
  ) throw versionConflict();

  const createdAt = new Date().toISOString();
  const eventId = randomUUID();
  const grantId = String(projection.current_grant_id);
  const resultingRevision = command.expectedRevision + 1;
  const previousEventHash = String(projection.last_event_hash);
  const payload = Object.freeze({
    reason: command.reason,
    effect: "FUTURE_ATELIER_PROVIDER_USE_BLOCKED",
  });
  const eventHash = deriveStudioAtelierConsentEventHash({
    operatorSubject: input.operator.subject,
    sequence: resultingRevision,
    eventType: "REVOKED",
    grantId,
    actorSubject: input.operator.actorSubject,
    payload,
    previousEventHash,
    createdAt,
  });
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    with lifecycle_lock as (
      select pg_advisory_xact_lock(hashtextextended(
        'studio_atelier_consent:' || ${input.operator.subject}, 0
      ))
    ), advanced_projection as (
      update studio_atelier_consent_projections projection
      set revision = ${resultingRevision}, state = 'REVOKED',
          last_event_hash = ${eventHash}, updated_at = ${createdAt}
      from lifecycle_lock
      where projection.operator_subject = ${input.operator.subject}
        and projection.revision = ${command.expectedRevision}
        and projection.state = 'ACTIVE'
        and projection.current_grant_id = ${grantId}::uuid
        and projection.last_event_hash = ${previousEventHash}
      returning projection.current_grant_id
    ), appended_event as (
      insert into studio_atelier_consent_events (
        id, operator_subject, sequence, event_type, grant_id,
        expected_revision, resulting_revision, actor_subject,
        idempotency_key, request_fingerprint, payload,
        previous_event_hash, event_hash, created_at
      )
      select ${eventId}::uuid, ${input.operator.subject}, ${resultingRevision},
        'REVOKED', current_grant_id, ${command.expectedRevision},
        ${resultingRevision}, ${input.operator.actorSubject}, ${command.idempotencyKey},
        ${fingerprint}, ${JSON.stringify(payload)}::jsonb,
        ${previousEventHash}, ${eventHash}, ${createdAt}
      from advanced_projection
      returning *
    )
    select * from appended_event
  `);
  if (resultRows(result).length !== 1) {
    const racedReplay = await replayedReceipt(input.operator, command, fingerprint);
    if (racedReplay) return racedReplay;
    throw versionConflict();
  }
  return Object.freeze({
    eventType: "REVOKED",
    replayed: false,
    status: await readStudioAtelierConsentStatus(input.operator),
  });
}
