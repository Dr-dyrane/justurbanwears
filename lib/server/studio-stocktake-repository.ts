import { sql } from "drizzle-orm";
import { z } from "zod";
import { getStudioDb } from "../../db/shop-postgres";
import type { StudioOperator } from "./studio-operator";
import { StudioEngineError } from "../studio/engine/errors";
import { sha256 } from "../studio/engine/fingerprint";

export const STOCKTAKE_LOCATIONS = [
  { key: "WARDROBE_RAIL", label: "Wardrobe rail" },
  { key: "PACKING_SHELF", label: "Packing shelf" },
  { key: "RETURN_INSPECTION", label: "Return inspection" },
] as const;

export type StocktakeLocationKey = (typeof STOCKTAKE_LOCATIONS)[number]["key"];
export type PhysicalCustody = "STUDIO" | "COURIER" | "CUSTOMER" | "UNKNOWN";
export type PhysicalAvailability = "PRIVATE" | "AVAILABLE" | "RESERVED" | "SOLD" | "ARCHIVED";

export type StocktakeExpectedPiece = {
  authorityUpdatedAt: string;
  locationVersion: number;
  pieceKey: string;
  wardrobeItemId: string | null;
  sku: string | null;
  title: string;
  expectedLocationKey: string;
  expectedLocationLabel: string;
  expectedCustody: PhysicalCustody;
  availability: PhysicalAvailability;
  orderReference: string | null;
  orderVersion: number | null;
  orderLifecycleStatus: string | null;
  orderFulfillmentStatus: string | null;
  orderReturnStatus: string | null;
};

export type PhysicalObservation = {
  id: string;
  stocktakeId: string | null;
  pieceKey: string;
  expectedLocationKey: string;
  expectedLocationLabel: string;
  expectedCustody: PhysicalCustody;
  observedLocationKey: StocktakeLocationKey;
  observedLocationLabel: string;
  observedCustody: "STUDIO";
  result: "MATCH" | "MISMATCH";
  orderReference: string | null;
  note: string | null;
  occurredAt: string;
};

export type PhysicalPiece = StocktakeExpectedPiece & {
  authorityRevision: string;
  description?: string | null;
  category: string;
  colour: string;
  condition: string;
  sizeLabel: string;
  imageSrc: string | null;
  latestObservation: PhysicalObservation | null;
};

export type StocktakeSession = {
  id: string;
  locationKey: StocktakeLocationKey;
  locationLabel: string;
  state: "OPEN" | "CLOSED";
  version: number;
  startedAt: string;
  closedAt: string | null;
  expectedPieces: StocktakeExpectedPiece[];
  confirmedPieceKeys: string[];
  exceptionPieceKeys: string[];
  unscannedPieceKeys: string[];
  canClose: boolean;
};

export type StocktakeWorkspace = {
  pieces: PhysicalPiece[];
  session: StocktakeSession | null;
};

const locationKeySchema = z.enum(["WARDROBE_RAIL", "PACKING_SHELF", "RETURN_INSPECTION"]);
const idempotencyKeySchema = z.string().trim().min(8).max(160);

export const stocktakeCommandReceiptQuerySchema = z.object({
  idempotencyKey: idempotencyKeySchema,
}).strict();

export const stocktakeCommandSchema = z.discriminatedUnion("command", [
  z.object({
    command: z.literal("START_COUNT"),
    idempotencyKey: idempotencyKeySchema,
    locationKey: locationKeySchema,
  }),
  z.object({
    command: z.literal("OBSERVE"),
    expectedVersion: z.number().int().positive().nullable().optional(),
    idempotencyKey: idempotencyKeySchema,
    locationKey: locationKeySchema,
    note: z.string().trim().max(240).optional(),
    pieceKey: z.string().trim().min(1).max(96),
    stocktakeId: z.string().uuid().nullable().optional(),
  }),
  z.object({
    command: z.literal("CLOSE_COUNT"),
    expectedVersion: z.number().int().positive(),
    idempotencyKey: idempotencyKeySchema,
    stocktakeId: z.string().uuid(),
  }),
]);

export const stocktakeCommandReceiptSchema = z.object({
  schemaVersion: z.literal("juw.studio-stocktake-command-receipt.v1"),
  receiptId: z.string().uuid(),
  actorSubject: z.string().min(1),
  command: z.enum(["START_COUNT", "OBSERVE", "CLOSE_COUNT"]),
  stocktakeId: z.string().uuid().nullable(),
  expectedVersion: z.number().int().positive().nullable(),
  resultingVersion: z.number().int().positive().nullable(),
  idempotencyKey: idempotencyKeySchema,
  requestFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  locationKey: locationKeySchema,
  pieceKey: z.string().min(1).max(96).nullable(),
  occurredAt: z.string().min(1),
}).strict();

export type StocktakeCommandReceipt = z.infer<typeof stocktakeCommandReceiptSchema>;

type StocktakeCommand = z.infer<typeof stocktakeCommandSchema>;

export function stocktakeCommandRequestFingerprint(command: StocktakeCommand): string {
  return sha256(JSON.stringify({
    command: command.command,
    contract: "juw.studio-stocktake-command.v1",
    expectedVersion: "expectedVersion" in command ? command.expectedVersion ?? null : null,
    locationKey: "locationKey" in command ? command.locationKey : null,
    note: "note" in command ? command.note ?? null : null,
    pieceKey: "pieceKey" in command ? command.pieceKey : null,
    stocktakeId: "stocktakeId" in command ? command.stocktakeId ?? null : null,
  }));
}

