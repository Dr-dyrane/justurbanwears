import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getStudioDb } from "../../db/shop-postgres";
import {
  fashionNovaCheckSchema,
} from "../studio/atelier/contracts";
import {
  canonicalStringify,
  sha256Text,
} from "../studio/atelier/canonical";
import { StudioEngineError } from "../studio/engine/errors";

export const STUDIO_ATELIER_FASHION_NOVA_ADVISORY_VERSION =
  "juw.atelier-fashion-nova-advisory-record.v1" as const;
export const STUDIO_ATELIER_FASHION_NOVA_FETCH_POLICY_REVISION =
  "juw.atelier-fashion-nova-official-fetch.v1" as const;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const OFFICIAL_FASHION_NOVA_HOST = /^(?:[a-z0-9-]+\.)*fashionnova\.com$/i;

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

export function isOfficialStudioAtelierFashionNovaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.username === ""
      && url.password === ""
      && url.port === ""
      && OFFICIAL_FASHION_NOVA_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

const advisoryBodyBaseSchema = z.object({
  schemaVersion: z.literal(STUDIO_ATELIER_FASHION_NOVA_ADVISORY_VERSION),
  operatorSubject: z.string().trim().min(1),
  wardrobeItemId: z.string().uuid(),
  wardrobeVersion: z.number().int().positive(),
  sourceBindingSha256: z.string().regex(SHA256_PATTERN),
  garmentTruthRevision: z.string().trim().min(1).max(120),
  garmentTruthSourceHash: z.string().regex(SHA256_PATTERN),
  publisher: z.literal("Fashion Nova"),
  officialUrl: z.string().url().max(1_000),
  resolvedOfficialUrl: z.string().url().max(1_000),
  pageTitle: z.string().trim().min(1).max(500),
  accessedAt: z.string().regex(ISO_TIMESTAMP_PATTERN),
  evidenceKind: z.literal("OFFICIAL_PAGE_FETCH"),
  evidenceBlobPathname: z.string().trim().min(1).max(2_000),
  evidenceMimeType: z.enum([
    "text/html",
    "application/json",
    "application/pdf",
  ]),
  evidenceByteSize: z.number().int().positive(),
  evidenceSha256: z.string().regex(SHA256_PATTERN),
  searchScope: z.array(z.string().trim().min(1).max(1_000)).min(1).max(32),
  matchedGarmentFacts: z.array(z.string().trim().min(1).max(500)).max(64),
  decision: z.enum(["KEEP", "REFINE", "REPLACE", "NO_CLOSE_MATCH"]),
  noCloseMatchReason: z.string().trim().min(1).max(1_000).nullable(),
  selectedStylingDirection: z.string().trim().min(1).max(1_000),
  authority: z.literal("ADVISORY_STYLING_ONLY"),
  passedAsImageReference: z.literal(false),
  fetchPolicyRevision: z.literal(STUDIO_ATELIER_FASHION_NOVA_FETCH_POLICY_REVISION),
  createdAt: z.string().regex(ISO_TIMESTAMP_PATTERN),
}).strict();

type AdvisoryValidationValue = z.infer<typeof advisoryBodyBaseSchema>;

function validateAdvisory(
  value: AdvisoryValidationValue,
  context: z.RefinementCtx,
): void {
  if (!isOfficialStudioAtelierFashionNovaUrl(value.officialUrl)) {
    context.addIssue({
      code: "custom",
      path: ["officialUrl"],
      message: "Official evidence must remain on HTTPS fashionnova.com.",
    });
  }
  if (!isOfficialStudioAtelierFashionNovaUrl(value.resolvedOfficialUrl)) {
    context.addIssue({
      code: "custom",
      path: ["resolvedOfficialUrl"],
      message: "The resolved evidence URL must remain on HTTPS fashionnova.com.",
    });
  }
  value.searchScope.forEach((scope, index) => {
    if (!isOfficialStudioAtelierFashionNovaUrl(scope)) {
      context.addIssue({
        code: "custom",
        path: ["searchScope", index],
        message: "Every searched page must be an official HTTPS Fashion Nova URL.",
      });
    }
  });
  const extension = value.evidenceMimeType === "text/html"
    ? "html"
    : value.evidenceMimeType === "application/json"
      ? "json"
      : "pdf";
  const expectedEvidencePathname = `studio/atelier/advisories/${value.evidenceSha256}.${extension}`;
  if (value.evidenceBlobPathname !== expectedEvidencePathname) {
    context.addIssue({
      code: "custom",
      path: ["evidenceBlobPathname"],
      message: "Fetched evidence must use the exact content-addressed private pathname.",
    });
  }
  if (Date.parse(value.accessedAt) > Date.parse(value.createdAt)) {
    context.addIssue({
      code: "custom",
      path: ["accessedAt"],
      message: "Official evidence cannot be recorded before it was fetched.",
    });
  }
  if (value.decision === "NO_CLOSE_MATCH") {
    if (value.matchedGarmentFacts.length !== 0) {
      context.addIssue({
        code: "custom",
        path: ["matchedGarmentFacts"],
        message: "NO_CLOSE_MATCH cannot contain matched garment facts.",
      });
    }
    if (!value.noCloseMatchReason) {
      context.addIssue({
        code: "custom",
        path: ["noCloseMatchReason"],
        message: "NO_CLOSE_MATCH requires an evidence-backed search explanation.",
      });
    }
  } else {
    if (value.matchedGarmentFacts.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["matchedGarmentFacts"],
        message: "A styling decision requires evidence-backed garment facts.",
      });
    }
    if (value.noCloseMatchReason !== null) {
      context.addIssue({
        code: "custom",
        path: ["noCloseMatchReason"],
        message: "Only NO_CLOSE_MATCH may carry a no-match reason.",
      });
    }
  }
}

