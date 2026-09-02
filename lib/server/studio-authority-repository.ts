import { get } from "@vercel/blob";
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getStudioDb } from "../../db/shop-postgres";
import { getShopBlobToken, putShopBlob } from "./vercel-blob";
import { getShopOrderStore } from "../shop/server-order/runtime";
import { mapOperatorOrderRows, operatorOrdersReadQuery } from "../shop/server-order/postgres-store";
import {
  studioOrderHasDueReturnWork,
  studioOrderHasDueWork,
} from "../shop/order-presentation";
import type { ShopServerOrder } from "../shop/server-order/types";
import { createOrReuseStockModel, getOwnedModelProfile, listOwnedModelProfiles } from "./studio-intake-repository";
import {
  getPhysicalPiece,
  mapPhysicalPieceRows,
  physicalPiecesReadQuery,
  type PhysicalPiece,
} from "./studio-stocktake-repository";
import type { StudioOperator } from "./studio-operator";
import { verifyStudioImage } from "../studio/engine/assets";
import { StudioEngineError } from "../studio/engine/errors";
import { sha256 } from "../studio/engine/fingerprint";
import { APPROVED_PUBLIC_MODEL_PREVIEW } from "../studio/projections/approved-catalogue";
import { LULU_V4_AUTHORITY_REVISION } from "./studio-lulu-v4-authority";
import type {
  StudioAuthorityHold,
  StudioAuthorityMedia,
  StudioAuthorityModel,
  StudioAuthorityNotification,
  StudioAuthorityPiece,
  StudioAuthoritySnapshot,
} from "../studio/services/studio-authority-client";

type DatabaseRow = Record<string, unknown>;

const studioReadDialect = new PgDialect();

/**
 * Shared-schema contract for the authority consolidation. The integration
 * migration owns applying this DDL; runtime code never creates tables.
 */
export const STUDIO_AUTHORITY_REQUIRED_SQL = [
  `create table studio_manual_holds (
    id uuid primary key default gen_random_uuid(),
    operator_subject text not null,
    idempotency_key varchar(160) not null,
    sku varchar(40) not null references shop_catalogue_items(sku) on update cascade on delete restrict,
    customer_name text not null,
    contact text not null,
    reason text not null,
    status varchar(24) not null default 'ACTIVE',
    expires_at timestamptz not null,
    created_at timestamptz not null default now(),
    released_at timestamptz,
    constraint studio_manual_holds_status_known check (status in ('ACTIVE', 'RELEASED', 'EXPIRED')),
    constraint studio_manual_holds_release_pair check ((status = 'ACTIVE' and released_at is null) or (status <> 'ACTIVE' and released_at is not null)),
    constraint studio_manual_holds_expiry_after_create check (expires_at > created_at),
    constraint studio_manual_holds_operator_idempotency_unique unique (operator_subject, idempotency_key)
  )`,
  `create unique index studio_manual_holds_active_sku_unique on studio_manual_holds(sku) where status = 'ACTIVE'`,
  `create index studio_manual_holds_operator_created_idx on studio_manual_holds(operator_subject, created_at desc)`,
  `create table studio_notification_receipts (
    operator_subject text not null,
    notification_id varchar(240) not null,
    dismissed_at timestamptz not null default now(),
    primary key (operator_subject, notification_id)
  )`,
  `create table studio_piece_custody_commands (
    id uuid primary key default gen_random_uuid(),
    operator_subject text not null,
    idempotency_key varchar(160) not null,
    request_fingerprint varchar(64),
    piece_key varchar(96) not null,
    command varchar(24) not null,
    from_location_key varchar(40) not null,
    from_location_label text not null,
    to_location_key varchar(40) not null,
    to_location_label text not null,
    custody varchar(24) not null,
    availability varchar(24) not null,
    order_reference varchar(40),
    expected_version integer,
    resulting_version integer,
    reason text,
    created_at timestamptz not null default now(),
    constraint studio_piece_custody_command_known check (command in ('MOVE', 'CONFIRM')),
    constraint studio_piece_custody_command_custody_known check (custody in ('STUDIO')),
    constraint studio_piece_custody_command_availability_known check (availability in ('PRIVATE', 'AVAILABLE', 'RESERVED', 'SOLD', 'ARCHIVED')),
    constraint studio_piece_custody_command_location_known check (to_location_key in ('WARDROBE_RAIL', 'PACKING_SHELF', 'RETURN_INSPECTION')),
    constraint studio_piece_custody_command_fingerprint check (request_fingerprint is null or request_fingerprint ~ '^[0-9a-f]{64}$'),
    constraint studio_piece_custody_command_expected_version_nonnegative check (expected_version is null or expected_version >= 0),
    constraint studio_piece_custody_command_resulting_version_nonnegative check (resulting_version is null or resulting_version >= 0),
    constraint studio_piece_custody_command_receipt_pair check (
      (request_fingerprint is null and expected_version is null and resulting_version is null)
      or (request_fingerprint is not null and expected_version is not null and resulting_version is not null)
    ),
    constraint studio_piece_custody_command_version_step check (
      (expected_version is null and resulting_version is null)
      or (
        expected_version is not null
        and resulting_version is not null
        and (
          (command = 'MOVE' and resulting_version = expected_version + 1)
          or (command = 'CONFIRM' and resulting_version = expected_version)
        )
      )
    ),
    constraint studio_piece_custody_command_operator_idempotency_unique unique (operator_subject, idempotency_key)
  )`,
  `create index studio_piece_custody_commands_piece_idx on studio_piece_custody_commands(operator_subject, piece_key, created_at desc)`,
  `create table studio_piece_custody (
    operator_subject text not null,
    piece_key varchar(96) not null,
    location_key varchar(40) not null,
    location_label text not null,
    custody varchar(24) not null,
    availability varchar(24) not null,
    order_reference varchar(40),
    last_command_id uuid not null references studio_piece_custody_commands(id) on delete restrict,
    version integer not null default 1,
    updated_at timestamptz not null default now(),
    primary key (operator_subject, piece_key),
    constraint studio_piece_custody_custody_known check (custody in ('STUDIO')),
    constraint studio_piece_custody_availability_known check (availability in ('PRIVATE', 'AVAILABLE', 'RESERVED', 'SOLD', 'ARCHIVED')),
    constraint studio_piece_custody_location_known check (location_key in ('WARDROBE_RAIL', 'PACKING_SHELF', 'RETURN_INSPECTION')),
    constraint studio_piece_custody_version_positive check (version > 0)
  )`,
] as const;