type PhysicalTruthInput = {
  availability: PhysicalAvailability;
  fulfillmentStatus?: string | null;
  returnStatus?: string | null;
};

export function expectedPhysicalTruth(input: PhysicalTruthInput): {
  custody: PhysicalCustody;
  locationKey: string;
  locationLabel: string;
} {
  if (input.availability === "PRIVATE" || input.availability === "AVAILABLE") {
    return { custody: "STUDIO", locationKey: "WARDROBE_RAIL", locationLabel: "Wardrobe rail" };
  }
  if (input.availability === "RESERVED" && input.fulfillmentStatus === "IN_TRANSIT") {
    return { custody: "COURIER", locationKey: "COURIER", locationLabel: "With courier" };
  }
  if (input.availability === "RESERVED") {
    return { custody: "STUDIO", locationKey: "PACKING_SHELF", locationLabel: "Packing shelf" };
  }
  if (input.availability === "SOLD" && input.returnStatus === "RECEIVED") {
    return { custody: "STUDIO", locationKey: "RETURN_INSPECTION", locationLabel: "Return inspection" };
  }
  if (input.availability === "SOLD") {
    return { custody: "CUSTOMER", locationKey: "CUSTOMER", locationLabel: "With customer" };
  }
  return { custody: "UNKNOWN", locationKey: "RETIRED", locationLabel: "Retired" };
}

type DatabaseRow = Record<string, unknown>;

function iso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : String(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length ? value : null;
}

function nullableNonnegativeInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function locationLabel(locationKey: StocktakeLocationKey): string {
  return STOCKTAKE_LOCATIONS.find((location) => location.key === locationKey)?.label ?? locationKey;
}

function stocktakeObservationPersistenceError(error: unknown): StudioEngineError {
  if (error instanceof StudioEngineError) return error;
  const message = error instanceof Error ? error.message : "";
  if (message.includes("STUDIO_IDEMPOTENCY_MISMATCH")) {
    return new StudioEngineError(
      "INVALID_REQUEST",
      409,
      "That location request key was already used.",
      "Scan the piece again with a new request key.",
    );
  }
  if (message.includes("STUDIO_STOCKTAKE_VERSION_CONFLICT")) {
    return new StudioEngineError(
      "VERSION_CONFLICT",
      409,
      "This count changed before the check was saved.",
      "Reload Stocktake.",
    );
  }
  if (message.includes("STUDIO_STOCKTAKE_AUTHORITY_CONFLICT")) {
    return new StudioEngineError(
      "VERSION_CONFLICT",
      409,
      "This piece changed after the count started.",
      "Reload Stocktake and start a new count from current custody.",
    );
  }
  if (message.includes("STUDIO_LOCATION_VERSION_CONFLICT")) {
    return new StudioEngineError(
      "VERSION_CONFLICT",
      409,
      "This piece changed before the check was saved.",
      "Reload Stocktake and scan the current piece again.",
    );
  }
  if (message.includes("STUDIO_INVALID_REQUEST")) {
    return new StudioEngineError(
      "INVALID_REQUEST",
      400,
      "Studio rejected that location check.",
      "Reload Stocktake and review the scan.",
    );
  }
  return new StudioEngineError(
    "ENGINE_UNAVAILABLE",
    503,
    "The location check could not be saved.",
    "Try again after reloading Stocktake.",
  );
}

