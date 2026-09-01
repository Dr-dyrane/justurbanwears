import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getStudioDb } from "../../db/shop-postgres";
import { CURRENT_SHOP_DROP } from "../shop/current-drop";
import {
  STUDIO_ATELIER_SHOP_ADOPTION_REQUIRED_MIGRATION,
  STUDIO_ATELIER_SHOP_ADOPTION_SCHEMA_VERSION,
  STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER,
  studioAtelierShopMediaRoleSchema,
  type StudioAtelierShopAdoptionReceipt,
  type StudioAtelierShopMediaRole,
} from "../studio/atelier/publication-adoption-contracts";
import { StudioEngineError } from "../studio/engine/errors";
import type { StudioAtelierShopAdoptionCommitInput } from
  "./studio-atelier-publication-adoption";
import type { AtelierArtifactRow } from "./studio-atelier-repository";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

const storedReceiptSchema = z.object({
  schemaVersion: z.literal(STUDIO_ATELIER_SHOP_ADOPTION_SCHEMA_VERSION),
  receiptId: z.string().regex(SHA256_PATTERN),
  wardrobeItemId: z.string().uuid(),
  garmentId: z.string().trim().min(1).max(80),
  adoptionRevision: z.string().regex(SHA256_PATTERN),
  media: z.array(z.object({
    role: studioAtelierShopMediaRoleSchema,
    operationId: z.string().uuid(),
    projectionVersion: z.number().int().positive(),
    lockedArtifactSha256: z.string().regex(SHA256_PATTERN),
    mimeType: z.enum(["image/jpeg", "image/png"]),
    byteSize: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }).strict()).length(STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER.length),
}).strict();

export type StudioAtelierShopAdoptionTarget = Readonly<{
  wardrobeItemId: string;
  intakeId: string;
  operatorSubject: string;
  expectedVersion: number;
  title: string;
  description: string;
  sourceCategory: string;
  category: "Dresses" | "Rompers" | "Sets" | "Shirts" | "Knitwear" | "Skirts" | "Trousers";
  colour: string;
  sizeLabel: string;
  condition: string;
  price: number;
  tone: "coral" | "indigo" | "moss" | "ivory" | "cocoa" | "salmon";
  silhouette: "dress" | "romper" | "set" | "shirt" | "knit" | "skirt" | "trouser";
  slug: string;
}>;

export type StudioAtelierShopAdoptionPublicMedia = Readonly<{
  role: StudioAtelierShopMediaRole;
  src: string;
  operationId: string;
  projectionVersion: number;
  lockedArtifactId: string;
  lockedArtifactSha256: string;
  mimeType: "image/jpeg" | "image/png";
  byteSize: number;
  width: number;
  height: number;
}>;

export type StudioAtelierPublishedMediaAuthorization = Readonly<{
  receiptId: string;
  role: StudioAtelierShopMediaRole;
  operatorSubject: string;
  wardrobeItemId: string;
  garmentId: string;
  adoptionRevision: string;
  publicationId: string;
  publicationState: "PUBLISHED";
  publicationSourceRevision: string;
  operationId: string;
  projectionVersion: number;
  lockedArtifactId: string;
  lockedArtifactSha256: string;
  mimeType: "image/jpeg" | "image/png";
  byteSize: number;
  width: number;
  height: number;
  artifact: AtelierArtifactRow;
}>;

export type StudioAtelierShopAdoptionAtomicInput = Readonly<{
  commit: Readonly<Pick<
    StudioAtelierShopAdoptionCommitInput,
    "operatorSubject" | "idempotencyKey" | "expectedRevision" | "receipt" | "publicationAuthority" | "expectedLocks"
  >>;
  target: StudioAtelierShopAdoptionTarget;
  publicMedia: readonly StudioAtelierShopAdoptionPublicMedia[];
}>;

type QueryExecutor = (query: SQL) => Promise<unknown>;

