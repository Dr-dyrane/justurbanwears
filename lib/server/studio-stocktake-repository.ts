import { sql } from "drizzle-orm";
import { z } from "zod";
import { getStudioDb } from "../../db/shop-postgres";
import type { StudioOperator } from "./studio-operator";
import { StudioEngineError } from "../studio/engine/errors";

export const STOCKTAKE_LOCATIONS = [
  { key: "WARDROBE_RAIL", label: "Wardrobe rail" },
  { key: "PACKING_SHELF", label: "Packing shelf" },
  { key: "RETURN_INSPECTION", label: "Return inspection" },
] as const;

export type StocktakeLocationKey = (typeof STOCKTAKE_LOCATIONS)[number]["key"];
export type PhysicalCustody = "STUDIO" | "COURIER" | "CUSTOMER" | "UNKNOWN";
export type PhysicalAvailability = "PRIVATE" | "AVAILABLE" | "RESERVED" | "SOLD" | "ARCHIVED";

export type StocktakeExpectedPiece = {
  pieceKey: string;
  wardrobeItemId: string | null;
  sku: string | null;
  title: string;
  expectedLocationKey: string;
  expectedLocationLabel: string;
  expectedCustody: PhysicalCustody;
  availability: PhysicalAvailability;
  orderReference: string | null;
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

function locationLabel(locationKey: StocktakeLocationKey): string {
  return STOCKTAKE_LOCATIONS.find((location) => location.key === locationKey)?.label ?? locationKey;
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
        orders.fulfillment_status,
        returns.status as return_status,
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
      select sku, reference, fulfillment_status, return_status
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
        catalogue.category,
        catalogue.colour,
        catalogue.condition,
        catalogue.tagged_size as size_label,
        inventory.availability::text as availability,
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
        current_order.reference as order_reference
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
        wardrobe.category,
        wardrobe.colour,
        wardrobe.condition,
        wardrobe.size_label,
        case when wardrobe.state = 'ARCHIVED' then 'ARCHIVED' else 'PRIVATE' end as availability,
        case
          when wardrobe.approved_asset_id is null then null
          else '/api/studio/intakes/' || wardrobe.intake_id::text || '/assets/' || wardrobe.approved_asset_id::text
        end as image_src,
        case when wardrobe.state = 'ARCHIVED' then 'RETIRED' else 'WARDROBE_RAIL' end as expected_location_key,
        case when wardrobe.state = 'ARCHIVED' then 'Retired' else 'Wardrobe rail' end as expected_location_label,
        case when wardrobe.state = 'ARCHIVED' then 'UNKNOWN' else 'STUDIO' end as expected_custody,
        null::varchar(40) as order_reference
      from studio_wardrobe_items as wardrobe
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
        piece.category,
        piece.colour,
        piece.condition,
        piece.size_label,
        piece.availability,
        piece.image_src,
        coalesce(custody.location_key, piece.expected_location_key) as expected_location_key,
        coalesce(custody.location_label, piece.expected_location_label) as expected_location_label,
        coalesce(custody.custody, piece.expected_custody) as expected_custody,
        piece.order_reference
      from base_piece_authority as piece
      left join studio_piece_custody as custody
        on custody.operator_subject = ${operatorSubject}
        and custody.piece_key = piece.piece_key
        and piece.expected_custody = 'STUDIO'
        and custody.custody = 'STUDIO'
        and custody.availability = piece.availability
        and custody.order_reference is not distinct from piece.order_reference
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
    category: String(row.category),
    colour: String(row.colour),
    condition: String(row.condition),
    sizeLabel: String(row.size_label),
    availability: String(row.availability) as PhysicalAvailability,
    imageSrc: nullableString(row.image_src),
    expectedLocationKey: String(row.expected_location_key),
    expectedLocationLabel: String(row.expected_location_label),
    expectedCustody: String(row.expected_custody) as PhysicalCustody,
    orderReference: nullableString(row.order_reference),
    latestObservation: mapObservation(row),
  };
}