export const createHoldSchema = z.object({
  contact: z.string().trim().min(3).max(160),
  customerName: z.string().trim().min(2).max(120),
  expiresAt: z.string().datetime(),
  idempotencyKey: z.string().trim().min(8).max(160),
  reason: z.string().trim().min(2).max(240),
  sku: z.string().trim().min(3).max(40),
});

const exactAuthorityRevisionSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/,
  "Expected an exact Studio authority revision.",
);

export const locationCommandSchema = z.discriminatedUnion("command", [
  z.object({
    command: z.literal("CONFIRM"),
    expectedAuthorityRevision: exactAuthorityRevisionSchema,
    expectedVersion: z.number().int().nonnegative(),
    idempotencyKey: z.string().trim().min(8).max(160),
    locationKey: z.enum(["WARDROBE_RAIL", "PACKING_SHELF", "RETURN_INSPECTION"]),
    note: z.string().trim().max(240).optional(),
    pieceKey: z.string().trim().min(1).max(96),
  }),
  z.object({
    command: z.literal("MOVE"),
    expectedAuthorityRevision: exactAuthorityRevisionSchema,
    expectedVersion: z.number().int().nonnegative(),
    idempotencyKey: z.string().trim().min(8).max(160),
    locationKey: z.enum(["WARDROBE_RAIL", "PACKING_SHELF", "RETURN_INSPECTION"]),
    note: z.string().trim().max(240).optional(),
    pieceKey: z.string().trim().min(1).max(96),
  }),
]);

export const createModelAuthoritySchema = z.object({
  authorityConfirmed: z.literal("true"),
  licenseUrl: z.string().trim().url().max(500),
  name: z.string().trim().min(2).max(80),
});

export const updateModelAuthoritySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("UPDATE"),
    name: z.string().trim().min(2).max(80),
    styling: z.object({
      direction: z.string().trim().max(240),
      hair: z.string().trim().max(120),
      makeup: z.string().trim().max(120),
    }),
  }),
  z.object({
    action: z.literal("ARCHIVE"),
    reason: z.string().trim().min(3).max(240),
  }),
]);

function iso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : String(value);
}