export type StudioAtelierShopAdoptionSqlRepository = Readonly<{
  assertReady(): Promise<void>;
  findByIdempotencyKey(input: Readonly<{
    operatorSubject: string;
    idempotencyKey: string;
  }>): Promise<StudioAtelierShopAdoptionReceipt | null>;
  loadPublishableTarget(input: Readonly<{
    operatorSubject: string;
    wardrobeItemId: string;
  }>): Promise<StudioAtelierShopAdoptionTarget | null>;
  commitAtomically(input: StudioAtelierShopAdoptionAtomicInput): Promise<StudioAtelierShopAdoptionReceipt | null>;
  readPublishedMediaAuthorization(input: Readonly<{
    receiptId: string;
    role: StudioAtelierShopMediaRole;
  }>): Promise<StudioAtelierPublishedMediaAuthorization | null>;
}>;

function rowsOf(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  if (value && typeof value === "object" && "rows" in value) {
    const rows = (value as { rows?: unknown }).rows;
    return Array.isArray(rows) ? rows as Record<string, unknown>[] : [];
  }
  return [];
}

function migrationUnavailable(): StudioEngineError {
  return new StudioEngineError(
    "ENGINE_UNAVAILABLE",
    503,
    `Atelier Shop adoption requires ${STUDIO_ATELIER_SHOP_ADOPTION_REQUIRED_MIGRATION}.`,
    "Finish and verify the 0018/0019 migration lineage, then install the exact 0020 adoption receipt migration.",
  );
}

async function executeAtMigrationBoundary<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof StudioEngineError) throw error;
    throw migrationUnavailable();
  }
}

function parseStoredReceipt(value: unknown): StudioAtelierShopAdoptionReceipt {
  const result = storedReceiptSchema.safeParse(value);
  if (!result.success) throw migrationUnavailable();
  const roles = result.data.media.map((item) => item.role);
  if (roles.some((role, index) => role !== STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER[index])) {
    throw migrationUnavailable();
  }
  return Object.freeze({
    ...result.data,
    media: Object.freeze(result.data.media.map((item) => Object.freeze(item))),
  });
}

function categoryFor(value: string): StudioAtelierShopAdoptionTarget["category"] | null {
  const categories: Readonly<Record<string, StudioAtelierShopAdoptionTarget["category"]>> = {
    Dress: "Dresses",
    Romper: "Rompers",
    Set: "Sets",
    Shirt: "Shirts",
    Knitwear: "Knitwear",
    Skirt: "Skirts",
    Trousers: "Trousers",
  };
  return categories[value] ?? null;
}

function silhouetteFor(value: string): StudioAtelierShopAdoptionTarget["silhouette"] | null {
  const silhouettes: Readonly<Record<string, StudioAtelierShopAdoptionTarget["silhouette"]>> = {
    Dress: "dress",
    Romper: "romper",
    Set: "set",
    Shirt: "shirt",
    Knitwear: "knit",
    Skirt: "skirt",
    Trousers: "trouser",
  };
  return silhouettes[value] ?? null;
}

function toneFor(colour: string): StudioAtelierShopAdoptionTarget["tone"] {
  const value = colour.toLowerCase();
  if (/coral|orange|red/.test(value)) return "coral";
  if (/salmon|pink|magenta/.test(value)) return "salmon";
  if (/blue|indigo|navy|purple/.test(value)) return "indigo";
  if (/green|moss|sage/.test(value)) return "moss";
  if (/ivory|white|cream|beige/.test(value)) return "ivory";
  return "cocoa";
}

function adoptionSlug(wardrobeItemId: string): string {
  return `atelier-piece-${wardrobeItemId.replaceAll("-", "").toLowerCase()}`;
}