function physicalPieceAuthorityCtes(operatorSubject: string) {
  return sql`
    dynamic_publications as (
      select publication.wardrobe_item_id, publication.sku
      from studio_catalogue_publications as publication
      where publication.operator_subject = ${operatorSubject}
    ),
    order_candidates as (
      select
        items.sku,
        orders.reference,
        orders.version,
        orders.lifecycle_status::text as lifecycle_status,
        orders.fulfillment_status::text as fulfillment_status,
        orders.updated_at as authority_updated_at,
        returns.status::text as return_status,
        row_number() over (
          partition by items.sku
          order by orders.updated_at desc, orders.id desc
        ) as rank
      from shop_order_items as items
      inner join shop_orders as orders on orders.id = items.order_id
      left join shop_order_returns as returns on returns.order_id = orders.id
      where orders.lifecycle_status in ('ACTIVE', 'COMPLETED')
    ),
    current_order as (
      select
        sku, reference, version, lifecycle_status, fulfillment_status,
        authority_updated_at, return_status
      from order_candidates
      where rank = 1
    ),
    public_pieces as (
      select
        case
          when publication.wardrobe_item_id is not null
            then 'wardrobe:' || publication.wardrobe_item_id::text
          else 'sku:' || inventory.sku
        end as piece_key,
        publication.wardrobe_item_id,
        inventory.sku,
        catalogue.name as title,
        catalogue.note as description,
        catalogue.category,
        catalogue.colour,
        catalogue.condition,
        catalogue.tagged_size as size_label,
        inventory.availability::text as availability,
        greatest(
          inventory.updated_at,
          coalesce(current_order.authority_updated_at, inventory.updated_at)
        ) as authority_updated_at,
        (
          select media.value->>'src'
          from jsonb_array_elements(catalogue.media) with ordinality as media(value, position)
          order by
            case when media.value->>'slot' = 'GARMENT_FRONT' then 0 else 1 end,
            media.position
          limit 1
        ) as image_src,
        case
          when inventory.availability = 'AVAILABLE' then 'WARDROBE_RAIL'
          when inventory.availability = 'RESERVED' and current_order.fulfillment_status = 'IN_TRANSIT' then 'COURIER'
          when inventory.availability = 'RESERVED' then 'PACKING_SHELF'
          when inventory.availability = 'SOLD' and current_order.return_status = 'RECEIVED' then 'RETURN_INSPECTION'
          when inventory.availability = 'SOLD' then 'CUSTOMER'
          else 'RETIRED'
        end as expected_location_key,
        case
          when inventory.availability = 'AVAILABLE' then 'Wardrobe rail'
          when inventory.availability = 'RESERVED' and current_order.fulfillment_status = 'IN_TRANSIT' then 'With courier'
          when inventory.availability = 'RESERVED' then 'Packing shelf'
          when inventory.availability = 'SOLD' and current_order.return_status = 'RECEIVED' then 'Return inspection'
          when inventory.availability = 'SOLD' then 'With customer'
          else 'Retired'
        end as expected_location_label,
        case
          when inventory.availability in ('AVAILABLE', 'RESERVED')
            and coalesce(current_order.fulfillment_status::text, '') <> 'IN_TRANSIT' then 'STUDIO'
          when inventory.availability = 'SOLD' and current_order.return_status = 'RECEIVED' then 'STUDIO'
          when inventory.availability = 'RESERVED' and current_order.fulfillment_status = 'IN_TRANSIT' then 'COURIER'
          when inventory.availability = 'SOLD' then 'CUSTOMER'
          else 'UNKNOWN'
        end as expected_custody,
        current_order.reference as order_reference,
        current_order.version as order_version,
        current_order.lifecycle_status as order_lifecycle_status,
        current_order.fulfillment_status as order_fulfillment_status,
        current_order.return_status as order_return_status
      from shop_inventory as inventory
      inner join shop_catalogue_items as catalogue on catalogue.sku = inventory.sku
      left join dynamic_publications as publication on publication.sku = inventory.sku
      left join current_order on current_order.sku = inventory.sku
    ),
    private_pieces as (
      select
        'wardrobe:' || wardrobe.id::text as piece_key,
        wardrobe.id as wardrobe_item_id,
        null::varchar(40) as sku,
        wardrobe.title,
        nullif(btrim(intake.facts->>'description'), '') as description,
        wardrobe.category,
        wardrobe.colour,
        wardrobe.condition,
        wardrobe.size_label,
        case when wardrobe.state = 'ARCHIVED' then 'ARCHIVED' else 'PRIVATE' end as availability,
        wardrobe.updated_at as authority_updated_at,
        case
          when wardrobe.approved_asset_id is null then null
          else '/api/studio/intakes/' || wardrobe.intake_id::text || '/assets/' || wardrobe.approved_asset_id::text
        end as image_src,
        case when wardrobe.state = 'ARCHIVED' then 'RETIRED' else 'WARDROBE_RAIL' end as expected_location_key,
        case when wardrobe.state = 'ARCHIVED' then 'Retired' else 'Wardrobe rail' end as expected_location_label,
        case when wardrobe.state = 'ARCHIVED' then 'UNKNOWN' else 'STUDIO' end as expected_custody,
        null::varchar(40) as order_reference,
        null::integer as order_version,
        null::text as order_lifecycle_status,
        null::text as order_fulfillment_status,
        null::text as order_return_status
      from studio_wardrobe_items as wardrobe
      inner join studio_intakes as intake
        on intake.id = wardrobe.intake_id
        and intake.operator_subject = ${operatorSubject}
      where wardrobe.operator_subject = ${operatorSubject}
        and not exists (
          select 1
          from studio_catalogue_publications as publication
          where publication.wardrobe_item_id = wardrobe.id
        )
    ),
    base_piece_authority as (
      select * from public_pieces
      union all
      select * from private_pieces
    ),
    piece_authority as (
      select
        piece.piece_key,
        piece.wardrobe_item_id,
        piece.sku,
        piece.title,
        piece.description,
        piece.category,
        piece.colour,
        piece.condition,
        piece.size_label,
        piece.availability,
        piece.authority_updated_at,
        piece.image_src,
        coalesce(custody.location_key, piece.expected_location_key) as expected_location_key,
        coalesce(custody.location_label, piece.expected_location_label) as expected_location_label,
        coalesce(custody.custody, piece.expected_custody) as expected_custody,
        piece.order_reference,
        piece.order_version,
        piece.order_lifecycle_status,
        piece.order_fulfillment_status,
        piece.order_return_status,
        coalesce(custody_revision.version, 0) as location_version
      from base_piece_authority as piece
      left join studio_piece_custody as custody
        on custody.operator_subject = ${operatorSubject}
        and custody.piece_key = piece.piece_key
        and piece.expected_custody = 'STUDIO'
        and custody.custody = 'STUDIO'
        and custody.availability = piece.availability
        and custody.order_reference is not distinct from piece.order_reference
        and custody.updated_at >= piece.authority_updated_at
      left join studio_piece_custody as custody_revision
        on custody_revision.operator_subject = ${operatorSubject}
        and custody_revision.piece_key = piece.piece_key
    )
  `;
}

function latestObservationCte(operatorSubject: string) {
  return sql`
    latest_observations as (
      select distinct on (observation.piece_key)
        observation.*
      from studio_physical_observations as observation
      where observation.operator_subject = ${operatorSubject}
      order by observation.piece_key, observation.occurred_at desc, observation.id desc
    )
  `;
}

