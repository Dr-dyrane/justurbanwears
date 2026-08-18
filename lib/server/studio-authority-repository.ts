import { get } from "@vercel/blob";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getStudioDb } from "../../db/shop-postgres";
import { getShopBlobToken, putShopBlob } from "./vercel-blob";
import { getShopOrderService } from "../shop/server-order/runtime";
import type { ShopOperatorActor, ShopServerOrder } from "../shop/server-order/types";
import { createOrReuseStockModel, getOwnedModelProfile, listOwnedModelProfiles } from "./studio-intake-repository";
import { getPhysicalPiece, listPhysicalPieces } from "./studio-stocktake-repository";
import type { StudioOperator } from "./studio-operator";
import { verifyStudioImage } from "../studio/engine/assets";
import { StudioEngineError } from "../studio/engine/errors";
import { sha256 } from "../studio/engine/fingerprint";
import type {
  StudioAuthorityHold,
  StudioAuthorityMedia,
  StudioAuthorityModel,
  StudioAuthorityNotification,
  StudioAuthorityPiece,
  StudioAuthoritySnapshot,
} from "../studio/services/studio-authority-client";

type DatabaseRow = Record<string, unknown>;

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
    piece_key varchar(96) not null,
    command varchar(24) not null,
    from_location_key varchar(40) not null,
    from_location_label text not null,
    to_location_key varchar(40) not null,
    to_location_label text not null,
    custody varchar(24) not null,
    availability varchar(24) not null,
    order_reference varchar(40),
    reason text,
    created_at timestamptz not null default now(),
    constraint studio_piece_custody_command_known check (command in ('MOVE')),
    constraint studio_piece_custody_command_custody_known check (custody in ('STUDIO')),
    constraint studio_piece_custody_command_availability_known check (availability in ('PRIVATE', 'AVAILABLE', 'RESERVED', 'SOLD', 'ARCHIVED')),
    constraint studio_piece_custody_command_location_known check (to_location_key in ('WARDROBE_RAIL', 'PACKING_SHELF', 'RETURN_INSPECTION')),
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
}).superRefine((value, context) => {
  const expiry = Date.parse(value.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) {
    context.addIssue({ code: "custom", message: "Choose a future expiry.", path: ["expiresAt"] });
  }
});