const advisoryBodySchema = advisoryBodyBaseSchema.superRefine(validateAdvisory);

export type StudioAtelierFashionNovaAdvisoryBody = z.infer<
  typeof advisoryBodySchema
>;

export type StudioAtelierFashionNovaAdvisoryRecord = Readonly<
  StudioAtelierFashionNovaAdvisoryBody & {
    id: string;
    advisorySha256: string;
    idempotencyKey: string;
    requestFingerprint: string;
  }
>;

export const studioAtelierFashionNovaAdvisoryWriteSchema = advisoryBodyBaseSchema
  .omit({ createdAt: true })
  .extend({
    idempotencyKey: z.string().trim().min(8).max(160),
  })
  .strict()
  .superRefine((value, context) => {
    const { idempotencyKey, ...body } = value;
    void idempotencyKey;
    validateAdvisory({
      ...body,
      createdAt: "9999-12-31T23:59:59.999Z",
    }, context);
  });

export type StudioAtelierFashionNovaAdvisoryWrite = z.infer<
  typeof studioAtelierFashionNovaAdvisoryWriteSchema
>;

export function deriveStudioAtelierFashionNovaAdvisoryHash(
  raw: StudioAtelierFashionNovaAdvisoryBody,
): string {
  return sha256Text(canonicalStringify({
    domain: STUDIO_ATELIER_FASHION_NOVA_ADVISORY_VERSION,
    record: advisoryBodySchema.parse(raw),
  }));
}

export function deriveStudioAtelierFashionNovaRequestFingerprint(
  raw: StudioAtelierFashionNovaAdvisoryWrite,
): string {
  const parsed = studioAtelierFashionNovaAdvisoryWriteSchema.parse(raw);
  const { idempotencyKey, ...body } = parsed;
  void idempotencyKey;
  return sha256Text(canonicalStringify({
    domain: "juw.atelier-fashion-nova-advisory-request.v1",
    body,
  }));
}

function recordFromRow(row: DatabaseRow): StudioAtelierFashionNovaAdvisoryRecord | null {
  const body = advisoryBodySchema.safeParse({
    schemaVersion: STUDIO_ATELIER_FASHION_NOVA_ADVISORY_VERSION,
    operatorSubject: String(row.operator_subject ?? ""),
    wardrobeItemId: String(row.wardrobe_item_id ?? ""),
    wardrobeVersion: Number(row.wardrobe_version),
    sourceBindingSha256: row.source_binding_sha256,
    garmentTruthRevision: row.garment_truth_revision,
    garmentTruthSourceHash: row.garment_truth_source_hash,
    publisher: row.publisher,
    officialUrl: row.official_url,
    resolvedOfficialUrl: row.resolved_official_url,
    pageTitle: row.page_title,
    accessedAt: iso(row.accessed_at),
    evidenceKind: row.evidence_kind,
    evidenceBlobPathname: row.evidence_blob_pathname,
    evidenceMimeType: row.evidence_mime_type,
    evidenceByteSize: Number(row.evidence_byte_size),
    evidenceSha256: row.evidence_sha256,
    searchScope: row.search_scope,
    matchedGarmentFacts: row.matched_garment_facts,
    decision: row.decision,
    noCloseMatchReason: row.no_close_match_reason ?? null,
    selectedStylingDirection: row.selected_styling_direction,
    authority: row.authority,
    passedAsImageReference: row.passed_as_image_reference,
    fetchPolicyRevision: row.fetch_policy_revision,
    createdAt: iso(row.created_at),
  });
  const id = String(row.id ?? "");
  const advisorySha256 = String(row.advisory_sha256 ?? "");
  const requestFingerprint = String(row.request_fingerprint ?? "");
  const idempotencyKey = String(row.idempotency_key ?? "");
  const expectedRequestFingerprint = body.success
    ? deriveStudioAtelierFashionNovaRequestFingerprint({
        ...Object.fromEntries(
          Object.entries(body.data).filter(([key]) => key !== "createdAt"),
        ) as Omit<StudioAtelierFashionNovaAdvisoryWrite, "idempotencyKey">,
        idempotencyKey,
      })
    : null;
  if (
    !body.success
    || !z.string().uuid().safeParse(id).success
    || !SHA256_PATTERN.test(advisorySha256)
    || !SHA256_PATTERN.test(requestFingerprint)
    || idempotencyKey.length < 8
    || deriveStudioAtelierFashionNovaAdvisoryHash(body.data) !== advisorySha256
    || expectedRequestFingerprint !== requestFingerprint
  ) return null;
  return Object.freeze({
    ...body.data,
    id,
    advisorySha256,
    idempotencyKey,
    requestFingerprint,
  });
}