function targetFromRow(row: Record<string, unknown>): StudioAtelierShopAdoptionTarget | null {
  const wardrobeItemId = String(row.wardrobeItemId ?? "");
  const intakeId = String(row.intakeId ?? "");
  const operatorSubject = String(row.operatorSubject ?? "");
  const title = String(row.title ?? "").trim();
  const description = String(row.description ?? "").trim();
  const sourceCategory = String(row.sourceCategory ?? "").trim();
  const category = categoryFor(sourceCategory);
  const silhouette = silhouetteFor(sourceCategory);
  const colour = String(row.colour ?? "").trim();
  const sizeLabel = String(row.sizeLabel ?? "").trim();
  const condition = String(row.condition ?? "").trim();
  const expectedVersion = Number(row.expectedVersion);
  const price = Number(row.price);
  if (
    !/^[0-9a-f-]{36}$/i.test(wardrobeItemId)
    || !/^[0-9a-f-]{36}$/i.test(intakeId)
    || !operatorSubject
    || !title
    || !description
    || description.length > 2_000
    || !category
    || !silhouette
    || !colour
    || !sizeLabel
    || !condition
    || !Number.isSafeInteger(expectedVersion)
    || expectedVersion < 1
    || !Number.isSafeInteger(price)
    || price <= 0
  ) return null;
  return Object.freeze({
    wardrobeItemId,
    intakeId,
    operatorSubject,
    expectedVersion,
    title,
    description,
    sourceCategory,
    category,
    colour,
    sizeLabel,
    condition,
    price,
    tone: toneFor(colour),
    silhouette,
    slug: adoptionSlug(wardrobeItemId),
  });
}

function artifactFromRow(row: Record<string, unknown>): AtelierArtifactRow | null {
  const width = Number(row.artifactWidth);
  const height = Number(row.artifactHeight);
  const createdAt = new Date(String(row.artifactCreatedAt ?? ""));
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1 || Number.isNaN(createdAt.valueOf())) {
    return null;
  }
  return {
    id: String(row.artifactId),
    executionId: String(row.artifactExecutionId),
    ordinal: Number(row.artifactOrdinal),
    kind: String(row.artifactKind) as AtelierArtifactRow["kind"],
    role: String(row.artifactRole),
    state: String(row.artifactState) as AtelierArtifactRow["state"],
    blobPathname: String(row.artifactBlobPathname),
    blobUrl: String(row.artifactBlobUrl),
    mimeType: String(row.artifactMimeType),
    byteSize: Number(row.artifactByteSize),
    width,
    height,
    sha256: String(row.artifactSha256),
    metadata: row.artifactMetadata && typeof row.artifactMetadata === "object"
      ? row.artifactMetadata as Record<string, unknown>
      : {},
    quarantineReason: row.artifactQuarantineReason === null ? null : String(row.artifactQuarantineReason ?? ""),
    privacy: String(row.artifactPrivacy) as AtelierArtifactRow["privacy"],
    createdAt,
  };
}

function authorizationFromRow(row: Record<string, unknown>): StudioAtelierPublishedMediaAuthorization | null {
  const roleResult = studioAtelierShopMediaRoleSchema.safeParse(row.role);
  const artifact = artifactFromRow(row);
  const mimeType = row.mimeType;
  const publicationState = row.publicationState;
  if (
    !roleResult.success
    || !artifact
    || (mimeType !== "image/jpeg" && mimeType !== "image/png")
    || publicationState !== "PUBLISHED"
  ) return null;
  return Object.freeze({
    receiptId: String(row.receiptId),
    role: roleResult.data,
    operatorSubject: String(row.operatorSubject),
    wardrobeItemId: String(row.wardrobeItemId),
    garmentId: String(row.garmentId),
    adoptionRevision: String(row.adoptionRevision),
    publicationId: String(row.publicationId),
    publicationState,
    publicationSourceRevision: String(row.publicationSourceRevision),
    operationId: String(row.operationId),
    projectionVersion: Number(row.projectionVersion),
    lockedArtifactId: String(row.lockedArtifactId),
    lockedArtifactSha256: String(row.lockedArtifactSha256),
    mimeType,
    byteSize: Number(row.byteSize),
    width: Number(row.width),
    height: Number(row.height),
    artifact,
  });
}