export const locationCommandSchema = z.discriminatedUnion("command", [
  z.object({
    command: z.literal("CONFIRM"),
    idempotencyKey: z.string().trim().min(8).max(160),
    locationKey: z.enum(["WARDROBE_RAIL", "PACKING_SHELF", "RETURN_INSPECTION"]),
    note: z.string().trim().max(240).optional(),
    pieceKey: z.string().trim().min(1).max(96),
  }),
  z.object({
    command: z.literal("MOVE"),
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

function operatorActor(operator: StudioOperator): ShopOperatorActor {
  return {
    kind: "OPERATOR",
    subject: operator.subject,
    email: operator.email,
    displayName: operator.displayName,
    role: operator.role,
  };
}

type AuthorityTableState = {
  custody: boolean;
  holds: boolean;
  receipts: boolean;
};

async function authorityTablesReady(): Promise<AuthorityTableState> {
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    select
      to_regclass('public.studio_manual_holds') is not null as holds,
      to_regclass('public.studio_notification_receipts') is not null as receipts,
      to_regclass('public.studio_piece_custody') is not null
        and to_regclass('public.studio_piece_custody_commands') is not null as custody
  `);
  return {
    custody: result.rows[0]?.custody === true,
    holds: result.rows[0]?.holds === true,
    receipts: result.rows[0]?.receipts === true,
  };
}

function requireHoldTables(ready: AuthorityTableState) {
  if (!ready.holds) {
    throw new StudioEngineError(
      "ENGINE_DISABLED",
      503,
      "Studio holds are not installed yet.",
      "Apply the Studio authority migration, then try again.",
    );
  }
}

function requireNotificationTables(ready: AuthorityTableState) {
  if (!ready.receipts) {
    throw new StudioEngineError(
      "ENGINE_DISABLED",
      503,
      "Studio updates are not installed yet.",
      "Apply the Studio authority migration, then try again.",
    );
  }
}

function requireCustodyTables(ready: AuthorityTableState) {
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

function studioLocationLabel(locationKey: PieceCustodyProjection["locationKey"]): string {
  switch (locationKey) {
    case "PACKING_SHELF": return "Packing shelf";
    case "RETURN_INSPECTION": return "Return inspection";
    default: return "Wardrobe rail";
  }
}

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

async function listPieceCustody(operator: StudioOperator): Promise<PieceCustodyProjection[]> {
  if (!(await authorityTablesReady()).custody) return [];
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    select *
    from studio_piece_custody
    where operator_subject = ${operator.subject}
  `);
  return result.rows.map(mapPieceCustody);
}

async function expireManualHolds(operatorSubject: string): Promise<void> {
  if (!(await authorityTablesReady()).holds) return;
  await (await getStudioDb()).execute(sql`
    with expired as (
      update studio_manual_holds
      set status = 'EXPIRED', released_at = now()
      where operator_subject = ${operatorSubject}
        and status = 'ACTIVE'
        and expires_at <= now()
      returning sku
    )
    update shop_inventory as inventory
    set availability = 'AVAILABLE', reserved = 0, updated_at = now()
    where inventory.sku in (select sku from expired)
      and inventory.availability = 'RESERVED'
      and not exists (
        select 1
        from shop_order_items as items
        inner join shop_orders as orders on orders.id = items.order_id
        where items.sku = inventory.sku and orders.lifecycle_status = 'ACTIVE'
      )
  `);
}

export async function listManualHolds(operator: StudioOperator): Promise<StudioAuthorityHold[]> {
  if (!(await authorityTablesReady()).holds) return [];
  await expireManualHolds(operator.subject);
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    select * from studio_manual_holds
    where operator_subject = ${operator.subject}
    order by created_at desc
    limit 100
  `);
  return result.rows.map(mapHold);
}

export async function createManualHold(
  operator: StudioOperator,
  input: z.infer<typeof createHoldSchema>,
): Promise<StudioAuthorityHold> {
  requireHoldTables(await authorityTablesReady());
  await expireManualHolds(operator.subject);
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    with existing as (
      select * from studio_manual_holds
      where operator_subject = ${operator.subject}
        and idempotency_key = ${input.idempotencyKey}
    ), locked_inventory as (
      select * from shop_inventory
      where sku = ${input.sku}
      for update
    ), inserted as (
      insert into studio_manual_holds (
        operator_subject, idempotency_key, sku, customer_name,
        contact, reason, status, expires_at, created_at
      )
      select
        ${operator.subject}, ${input.idempotencyKey}, ${input.sku}, ${input.customerName},
        ${input.contact}, ${input.reason}, 'ACTIVE', ${input.expiresAt}::timestamptz, now()
      from locked_inventory
      where availability = 'AVAILABLE' and reserved = 0 and on_hand = 1
        and not exists (select 1 from existing)
      on conflict do nothing
      returning *
    ), reserved as (
      update shop_inventory as inventory
      set availability = 'RESERVED', reserved = 1, updated_at = now()
      where inventory.sku = ${input.sku}
        and exists (select 1 from inserted)
      returning inventory.sku
    )
    select * from inserted where exists (select 1 from reserved)
    union all
    select * from existing
    limit 1
  `);
  const row = result.rows[0];
  if (!row) {
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      "That piece is no longer available.",
      "Open the piece to see its current order or hold.",
    );
  }
  if (
    String(row.sku) !== input.sku
    || String(row.customer_name) !== input.customerName
    || String(row.contact) !== input.contact
    || String(row.reason) !== input.reason
    || iso(row.expires_at) !== new Date(input.expiresAt).toISOString()
  ) {
    throw new StudioEngineError("INVALID_REQUEST", 409, "That hold request was already used.", "Start a new hold.");
  }
  return mapHold(row);
}

export async function releaseManualHold(operator: StudioOperator, holdId: string): Promise<StudioAuthorityHold> {
  requireHoldTables(await authorityTablesReady());
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    with locked as (
      select * from studio_manual_holds
      where id = ${holdId}::uuid and operator_subject = ${operator.subject}
      for update
    ), released as (
      update studio_manual_holds as hold
      set status = 'RELEASED', released_at = now()
      from locked
      where hold.id = locked.id and hold.status = 'ACTIVE'
      returning hold.*
    ), restored as (
      update shop_inventory as inventory
      set availability = 'AVAILABLE', reserved = 0, updated_at = now()
      where inventory.sku = (select sku from released)
        and inventory.availability = 'RESERVED'
        and not exists (
          select 1 from shop_order_items as items
          inner join shop_orders as orders on orders.id = items.order_id
          where items.sku = inventory.sku and orders.lifecycle_status = 'ACTIVE'
        )
      returning inventory.sku
    )
    select * from released
    union all
    select * from locked where status <> 'ACTIVE'
    limit 1
  `);
  if (!result.rows[0]) {
    throw new StudioEngineError("INTAKE_NOT_FOUND", 404, "That hold was not found.", "Reload Operations.");
  }
  return mapHold(result.rows[0]);
}

function mapModel(row: Awaited<ReturnType<typeof listOwnedModelProfiles>>[number]): StudioAuthorityModel {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as StudioAuthorityModel["kind"],
    state: row.state as StudioAuthorityModel["state"],
    sourceAssetUrl: `/api/studio/models/${row.id}/asset`,
    licenseUrl: row.licenseUrl,
    authorityConfirmedAt: row.authorityConfirmedAt.toISOString(),
    authority: record(row.authority),
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
              'revocationReason', ${input.reason}
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
        case when job.output_blob_pathname is null then null
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
  piece: Awaited<ReturnType<typeof listPhysicalPieces>>[number],
  activeBySku: Map<string, StudioAuthorityHold>,
  custodyByPiece: Map<string, PieceCustodyProjection>,
): StudioAuthorityPiece {
  const projected = custodyByPiece.get(piece.pieceKey);
  const projectionApplies = Boolean(
    projected
    && piece.expectedCustody === "STUDIO"
    && projected.availability === piece.availability
    && projected.orderReference === piece.orderReference,
  );
  const expectedLocationKey = projectionApplies ? projected!.locationKey : piece.expectedLocationKey;
  const expectedLocationLabel = projectionApplies ? projected!.locationLabel : piece.expectedLocationLabel;
  const expectedCustody = projectionApplies ? projected!.custody : piece.expectedCustody;
  const observation = piece.latestObservation;
  const projectionIsNewest = Boolean(
    projectionApplies
    && projected
    && (!observation || Date.parse(projected.updatedAt) > Date.parse(observation.occurredAt)),
  );
  const observedLocationKey = projectionIsNewest
    ? projected!.locationKey
    : observation?.observedLocationKey ?? null;
  const observedLocationLabel = projectionIsNewest
    ? projected!.locationLabel
    : observation?.observedLocationLabel ?? null;
  const observedAt = projectionIsNewest ? projected!.updatedAt : observation?.occurredAt ?? null;
  return {
    pieceKey: piece.pieceKey,
    wardrobeItemId: piece.wardrobeItemId,
    sku: piece.sku,
    title: piece.title,
    category: piece.category,
    colour: piece.colour,
    condition: piece.condition,
    sizeLabel: piece.sizeLabel,
    imageSrc: piece.imageSrc,
    availability: piece.availability,
    expectedLocationKey,
    expectedLocationLabel,
    expectedCustody,
    orderReference: piece.orderReference,
    observedLocationKey,
    observedLocationLabel,
    observedAt,
    hasLocationMismatch: Boolean(!projectionIsNewest && observation && (
      expectedCustody !== "STUDIO"
      || observation.observedLocationKey !== expectedLocationKey
    )),
    activeHold: piece.sku ? activeBySku.get(piece.sku) ?? null : null,
  };
}

function notificationForOrder(order: ShopServerOrder): StudioAuthorityNotification | null {
  const returnWork = order.return && order.allowedReturnTransitions.length > 0;
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
  if (!order.allowedTransitions.length) return null;
  return {
    id: `order:${order.reference}:v${order.version}:${order.paymentReviewStatus}:${order.fundsConfirmationStatus}:${order.fulfillmentStatus}`,
    kind: "ORDER",
    tone: order.paymentReviewStatus === "EVIDENCE_RECEIVED" ? "attention" : "neutral",
    title: `Order waiting · ${order.reference}`,
    detail: `${order.lines[0]?.name ?? "Order"} has one legal next action.`,
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
    if (Date.parse(hold.expiresAt) - now <= 24 * 60 * 60 * 1000) notifications.push({
      id: `hold:${hold.id}:${hold.expiresAt}`,
      kind: "HOLD",
      tone: "attention",
      title: `Hold expires soon · ${hold.sku}`,
      detail: `${hold.customerName} · ${hold.contact}`,
      href: `/studio/operations?view=holds&hold=${hold.id}`,
      actionLabel: "Review hold",
      createdAt: hold.createdAt,
    });
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
    where operator_subject = ${operator.subject}
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
    values (${operator.subject}, ${notificationId}, now())
    on conflict (operator_subject, notification_id) do update set dismissed_at = excluded.dismissed_at
  `);
}