async function readByIdempotencyKey(
  operatorSubject: string,
  idempotencyKey: string,
): Promise<StudioAtelierFashionNovaAdvisoryRecord | null> {
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    select * from studio_atelier_styling_advisories
    where operator_subject = ${operatorSubject}
      and idempotency_key = ${idempotencyKey}
    limit 1
  `);
  const row = resultRows(result)[0];
  return row ? recordFromRow(row) : null;
}

/**
 * Server-only persistence boundary for already-fetched official evidence.
 * It performs no network access and has no public route; callers must first
 * verify the exact official response bytes and the current source binding.
 */
export async function recordStudioAtelierFashionNovaAdvisory(
  raw: StudioAtelierFashionNovaAdvisoryWrite,
): Promise<Readonly<{ record: StudioAtelierFashionNovaAdvisoryRecord; replayed: boolean }>> {
  const input = studioAtelierFashionNovaAdvisoryWriteSchema.parse(raw);
  const requestFingerprint = deriveStudioAtelierFashionNovaRequestFingerprint(input);
  const existing = await readByIdempotencyKey(input.operatorSubject, input.idempotencyKey);
  if (existing) {
    if (existing.requestFingerprint !== requestFingerprint) {
      throw new StudioEngineError(
        "INVALID_REQUEST",
        409,
        "That styling-evidence confirmation was already used for different evidence.",
        "Resolve the exact official fetch before recording another advisory.",
      );
    }
    return Object.freeze({ record: existing, replayed: true });
  }

  const createdAt = new Date().toISOString();
  const { idempotencyKey, ...writeBody } = input;
  const body = advisoryBodySchema.parse({ ...writeBody, createdAt });
  const advisorySha256 = deriveStudioAtelierFashionNovaAdvisoryHash(body);
  const id = randomUUID();
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    insert into studio_atelier_styling_advisories (
      id, operator_subject, wardrobe_item_id, wardrobe_version,
      source_binding_sha256, garment_truth_revision, garment_truth_source_hash,
      publisher, official_url, resolved_official_url, page_title, accessed_at,
      evidence_kind, evidence_blob_pathname, evidence_mime_type,
      evidence_byte_size, evidence_sha256, search_scope, matched_garment_facts,
      decision, no_close_match_reason, selected_styling_direction, authority,
      passed_as_image_reference, fetch_policy_revision, advisory_sha256,
      idempotency_key, request_fingerprint, created_at
    )
    select
      ${id}::uuid, ${body.operatorSubject}, wardrobe.id, ${body.wardrobeVersion},
      ${body.sourceBindingSha256}, ${body.garmentTruthRevision},
      ${body.garmentTruthSourceHash}, ${body.publisher}, ${body.officialUrl},
      ${body.resolvedOfficialUrl}, ${body.pageTitle}, ${body.accessedAt},
      ${body.evidenceKind}, ${body.evidenceBlobPathname}, ${body.evidenceMimeType},
      ${body.evidenceByteSize}, ${body.evidenceSha256},
      ${JSON.stringify(body.searchScope)}::jsonb,
      ${JSON.stringify(body.matchedGarmentFacts)}::jsonb, ${body.decision},
      ${body.noCloseMatchReason}, ${body.selectedStylingDirection}, ${body.authority},
      ${body.passedAsImageReference}, ${body.fetchPolicyRevision}, ${advisorySha256},
      ${idempotencyKey}, ${requestFingerprint}, ${createdAt}
    from studio_wardrobe_items wardrobe
    where wardrobe.id = ${body.wardrobeItemId}::uuid
      and wardrobe.operator_subject = ${body.operatorSubject}
      and wardrobe.version = ${body.wardrobeVersion}
      and wardrobe.state in ('DRAFT', 'READY')
    on conflict (operator_subject, idempotency_key) do nothing
    returning *
  `);
  const insertedRow = resultRows(result)[0];
  const record = insertedRow
    ? recordFromRow(insertedRow)
    : await readByIdempotencyKey(input.operatorSubject, idempotencyKey);
  if (!record) {
    throw new StudioEngineError(
      "VERSION_CONFLICT",
      409,
      "The Wardrobe garment changed before official styling evidence was recorded.",
      "Fetch official evidence again for the current garment truth.",
    );
  }
  if (record.requestFingerprint !== requestFingerprint) {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      409,
      "That styling-evidence confirmation conflicts with an existing record.",
      "Resolve the exact official fetch before continuing.",
    );
  }
  return Object.freeze({ record, replayed: !insertedRow });
}

