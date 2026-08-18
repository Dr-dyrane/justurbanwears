import { sql } from "drizzle-orm";
import { getStudioDb } from "../../db/shop-postgres";
import type { IntakeFacts } from "../studio/engine/contracts";
import type {
  GarmentLifecycleEvent,
  GarmentRevisionMediaRole,
} from "../studio/engine/garment-lifecycle-contracts";

export type GarmentRevisionRow = {
  id: string;
  wardrobeItemId: string;
  operatorSubject: string;
  revisionNumber: number;
  version: number;
  state: "DRAFT" | "PUBLISHED" | "SUPERSEDED" | "DISCARDED";
  baseSourceRevision: string;
  facts: IntakeFacts;
  media: Array<Record<string, unknown>>;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
};

function resultRows(result: unknown): Record<string, unknown>[] {
  if (!result || typeof result !== "object") return [];
  const value = "rows" in result ? result.rows : result;
  return Array.isArray(value) ? value as Record<string, unknown>[] : [];
}

function revisionRow(raw: Record<string, unknown>): GarmentRevisionRow {
  return {
    id: String(raw.id),
    wardrobeItemId: String(raw.wardrobe_item_id),
    operatorSubject: String(raw.operator_subject),
    revisionNumber: Number(raw.revision_number),
    version: Number(raw.version),
    state: String(raw.state) as GarmentRevisionRow["state"],
    baseSourceRevision: String(raw.base_source_revision),
    facts: raw.facts as IntakeFacts,
    media: Array.isArray(raw.media) ? raw.media as Array<Record<string, unknown>> : [],
    idempotencyKey: raw.idempotency_key ? String(raw.idempotency_key) : null,
    createdAt: new Date(String(raw.created_at)),
    updatedAt: new Date(String(raw.updated_at)),
    publishedAt: raw.published_at ? new Date(String(raw.published_at)) : null,
  };
}

export async function findDraftGarmentRevision(input: {
  wardrobeItemId: string;
  operatorSubject: string;
}): Promise<GarmentRevisionRow | null> {
  const result = await (await getStudioDb()).execute(sql`
    select *
    from studio_garment_revisions
    where wardrobe_item_id = ${input.wardrobeItemId}::uuid
      and operator_subject = ${input.operatorSubject}
      and state = 'DRAFT'
    limit 1
  `);
  const row = resultRows(result)[0];
  return row ? revisionRow(row) : null;
}

export async function createDraftGarmentRevision(input: {
  wardrobeItemId: string;
  operatorSubject: string;
  baseSourceRevision: string;
  facts: IntakeFacts;
  media: Array<Record<string, unknown>>;
}): Promise<GarmentRevisionRow | null> {
  const result = await (await getStudioDb()).execute(sql`
    with owned_piece as (
      select id
      from studio_wardrobe_items
      where id = ${input.wardrobeItemId}::uuid
        and operator_subject = ${input.operatorSubject}
        and state <> 'ARCHIVED'
    ), next_revision as (
      select coalesce(max(revision_number), 0) + 1 as revision_number
      from studio_garment_revisions
      where wardrobe_item_id = ${input.wardrobeItemId}::uuid
    ), created as (
      insert into studio_garment_revisions (
        wardrobe_item_id, operator_subject, revision_number, version, state,
        base_source_revision, facts, media, created_at, updated_at
      )
      select
        owned_piece.id, ${input.operatorSubject}, next_revision.revision_number, 1, 'DRAFT',
        ${input.baseSourceRevision}, ${JSON.stringify(input.facts)}::jsonb,
        ${JSON.stringify(input.media)}::jsonb, now(), now()
      from owned_piece cross join next_revision
      where not exists (
        select 1 from studio_garment_revisions
        where wardrobe_item_id = owned_piece.id and state = 'DRAFT'
      )
      returning *
    ), event as (
      insert into studio_garment_events (
        wardrobe_item_id, operator_subject, event_type, summary, details, occurred_at
      )
      select wardrobe_item_id, operator_subject, 'REVISION_STARTED', 'Private revision started',
        jsonb_build_object('revisionNumber', revision_number), now()
      from created
    )
    select * from created
  `);
  const row = resultRows(result)[0];
  return row ? revisionRow(row) : null;
}

export async function updateDraftGarmentRevision(input: {
  id: string;
  wardrobeItemId: string;
  operatorSubject: string;
  expectedVersion: number;
  facts: IntakeFacts;
  media: Array<Record<string, unknown>>;
  eventType?: "FACTS_UPDATED" | "MEDIA_REPLACED";
  eventSummary?: string;
  mediaRole?: GarmentRevisionMediaRole;
}): Promise<GarmentRevisionRow | null> {
  const eventType = input.eventType ?? "FACTS_UPDATED";
  const eventSummary = input.eventSummary ?? "Private garment details updated";
  const result = await (await getStudioDb()).execute(sql`
    with updated as (
      update studio_garment_revisions
      set facts = ${JSON.stringify(input.facts)}::jsonb,
          media = ${JSON.stringify(input.media)}::jsonb,
          version = version + 1,
          updated_at = now()
      where id = ${input.id}::uuid
        and wardrobe_item_id = ${input.wardrobeItemId}::uuid
        and operator_subject = ${input.operatorSubject}
        and state = 'DRAFT'
        and version = ${input.expectedVersion}
      returning *
    ), event as (
      insert into studio_garment_events (
        wardrobe_item_id, operator_subject, event_type, summary, details, occurred_at
      )
      select wardrobe_item_id, operator_subject, ${eventType}, ${eventSummary},
        jsonb_build_object(
          'revisionNumber', revision_number,
          'mediaRole', ${input.mediaRole ?? null}
        ), now()
      from updated
    )
    select * from updated
  `);
  const row = resultRows(result)[0];
  return row ? revisionRow(row) : null;
}