function nullable(value: unknown): string | null {
  return typeof value === "string" && value.length ? value : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export type StudioAuthorityWriteReadiness = {
  custody: boolean;
  holds: boolean;
  receipts: boolean;
};

type StudioAuthorityReadiness = StudioAuthorityWriteReadiness & {
  custodyReads: boolean;
  holdReads: boolean;
};

async function authorityTablesReady(): Promise<StudioAuthorityReadiness> {
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    select
      to_regclass('public.studio_manual_holds') is not null as hold_reads,
      to_regclass('public.studio_notification_receipts') is not null as receipts,
      to_regclass('public.studio_piece_custody') is not null
        and to_regclass('public.studio_piece_custody_commands') is not null as custody_reads,
      to_regclass('public.studio_manual_holds') is not null
        and to_regclass('public.studio_piece_custody') is not null
        and to_regclass('public.studio_piece_custody_commands') is not null
        and to_regproc('public.studio_create_manual_hold_v2') is not null
        and to_regproc('public.studio_release_manual_hold_v2') is not null
        and to_regproc('public.studio_expire_manual_holds_v2') is not null as holds,
      to_regclass('public.studio_piece_custody') is not null
        and to_regclass('public.studio_piece_custody_commands') is not null
        and to_regproc('public.studio_record_piece_move_v2') is not null
        and to_regproc('public.studio_record_piece_confirmation_v2') is not null as custody
  `);
  return {
    custody: result.rows[0]?.custody === true,
    custodyReads: result.rows[0]?.custody_reads === true,
    holdReads: result.rows[0]?.hold_reads === true,
    holds: result.rows[0]?.holds === true,
    receipts: result.rows[0]?.receipts === true,
  };
}

export async function getStudioAuthorityWriteReadiness(): Promise<StudioAuthorityWriteReadiness> {
  return authorityTablesReady();
}

function requireHoldTables(ready: StudioAuthorityWriteReadiness) {
  if (!ready.holds) {
    throw new StudioEngineError(
      "ENGINE_DISABLED",
      503,
      "Studio holds are not installed yet.",
      "Apply the Studio authority migration, then try again.",
    );
  }
}

function requireNotificationTables(ready: StudioAuthorityWriteReadiness) {
  if (!ready.receipts) {
    throw new StudioEngineError(
      "ENGINE_DISABLED",
      503,
      "Studio updates are not installed yet.",
      "Apply the Studio authority migration, then try again.",
    );
  }
}

function requireCustodyTables(ready: StudioAuthorityWriteReadiness) {
  if (!ready.custody) {
    throw new StudioEngineError(
      "ENGINE_DISABLED",
      503,
      "Piece locations are not installed yet.",
      "Apply the Studio authority migration, then try again.",
    );
  }
}

function mapHold(row: DatabaseRow): StudioAuthorityHold {
  return {
    id: String(row.id),
    sku: String(row.sku),
    customerName: String(row.customer_name),
    contact: String(row.contact),
    reason: String(row.reason),
    status: String(row.status) as StudioAuthorityHold["status"],
    expiresAt: iso(row.expires_at),
    createdAt: iso(row.created_at),
    releasedAt: row.released_at ? iso(row.released_at) : null,
  };
}

type PieceCustodyProjection = {
  pieceKey: string;
  locationKey: "WARDROBE_RAIL" | "PACKING_SHELF" | "RETURN_INSPECTION";
  locationLabel: string;
  custody: "STUDIO";
  availability: StudioAuthorityPiece["availability"];
  orderReference: string | null;
  version: number;
  updatedAt: string;
};

function mapPieceCustody(row: DatabaseRow): PieceCustodyProjection {
  return {
    pieceKey: String(row.piece_key),
    locationKey: String(row.location_key) as PieceCustodyProjection["locationKey"],
    locationLabel: String(row.location_label),
    custody: "STUDIO",
    availability: String(row.availability) as StudioAuthorityPiece["availability"],
    orderReference: nullable(row.order_reference),
    version: Number(row.version),
    updatedAt: iso(row.updated_at),
  };
}

function manualHoldsReadQuery(operatorSubject: string): SQL {
  return sql`
    select * from studio_manual_holds
    where operator_subject = ${operatorSubject}
    order by created_at desc
    limit 100
  `;
}

function pieceCustodyReadQuery(operatorSubject: string): SQL {
  return sql`
    select *
    from studio_piece_custody
    where operator_subject = ${operatorSubject}
  `;
}

async function repeatableReadRows(queries: readonly SQL[]): Promise<DatabaseRow[][]> {
  const database = await getStudioDb();
  const prepared = queries.map((query) => {
    const compiled = studioReadDialect.sqlToQuery(query);
    return database.$client.query(compiled.sql, compiled.params);
  });
  const results = await database.$client.transaction(prepared, {
    isolationLevel: "RepeatableRead",
    readOnly: true,
  });
  return results.map((rows) => rows as DatabaseRow[]);
}

type CoreAuthorityRead = {
  holds: StudioAuthorityHold[];
  physicalPieces: PhysicalPiece[];
  custody: PieceCustodyProjection[];
  orders: ShopServerOrder[];
};

async function readCoreAuthority(
  operator: StudioOperator,
  includeOrders = false,
): Promise<CoreAuthorityRead> {
  const ready = await authorityTablesReady();
  const emptyRows = sql`select null as unavailable where false`;
  const [holdRows, physicalRows, custodyRows, orderRows] = await repeatableReadRows([
    ready.holdReads ? manualHoldsReadQuery(operator.subject) : emptyRows,
    physicalPiecesReadQuery(operator.subject),
    ready.custodyReads ? pieceCustodyReadQuery(operator.subject) : emptyRows,
    includeOrders ? operatorOrdersReadQuery(100) : emptyRows,
  ]);
  return {
    holds: holdRows.map(mapHold),
    physicalPieces: mapPhysicalPieceRows(physicalRows),
    custody: custodyRows.map(mapPieceCustody),
    orders: mapOperatorOrderRows(orderRows),
  };
}

async function expireManualHolds(operatorSubject: string): Promise<void> {
  const ready = await authorityTablesReady();
  if (!ready.holdReads || !ready.holds) return;
  try {
    await (await getStudioDb()).execute(sql`
      select studio_expire_manual_holds_v2(${operatorSubject}) as expired_count
    `);
  } catch (error) {
    throw studioAuthorityPersistenceError(error);
  }
}

export async function listManualHolds(operator: StudioOperator): Promise<StudioAuthorityHold[]> {
  await expireManualHolds(operator.subject);
  return readManualHolds(operator);
}

async function readManualHolds(operator: StudioOperator): Promise<StudioAuthorityHold[]> {
  if (!(await authorityTablesReady()).holdReads) return [];
  const result = await (await getStudioDb()).execute<DatabaseRow>(manualHoldsReadQuery(operator.subject));
  return result.rows.map(mapHold);
}

export type ManualHoldCreateMutation = {
  hold: StudioAuthorityHold;
  outcome: "CREATED" | "REPLAYED";
};

export async function createManualHold(
  operator: StudioOperator,
  input: z.infer<typeof createHoldSchema>,
): Promise<ManualHoldCreateMutation> {
  requireHoldTables(await authorityTablesReady());
  try {
    const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
      select *
      from studio_create_manual_hold_v2(
        ${operator.subject},
        ${input.idempotencyKey},
        ${input.sku},
        ${input.customerName},
        ${input.contact},
        ${input.reason},
        ${input.expiresAt}::timestamptz
      )
    `);
    const row = result.rows[0];
    if (!row) {
      throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "The hold was not saved.", "Try again.");
    }
    const hold = mapHold(row);
    const outcome = String(row.outcome);
    if (
      (outcome !== "CREATED" && outcome !== "REPLAYED")
      || (outcome === "CREATED" && hold.status !== "ACTIVE")
    ) {
      throw new StudioEngineError(
        "ENGINE_UNAVAILABLE",
        503,
        "The hold receipt was invalid.",
        "Reload Operations before trying again.",
      );
    }
    return {
      hold,
      outcome,
    };
  } catch (error) {
    throw studioAuthorityPersistenceError(error);
  }
}