async function currentPieceCustody(
  operator: StudioOperator,
  pieceKey: string,
): Promise<PieceCustodyProjection | null> {
  if (!(await authorityTablesReady()).custody) return null;
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    select *
    from studio_piece_custody
    where operator_subject = ${operator.subject}
      and piece_key = ${pieceKey}
    limit 1
  `);
  return result.rows[0] ? mapPieceCustody(result.rows[0]) : null;
}

export async function recordPieceLocation(
  operator: StudioOperator,
  input: z.infer<typeof locationCommandSchema>,
) {
  const piece = await getPhysicalPiece(operator, input.pieceKey);
  const projected = await currentPieceCustody(operator, piece.pieceKey);
  const projectionApplies = Boolean(
    projected
    && piece.expectedCustody === "STUDIO"
    && projected.availability === piece.availability
    && projected.orderReference === piece.orderReference,
  );
  const expectedLocationKey = projectionApplies ? projected!.locationKey : piece.expectedLocationKey;
  const expectedLocationLabel = projectionApplies ? projected!.locationLabel : piece.expectedLocationLabel;
  const targetLabel = studioLocationLabel(input.locationKey);

  if (input.command === "CONFIRM") {
    const resultValue = piece.expectedCustody === "STUDIO" && expectedLocationKey === input.locationKey
      ? "MATCH"
      : "MISMATCH";
    const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
      with existing as (
        select *
        from studio_physical_observations
        where operator_subject = ${operator.subject}
          and idempotency_key = ${input.idempotencyKey}
      ), inserted as (
        insert into studio_physical_observations (
          stocktake_id, operator_subject, idempotency_key, piece_key,
          wardrobe_item_id, sku, command,
          expected_location_key, expected_location_label, expected_custody,
          observed_location_key, observed_location_label, observed_custody,
          result, order_reference, note, occurred_at
        )
        select
          null, ${operator.subject}, ${input.idempotencyKey}, ${piece.pieceKey},
          ${piece.wardrobeItemId ?? null}::uuid, ${piece.sku}, 'CONFIRM_IN_HAND',
          ${expectedLocationKey}, ${expectedLocationLabel}, ${piece.expectedCustody},
          ${input.locationKey}, ${targetLabel}, 'STUDIO',
          ${resultValue}, ${piece.orderReference}, ${input.note || null}, now()
        where not exists (select 1 from existing)
        on conflict (operator_subject, idempotency_key) do nothing
        returning *
      )
      select * from inserted
      union all
      select * from existing
      limit 1
    `);
    const row = result.rows[0];
    if (!row) {
      throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "The check could not be saved.", "Try again.");
    }
    if (String(row.piece_key) !== piece.pieceKey || String(row.observed_location_key) !== input.locationKey) {
      throw new StudioEngineError("INVALID_REQUEST", 409, "That check request was already used.", "Check the piece again.");
    }
    return {
      command: "CONFIRM" as const,
      expectedLocationLabel: String(row.expected_location_label),
      locationLabel: String(row.observed_location_label),
      mismatch: String(row.result) === "MISMATCH",
      orderReference: nullable(row.order_reference),
      previousLocationLabel: String(row.expected_location_label),
    };
  }

  requireCustodyTables(await authorityTablesReady());
  if (piece.expectedCustody !== "STUDIO") {
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      `This piece is ${piece.expectedLocationLabel.toLowerCase()}.`,
      piece.orderReference ? "Open the connected order." : "Confirm the handoff before moving it in Studio.",
    );
  }
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    with existing_command as (
      select *
      from studio_piece_custody_commands
      where operator_subject = ${operator.subject}
        and idempotency_key = ${input.idempotencyKey}
    ), inserted_command as (
      insert into studio_piece_custody_commands (
        operator_subject, idempotency_key, piece_key, command,
        from_location_key, from_location_label, to_location_key, to_location_label,
        custody, availability, order_reference, reason, created_at
      )
      select
        ${operator.subject}, ${input.idempotencyKey}, ${piece.pieceKey}, 'MOVE',
        ${expectedLocationKey}, ${expectedLocationLabel}, ${input.locationKey}, ${targetLabel},
        'STUDIO', ${piece.availability}, ${piece.orderReference}, ${input.note || null}, now()
      where ${expectedLocationKey} <> ${input.locationKey}
        and not exists (select 1 from existing_command)
      on conflict (operator_subject, idempotency_key) do nothing
      returning *
    ), applied as (
      insert into studio_piece_custody (
        operator_subject, piece_key, location_key, location_label, custody,
        availability, order_reference, last_command_id, version, updated_at
      )
      select
        operator_subject, piece_key, to_location_key, to_location_label, custody,
        availability, order_reference, id, 1, created_at
      from inserted_command
      on conflict (operator_subject, piece_key) do update
      set location_key = excluded.location_key,
          location_label = excluded.location_label,
          custody = excluded.custody,
          availability = excluded.availability,
          order_reference = excluded.order_reference,
          last_command_id = excluded.last_command_id,
          version = studio_piece_custody.version + 1,
          updated_at = excluded.updated_at
      returning *
    ), observed as (
      insert into studio_physical_observations (
        stocktake_id, operator_subject, idempotency_key, piece_key,
        wardrobe_item_id, sku, command,
        expected_location_key, expected_location_label, expected_custody,
        observed_location_key, observed_location_label, observed_custody,
        result, order_reference, note, occurred_at
      )
      select
        null, ${operator.subject}, command.idempotency_key, command.piece_key,
        ${piece.wardrobeItemId ?? null}::uuid, ${piece.sku}, 'CONFIRM_IN_HAND',
        command.to_location_key, command.to_location_label, 'STUDIO',
        command.to_location_key, command.to_location_label, 'STUDIO',
        'MATCH', command.order_reference, command.reason, command.created_at
      from inserted_command as command
      on conflict (operator_subject, idempotency_key) do nothing
      returning id
    ), selected_command as (
      select * from inserted_command
      union all
      select * from existing_command
      limit 1
    )
    select selected_command.*,
      (select count(*) from applied) as applied_count,
      (select count(*) from observed) as observed_count
    from selected_command
  `);
  const row = result.rows[0];
  if (!row) {
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      `${piece.title} is already at ${targetLabel.toLowerCase()}.`,
      "Confirm it in hand instead.",
    );
  }
  if (
    String(row.piece_key) !== piece.pieceKey
    || String(row.command) !== "MOVE"
    || String(row.to_location_key) !== input.locationKey
  ) {
    throw new StudioEngineError("INVALID_REQUEST", 409, "That move request was already used.", "Start a new move.");
  }
  return {
    command: "MOVE" as const,
    expectedLocationLabel: String(row.to_location_label),
    locationLabel: String(row.to_location_label),
    mismatch: false,
    orderReference: nullable(row.order_reference),
    previousLocationLabel: String(row.from_location_label),
  };
}

export async function getStudioAuthority(operator: StudioOperator): Promise<StudioAuthoritySnapshot> {
  const [holds, models, media, orders, physicalPieces, custody] = await Promise.all([
    listManualHolds(operator),
    listStudioModelAuthority(operator),
    listStudioMediaAuthority(operator),
    getShopOrderService().listOperatorOrders(operatorActor(operator)),
    listPhysicalPieces(operator),
    listPieceCustody(operator),
  ]);
  const activeBySku = new Map(holds.filter((hold) => hold.status === "ACTIVE").map((hold) => [hold.sku, hold]));
  const custodyByPiece = new Map(custody.map((entry) => [entry.pieceKey, entry]));
  const pieces = physicalPieces.map((piece) => pieceWithHold(piece, activeBySku, custodyByPiece));
  const dismissed = await dismissedNotificationIds(operator);
  const notifications = deriveNotifications({ holds, media, models, orders, pieces })
    .filter((notification) => !dismissed.has(notification.id));
  return { pieces, orders, holds, models, media, notifications, generatedAt: new Date().toISOString() };
}