export async function updatePrivateGarmentFacts(input: {
  wardrobeItemId: string;
  operatorSubject: string;
  expectedVersion: number;
  facts: IntakeFacts;
}): Promise<boolean> {
  const result = await (await getStudioDb()).execute(sql`
    with updated as (
      update studio_wardrobe_items
      set title = ${input.facts.title}, category = ${input.facts.category},
          colour = ${input.facts.colour}, size_label = ${input.facts.sizeLabel},
          condition = ${input.facts.condition}, price = ${input.facts.price},
          version = version + 1, updated_at = now()
      where id = ${input.wardrobeItemId}::uuid
        and operator_subject = ${input.operatorSubject}
        and version = ${input.expectedVersion}
        and state in ('DRAFT', 'READY')
        and not exists (
          select 1 from studio_catalogue_publications publication
          where publication.wardrobe_item_id = studio_wardrobe_items.id
        )
      returning id
    ), event as (
      insert into studio_garment_events (
        wardrobe_item_id, operator_subject, event_type, summary, details, occurred_at
      )
      select id, ${input.operatorSubject}, 'FACTS_UPDATED', 'Private garment details updated',
        ${JSON.stringify({ facts: input.facts })}::jsonb, now()
      from updated
    )
    select * from updated
  `);
  return resultRows(result).length === 1;
}

export async function replaceWardrobeApprovedFront(input: {
  wardrobeItemId: string;
  operatorSubject: string;
  expectedVersion: number;
  approvedAssetId: string;
}): Promise<boolean> {
  const result = await (await getStudioDb()).execute(sql`
    update studio_wardrobe_items item
    set approved_asset_id = ${input.approvedAssetId}::uuid,
        version = version + 1,
        updated_at = now()
    where item.id = ${input.wardrobeItemId}::uuid
      and item.operator_subject = ${input.operatorSubject}
      and item.version = ${input.expectedVersion}
      and item.state in ('DRAFT', 'READY')
      and exists (
        select 1 from studio_assets asset
        where asset.id = ${input.approvedAssetId}::uuid
          and asset.intake_id = item.intake_id
          and asset.role = 'GARMENT_FRONT'
          and asset.privacy = 'PRIVATE'
      )
    returning id
  `);
  return resultRows(result).length === 1;
}

export async function discardDraftGarmentRevision(input: {
  wardrobeItemId: string;
  operatorSubject: string;
  expectedVersion: number;
}): Promise<boolean> {
  const result = await (await getStudioDb()).execute(sql`
    with discarded as (
      update studio_garment_revisions
      set state = 'DISCARDED', version = version + 1, updated_at = now()
      where wardrobe_item_id = ${input.wardrobeItemId}::uuid
        and operator_subject = ${input.operatorSubject}
        and state = 'DRAFT'
        and version = ${input.expectedVersion}
      returning wardrobe_item_id, operator_subject, revision_number
    ), event as (
      insert into studio_garment_events (
        wardrobe_item_id, operator_subject, event_type, summary, details, occurred_at
      )
      select wardrobe_item_id, operator_subject, 'REVISION_DISCARDED', 'Private revision discarded',
        jsonb_build_object('revisionNumber', revision_number), now()
      from discarded
    )
    select * from discarded
  `);
  return resultRows(result).length === 1;
}