export type ManualHoldReleaseMutation = {
  hold: StudioAuthorityHold;
  outcome: "RELEASED" | "ALREADY_RELEASED" | "ALREADY_EXPIRED";
};

export async function releaseManualHold(
  operator: StudioOperator,
  holdId: string,
): Promise<ManualHoldReleaseMutation> {
  requireHoldTables(await authorityTablesReady());
  try {
    const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
      select *
      from studio_release_manual_hold_v2(${operator.subject}, ${holdId}::uuid)
    `);
    const row = result.rows[0];
    if (!row) {
      throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "The hold was not released.", "Try again.");
    }
    const hold = mapHold(row);
    const outcome = String(row.outcome);
    const validOutcome = outcome === "RELEASED"
      ? hold.status === "RELEASED"
      : outcome === "ALREADY_RELEASED"
        ? hold.status === "RELEASED"
        : outcome === "ALREADY_EXPIRED" && hold.status === "EXPIRED";
    if (!validOutcome) {
      throw new StudioEngineError(
        "ENGINE_UNAVAILABLE",
        503,
        "The hold release receipt was invalid.",
        "Reload Operations before trying again.",
      );
    }
    return {
      hold,
      outcome: outcome as ManualHoldReleaseMutation["outcome"],
    };
  } catch (error) {
    throw studioAuthorityPersistenceError(error);
  }
}

function mapModel(row: Awaited<ReturnType<typeof listOwnedModelProfiles>>[number]): StudioAuthorityModel {
  const canonicalLulu = row.kind === "LULU_V3" && row.authorityId === "lulu-v3";
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as StudioAuthorityModel["kind"],
    state: row.state as StudioAuthorityModel["state"],
    sourceAssetUrl: `/api/studio/models/${row.id}/asset`,
    previewAssetUrl: canonicalLulu ? APPROVED_PUBLIC_MODEL_PREVIEW.src : `/api/studio/models/${row.id}/asset`,
    previewWidth: canonicalLulu ? APPROVED_PUBLIC_MODEL_PREVIEW.width : row.sourceWidth ?? 1200,
    previewHeight: canonicalLulu ? APPROVED_PUBLIC_MODEL_PREVIEW.height : row.sourceHeight ?? 1500,
    authorityId: canonicalLulu ? "lulu-v4" : row.authorityId,
    authorityRevision: canonicalLulu ? LULU_V4_AUTHORITY_REVISION : row.updatedAt.toISOString(),
    licenseUrl: row.licenseUrl,
    authorityConfirmedAt: row.authorityConfirmedAt.toISOString(),
    authority: canonicalLulu ? {
      ...record(row.authority),
      canonVersion: "4.0.0",
      approvalState: "CURRENT_V4_OPERATIONAL_AUTHORITY",
      faceAuthority: "LOCKED",
      bodyAuthority: "LOCKED",
      rearAuthority: "LOCKED",
    } : record(row.authority),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listStudioModelAuthority(operator: StudioOperator): Promise<StudioAuthorityModel[]> {
  return (await listOwnedModelProfiles(operator.subject)).map(mapModel);
}

export async function createStudioModelAuthority(input: {
  operator: StudioOperator;
  name: string;
  licenseUrl: string;
  bytes: Uint8Array;
  declaredType?: string;
}): Promise<StudioAuthorityModel> {
  const verified = verifyStudioImage(input.bytes, input.declaredType);
  const hash = sha256(verified.bytes);
  const pathname = `studio/operators/${sha256(input.operator.subject).slice(0, 20)}/models/${hash}.${verified.extension}`;
  const existing = await get(pathname, { access: "private", token: getShopBlobToken("private"), useCache: false });
  if (!existing) {
    await putShopBlob("private", pathname, Buffer.from(verified.bytes), {
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: verified.mimeType,
      cacheControlMaxAge: 31_536_000,
    });
  }
  const profile = await createOrReuseStockModel({
    operatorSubject: input.operator.subject,
    name: input.name,
    authorityId: `authorized-stock:${sha256(`${input.operator.subject}:${hash}:${input.licenseUrl}`)}`,
    blobPathname: pathname,
    mimeType: verified.mimeType,
    byteSize: verified.bytes.byteLength,
    width: verified.width,
    height: verified.height,
    sha256: hash,
    licenseUrl: input.licenseUrl,
  });
  return mapModel(profile);
}

export async function updateStudioModelAuthority(
  operator: StudioOperator,
  modelId: string,
  input: z.infer<typeof updateModelAuthoritySchema>,
): Promise<StudioAuthorityModel> {
  const current = await getOwnedModelProfile(modelId, operator.subject);
  if (current.kind === "LULU_V3") {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "Lulu is the approved default.", "Add another model for different authority.");
  }
  const database = await getStudioDb();
  const result = input.action === "UPDATE"
    ? await database.execute<DatabaseRow>(sql`
        update studio_model_profiles
        set name = ${input.name},
            authority = authority || jsonb_build_object('styling', ${JSON.stringify(input.styling)}::jsonb),
            updated_at = now()
        where id = ${modelId}::uuid
          and operator_subject = ${operator.subject}
          and state = 'READY'
        returning *
      `)
    : await database.execute<DatabaseRow>(sql`
        update studio_model_profiles
        set state = 'ARCHIVED',
            authority = authority || jsonb_build_object(
              'revokedAt', now()::text,
              'revocationReason', ${input.reason}::text
            ),
            updated_at = now()
        where id = ${modelId}::uuid
          and operator_subject = ${operator.subject}
          and state = 'READY'
        returning *
      `);
  if (!result.rows[0]) {
    throw new StudioEngineError("VERSION_CONFLICT", 409, "That model changed in another window.", "Reload Models.");
  }
  const refreshed = (await listOwnedModelProfiles(operator.subject)).find((profile) => profile.id === modelId);
  if (!refreshed) throw new StudioEngineError("INTAKE_NOT_FOUND", 404, "That model was not found.", "Reload Models.");
  return mapModel(refreshed);
}

export async function readStudioModelAsset(operator: StudioOperator, modelId: string) {
  const profile = await getOwnedModelProfile(modelId, operator.subject);
  const asset = await get(profile.sourceBlobPathname, {
    access: "private",
    token: getShopBlobToken("private"),
    useCache: true,
  });
  if (!asset || asset.statusCode !== 200) {
    throw new StudioEngineError("INVALID_ASSET", 404, "That model image is unavailable.", "Archive the model or restore its source.");
  }
  return { stream: asset.stream, mimeType: profile.sourceMimeType, byteSize: profile.sourceByteSize };
}

export async function listStudioMediaAuthority(operator: StudioOperator): Promise<StudioAuthorityMedia[]> {
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    with wear as (
      select
        generation.id::text,
        wardrobe.id::text as wardrobe_item_id,
        wardrobe.title,
        publication.sku,
        generation.operation,
        generation.state::text,
        case when generation.output_asset_id is null then null
          else '/api/studio/wardrobe/' || wardrobe.id::text || '/assets/' || generation.output_asset_id::text
        end as output_url,
        model.name as model_name,
        generation.cost_usd,
        generation.created_at,
        generation.updated_at
      from studio_generations as generation
      inner join studio_intakes as intake on intake.id = generation.intake_id
      inner join studio_wardrobe_items as wardrobe on wardrobe.intake_id = intake.id
      left join studio_model_profiles as model on model.id = generation.model_profile_id
      left join studio_catalogue_publications as publication on publication.wardrobe_item_id = wardrobe.id
      where intake.operator_subject = ${operator.subject}
        and generation.operation in ('MANNEQUIN_FRONT', 'MODEL_TRY_ON', 'EDITORIAL_MODEL')
    ), completion as (
      select
        job.id::text,
        wardrobe.id::text as wardrobe_item_id,
        wardrobe.title,
        publication.sku,
        job.role as operation,
        job.state,
        case when job.state not in ('COMPLETE', 'APPROVED', 'REJECTED')
          or job.error_code = 'PAID_RESULT_POLICY_BLOCKED'
          or job.output_blob_pathname is null then null
          else '/api/studio/wardrobe/' || wardrobe.id::text || '/completions/' || job.id::text || '/asset'
        end as output_url,
        null::text as model_name,
        job.cost_usd,
        job.created_at,
        job.updated_at
      from studio_media_completion_jobs as job
      inner join studio_wardrobe_items as wardrobe
        on job.target_kind = 'WARDROBE_ITEM' and job.target_key = wardrobe.id::text
      left join studio_catalogue_publications as publication on publication.wardrobe_item_id = wardrobe.id
      where job.operator_subject = ${operator.subject}
    )
    select * from wear
    union all
    select * from completion
    order by created_at desc
    limit 250
  `);
  return result.rows.map((row) => ({
    id: String(row.id),
    wardrobeItemId: String(row.wardrobe_item_id),
    title: String(row.title),
    sku: nullable(row.sku),
    operation: String(row.operation) as StudioAuthorityMedia["operation"],
    state: String(row.state) as StudioAuthorityMedia["state"],
    outputUrl: nullable(row.output_url),
    modelName: nullable(row.model_name),
    costUsd: nullable(row.cost_usd),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }));
}

