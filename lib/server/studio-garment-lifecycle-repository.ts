import { sql } from "drizzle-orm";
import { getStudioDb } from "../../db/shop-postgres";
import type { IntakeFacts } from "../studio/engine/contracts";
import type {
  GarmentLifecycleEvent,
  GarmentPermanentDeleteReceipt,
  GarmentRevisionMediaRole,
} from "../studio/engine/garment-lifecycle-contracts";
import { studioWardrobeItemLockKey } from "./studio-wardrobe-item-lock";

export type GarmentPermanentDeleteEligibility = {
  eligible: boolean;
  blockers: string[];
};

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

function deletionReceipt(raw: Record<string, unknown>): GarmentPermanentDeleteReceipt {
  return {
    wardrobeItemId: String(raw.wardrobe_item_id),
    title: String(raw.title),
    consequence: String(raw.consequence),
    deletedAt: new Date(String(raw.deleted_at)).toISOString(),
  };
}

function databaseBoolean(value: unknown) {
  return value === true || value === "t" || value === "true" || value === 1 || value === "1";
}

export async function getGarmentPermanentDeleteEligibility(input: {
  wardrobeItemId: string;
  operatorSubject: string;
}): Promise<GarmentPermanentDeleteEligibility> {
  const result = await (await getStudioDb()).execute(sql`
    select
      item.state,
      exists (
        select 1 from studio_catalogue_publications publication
        where publication.wardrobe_item_id = item.id
      ) or exists (
        select 1 from studio_garment_revisions revision
        where revision.wardrobe_item_id = item.id
          and revision.state in ('PUBLISHED', 'SUPERSEDED')
      ) or exists (
        select 1 from studio_garment_events event
        where event.wardrobe_item_id = item.id
          and event.event_type in ('REVISION_PUBLISHED', 'PUBLISHED', 'UNPUBLISHED', 'REPUBLISHED')
      ) as has_shop_history,
      exists (
        select 1 from studio_engine_work_ownership ownership
        where ownership.wardrobe_item_id = item.id
      ) or exists (
        select 1 from studio_atelier_styling_advisories advisory
        where advisory.wardrobe_item_id = item.id
      ) or exists (
        select 1 from studio_atelier_operations operation
        where operation.wardrobe_item_id = item.id
      ) or exists (
        select 1 from studio_atelier_shop_adoption_receipts receipt
        where receipt.wardrobe_item_id = item.id
      ) as has_atelier_history,
      exists (
        select 1 from studio_physical_observations observation
        where observation.operator_subject = item.operator_subject
          and (observation.wardrobe_item_id = item.id or observation.piece_key = 'wardrobe:' || item.id::text)
      ) or exists (
        select 1 from studio_piece_custody custody
        where custody.operator_subject = item.operator_subject
          and custody.piece_key = 'wardrobe:' || item.id::text
      ) or exists (
        select 1 from studio_piece_custody_commands command
        where command.operator_subject = item.operator_subject
          and command.piece_key = 'wardrobe:' || item.id::text
      ) or exists (
        select 1 from studio_stocktakes stocktake,
          jsonb_array_elements(stocktake.expected_pieces) expected_piece
        where stocktake.operator_subject = item.operator_subject
          and (
            expected_piece->>'wardrobeItemId' = item.id::text
            or expected_piece->>'pieceKey' = 'wardrobe:' || item.id::text
          )
      ) as has_inventory_history
      , exists (
        select 1 from studio_media_completion_jobs job
        where job.operator_subject = item.operator_subject
          and job.target_kind = 'WARDROBE_ITEM'
          and job.target_key = item.id::text
      ) or exists (
        select 1 from studio_pending_product_captures capture
        where capture.operator_subject = item.operator_subject
          and capture.sku = 'INTAKE-' || upper(substr(replace(item.id::text, '-', ''), 1, 32))
      ) as has_media_history
    from studio_wardrobe_items item
    where item.id = ${input.wardrobeItemId}::uuid
      and item.operator_subject = ${input.operatorSubject}
    limit 1
  `);
  const row = resultRows(result)[0];
  if (!row) return { eligible: false, blockers: ["This piece no longer exists."] };
  const blockers: string[] = [];
  if (String(row.state) !== "ARCHIVED") blockers.push("Archive the piece first.");
  if (databaseBoolean(row.has_shop_history)) blockers.push("Published Shop history must be preserved.");
  if (databaseBoolean(row.has_atelier_history)) blockers.push("Atelier work or approved media must be preserved.");
  if (databaseBoolean(row.has_inventory_history)) blockers.push("Inventory or stock count history must be preserved.");
  if (databaseBoolean(row.has_media_history)) blockers.push("Generated or approved media history must be preserved.");
  return { eligible: blockers.length === 0, blockers };
}

export async function findGarmentPermanentDeleteReceipt(input: {
  wardrobeItemId: string;
  operatorSubject: string;
  idempotencyKey: string;
}): Promise<GarmentPermanentDeleteReceipt | null> {
  const result = await (await getStudioDb()).execute(sql`
    select wardrobe_item_id, title, consequence, deleted_at
    from studio_garment_deletions
    where wardrobe_item_id = ${input.wardrobeItemId}::uuid
      and operator_subject = ${input.operatorSubject}
      and idempotency_key = ${input.idempotencyKey}
    limit 1
  `);
  const row = resultRows(result)[0];
  return row ? deletionReceipt(row) : null;
}