export async function changePublicationVisibility(input: {
  wardrobeItemId: string;
  operatorSubject: string;
  expectedSourceRevision: string;
  command: "UNPUBLISH" | "REPUBLISH";
}): Promise<boolean> {
  const fromState = input.command === "UNPUBLISH" ? "PUBLISHED" : "UNPUBLISHED";
  const toState = input.command === "UNPUBLISH" ? "UNPUBLISHED" : "PUBLISHED";
  const fromInventory = input.command === "UNPUBLISH" ? "AVAILABLE" : "ARCHIVED";
  const toInventory = input.command === "UNPUBLISH" ? "ARCHIVED" : "AVAILABLE";
  const summary = input.command === "UNPUBLISH" ? "Removed from Shop" : "Returned to Shop";
  const result = await (await getStudioDb()).execute(sql`
    with publication as (
      select publication.id, publication.sku, publication.wardrobe_item_id, publication.operator_subject
      from studio_catalogue_publications publication
      join studio_wardrobe_items item on item.id = publication.wardrobe_item_id
      where publication.wardrobe_item_id = ${input.wardrobeItemId}::uuid
        and publication.operator_subject = ${input.operatorSubject}
        and publication.source_revision = ${input.expectedSourceRevision}
        and publication.state = ${fromState}
        and item.state <> 'ARCHIVED'
      for update
    ), inventory as (
      update shop_inventory inventory
      set availability = ${toInventory}, updated_at = now()
      from publication
      where inventory.sku = publication.sku
        and inventory.availability = ${fromInventory}
        and inventory.on_hand = 1
        and inventory.reserved = 0
        and inventory.sold = inventory.returned
        and inventory.write_off = 0
      returning inventory.sku
    ), changed as (
      update studio_catalogue_publications target
      set state = ${toState}, published_at = case when ${toState} = 'PUBLISHED' then now() else target.published_at end
      from publication, inventory
      where target.id = publication.id and inventory.sku = publication.sku
      returning target.wardrobe_item_id, target.operator_subject
    ), event as (
      insert into studio_garment_events (
        wardrobe_item_id, operator_subject, event_type, summary, details, occurred_at
      )
      select wardrobe_item_id, operator_subject, ${input.command === "UNPUBLISH" ? "UNPUBLISHED" : "REPUBLISHED"},
        ${summary}, '{}'::jsonb, now()
      from changed
    )
    select * from changed
  `);
  return resultRows(result).length === 1;
}

export async function archiveGarment(input: {
  wardrobeItemId: string;
  operatorSubject: string;
  expectedVersion: number;
}): Promise<boolean> {
  const result = await (await getStudioDb()).execute(sql`
    with piece as (
      select item.id, item.operator_subject, publication.id as publication_id, publication.sku,
        publication.state as publication_state
      from studio_wardrobe_items item
      left join studio_catalogue_publications publication on publication.wardrobe_item_id = item.id
      where item.id = ${input.wardrobeItemId}::uuid
        and item.operator_subject = ${input.operatorSubject}
        and item.version = ${input.expectedVersion}
        and item.state in ('DRAFT', 'READY')
      for update of item
    ), inventory as (
      update shop_inventory inventory
      set availability = 'ARCHIVED', updated_at = now()
      from piece
      where piece.publication_id is not null
        and inventory.sku = piece.sku
        and inventory.availability in ('AVAILABLE', 'ARCHIVED')
        and inventory.on_hand = 1
        and inventory.reserved = 0
        and inventory.sold = inventory.returned
        and inventory.write_off = 0
      returning inventory.sku
    ), eligible as (
      select piece.* from piece
      where piece.publication_id is null
        or exists (select 1 from inventory where inventory.sku = piece.sku)
    ), publication as (
      update studio_catalogue_publications target
      set state = 'ARCHIVED'
      from eligible
      where target.id = eligible.publication_id
      returning target.id
    ), archived as (
      update studio_wardrobe_items target
      set state = 'ARCHIVED', version = version + 1, updated_at = now()
      from eligible
      where target.id = eligible.id
      returning target.id, target.operator_subject
    ), revisions as (
      update studio_garment_revisions revision
      set state = 'DISCARDED', version = version + 1, updated_at = now()
      from archived
      where revision.wardrobe_item_id = archived.id and revision.state = 'DRAFT'
    ), event as (
      insert into studio_garment_events (
        wardrobe_item_id, operator_subject, event_type, summary, details, occurred_at
      )
      select id, operator_subject, 'ARCHIVED', 'Piece archived', '{}'::jsonb, now()
      from archived
    )
    select * from archived
  `);
  return resultRows(result).length === 1;
}

export async function listGarmentEvents(input: {
  wardrobeItemId: string;
  operatorSubject: string;
}): Promise<GarmentLifecycleEvent[]> {
  const result = await (await getStudioDb()).execute(sql`
    select id, event_type, summary, details, occurred_at
    from studio_garment_events
    where wardrobe_item_id = ${input.wardrobeItemId}::uuid
      and operator_subject = ${input.operatorSubject}
    order by occurred_at desc, id desc
    limit 100
  `);
  return resultRows(result).map((row) => {
    const details = row.details && typeof row.details === "object" ? row.details as Record<string, unknown> : {};
    return {
      id: String(row.id),
      type: String(row.event_type) as GarmentLifecycleEvent["type"],
      summary: String(row.summary),
      ...(typeof details.detail === "string" ? { detail: details.detail } : {}),
      occurredAt: new Date(String(row.occurred_at)).toISOString(),
    };
  });
}

export async function appendGarmentEvent(input: {
  wardrobeItemId: string;
  operatorSubject: string;
  eventType: GarmentLifecycleEvent["type"];
  summary: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  await (await getStudioDb()).execute(sql`
    insert into studio_garment_events (
      wardrobe_item_id, operator_subject, event_type, summary, details, occurred_at
    ) values (
      ${input.wardrobeItemId}::uuid, ${input.operatorSubject}, ${input.eventType},
      ${input.summary}, ${JSON.stringify(input.details ?? {})}::jsonb, now()
    )
  `);
}