export function createStudioAtelierShopAdoptionSqlRepository(
  overrides: Readonly<{ execute?: QueryExecutor }> = {},
): StudioAtelierShopAdoptionSqlRepository {
  const execute: QueryExecutor = overrides.execute ?? (async (query) =>
    (await getStudioDb()).execute(query)
  );

  return Object.freeze({
    async assertReady() {
      return executeAtMigrationBoundary(async () => {
        const row = rowsOf(await execute(sql`
          select
            to_regclass('public.studio_atelier_shop_adoption_receipts')::text as receipts,
            to_regclass('public.studio_atelier_shop_adoption_media')::text as media,
            (
              select count(*) = 16
              from information_schema.columns
              where table_schema = 'public'
                and table_name = 'studio_atelier_shop_adoption_receipts'
                and column_name in (
                  'receipt_id', 'operator_subject', 'idempotency_key', 'wardrobe_item_id',
                  'garment_id', 'adoption_revision', 'schema_version', 'state', 'receipt',
                  'publication_id', 'sku', 'slug', 'created_at', 'committed_at',
                  'request_fingerprint', 'media_count'
                )
            ) as "receiptShape",
            (
              select count(*) = 13
              from information_schema.columns
              where table_schema = 'public'
                and table_name = 'studio_atelier_shop_adoption_media'
                and column_name in (
                  'receipt_id', 'role', 'ordinal', 'operation_id', 'projection_version',
                  'locked_artifact_id', 'locked_artifact_sha256', 'public_src',
                  'mime_type', 'byte_size', 'width', 'height', 'created_at'
                )
            ) as "mediaShape",
            (
              select count(*) = 3
              from pg_indexes
              where schemaname = 'public'
                and tablename = 'studio_atelier_shop_adoption_receipts'
                and indexname in (
                  'studio_atelier_shop_adoption_receipts_pkey',
                  'studio_atelier_shop_adoption_receipts_operator_idempotency_unique',
                  'studio_atelier_shop_adoption_receipts_wardrobe_unique'
                )
            ) as "receiptIndexes",
            (
              select count(*) = 2
              from pg_indexes
              where schemaname = 'public'
                and tablename = 'studio_atelier_shop_adoption_media'
                and indexname in (
                  'studio_atelier_shop_adoption_media_pkey',
                  'studio_atelier_shop_adoption_media_receipt_ordinal_unique'
                )
            ) as "mediaIndexes"
        `))[0];
        if (
          row?.receipts !== "studio_atelier_shop_adoption_receipts"
          || row?.media !== "studio_atelier_shop_adoption_media"
          || row?.receiptShape !== true
          || row?.mediaShape !== true
          || row?.receiptIndexes !== true
          || row?.mediaIndexes !== true
        ) throw migrationUnavailable();
      });
    },

    async findByIdempotencyKey(input) {
      return executeAtMigrationBoundary(async () => {
        const rows = rowsOf(await execute(sql`
          select receipt
          from studio_atelier_shop_adoption_receipts
          where operator_subject = ${input.operatorSubject}
            and idempotency_key = ${input.idempotencyKey}
            and state = 'COMMITTED'
          limit 1
        `));
        return rows[0] ? parseStoredReceipt(rows[0].receipt) : null;
      });
    },

    async loadPublishableTarget(input) {
      return executeAtMigrationBoundary(async () => {
        const rows = rowsOf(await execute(sql`
          select item.id::text as "wardrobeItemId",
            item.intake_id::text as "intakeId",
            item.operator_subject as "operatorSubject",
            item.version as "expectedVersion",
            item.title,
            intake.facts->>'description' as description,
            item.category as "sourceCategory",
            item.colour,
            item.size_label as "sizeLabel",
            item.condition,
            item.price
          from studio_wardrobe_items item
          join studio_intakes intake
            on intake.id = item.intake_id
           and intake.operator_subject = item.operator_subject
          where item.id = ${input.wardrobeItemId}::uuid
            and item.operator_subject = ${input.operatorSubject}
            and intake.facts->>'title' = item.title
            and intake.facts->>'description' is not null
            and intake.facts->>'category' = item.category
            and intake.facts->>'colour' = item.colour
            and intake.facts->>'sizeLabel' = item.size_label
            and intake.facts->>'condition' = item.condition
            and intake.facts->>'price' = item.price::text
            and item.state in ('DRAFT', 'READY')
            and item.quantity = 1
            and not exists (
              select 1 from studio_catalogue_publications publication
              where publication.wardrobe_item_id = item.id
            )
          limit 1
        `));
        return rows[0] ? targetFromRow(rows[0]) : null;
      });
    },

    async commitAtomically(input) {
      return executeAtMigrationBoundary(async () => {
        const { commit, target, publicMedia } = input;
        const expectedLocks = JSON.stringify(commit.expectedLocks.map((lock, ordinal) => ({
          ...lock,
          ordinal,
        })));
        const mediaLedger = JSON.stringify(publicMedia.map((item, ordinal) => ({ ...item, ordinal })));
        const catalogueMedia = JSON.stringify(publicMedia.map((item) => ({
          slot: item.role,
          src: item.src,
          ...(["MODEL_FRONT", "MODEL_LEFT_PROFILE", "MODEL_REAR_THREE_QUARTER"].includes(item.role)
            ? { modelAnchorId: "lulu-v4" }
            : {}),
        })));
        const publicationMedia = JSON.stringify(publicMedia.map((item) => ({
          slot: item.role,
          src: item.src,
          sourceSha256: item.lockedArtifactSha256,
          sha256: item.lockedArtifactSha256,
          mimeType: item.mimeType,
          width: item.width,
          height: item.height,
          operationId: item.operationId,
          projectionVersion: item.projectionVersion,
        })));
        const facts = JSON.stringify({
          title: target.title,
          description: target.description,
          category: target.category,
          colour: target.colour,
          sizeLabel: target.sizeLabel,
          condition: target.condition,
          price: target.price,
          quantity: 1,
          atelierAdoptionRevision: commit.receipt.adoptionRevision,
        });
        const details = JSON.stringify([target.colour, target.sizeLabel, target.condition]);
        const receipt = JSON.stringify(commit.receipt);
        const result = await execute(sql`
          with piece_gate as materialized (
            select pg_advisory_xact_lock(hashtextextended(
              'juw:studio:atelier-adoption:' || ${commit.operatorSubject}
                || ':' || ${commit.receipt.wardrobeItemId},
              0
            )) as locked
          ), expected_locks as materialized (
            select expected.*
            from piece_gate cross join jsonb_to_recordset(${expectedLocks}::jsonb) as expected(
              ordinal integer,
              role text,
              "operationId" uuid,
              "expectedProjectionVersion" integer,
              "lockedArtifactId" uuid,
              "lockedArtifactSha256" text
            )
          ), current_locks as materialized (
            select expected.ordinal, expected.role, operation.id, projection.version,
              artifact.id as artifact_id
            from expected_locks expected
            join studio_atelier_operations operation
              on operation.id = expected."operationId"
             and operation.operator_subject = ${commit.operatorSubject}
             and operation.wardrobe_item_id = ${commit.receipt.wardrobeItemId}::uuid
             and operation.garment_id = ${commit.receipt.garmentId}
             and operation.state = 'COMPLETE'
             and (
               (expected.role = 'GARMENT_FRONT' and operation.view = '01' and operation.stage = 'GARMENT_01_FRONT')
               or (expected.role = 'GARMENT_BACK' and operation.view = '02' and operation.stage = 'GARMENT_02_BACK')
               or (expected.role = 'MANNEQUIN_FRONT' and operation.view = '03' and operation.stage = 'GARMENT_03_MANNEQUIN')
               or (expected.role = 'FABRIC_DETAIL' and operation.view = '04' and operation.stage = 'GARMENT_04_DETAIL')
               or (expected.role = 'MODEL_FRONT' and operation.view = '05' and operation.stage = 'ROOM_FINAL_05')
               or (expected.role = 'MODEL_LEFT_PROFILE' and operation.view = '06' and operation.stage = 'SIBLING_06')
               or (expected.role = 'MODEL_REAR_THREE_QUARTER' and operation.view = '07'
                 and operation.stage in ('SIBLING_07_CORE', 'SIBLING_07_RECOVERY'))
             )
            join studio_atelier_operation_projections projection
              on projection.operation_id = operation.id
             and projection.version = expected."expectedProjectionVersion"
             and projection.state = 'LOCKED'
             and projection.technical_decision = 'PASS'
             and projection.semantic_decision = 'PASS'
             and projection.user_decision = 'APPROVED'
             and projection.materialized_artifact_id = expected."lockedArtifactId"
             and projection.materialized_artifact_sha256 = expected."lockedArtifactSha256"
             and projection.locked_artifact_id = expected."lockedArtifactId"
             and projection.locked_artifact_sha256 = expected."lockedArtifactSha256"
            join studio_atelier_artifacts artifact
              on artifact.id = projection.locked_artifact_id
             and artifact.sha256 = projection.locked_artifact_sha256
             and artifact.state = 'STORED'
             and artifact.privacy = 'PRIVATE'
             and artifact.mime_type in ('image/jpeg', 'image/png')
            join studio_atelier_executions execution
              on execution.id = artifact.execution_id
             and execution.id = projection.materialized_execution_id
             and execution.state = 'COMPLETE'
            order by expected.ordinal asc, operation.id asc
            for update of projection
          ), verified_set as (
            select count(*) as lock_count, count(distinct role) as role_count
            from current_locks
            having count(*) = 7 and count(distinct role) = 7
          ), piece_source as materialized (
            select item.*
            from studio_wardrobe_items item
            join studio_intakes intake
              on intake.id = item.intake_id
             and intake.operator_subject = item.operator_subject
            cross join verified_set
            where item.id = ${target.wardrobeItemId}::uuid
              and item.intake_id = ${target.intakeId}::uuid
              and item.operator_subject = ${target.operatorSubject}
              and item.version = ${target.expectedVersion}
              and item.state in ('DRAFT', 'READY')
              and item.quantity = 1
              and item.title = ${target.title}
              and item.category = ${target.sourceCategory}
              and item.colour = ${target.colour}
              and item.size_label = ${target.sizeLabel}
              and item.condition = ${target.condition}
              and item.price = ${target.price}
              and intake.facts->>'title' = ${target.title}
              and intake.facts->>'description' = ${target.description}
              and intake.facts->>'category' = ${target.sourceCategory}
              and intake.facts->>'colour' = ${target.colour}
              and intake.facts->>'sizeLabel' = ${target.sizeLabel}
              and intake.facts->>'condition' = ${target.condition}
              and intake.facts->>'price' = ${String(target.price)}
              and not exists (
                select 1 from studio_catalogue_publications publication
                where publication.wardrobe_item_id = item.id
              )
            for update of item, intake
          ), claim as (
            insert into studio_atelier_shop_adoption_receipts (
              receipt_id, operator_subject, idempotency_key, wardrobe_item_id,
              garment_id, adoption_revision, schema_version, state, receipt,
              request_fingerprint, media_count, created_at
            )
            select ${commit.receipt.receiptId}, ${commit.operatorSubject}, ${commit.idempotencyKey},
              piece_source.id, ${commit.receipt.garmentId}, ${commit.receipt.adoptionRevision},
              ${STUDIO_ATELIER_SHOP_ADOPTION_SCHEMA_VERSION}, 'COMMITTING', ${receipt}::jsonb,
              ${commit.receipt.receiptId}, 7, now()
            from piece_source
            on conflict do nothing
            returning receipt_id
          ), public_identity as (
            select 'JUW-' || lpad(nextval('shop_dynamic_sku_sequence')::text, 3, '0') as sku
            from claim
          ), catalogue as (
            insert into shop_catalogue_items (
              sku, slug, name, category, price, tagged_size, fit, condition,
              colour, drop_label, tone, silhouette, note, story, details,
              measurements, model_anchor, media, created_at, updated_at
            )
            select public_identity.sku, ${target.slug}, ${target.title}, ${target.category}, ${target.price},
              ${target.sizeLabel}, 'Measurements confirmed before payment', ${target.condition},
              ${target.colour}, ${CURRENT_SHOP_DROP}, ${target.tone}, ${target.silhouette},
              ${target.description}, ${`${target.colour} · ${target.condition}`},
              ${details}::jsonb, '[]'::jsonb, '{"id":"lulu-v4"}'::jsonb,
              ${catalogueMedia}::jsonb, now(), now()
            from public_identity
            returning sku
          ), inventory as (
            insert into shop_inventory (
              sku, availability, on_hand, reserved, sold, returned, write_off, updated_at
            )
            select catalogue.sku, 'AVAILABLE', 1, 0, 0, 0, 0, now()
            from catalogue
            returning sku
          ), publication as (
            insert into studio_catalogue_publications (
              wardrobe_item_id, operator_subject, idempotency_key, source_revision,
              sku, slug, origin, state, facts, media, published_at, created_at
            )
            select piece_source.id, ${commit.operatorSubject}, ${commit.idempotencyKey},
              ${commit.receipt.adoptionRevision}, inventory.sku, ${target.slug},
              'STUDIO_NATIVE', 'PUBLISHED', ${facts}::jsonb, ${publicationMedia}::jsonb,
              now(), now()
            from piece_source, inventory
            returning *
          ), piece as (
            update studio_wardrobe_items item
            set state = 'READY', version = version + 1, updated_at = now()
            from publication
            where item.id = publication.wardrobe_item_id
            returning item.id
          ), revision as (
            insert into studio_garment_revisions (
              wardrobe_item_id, operator_subject, revision_number, version, state,
              base_source_revision, facts, media, idempotency_key,
              created_at, updated_at, published_at
            )
            select publication.wardrobe_item_id, publication.operator_subject, 1, 1, 'PUBLISHED',
              publication.source_revision, publication.facts, publication.media,
              publication.idempotency_key, now(), now(), now()
            from publication, piece
            returning id
          ), adoption_media as (
            insert into studio_atelier_shop_adoption_media (
              receipt_id, role, ordinal, operation_id, projection_version,
              locked_artifact_id, locked_artifact_sha256, public_src,
              mime_type, byte_size, width, height, created_at
            )
            select claim.receipt_id, media.role, media.ordinal, media."operationId",
              media."projectionVersion", media."lockedArtifactId", media."lockedArtifactSha256",
              media.src, media."mimeType", media."byteSize", media.width, media.height, now()
            from claim cross join jsonb_to_recordset(${mediaLedger}::jsonb) as media(
              role text, ordinal integer, src text, "operationId" uuid,
              "projectionVersion" integer, "lockedArtifactId" uuid,
              "lockedArtifactSha256" text, "mimeType" text,
              "byteSize" integer, width integer, height integer
            )
            returning receipt_id
          ), complete_media as (
            select receipt_id from adoption_media
            group by receipt_id having count(*) = 7
          ), finalized as (
            update studio_atelier_shop_adoption_receipts target_receipt
            set state = 'COMMITTED', publication_id = publication.id,
              sku = publication.sku, slug = publication.slug, committed_at = now()
            from publication, complete_media, revision
            where target_receipt.receipt_id = complete_media.receipt_id
              and target_receipt.receipt_id = ${commit.receipt.receiptId}
            returning target_receipt.receipt
          ), event as (
            insert into studio_garment_events (
              wardrobe_item_id, operator_subject, event_type, summary, details, occurred_at
            )
            select publication.wardrobe_item_id, publication.operator_subject,
              'PUBLISHED', 'Published seven LOCKED Atelier views to Shop',
              jsonb_build_object(
                'sku', publication.sku,
                'slug', publication.slug,
                'adoptionReceiptId', ${commit.receipt.receiptId},
                'adoptionRevision', ${commit.receipt.adoptionRevision},
                'mediaCount', 7
              ), now()
            from publication, finalized
          )
          select receipt from finalized
        `);
        const row = rowsOf(result)[0];
        return row ? parseStoredReceipt(row.receipt) : null;
      });
    },

    async readPublishedMediaAuthorization(input) {
      return executeAtMigrationBoundary(async () => {
        const rows = rowsOf(await execute(sql`
          select receipt.receipt_id as "receiptId",
            media.role,
            receipt.operator_subject as "operatorSubject",
            receipt.wardrobe_item_id::text as "wardrobeItemId",
            receipt.garment_id as "garmentId",
            receipt.adoption_revision as "adoptionRevision",
            publication.id::text as "publicationId",
            publication.state as "publicationState",
            publication.source_revision as "publicationSourceRevision",
            media.operation_id::text as "operationId",
            media.projection_version as "projectionVersion",
            media.locked_artifact_id::text as "lockedArtifactId",
            media.locked_artifact_sha256 as "lockedArtifactSha256",
            media.mime_type as "mimeType",
            media.byte_size as "byteSize",
            media.width,
            media.height,
            artifact.id::text as "artifactId",
            artifact.execution_id::text as "artifactExecutionId",
            artifact.ordinal as "artifactOrdinal",
            artifact.kind as "artifactKind",
            artifact.role as "artifactRole",
            artifact.state as "artifactState",
            artifact.blob_pathname as "artifactBlobPathname",
            artifact.blob_url as "artifactBlobUrl",
            artifact.mime_type as "artifactMimeType",
            artifact.byte_size as "artifactByteSize",
            artifact.width as "artifactWidth",
            artifact.height as "artifactHeight",
            artifact.sha256 as "artifactSha256",
            artifact.metadata as "artifactMetadata",
            artifact.quarantine_reason as "artifactQuarantineReason",
            artifact.privacy as "artifactPrivacy",
            artifact.created_at as "artifactCreatedAt"
          from studio_atelier_shop_adoption_receipts receipt
          join studio_atelier_shop_adoption_media media
            on media.receipt_id = receipt.receipt_id
          join studio_catalogue_publications publication
            on publication.id = receipt.publication_id
           and publication.wardrobe_item_id = receipt.wardrobe_item_id
           and publication.operator_subject = receipt.operator_subject
           and publication.source_revision = receipt.adoption_revision
           and publication.state = 'PUBLISHED'
           and exists (
             select 1 from jsonb_array_elements(publication.media) publication_media
             where publication_media->>'slot' = media.role
               and publication_media->>'src' = media.public_src
               and publication_media->>'sha256' = media.locked_artifact_sha256
           )
          join shop_catalogue_items catalogue
            on catalogue.sku = publication.sku
           and catalogue.slug = publication.slug
           and exists (
             select 1 from jsonb_array_elements(catalogue.media) catalogue_media
             where catalogue_media->>'slot' = media.role
               and catalogue_media->>'src' = media.public_src
           )
          join studio_atelier_operations operation
            on operation.id = media.operation_id
           and operation.operator_subject = receipt.operator_subject
           and operation.wardrobe_item_id = receipt.wardrobe_item_id
           and operation.garment_id = receipt.garment_id
           and operation.state = 'COMPLETE'
          join studio_atelier_operation_projections projection
            on projection.operation_id = operation.id
           and projection.version = media.projection_version
           and projection.state = 'LOCKED'
           and projection.technical_decision = 'PASS'
           and projection.semantic_decision = 'PASS'
           and projection.user_decision = 'APPROVED'
           and projection.locked_artifact_id = media.locked_artifact_id
           and projection.locked_artifact_sha256 = media.locked_artifact_sha256
          join studio_atelier_artifacts artifact
            on artifact.id = media.locked_artifact_id
           and artifact.sha256 = media.locked_artifact_sha256
           and artifact.mime_type = media.mime_type
           and artifact.byte_size = media.byte_size
           and artifact.width = media.width
           and artifact.height = media.height
           and artifact.state = 'STORED'
           and artifact.privacy = 'PRIVATE'
          where receipt.receipt_id = ${input.receiptId}
            and receipt.schema_version = ${STUDIO_ATELIER_SHOP_ADOPTION_SCHEMA_VERSION}
            and receipt.state = 'COMMITTED'
            and receipt.request_fingerprint = receipt.receipt_id
            and receipt.media_count = 7
            and media.role = ${input.role}
            and media.public_src = ${`/api/shop/atelier-media/${input.receiptId}/${input.role}`}
          limit 1
        `));
        return rows[0] ? authorizationFromRow(rows[0]) : null;
      });
    },
  });
}

export const studioAtelierShopAdoptionSqlRepository =
  createStudioAtelierShopAdoptionSqlRepository();