function mapObservation(row: DatabaseRow, prefix = "observation_"): PhysicalObservation | null {
  const id = nullableString(row[`${prefix}id`]);
  if (!id) return null;
  return {
    id,
    stocktakeId: nullableString(row[`${prefix}stocktake_id`]),
    pieceKey: String(row[`${prefix}piece_key`]),
    expectedLocationKey: String(row[`${prefix}expected_location_key`]),
    expectedLocationLabel: String(row[`${prefix}expected_location_label`]),
    expectedCustody: String(row[`${prefix}expected_custody`]) as PhysicalCustody,
    observedLocationKey: String(row[`${prefix}observed_location_key`]) as StocktakeLocationKey,
    observedLocationLabel: String(row[`${prefix}observed_location_label`]),
    observedCustody: "STUDIO",
    result: String(row[`${prefix}result`]) as "MATCH" | "MISMATCH",
    orderReference: nullableString(row[`${prefix}order_reference`]),
    note: nullableString(row[`${prefix}note`]),
    occurredAt: iso(row[`${prefix}occurred_at`]),
  };
}

function mapPiece(row: DatabaseRow): PhysicalPiece {
  return {
    pieceKey: String(row.piece_key),
    wardrobeItemId: nullableString(row.wardrobe_item_id),
    sku: nullableString(row.sku),
    title: String(row.title),
    description: nullableString(row.description)?.trim() ?? null,
    category: String(row.category),
    colour: String(row.colour),
    condition: String(row.condition),
    sizeLabel: String(row.size_label),
    availability: String(row.availability) as PhysicalAvailability,
    authorityUpdatedAt: iso(row.authority_updated_at),
    authorityRevision: String(row.authority_revision),
    locationVersion: nullableNonnegativeInteger(row.location_version) ?? 0,
    imageSrc: nullableString(row.image_src),
    expectedLocationKey: String(row.expected_location_key),
    expectedLocationLabel: String(row.expected_location_label),
    expectedCustody: String(row.expected_custody) as PhysicalCustody,
    orderReference: nullableString(row.order_reference),
    orderVersion: nullableNonnegativeInteger(row.order_version),
    orderLifecycleStatus: nullableString(row.order_lifecycle_status),
    orderFulfillmentStatus: nullableString(row.order_fulfillment_status),
    orderReturnStatus: nullableString(row.order_return_status),
    latestObservation: mapObservation(row),
  };
}

export function physicalPiecesReadQuery(operatorSubject: string) {
  const authority = physicalPieceAuthorityCtes(operatorSubject);
  const latest = latestObservationCte(operatorSubject);
  return sql`
    with ${authority}, ${latest}
    select
      piece.*,
      to_char(
        piece.authority_updated_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) as authority_revision,
      observation.id as observation_id,
      observation.stocktake_id as observation_stocktake_id,
      observation.piece_key as observation_piece_key,
      observation.expected_location_key as observation_expected_location_key,
      observation.expected_location_label as observation_expected_location_label,
      observation.expected_custody as observation_expected_custody,
      observation.observed_location_key as observation_observed_location_key,
      observation.observed_location_label as observation_observed_location_label,
      observation.result as observation_result,
      observation.order_reference as observation_order_reference,
      observation.note as observation_note,
      observation.occurred_at as observation_occurred_at
    from piece_authority as piece
    left join latest_observations as observation on observation.piece_key = piece.piece_key
    order by
      case piece.expected_custody when 'STUDIO' then 0 else 1 end,
      piece.title,
      piece.piece_key
  `;
}

export function mapPhysicalPieceRows(rows: readonly Record<string, unknown>[]): PhysicalPiece[] {
  return rows.map(mapPiece);
}

export async function listPhysicalPieces(operator: StudioOperator): Promise<PhysicalPiece[]> {
  const database = await getStudioDb();
  const result = await database.execute<DatabaseRow>(physicalPiecesReadQuery(operator.subject));
  return mapPhysicalPieceRows(result.rows);
}

function matchesPieceKey(piece: PhysicalPiece, candidate: string): boolean {
  const normalized = candidate.trim().toLowerCase();
  return piece.pieceKey.toLowerCase() === normalized
    || piece.sku?.toLowerCase() === normalized
    || piece.wardrobeItemId?.toLowerCase() === normalized
    || (piece.wardrobeItemId
      ? `intake-${piece.wardrobeItemId.slice(0, 8)}`.toLowerCase() === normalized
      : false);
}

export async function getPhysicalPiece(operator: StudioOperator, key: string): Promise<PhysicalPiece> {
  const piece = (await listPhysicalPieces(operator)).find((candidate) => matchesPieceKey(candidate, key));
  if (!piece) {
    throw new StudioEngineError("INTAKE_NOT_FOUND", 404, "That piece was not found.", "Scan the label again.");
  }
  return piece;
}

function mapExpectedPieces(value: unknown): StocktakeExpectedPiece[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const item = candidate as Record<string, unknown>;
    if (typeof item.pieceKey !== "string" || typeof item.title !== "string") return [];
    return [{
      authorityUpdatedAt: typeof item.authorityUpdatedAt === "string" ? item.authorityUpdatedAt : "",
      locationVersion: nullableNonnegativeInteger(item.locationVersion) ?? 0,
      pieceKey: item.pieceKey,
      wardrobeItemId: nullableString(item.wardrobeItemId),
      sku: nullableString(item.sku),
      title: item.title,
      expectedLocationKey: String(item.expectedLocationKey),
      expectedLocationLabel: String(item.expectedLocationLabel),
      expectedCustody: String(item.expectedCustody) as PhysicalCustody,
      availability: String(item.availability) as PhysicalAvailability,
      orderReference: nullableString(item.orderReference),
      orderVersion: nullableNonnegativeInteger(item.orderVersion),
      orderLifecycleStatus: nullableString(item.orderLifecycleStatus),
      orderFulfillmentStatus: nullableString(item.orderFulfillmentStatus),
      orderReturnStatus: nullableString(item.orderReturnStatus),
    }];
  });
}