export async function listPhysicalPieces(operator: StudioOperator): Promise<PhysicalPiece[]> {
  const database = await getStudioDb();
  const authority = physicalPieceAuthorityCtes(operator.subject);
  const latest = latestObservationCte(operator.subject);
  const result = await database.execute<DatabaseRow>(sql`
    with ${authority}, ${latest}
    select
      piece.*,
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
  `);
  return result.rows.map(mapPiece);
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
      pieceKey: item.pieceKey,
      wardrobeItemId: nullableString(item.wardrobeItemId),
      sku: nullableString(item.sku),
      title: item.title,
      expectedLocationKey: String(item.expectedLocationKey),
      expectedLocationLabel: String(item.expectedLocationLabel),
      expectedCustody: String(item.expectedCustody) as PhysicalCustody,
      availability: String(item.availability) as PhysicalAvailability,
      orderReference: nullableString(item.orderReference),
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
}): Promise<StocktakeSession> {
  const database = await getStudioDb();
  const authority = physicalPieceAuthorityCtes(input.operator.subject);
  const label = locationLabel(input.locationKey);
  const result = await database.execute<DatabaseRow>(sql`
    with ${authority},
    expected as (
      select coalesce(jsonb_agg(jsonb_build_object(
        'pieceKey', piece.piece_key,
        'wardrobeItemId', piece.wardrobe_item_id,
        'sku', piece.sku,
        'title', piece.title,
        'expectedLocationKey', piece.expected_location_key,
        'expectedLocationLabel', piece.expected_location_label,
        'expectedCustody', piece.expected_custody,
        'availability', piece.availability,
        'orderReference', piece.order_reference
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
      from expected
      where jsonb_array_length(expected.pieces) > 0
      on conflict do nothing
      returning *
    )
    select * from inserted
    union all
    select *
    from studio_stocktakes
    where operator_subject = ${input.operator.subject}
      and idempotency_key = ${input.idempotencyKey}
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
  if (String(row.location_key) !== input.locationKey) {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      409,
      "That count request was already used.",
      "Start again.",
    );
  }
  return mapSession(input.operator, row);
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
}): Promise<{ observation: PhysicalObservation; piece: PhysicalPiece; session: StocktakeSession | null }> {
  const piece = await getPhysicalPiece(input.operator, input.pieceKey);
  const session = input.stocktakeId ? await getActiveStocktake(input.operator) : null;
  if (input.stocktakeId && (!session || session.id !== input.stocktakeId)) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "That count is closed.", "Start a new count.");
  }
  if (session && session.locationKey !== input.locationKey) {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      400,
      `This count is for ${session.locationLabel.toLowerCase()}.`,
      "Record the piece at the count location.",
    );
  }
  const expectedSnapshot = session?.expectedPieces.find((candidate) => candidate.pieceKey === piece.pieceKey);
  const expected = expectedSnapshot ?? piece;
  const observedLabel = locationLabel(input.locationKey);
  const resultValue = expected.expectedCustody === "STUDIO"
    && expected.expectedLocationKey === input.locationKey
    ? "MATCH"
    : "MISMATCH";
  const database = await getStudioDb();
  const result = await database.execute<DatabaseRow>(sql`
    with existing as (
      select *
      from studio_physical_observations
      where operator_subject = ${input.operator.subject}
        and idempotency_key = ${input.idempotencyKey}
    ),
    session_lock as (
      select stocktake.id, stocktake.version
      from studio_stocktakes as stocktake
      where ${session?.id ?? null}::uuid is not null
        and stocktake.id = ${session?.id ?? null}::uuid
        and stocktake.operator_subject = ${input.operator.subject}
        and stocktake.state = 'OPEN'
        and stocktake.version = ${input.expectedVersion ?? -1}
        and stocktake.location_key = ${input.locationKey}
        and not exists (select 1 from existing)
      for update
    ),
    session_tick as (
      update studio_stocktakes as stocktake
      set version = stocktake.version + 1, updated_at = now()
      from session_lock
      where stocktake.id = session_lock.id
        and stocktake.version = session_lock.version
        and stocktake.state = 'OPEN'
      returning stocktake.id
    ),
    inserted as (
      insert into studio_physical_observations (
        stocktake_id, operator_subject, idempotency_key, piece_key,
        wardrobe_item_id, sku, command,
        expected_location_key, expected_location_label, expected_custody,
        observed_location_key, observed_location_label, observed_custody,
        result, order_reference, note, occurred_at
      )
      select
        ${session?.id ?? null}::uuid, ${input.operator.subject}, ${input.idempotencyKey}, ${piece.pieceKey},
        ${piece.wardrobeItemId ?? null}::uuid, ${piece.sku}, 'CONFIRM_IN_HAND',
        ${expected.expectedLocationKey}, ${expected.expectedLocationLabel}, ${expected.expectedCustody},
        ${input.locationKey}, ${observedLabel}, 'STUDIO',
        ${resultValue}, ${expected.orderReference}, ${input.note || null}, now()
      where ${session?.id ?? null}::uuid is null
        or exists (select 1 from session_tick)
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
    if (session) {
      throw new StudioEngineError(
        "VERSION_CONFLICT",
        409,
        "This count changed before the check was saved.",
        "Reload Stocktake.",
      );
    }
    throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "The check could not be saved.", "Try again.");
  }
  if (
    String(row.piece_key) !== piece.pieceKey
    || nullableString(row.stocktake_id) !== (session?.id ?? null)
    || String(row.observed_location_key) !== input.locationKey
  ) {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      409,
      "That check request was already used.",
      "Scan the piece again.",
    );
  }
  return {
    observation: mapInsertedObservation(row),
    piece,
    session: session ? await getActiveStocktake(input.operator) : null,
  };
}

export async function closeStocktake(input: {
  expectedVersion: number;
  idempotencyKey: string;
  operator: StudioOperator;
  stocktakeId: string;
}): Promise<StocktakeSession> {
  const database = await getStudioDb();
  const result = await database.execute<DatabaseRow>(sql`
    with locked as (
      select *
      from studio_stocktakes
      where id = ${input.stocktakeId}::uuid
        and operator_subject = ${input.operator.subject}
      for update
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
        and (select count from blockers) = 0
        and not exists (
          select 1
          from latest
          where not exists (
            select 1 from expected where expected.expected_piece->>'pieceKey' = latest.piece_key
          )
        )
      returning stocktake.*
    )
    select * from closed
    union all
    select * from locked where state = 'CLOSED'
    limit 1
  `);
  if (result.rows[0]) return mapSession(input.operator, result.rows[0]);
  const active = await getActiveStocktake(input.operator);
  if (!active || active.id !== input.stocktakeId) {
    throw new StudioEngineError("INTAKE_NOT_FOUND", 404, "That count was not found.", "Open Stocktake.");
  }
  if (active.version !== input.expectedVersion) {
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