function pieceWithHold(
  piece: PhysicalPiece,
  activeBySku: Map<string, StudioAuthorityHold>,
  custodyByPiece: Map<string, PieceCustodyProjection>,
): StudioAuthorityPiece {
  const activeHold = piece.sku ? activeBySku.get(piece.sku) ?? null : null;
  const authorityUpdatedAt = Date.parse(piece.authorityUpdatedAt);
  const projected = custodyByPiece.get(piece.pieceKey);
  const projectionApplies = Boolean(
    projected
    && piece.expectedCustody === "STUDIO"
    && projected.availability === piece.availability
    && projected.orderReference === piece.orderReference
    && Date.parse(projected.updatedAt) >= authorityUpdatedAt,
  );
  const holdOwnsReservedPiece = Boolean(
    activeHold
    && piece.availability === "RESERVED"
    && piece.expectedCustody === "STUDIO",
  );
  const expectedLocationKey = holdOwnsReservedPiece
    ? "WARDROBE_RAIL"
    : projectionApplies ? projected!.locationKey : piece.expectedLocationKey;
  const expectedLocationLabel = holdOwnsReservedPiece
    ? "Wardrobe rail"
    : projectionApplies ? projected!.locationLabel : piece.expectedLocationLabel;
  const expectedCustody = projectionApplies ? projected!.custody : piece.expectedCustody;
  const observation = piece.latestObservation;
  const observationApplies = Boolean(
    observation
    && observation.orderReference === piece.orderReference
    && Date.parse(observation.occurredAt) >= authorityUpdatedAt,
  );
  const applicableObservation = observationApplies ? observation : null;
  const projectionIsNewest = Boolean(
    projectionApplies
    && projected
    && (!observation || Date.parse(projected.updatedAt) > Date.parse(observation.occurredAt)),
  );
  const observedLocationKey = projectionIsNewest
    ? projected!.locationKey
    : applicableObservation?.observedLocationKey ?? null;
  const observedLocationLabel = projectionIsNewest
    ? projected!.locationLabel
    : applicableObservation?.observedLocationLabel ?? null;
  const observedAt = projectionIsNewest ? projected!.updatedAt : applicableObservation?.occurredAt ?? null;
  const authorityInconsistent = Boolean(activeHold && piece.availability !== "RESERVED");
  return {
    pieceKey: piece.pieceKey,
    wardrobeItemId: piece.wardrobeItemId,
    sku: piece.sku,
    title: piece.title,
    description: piece.description ?? null,
    category: piece.category,
    colour: piece.colour,
    condition: piece.condition,
    sizeLabel: piece.sizeLabel,
    imageSrc: piece.imageSrc,
    availability: piece.availability,
    authorityUpdatedAt: piece.authorityUpdatedAt,
    authorityRevision: piece.authorityRevision,
    locationVersion: projected?.version ?? 0,
    expectedLocationKey,
    expectedLocationLabel,
    expectedCustody,
    orderReference: piece.orderReference,
    observedLocationKey,
    observedLocationLabel,
    observedAt,
    hasLocationMismatch: authorityInconsistent || Boolean(!projectionIsNewest && applicableObservation && (
      expectedCustody !== "STUDIO"
      || applicableObservation.observedLocationKey !== expectedLocationKey
    )),
    activeHold,
  };
}