async function latestSessionObservations(
  operator: StudioOperator,
  stocktakeId: string,
): Promise<PhysicalObservation[]> {
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    select distinct on (observation.piece_key)
      observation.id as observation_id,
      observation.stocktake_id as observation_stocktake_id,
      observation.piece_key as observation_piece_key,
      observation.expected_location_key as observation_expected_location_key,
      observation.expected_location_label as observation_expected_location_label,
      observation.expected_custody as observation_expected_custody,
      observation.observed_location_key as observation_observed_location_key,
      observation.observed_location_label as observation_observed_location_label,
      observation.result as observation_result,
      observation.order_reference as observation_order_reference,
      observation.note as observation_note,
      observation.occurred_at as observation_occurred_at
    from studio_physical_observations as observation
    where observation.operator_subject = ${operator.subject}
      and observation.stocktake_id = ${stocktakeId}::uuid
    order by observation.piece_key, observation.occurred_at desc, observation.id desc
  `);
  return result.rows.flatMap((row) => {
    const observation = mapObservation(row);
    return observation ? [observation] : [];
  });
}

async function mapSession(operator: StudioOperator, row: DatabaseRow): Promise<StocktakeSession> {
  const expectedPieces = mapExpectedPieces(row.expected_pieces);
  const observations = await latestSessionObservations(operator, String(row.id));
  const latestByPiece = new Map(observations.map((observation) => [observation.pieceKey, observation]));
  const expectedKeys = new Set(expectedPieces.map((piece) => piece.pieceKey));
  const confirmedPieceKeys = expectedPieces.flatMap((piece) => {
    const observation = latestByPiece.get(piece.pieceKey);
    return observation?.result === "MATCH" ? [piece.pieceKey] : [];
  });
  const exceptionPieceKeys = observations.flatMap((observation) => (
    observation.result === "MISMATCH" || !expectedKeys.has(observation.pieceKey)
      ? [observation.pieceKey]
      : []
  ));
  const unscannedPieceKeys = expectedPieces
    .filter((piece) => !latestByPiece.has(piece.pieceKey))
    .map((piece) => piece.pieceKey);
  return {
    id: String(row.id),
    locationKey: String(row.location_key) as StocktakeLocationKey,
    locationLabel: String(row.location_label),
    state: String(row.state) as "OPEN" | "CLOSED",
    version: Number(row.version),
    startedAt: iso(row.started_at),
    closedAt: row.closed_at ? iso(row.closed_at) : null,
    expectedPieces,
    confirmedPieceKeys,
    exceptionPieceKeys,
    unscannedPieceKeys,
    canClose: expectedPieces.length > 0
      && confirmedPieceKeys.length === expectedPieces.length
      && exceptionPieceKeys.length === 0,
  };
}

function mapStocktakeCommandReceipt(row: DatabaseRow): StocktakeCommandReceipt {
  return stocktakeCommandReceiptSchema.parse({
    schemaVersion: "juw.studio-stocktake-command-receipt.v1",
    receiptId: String(row.receipt_id),
    actorSubject: String(row.receipt_actor_subject),
    command: String(row.receipt_command),
    stocktakeId: nullableString(row.receipt_stocktake_id),
    expectedVersion: nullableNonnegativeInteger(row.receipt_expected_version),
    resultingVersion: nullableNonnegativeInteger(row.receipt_resulting_version),
    idempotencyKey: String(row.receipt_idempotency_key),
    requestFingerprint: String(row.receipt_request_fingerprint),
    locationKey: String(row.receipt_location_key),
    pieceKey: nullableString(row.receipt_piece_key),
    occurredAt: iso(row.receipt_occurred_at),
  });
}

function receiptSelect() {
  return sql`
    receipt.id as receipt_id,
    receipt.actor_subject as receipt_actor_subject,
    receipt.command as receipt_command,
    receipt.stocktake_id as receipt_stocktake_id,
    receipt.expected_version as receipt_expected_version,
    receipt.resulting_version as receipt_resulting_version,
    receipt.idempotency_key as receipt_idempotency_key,
    receipt.request_fingerprint as receipt_request_fingerprint,
    receipt.location_key as receipt_location_key,
    null::text as receipt_piece_key,
    receipt.occurred_at as receipt_occurred_at
  `;
}

export async function getActiveStocktake(operator: StudioOperator): Promise<StocktakeSession | null> {
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    select *
    from studio_stocktakes
    where operator_subject = ${operator.subject}
      and state = 'OPEN'
    order by started_at desc
    limit 1
  `);
  return result.rows[0] ? mapSession(operator, result.rows[0]) : null;
}