export async function permanentlyDeleteArchivedGarment(input: {
  wardrobeItemId: string;
  operatorSubject: string;
  actorSubject: string;
  expectedVersion: number;
  idempotencyKey: string;
  requestFingerprint: string;
}): Promise<{ kind: "DELETED" | "INELIGIBLE" | "VERSION_CONFLICT" | "IDEMPOTENCY_CONFLICT"; receipt?: GarmentPermanentDeleteReceipt }> {
  const db = await getStudioDb();
  const existingResult = await db.execute(sql`
    select wardrobe_item_id, title, consequence, deleted_at, request_fingerprint
    from studio_garment_deletions
    where operator_subject = ${input.operatorSubject}
      and (idempotency_key = ${input.idempotencyKey} or wardrobe_item_id = ${input.wardrobeItemId}::uuid)
    order by (idempotency_key = ${input.idempotencyKey}) desc
    limit 1
  `);
  const existing = resultRows(existingResult)[0];
  if (existing) {
    if (String(existing.request_fingerprint) !== input.requestFingerprint) {
      return { kind: "IDEMPOTENCY_CONFLICT" };
    }
    return { kind: "DELETED", receipt: deletionReceipt(existing) };
  }

  const result = await db.execute(sql`
    with command_lock as (
      select pg_advisory_xact_lock(hashtextextended(
        ${studioWardrobeItemLockKey(input.operatorSubject, input.wardrobeItemId)}, 0
      ))
    ), piece as (
      select item.id, item.intake_id, item.operator_subject, item.title, item.state, item.version
      from studio_wardrobe_items item cross join command_lock
      where item.id = ${input.wardrobeItemId}::uuid
        and item.operator_subject = ${input.operatorSubject}
      for update
    ), signals as (
      select piece.*,
        exists (
          select 1 from studio_catalogue_publications publication
          where publication.wardrobe_item_id = piece.id
        ) or exists (
          select 1 from studio_garment_revisions revision
          where revision.wardrobe_item_id = piece.id
            and revision.state in ('PUBLISHED', 'SUPERSEDED')
        ) or exists (
          select 1 from studio_garment_events event
          where event.wardrobe_item_id = piece.id
            and event.event_type in ('REVISION_PUBLISHED', 'PUBLISHED', 'UNPUBLISHED', 'REPUBLISHED')
        ) as has_shop_history,
        exists (
          select 1 from studio_engine_work_ownership ownership
          where ownership.wardrobe_item_id = piece.id
        ) or exists (
          select 1 from studio_atelier_styling_advisories advisory
          where advisory.wardrobe_item_id = piece.id
        ) or exists (
          select 1 from studio_atelier_operations operation
          where operation.wardrobe_item_id = piece.id
        ) or exists (
          select 1 from studio_atelier_shop_adoption_receipts adoption
          where adoption.wardrobe_item_id = piece.id
        ) as has_atelier_history,
        exists (
          select 1 from studio_physical_observations observation
          where observation.operator_subject = piece.operator_subject
            and (observation.wardrobe_item_id = piece.id or observation.piece_key = 'wardrobe:' || piece.id::text)
        ) or exists (
          select 1 from studio_piece_custody custody
          where custody.operator_subject = piece.operator_subject
            and custody.piece_key = 'wardrobe:' || piece.id::text
        ) or exists (
          select 1 from studio_piece_custody_commands command
          where command.operator_subject = piece.operator_subject
            and command.piece_key = 'wardrobe:' || piece.id::text
        ) or exists (
          select 1 from studio_stocktakes stocktake,
            jsonb_array_elements(stocktake.expected_pieces) expected_piece
          where stocktake.operator_subject = piece.operator_subject
            and (
              expected_piece->>'wardrobeItemId' = piece.id::text
              or expected_piece->>'pieceKey' = 'wardrobe:' || piece.id::text
            )
        ) as has_inventory_history,
        exists (
          select 1 from studio_media_completion_jobs job
          where job.operator_subject = piece.operator_subject
            and job.target_kind = 'WARDROBE_ITEM'
            and job.target_key = piece.id::text
        ) or exists (
          select 1 from studio_pending_product_captures capture
          where capture.operator_subject = piece.operator_subject
            and capture.sku = 'INTAKE-' || upper(substr(replace(piece.id::text, '-', ''), 1, 32))
        ) as has_media_history
      from piece
    ), receipt as (
      insert into studio_garment_deletions (
        wardrobe_item_id, intake_id, operator_subject, actor_subject, idempotency_key,
        request_fingerprint, expected_version, title, consequence, deleted_at
      )
      select id, intake_id, operator_subject, ${input.actorSubject}, ${input.idempotencyKey},
        ${input.requestFingerprint}, ${input.expectedVersion}, title,
        'The piece was removed from Wardrobe. Private engine evidence remains retained for integrity.', now()
      from signals
      where state = 'ARCHIVED'
        and version = ${input.expectedVersion}
        and not has_shop_history
        and not has_atelier_history
        and not has_inventory_history
        and not has_media_history
      on conflict do nothing
      returning wardrobe_item_id, title, consequence, deleted_at
    ), deleted_events as (
      delete from studio_garment_events event
      using receipt
      where event.wardrobe_item_id = receipt.wardrobe_item_id
      returning event.wardrobe_item_id
    ), deleted_revisions as (
      delete from studio_garment_revisions revision
      using receipt
      where revision.wardrobe_item_id = receipt.wardrobe_item_id
        and revision.state in ('DRAFT', 'DISCARDED')
        and (select count(*) from deleted_events) >= 0
      returning revision.wardrobe_item_id
    ), deleted_piece as (
      delete from studio_wardrobe_items item
      using receipt
      where item.id = receipt.wardrobe_item_id
        and (select count(*) from deleted_events) >= 0
        and (select count(*) from deleted_revisions) >= 0
      returning item.id
    )
    select 'DELETED' as result_kind, receipt.*
    from receipt
    inner join deleted_piece on deleted_piece.id = receipt.wardrobe_item_id
    union all
    select 'VERSION_CONFLICT' as result_kind, null::uuid, null::text, null::text, null::timestamptz
    from signals
    where version <> ${input.expectedVersion}
    union all
    select 'INELIGIBLE' as result_kind, null::uuid, null::text, null::text, null::timestamptz
    from signals
    where version = ${input.expectedVersion}
      and (
        state <> 'ARCHIVED'
        or has_shop_history
        or has_atelier_history
        or has_inventory_history
        or has_media_history
      )
    limit 1
  `);
  const row = resultRows(result)[0];
  if (row && String(row.result_kind) === "DELETED") {
    return { kind: "DELETED", receipt: deletionReceipt(row) };
  }
  if (row && String(row.result_kind) === "VERSION_CONFLICT") return { kind: "VERSION_CONFLICT" };
  if (row && String(row.result_kind) === "INELIGIBLE") return { kind: "INELIGIBLE" };

  // A concurrent identical request can win the unique receipt claim while this
  // statement waits. Read again after the statement obtains a fresh snapshot.
  const concurrentResult = await db.execute(sql`
    select wardrobe_item_id, title, consequence, deleted_at, request_fingerprint
    from studio_garment_deletions
    where operator_subject = ${input.operatorSubject}
      and (idempotency_key = ${input.idempotencyKey} or wardrobe_item_id = ${input.wardrobeItemId}::uuid)
    order by (idempotency_key = ${input.idempotencyKey}) desc
    limit 1
  `);
  const concurrent = resultRows(concurrentResult)[0];
  if (!concurrent) return { kind: "INELIGIBLE" };
  if (String(concurrent.request_fingerprint) !== input.requestFingerprint) {
    return { kind: "IDEMPOTENCY_CONFLICT" };
  }
  return { kind: "DELETED", receipt: deletionReceipt(concurrent) };
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
      update studio_wardrobe_items item
      set title = ${input.facts.title}, category = ${input.facts.category},
          colour = ${input.facts.colour}, size_label = ${input.facts.sizeLabel},
          condition = ${input.facts.condition}, price = ${input.facts.price},
          version = version + 1, updated_at = now()
      from studio_intakes intake
      where item.id = ${input.wardrobeItemId}::uuid
        and item.operator_subject = ${input.operatorSubject}
        and item.version = ${input.expectedVersion}
        and item.state in ('DRAFT', 'READY')
        and intake.id = item.intake_id
        and intake.operator_subject = ${input.operatorSubject}
        and not exists (
          select 1 from studio_catalogue_publications publication
          where publication.wardrobe_item_id = item.id
        )
      returning item.id, item.intake_id
    ), intake_updated as (
      update studio_intakes intake
      set facts = intake.facts || ${JSON.stringify(input.facts)}::jsonb,
          updated_at = now()
      from updated
      where intake.id = updated.intake_id
        and intake.operator_subject = ${input.operatorSubject}
      returning updated.id
    ), event as (
      insert into studio_garment_events (
        wardrobe_item_id, operator_subject, event_type, summary, details, occurred_at
      )
      select id, ${input.operatorSubject}, 'FACTS_UPDATED', 'Private garment details updated',
        ${JSON.stringify({ facts: input.facts })}::jsonb, now()
      from intake_updated
    )
    select * from intake_updated
  `);
  return resultRows(result).length === 1;
}

export async function findPrivateGarmentDescription(input: {
  wardrobeItemId: string;
  operatorSubject: string;
}): Promise<string | null> {
  const result = await (await getStudioDb()).execute(sql`
    select intake.facts->>'description' as description
    from studio_wardrobe_items item
    join studio_intakes intake on intake.id = item.intake_id
    where item.id = ${input.wardrobeItemId}::uuid
      and item.operator_subject = ${input.operatorSubject}
      and intake.operator_subject = ${input.operatorSubject}
    limit 1
  `);
  const description = resultRows(result)[0]?.description;
  return typeof description === "string" && description.trim() ? description.trim() : null;
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