function studioAuthorityPersistenceError(error: unknown): StudioEngineError {
  if (error instanceof StudioEngineError) return error;
  const message = error instanceof Error ? error.message : "";
  if (message.includes("STUDIO_IDEMPOTENCY_MISMATCH")) {
    return new StudioEngineError("INVALID_REQUEST", 409, "That request key was already used.", "Start a new action.");
  }
  if (message.includes("STUDIO_LOCATION_VERSION_CONFLICT")) {
    return new StudioEngineError(
      "VERSION_CONFLICT",
      409,
      "This piece location changed before the action was saved.",
      "Reload Operations and review the current location.",
    );
  }
  if (message.includes("STUDIO_CUSTODY_CONFLICT")) {
    return new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      "This piece is not physically reconciled for that change.",
      "Move it to the required Studio location and confirm it in hand.",
    );
  }
  if (message.includes("STUDIO_PIECE_UNAVAILABLE")) {
    return new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      "That piece is no longer available.",
      "Open the piece to see its current order or hold.",
    );
  }
  if (message.includes("STUDIO_NOT_FOUND")) {
    return new StudioEngineError("INTAKE_NOT_FOUND", 404, "That hold was not found.", "Reload Operations.");
  }
  if (message.includes("STUDIO_INVALID_REQUEST")) {
    return new StudioEngineError("INVALID_REQUEST", 400, "Studio rejected that action.", "Review the fields and try again.");
  }
  if (message.includes("STUDIO_INVALID_TRANSITION")) {
    return new StudioEngineError("INVALID_TRANSITION", 409, "That location is already current.", "Confirm it in hand instead.");
  }
  return new StudioEngineError(
    "ENGINE_UNAVAILABLE",
    503,
    "Studio could not save that authority change.",
    "Try again after refreshing Operations.",
  );
}

export function studioPieceIsOrderable(piece: StudioAuthorityPiece): boolean {
  return piece.availability === "AVAILABLE"
    && Boolean(piece.sku)
    && piece.expectedCustody === "STUDIO"
    && piece.expectedLocationKey === "WARDROBE_RAIL"
    && Boolean(piece.observedAt)
    && piece.observedLocationKey === "WARDROBE_RAIL"
    && !piece.hasLocationMismatch
    && !piece.activeHold;
}

export async function listStudioOrderablePieceSkus(operator: StudioOperator): Promise<Set<string>> {
  // Lazy expiry mutates both holds and commerce inventory. Finish it before
  // reading the projection so one response cannot mix post-expiry holds with
  // pre-expiry inventory.
  await expireManualHolds(operator.subject);
  const { holds, physicalPieces, custody } = await readCoreAuthority(operator);
  const activeBySku = new Map(holds.filter((hold) => hold.status === "ACTIVE").map((hold) => [hold.sku, hold]));
  const custodyByPiece = new Map(custody.map((entry) => [entry.pieceKey, entry]));
  return new Set(physicalPieces
    .map((piece) => pieceWithHold(piece, activeBySku, custodyByPiece))
    .filter(studioPieceIsOrderable)
    .flatMap((piece) => piece.sku ? [piece.sku] : []));
}