async function getStocktakeById(operator: StudioOperator, stocktakeId: string): Promise<StocktakeSession | null> {
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    select * from studio_stocktakes
    where id = ${stocktakeId}::uuid
      and operator_subject = ${operator.subject}
    limit 1
  `);
  return result.rows[0] ? mapSession(operator, result.rows[0]) : null;
}

export async function readStocktakeCommandReceipt(
  operator: StudioOperator,
  idempotencyKey: string,
): Promise<{
  observation?: PhysicalObservation;
  piece?: PhysicalPiece;
  receipt: StocktakeCommandReceipt;
  session: StocktakeSession | null;
} | null> {
  const database = await getStudioDb();
  const durable = await database.execute<DatabaseRow>(sql`
    select ${receiptSelect()}
    from studio_stocktake_command_receipts as receipt
    where receipt.operator_subject = ${operator.subject}
      and receipt.actor_subject = ${operator.actorSubject}
      and receipt.idempotency_key = ${idempotencyKey}
    limit 1
  `);
  if (durable.rows[0]) {
    const receipt = mapStocktakeCommandReceipt(durable.rows[0]);
    return { receipt, session: receipt.stocktakeId ? await getStocktakeById(operator, receipt.stocktakeId) : null };
  }

  const observation = await database.execute<DatabaseRow>(sql`
    select
      observation.id as receipt_id,
      ${operator.actorSubject}::text as receipt_actor_subject,
      'OBSERVE'::text as receipt_command,
      observation.stocktake_id as receipt_stocktake_id,
      case when observation.stocktake_id is null then null else 1 + (
        select count(*)::integer
        from studio_physical_observations as prior
        where prior.stocktake_id = observation.stocktake_id
          and prior.operator_subject = observation.operator_subject
          and (prior.occurred_at, prior.id) < (observation.occurred_at, observation.id)
      ) end as receipt_expected_version,
      case when observation.stocktake_id is null then null else 2 + (
        select count(*)::integer
        from studio_physical_observations as prior
        where prior.stocktake_id = observation.stocktake_id
          and prior.operator_subject = observation.operator_subject
          and (prior.occurred_at, prior.id) < (observation.occurred_at, observation.id)
      ) end as receipt_resulting_version,
      receipt.idempotency_key as receipt_idempotency_key,
      receipt.request_fingerprint as receipt_request_fingerprint,
      observation.observed_location_key as receipt_location_key,
      observation.piece_key as receipt_piece_key,
      observation.occurred_at as receipt_occurred_at,
      observation.*
    from studio_piece_custody_commands as receipt
    inner join studio_physical_observations as observation
      on observation.operator_subject = receipt.operator_subject
      and observation.idempotency_key = receipt.idempotency_key
    where receipt.operator_subject = ${operator.subject}
      and receipt.idempotency_key = ${idempotencyKey}
      and receipt.command = 'CONFIRM'
    limit 1
  `);
  if (!observation.rows[0]) return null;
  const receipt = mapStocktakeCommandReceipt(observation.rows[0]);
  return {
    observation: mapInsertedObservation(observation.rows[0]),
    piece: await getPhysicalPiece(operator, String(observation.rows[0].piece_key)),
    receipt,
    session: receipt.stocktakeId ? await getStocktakeById(operator, receipt.stocktakeId) : null,
  };
}

export async function getStocktakeWorkspace(operator: StudioOperator): Promise<StocktakeWorkspace> {
  const [pieces, session] = await Promise.all([
    listPhysicalPieces(operator),
    getActiveStocktake(operator),
  ]);
  return { pieces, session };
}

export async function startStocktake(input: {
  idempotencyKey: string;
  locationKey: StocktakeLocationKey;
  operator: StudioOperator;
}): Promise<{ receipt: StocktakeCommandReceipt; session: StocktakeSession }> {
  const database = await getStudioDb();
  const authority = physicalPieceAuthorityCtes(input.operator.subject);
  const label = locationLabel(input.locationKey);
  const requestFingerprint = stocktakeCommandRequestFingerprint({
    command: "START_COUNT",
    idempotencyKey: input.idempotencyKey,
    locationKey: input.locationKey,
  });
  const result = await database.execute<DatabaseRow>(sql`
    with command_lock as materialized (
      select pg_advisory_xact_lock(hashtextextended(
        'juw:studio:stocktake:' || ${input.operator.actorSubject} || ':' || ${input.idempotencyKey}, 0
      ))
    ),
    existing_receipt as materialized (
      select receipt.*
      from studio_stocktake_command_receipts as receipt, command_lock
      where receipt.operator_subject = ${input.operator.subject}
        and receipt.actor_subject = ${input.operator.actorSubject}
        and receipt.idempotency_key = ${input.idempotencyKey}
    ),
    ${authority},
    expected as (
      select coalesce(jsonb_agg(jsonb_build_object(
        'authorityUpdatedAt', piece.authority_updated_at,
        'locationVersion', piece.location_version,
        'pieceKey', piece.piece_key,
        'wardrobeItemId', piece.wardrobe_item_id,
        'sku', piece.sku,
        'title', piece.title,
        'expectedLocationKey', piece.expected_location_key,
        'expectedLocationLabel', piece.expected_location_label,
        'expectedCustody', piece.expected_custody,
        'availability', piece.availability,
        'orderReference', piece.order_reference,
        'orderVersion', piece.order_version,
        'orderLifecycleStatus', piece.order_lifecycle_status,
        'orderFulfillmentStatus', piece.order_fulfillment_status,
        'orderReturnStatus', piece.order_return_status
      ) order by piece.title, piece.piece_key), '[]'::jsonb) as pieces
      from piece_authority as piece
      where piece.expected_location_key = ${input.locationKey}
        and piece.expected_custody = 'STUDIO'
    ),
    inserted as (
      insert into studio_stocktakes (
        operator_subject, idempotency_key, location_key, location_label,
        state, expected_pieces, version, started_at, updated_at
      )
      select
        ${input.operator.subject}, ${input.idempotencyKey}, ${input.locationKey}, ${label},
        'OPEN', expected.pieces, 1, now(), now()
      from expected, command_lock
      where jsonb_array_length(expected.pieces) > 0
        and not exists (select 1 from existing_receipt)
      on conflict do nothing
      returning *
    ),
    created_receipt as (
      insert into studio_stocktake_command_receipts (
        operator_subject, actor_subject, idempotency_key, request_fingerprint,
        command, stocktake_id, expected_version, resulting_version, location_key, occurred_at
      )
      select
        ${input.operator.subject}, ${input.operator.actorSubject}, ${input.idempotencyKey},
        ${requestFingerprint}, 'START_COUNT', inserted.id, null, inserted.version,
        inserted.location_key, inserted.started_at
      from inserted
      returning *
    ),
    resolved_receipt as (
      select * from created_receipt
      union all
      select * from existing_receipt
    )
    select ${receiptSelect()}, stocktake.*
    from resolved_receipt as receipt
    inner join studio_stocktakes as stocktake on stocktake.id = receipt.stocktake_id
    limit 1
  `);
  const row = result.rows[0];
  if (!row) {
    const active = await getActiveStocktake(input.operator);
    if (active) {
      throw new StudioEngineError(
        "INVALID_TRANSITION",
        409,
        "A count is already open.",
        "Finish the current count first.",
      );
    }
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      `Nothing is expected at ${label.toLowerCase()}.`,
      "Choose another location.",
    );
  }
  const receipt = mapStocktakeCommandReceipt(row);
  if (receipt.requestFingerprint !== requestFingerprint || receipt.command !== "START_COUNT") {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      409,
      "That count request was already used.",
      "Start again.",
    );
  }
  return { receipt, session: await mapSession(input.operator, row) };
}

function mapInsertedObservation(row: DatabaseRow): PhysicalObservation {
  return {
    id: String(row.id),
    stocktakeId: nullableString(row.stocktake_id),
    pieceKey: String(row.piece_key),
    expectedLocationKey: String(row.expected_location_key),
    expectedLocationLabel: String(row.expected_location_label),
    expectedCustody: String(row.expected_custody) as PhysicalCustody,
    observedLocationKey: String(row.observed_location_key) as StocktakeLocationKey,
    observedLocationLabel: String(row.observed_location_label),
    observedCustody: "STUDIO",
    result: String(row.result) as "MATCH" | "MISMATCH",
    orderReference: nullableString(row.order_reference),
    note: nullableString(row.note),
    occurredAt: iso(row.occurred_at),
  };
}

export async function observePhysicalPiece(input: {
  expectedVersion?: number | null;
  idempotencyKey: string;
  locationKey: StocktakeLocationKey;
  note?: string;
  operator: StudioOperator;
  pieceKey: string;
  stocktakeId?: string | null;
}): Promise<{ observation: PhysicalObservation; piece: PhysicalPiece; receipt: StocktakeCommandReceipt; session: StocktakeSession | null }> {
  const database = await getStudioDb();
  const requestFingerprint = sha256(JSON.stringify({
    command: "CONFIRM",
    contract: "juw.studio.location-command.v1",
    expectedVersion: input.expectedVersion ?? null,
    locationKey: input.locationKey,
    note: input.note ?? null,
    pieceKey: input.pieceKey,
    source: "STOCKTAKE",
    stocktakeId: input.stocktakeId ?? null,
  }));
  const replay = await database.execute<DatabaseRow>(sql`
    select
      receipt.request_fingerprint,
      receipt.command as receipt_command,
      observation.*
    from studio_piece_custody_commands as receipt
    left join studio_physical_observations as observation
      on observation.operator_subject = receipt.operator_subject
      and observation.idempotency_key = receipt.idempotency_key
    where receipt.operator_subject = ${input.operator.subject}
      and receipt.idempotency_key = ${input.idempotencyKey}
    limit 1
  `);
  const replayRow = replay.rows[0];
  if (replayRow) {
    if (
      String(replayRow.request_fingerprint) !== requestFingerprint
      || String(replayRow.receipt_command) !== "CONFIRM"
    ) {
      throw new StudioEngineError(
        "INVALID_REQUEST",
        409,
        "That location request key was already used.",
        "Scan the piece again with a new request key.",
      );
    }
    if (!replayRow.id) {
      throw new StudioEngineError(
        "ENGINE_UNAVAILABLE",
        503,
        "The location check receipt is incomplete.",
        "Reload Stocktake before trying again.",
      );
    }
    const piece = await getPhysicalPiece(input.operator, String(replayRow.piece_key));
    const session = input.stocktakeId ? await getActiveStocktake(input.operator) : null;
    return {
      observation: mapInsertedObservation(replayRow),
      piece,
      receipt: stocktakeCommandReceiptSchema.parse({
        schemaVersion: "juw.studio-stocktake-command-receipt.v1",
        receiptId: String(replayRow.id),
        actorSubject: input.operator.actorSubject,
        command: "OBSERVE",
        stocktakeId: input.stocktakeId ?? null,
        expectedVersion: input.expectedVersion ?? null,
        resultingVersion: input.expectedVersion == null ? null : input.expectedVersion + 1,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint,
        locationKey: input.locationKey,
        pieceKey: String(replayRow.piece_key),
        occurredAt: iso(replayRow.occurred_at),
      }),
      session,
    };
  }

  const piece = await getPhysicalPiece(input.operator, input.pieceKey);
  let row: DatabaseRow | undefined;
  try {
    const result = await database.execute<DatabaseRow>(sql`
      select *
      from studio_record_piece_confirmation_v2(
        ${input.operator.subject},
        ${input.idempotencyKey},
        ${requestFingerprint},
        'STOCKTAKE',
        ${piece.pieceKey},
        ${piece.wardrobeItemId ?? null}::uuid,
        ${piece.sku},
        null::integer,
        null::text,
        ${input.locationKey},
        ${input.note || null},
        ${input.stocktakeId ?? null}::uuid,
        ${input.expectedVersion ?? null}::integer
      )
    `);
    row = result.rows[0];
  } catch (error) {
    throw stocktakeObservationPersistenceError(error);
  }
  if (!row) {
    throw new StudioEngineError(
      "ENGINE_UNAVAILABLE",
      503,
      "The location check could not be saved.",
      "Try again after reloading Stocktake.",
    );
  }
  const observation = mapInsertedObservation(row);
  const session = input.stocktakeId ? await getActiveStocktake(input.operator) : null;
  return {
    observation,
    piece,
    receipt: stocktakeCommandReceiptSchema.parse({
      schemaVersion: "juw.studio-stocktake-command-receipt.v1",
      receiptId: observation.id,
      actorSubject: input.operator.actorSubject,
      command: "OBSERVE",
      stocktakeId: input.stocktakeId ?? null,
      expectedVersion: input.expectedVersion ?? null,
      resultingVersion: input.expectedVersion == null ? null : input.expectedVersion + 1,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint,
      locationKey: input.locationKey,
      pieceKey: piece.pieceKey,
      occurredAt: observation.occurredAt,
    }),
    session,
  };
}

export async function closeStocktake(input: {
  expectedVersion: number;
  idempotencyKey: string;
  operator: StudioOperator;
  stocktakeId: string;
}): Promise<{ receipt: StocktakeCommandReceipt; session: StocktakeSession }> {
  const database = await getStudioDb();
  const requestFingerprint = stocktakeCommandRequestFingerprint({
    command: "CLOSE_COUNT",
    expectedVersion: input.expectedVersion,
    idempotencyKey: input.idempotencyKey,
    stocktakeId: input.stocktakeId,
  });
  const result = await database.execute<DatabaseRow>(sql`
    with command_lock as materialized (
      select pg_advisory_xact_lock(hashtextextended(
        'juw:studio:stocktake:' || ${input.operator.actorSubject} || ':' || ${input.idempotencyKey}, 0
      ))
    ),
    existing_receipt as materialized (
      select receipt.*
      from studio_stocktake_command_receipts as receipt, command_lock
      where receipt.operator_subject = ${input.operator.subject}
        and receipt.actor_subject = ${input.operator.actorSubject}
        and receipt.idempotency_key = ${input.idempotencyKey}
    ),
    locked as materialized (
      select stocktake.*
      from studio_stocktakes
      as stocktake, command_lock
      where id = ${input.stocktakeId}::uuid
        and operator_subject = ${input.operator.subject}
      for update of stocktake
    ),
    expected as (
      select expected_piece
      from locked, jsonb_array_elements(locked.expected_pieces) as expected_piece
    ),
    latest as (
      select distinct on (observation.piece_key)
        observation.piece_key,
        observation.result,
        observation.observed_location_key
      from studio_physical_observations as observation
      where observation.stocktake_id = ${input.stocktakeId}::uuid
        and observation.operator_subject = ${input.operator.subject}
      order by observation.piece_key, observation.occurred_at desc, observation.id desc
    ),
    blockers as (
      select count(*)::integer as count
      from expected
      left join latest on latest.piece_key = expected.expected_piece->>'pieceKey'
      where latest.piece_key is null
        or latest.result <> 'MATCH'
        or latest.observed_location_key <> (select location_key from locked)
    ),
    closed as (
      update studio_stocktakes as stocktake
      set state = 'CLOSED', version = stocktake.version + 1, closed_at = now(), updated_at = now()
      where stocktake.id = ${input.stocktakeId}::uuid
        and stocktake.operator_subject = ${input.operator.subject}
        and stocktake.state = 'OPEN'
        and stocktake.version = ${input.expectedVersion}
        and not exists (select 1 from existing_receipt)
        and (select count from blockers) = 0
        and not exists (
          select 1
          from latest
          where not exists (
            select 1 from expected where expected.expected_piece->>'pieceKey' = latest.piece_key
          )
        )
      returning stocktake.*
    ),
    created_receipt as (
      insert into studio_stocktake_command_receipts (
        operator_subject, actor_subject, idempotency_key, request_fingerprint,
        command, stocktake_id, expected_version, resulting_version, location_key, occurred_at
      )
      select
        ${input.operator.subject}, ${input.operator.actorSubject}, ${input.idempotencyKey},
        ${requestFingerprint}, 'CLOSE_COUNT', closed.id, ${input.expectedVersion}, closed.version,
        closed.location_key, closed.closed_at
      from closed
      returning *
    ),
    resolved_receipt as (
      select * from created_receipt
      union all
      select * from existing_receipt
    )
    select ${receiptSelect()}, stocktake.*
    from resolved_receipt as receipt
    inner join studio_stocktakes as stocktake on stocktake.id = receipt.stocktake_id
    limit 1
  `);
  if (result.rows[0]) {
    const receipt = mapStocktakeCommandReceipt(result.rows[0]);
    if (receipt.requestFingerprint !== requestFingerprint || receipt.command !== "CLOSE_COUNT") {
      throw new StudioEngineError(
        "INVALID_REQUEST",
        409,
        "That count request key was already used.",
        "Reload Stock count and close it again.",
      );
    }
    return { receipt, session: await mapSession(input.operator, result.rows[0]) };
  }
  const current = await getStocktakeById(input.operator, input.stocktakeId);
  if (!current) {
    throw new StudioEngineError("INTAKE_NOT_FOUND", 404, "That count was not found.", "Open Stocktake.");
  }
  if (current.version !== input.expectedVersion || current.state === "CLOSED") {
    throw new StudioEngineError(
      "VERSION_CONFLICT",
      409,
      "This count changed in another window.",
      "Reload Stocktake.",
    );
  }
  throw new StudioEngineError(
    "INVALID_TRANSITION",
    409,
    "This count still has pieces to check.",
    "Resolve every missing piece and mismatch first.",
  );
}