export async function readStudioAtelierFashionNovaAdvisory(input: Readonly<{
  operatorSubject: string;
  wardrobeItemId: string;
  wardrobeVersion: number;
  sourceBindingSha256: string;
  garmentTruthRevision: string;
  garmentTruthSourceHash: string;
}>): Promise<StudioAtelierFashionNovaAdvisoryRecord | null> {
  if (
    !z.string().uuid().safeParse(input.wardrobeItemId).success
    || !Number.isSafeInteger(input.wardrobeVersion)
    || input.wardrobeVersion < 1
    || !SHA256_PATTERN.test(input.sourceBindingSha256)
    || !z.string().trim().min(1).max(120).safeParse(input.garmentTruthRevision).success
    || !SHA256_PATTERN.test(input.garmentTruthSourceHash)
  ) return null;
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    select advisory.*
    from studio_atelier_styling_advisories advisory
    inner join studio_wardrobe_items wardrobe
      on wardrobe.id = advisory.wardrobe_item_id
    where advisory.operator_subject = ${input.operatorSubject}
      and advisory.wardrobe_item_id = ${input.wardrobeItemId}::uuid
      and advisory.wardrobe_version = ${input.wardrobeVersion}
      and advisory.source_binding_sha256 = ${input.sourceBindingSha256}
      and advisory.garment_truth_revision = ${input.garmentTruthRevision}
      and advisory.garment_truth_source_hash = ${input.garmentTruthSourceHash}
      and wardrobe.operator_subject = advisory.operator_subject
      and wardrobe.version = advisory.wardrobe_version
      and wardrobe.state in ('DRAFT', 'READY')
    order by advisory.created_at desc
    limit 1
  `);
  const row = resultRows(result)[0];
  return row ? recordFromRow(row) : null;
}

export function projectStudioAtelierFashionNovaCheck(
  record: StudioAtelierFashionNovaAdvisoryRecord,
) {
  const verified = advisoryBodySchema.parse(Object.fromEntries(
    Object.entries(record).filter(([key]) => ![
      "id",
      "advisorySha256",
      "idempotencyKey",
      "requestFingerprint",
    ].includes(key)),
  ));
  return Object.freeze(fashionNovaCheckSchema.parse({
    operationId: record.id,
    publisher: verified.publisher,
    officialUrl: verified.officialUrl,
    resolvedOfficialUrl: verified.resolvedOfficialUrl,
    pageTitle: verified.pageTitle,
    accessedOn: verified.accessedAt.slice(0, 10),
    matchedGarmentFacts: [...verified.matchedGarmentFacts],
    decision: verified.decision,
    ...(verified.noCloseMatchReason
      ? { noCloseMatchReason: verified.noCloseMatchReason }
      : {}),
    selectedStylingDirection: verified.selectedStylingDirection,
    authority: verified.authority,
    passedAsImageReference: false,
  }));
}

/** Exact stage-factory adapter; private fetched-evidence fields never escape. */
export async function resolveStudioAtelierFashionNovaCheck(input: Readonly<{
  operatorSubject: string;
  wardrobeItemId: string;
  wardrobeVersion: number;
  sourceBindingSha256: string;
  garmentTruthRevision: string;
  garmentTruthSourceHash: string;
}>) {
  const record = await readStudioAtelierFashionNovaAdvisory(input);
  return record ? projectStudioAtelierFashionNovaCheck(record) : null;
}