function notificationForOrder(order: ShopServerOrder): StudioAuthorityNotification | null {
  const returnWork = studioOrderHasDueReturnWork(order);
  if (returnWork) return {
    id: `return:${order.reference}:v${order.version}:${order.return!.status}:${order.return!.refundStatus}`,
    kind: "RETURN",
    tone: "attention",
    title: `Return waiting · ${order.reference}`,
    detail: `${order.lines[0]?.name ?? "Order"} needs its next return decision.`,
    href: `/studio/orders/${order.reference}#studio-order-next-action`,
    actionLabel: "Review return",
    createdAt: order.return!.requestedAt,
  };
  if (!studioOrderHasDueWork(order)) return null;
  return {
    id: `order:${order.reference}:v${order.version}:${order.paymentReviewStatus}:${order.fundsConfirmationStatus}:${order.fulfillmentStatus}`,
    kind: "ORDER",
    tone: order.paymentReviewStatus === "EVIDENCE_RECEIVED" ? "attention" : "neutral",
    title: `Order waiting · ${order.reference}`,
    detail: `${order.lines[0]?.name ?? "Order"} has a next action due.`,
    href: `/studio/orders/${order.reference}#studio-order-next-action`,
    actionLabel: "Open order",
    createdAt: order.savedAt,
  };
}

function deriveNotifications(input: {
  holds: StudioAuthorityHold[];
  media: StudioAuthorityMedia[];
  models: StudioAuthorityModel[];
  orders: ShopServerOrder[];
  pieces: StudioAuthorityPiece[];
}): StudioAuthorityNotification[] {
  const notifications = input.orders.flatMap((order) => {
    const notification = notificationForOrder(order);
    return notification ? [notification] : [];
  });
  for (const piece of input.pieces) {
    if (piece.hasLocationMismatch) notifications.push({
      id: `location:${piece.pieceKey}:${piece.observedAt}`,
      kind: "LOCATION",
      tone: "critical",
      title: `Location differs · ${piece.title}`,
      detail: `Expected ${piece.expectedLocationLabel}; last seen ${piece.observedLocationLabel}.`,
      href: `/studio/operations?view=inventory&piece=${encodeURIComponent(piece.pieceKey)}`,
      actionLabel: "Resolve",
      createdAt: piece.observedAt ?? new Date(0).toISOString(),
    });
    if (piece.availability === "PRIVATE") notifications.push({
      id: `wardrobe:${piece.pieceKey}:private`,
      kind: "WARDROBE",
      tone: "neutral",
      title: `Finish ${piece.title}`,
      detail: "This piece is still private.",
      href: `/studio/wardrobe/${encodeURIComponent(piece.wardrobeItemId ?? piece.pieceKey)}`,
      actionLabel: "Open piece",
      createdAt: new Date(0).toISOString(),
    });
  }
  const now = Date.now();
  for (const hold of input.holds.filter((candidate) => candidate.status === "ACTIVE")) {
    const expiresIn = Date.parse(hold.expiresAt) - now;
    if (expiresIn <= 24 * 60 * 60 * 1000) {
      const expiryBlocked = expiresIn <= 0;
      notifications.push({
        id: `hold:${hold.id}:${hold.expiresAt}`,
        kind: "HOLD",
        tone: expiryBlocked ? "critical" : "attention",
        title: expiryBlocked ? `Hold needs expiry review · ${hold.sku}` : `Hold expires soon · ${hold.sku}`,
        detail: expiryBlocked
          ? `${hold.customerName} · Studio kept this piece reserved because the safe expiry preflight did not complete.`
          : `${hold.customerName} · ${hold.contact}`,
        href: `/studio/operations?view=holds&hold=${hold.id}`,
        actionLabel: expiryBlocked ? "Review blocker" : "Review hold",
        createdAt: hold.createdAt,
      });
    }
  }
  for (const media of input.media.filter((item) => item.state === "COMPLETE" || item.state === "FAILED")) {
    notifications.push({
      id: `media:${media.id}:${media.state}`,
      kind: "MEDIA",
      tone: media.state === "FAILED" ? "attention" : "neutral",
      title: media.state === "FAILED" ? `Media needs retry · ${media.title}` : `Media ready · ${media.title}`,
      detail: media.operation.toLowerCase().replaceAll("_", " "),
      href: `/studio/media/${media.id}`,
      actionLabel: media.state === "FAILED" ? "Review" : "Decide",
      createdAt: media.updatedAt,
    });
  }
  return notifications.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

async function dismissedNotificationIds(operator: StudioOperator): Promise<Set<string>> {
  if (!(await authorityTablesReady()).receipts) return new Set();
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    select notification_id
    from studio_notification_receipts
    where operator_subject = ${operator.actorSubject}
  `);
  return new Set(result.rows.map((row) => String(row.notification_id)));
}

export async function dismissNotification(operator: StudioOperator, notificationId: string): Promise<void> {
  requireNotificationTables(await authorityTablesReady());
  if (!notificationId || notificationId.length > 240) {
    throw new StudioEngineError("INVALID_REQUEST", 400, "That update is invalid.", "Reload Updates.");
  }
  await (await getStudioDb()).execute(sql`
    insert into studio_notification_receipts (operator_subject, notification_id, dismissed_at)
    values (${operator.actorSubject}, ${notificationId}, now())
    on conflict (operator_subject, notification_id) do update set dismissed_at = excluded.dismissed_at
  `);
}

export async function recordPieceLocation(
  operator: StudioOperator,
  input: z.infer<typeof locationCommandSchema>,
) {
  const database = await getStudioDb();
  requireCustodyTables(await authorityTablesReady());
  const requestFingerprint = sha256(JSON.stringify({
    command: input.command,
    contract: "juw.studio.location-command.v1",
    expectedAuthorityRevision: input.expectedAuthorityRevision,
    expectedVersion: input.expectedVersion,
    locationKey: input.locationKey,
    note: input.note ?? null,
    pieceKey: input.pieceKey,
    source: "OPERATIONS",
  }));
  const replay = await database.execute<DatabaseRow>(sql`
    select
      receipt.*,
      observation.id as observation_id,
      observation.expected_location_label as observation_expected_location_label,
      observation.observed_location_label as observation_observed_location_label,
      observation.result as observation_result,
      observation.order_reference as observation_order_reference
    from studio_piece_custody_commands as receipt
    left join studio_physical_observations as observation
      on observation.operator_subject = receipt.operator_subject
      and observation.idempotency_key = receipt.idempotency_key
    where receipt.operator_subject = ${operator.subject}
      and receipt.idempotency_key = ${input.idempotencyKey}
    limit 1
  `);
  const replayRow = replay.rows[0];
  if (replayRow) {
    if (
      String(replayRow.request_fingerprint) !== requestFingerprint
      || String(replayRow.command) !== input.command
    ) {
      throw new StudioEngineError(
        "INVALID_REQUEST",
        409,
        "That location request key was already used.",
        "Start a new location action.",
      );
    }
    if (input.command === "MOVE") {
      return {
        command: "MOVE" as const,
        expectedLocationLabel: String(replayRow.to_location_label),
        locationLabel: String(replayRow.to_location_label),
        locationVersion: Number(replayRow.resulting_version),
        mismatch: false,
        orderReference: nullable(replayRow.order_reference),
        previousLocationLabel: String(replayRow.from_location_label),
      };
    }
    if (!replayRow.observation_id) {
      throw new StudioEngineError(
        "ENGINE_UNAVAILABLE",
        503,
        "The location check receipt is incomplete.",
        "Reload Operations before trying again.",
      );
    }
    return {
      command: "CONFIRM" as const,
      expectedLocationLabel: String(replayRow.observation_expected_location_label),
      locationLabel: String(replayRow.observation_observed_location_label),
      locationVersion: Number(replayRow.resulting_version),
      mismatch: String(replayRow.observation_result) === "MISMATCH",
      orderReference: nullable(replayRow.observation_order_reference),
      previousLocationLabel: String(replayRow.observation_expected_location_label),
    };
  }

  const piece = await getPhysicalPiece(operator, input.pieceKey);
  try {
    const result = input.command === "MOVE"
      ? await database.execute<DatabaseRow>(sql`
          select *
          from studio_record_piece_move_v2(
            ${operator.subject},
            ${input.idempotencyKey},
            ${requestFingerprint},
            ${piece.pieceKey},
            ${piece.wardrobeItemId ?? null}::uuid,
            ${piece.sku},
            ${piece.availability},
            ${piece.orderReference},
            ${input.expectedVersion},
            ${input.expectedAuthorityRevision},
            ${input.locationKey},
            ${input.note || null}
          )
        `)
      : await database.execute<DatabaseRow>(sql`
          select *
          from studio_record_piece_confirmation_v2(
            ${operator.subject},
            ${input.idempotencyKey},
            ${requestFingerprint},
            'OPERATIONS',
            ${piece.pieceKey},
            ${piece.wardrobeItemId ?? null}::uuid,
            ${piece.sku},
            ${input.expectedVersion},
            ${input.expectedAuthorityRevision},
            ${input.locationKey},
            ${input.note || null},
            null::uuid,
            null::integer
          )
        `);
    const row = result.rows[0];
    if (!row) {
      throw new StudioEngineError(
        "ENGINE_UNAVAILABLE",
        503,
        input.command === "MOVE" ? "The move was not saved." : "The location check was not saved.",
        "Try again.",
      );
    }
    if (input.command === "MOVE") {
      return {
        command: "MOVE" as const,
        expectedLocationLabel: String(row.to_location_label),
        locationLabel: String(row.to_location_label),
        locationVersion: Number(row.resulting_version),
        mismatch: false,
        orderReference: nullable(row.order_reference),
        previousLocationLabel: String(row.from_location_label),
      };
    }
    return {
      command: "CONFIRM" as const,
      expectedLocationLabel: String(row.expected_location_label),
      locationLabel: String(row.observed_location_label),
      locationVersion: Number(row.resulting_version),
      mismatch: String(row.result) === "MISMATCH",
      orderReference: nullable(row.order_reference),
      previousLocationLabel: String(row.expected_location_label),
    };
  } catch (error) {
    throw studioAuthorityPersistenceError(error);
  }
}

export async function getStudioAuthority(operator: StudioOperator): Promise<StudioAuthoritySnapshot> {
  // Both expiry paths mutate commerce inventory. Complete them before opening
  // one repeatable-read snapshot for orders, holds, inventory and custody.
  await getShopOrderStore().expireReservations(new Date(), 100);
  await expireManualHolds(operator.subject);
  const [core, models, media] = await Promise.all([
    readCoreAuthority(operator, true),
    listStudioModelAuthority(operator),
    listStudioMediaAuthority(operator),
  ]);
  const { holds, physicalPieces, custody, orders } = core;
  const activeBySku = new Map(holds.filter((hold) => hold.status === "ACTIVE").map((hold) => [hold.sku, hold]));
  const custodyByPiece = new Map(custody.map((entry) => [entry.pieceKey, entry]));
  const pieces = physicalPieces.map((piece) => pieceWithHold(piece, activeBySku, custodyByPiece));
  const dismissed = await dismissedNotificationIds(operator);
  const notifications = deriveNotifications({ holds, media, models, orders, pieces })
    .filter((notification) => !dismissed.has(notification.id));
  return { pieces, orders, holds, models, media, notifications, generatedAt: new Date().toISOString() };
}
