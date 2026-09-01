import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getStudioDb } from "../../db/shop-postgres";
import {
  shopCatalogueItems,
  shopInventory,
  studioCataloguePublications,
} from "../../db/shop-postgres-schema";
import { CURRENT_SHOP_DROP } from "../shop/current-drop";
import {
  parseStudioAtelierPublicationMediaSet,
  type PublicationMediaSlot,
  type StudioAtelierPublicationMedia,
  type StudioPublicationReceipt,
} from "../studio/engine/catalogue-publication-contracts";

type LegacyCataloguePublicationMedia = (typeof studioCataloguePublications.$inferSelect)["media"][number];
export type CataloguePublicationRow = Omit<
  typeof studioCataloguePublications.$inferSelect,
  "media"
> & {
  media: Array<LegacyCataloguePublicationMedia | StudioAtelierPublicationMedia>;
};
export type CataloguePublicationWithDrop = CataloguePublicationRow & {
  dropLabel: string;
  description: string;
};
export type CataloguePublicationWithInventory = CataloguePublicationWithDrop & {
  inventory?: {
    availability: "AVAILABLE" | "RESERVED" | "SOLD" | "ARCHIVED";
    onHand: number;
    reserved: number;
    sold: number;
    returned: number;
    writeOff: number;
    updatedAt: Date;
  };
};

export type PublicPublicationMedia = {
  slot: PublicationMediaSlot;
  src: string;
  pathname: string;
  sourceSha256: string;
  sha256: string;
  mimeType: string;
  width: number;
  height: number;
};

export type CatalogueBaselineMedia = {
  origin: "CATALOGUE_BASELINE";
  slot: PublicationMediaSlot;
  src: string;
};

export async function findCataloguePublication(input: {
  wardrobeItemId: string;
  operatorSubject: string;
}): Promise<CataloguePublicationWithDrop | null> {
  const [row] = await (await getStudioDb()).select({
    publication: studioCataloguePublications,
    dropLabel: shopCatalogueItems.dropLabel,
    description: shopCatalogueItems.note,
  }).from(studioCataloguePublications).innerJoin(
    shopCatalogueItems,
    eq(shopCatalogueItems.sku, studioCataloguePublications.sku),
  ).where(and(
    eq(studioCataloguePublications.wardrobeItemId, input.wardrobeItemId),
    eq(studioCataloguePublications.operatorSubject, input.operatorSubject),
  )).limit(1);
  return row ? { ...row.publication, dropLabel: row.dropLabel, description: row.description } : null;
}

export async function listCataloguePublications(operatorSubject: string): Promise<CataloguePublicationWithInventory[]> {
  const rows = await (await getStudioDb()).select({
    publication: studioCataloguePublications,
    dropLabel: shopCatalogueItems.dropLabel,
    description: shopCatalogueItems.note,
    availability: shopInventory.availability,
    onHand: shopInventory.onHand,
    reserved: shopInventory.reserved,
    sold: shopInventory.sold,
    returned: shopInventory.returned,
    writeOff: shopInventory.writeOff,
    inventoryUpdatedAt: shopInventory.updatedAt,
  }).from(studioCataloguePublications).innerJoin(
    shopCatalogueItems,
    eq(shopCatalogueItems.sku, studioCataloguePublications.sku),
  ).innerJoin(
    shopInventory,
    eq(shopInventory.sku, studioCataloguePublications.sku),
  ).where(and(
    eq(studioCataloguePublications.operatorSubject, operatorSubject),
    inArray(studioCataloguePublications.state, ["PUBLISHED", "UNPUBLISHED", "ARCHIVED"]),
  )).orderBy(desc(studioCataloguePublications.publishedAt));
  return rows.map((row) => ({
    ...row.publication,
    dropLabel: row.dropLabel,
    description: row.description,
    inventory: {
      availability: row.availability,
      onHand: row.onHand,
      reserved: row.reserved,
      sold: row.sold,
      returned: row.returned,
      writeOff: row.writeOff,
      updatedAt: row.inventoryUpdatedAt,
    },
  }));
}

export function cataloguePublicationReceipt(
  row: CataloguePublicationRow & Partial<Pick<CataloguePublicationWithInventory, "dropLabel" | "inventory">>,
): StudioPublicationReceipt {
  return {
    publicationId: row.id,
    wardrobeItemId: row.wardrobeItemId,
    sku: row.sku,
    slug: row.slug,
    origin: row.origin as StudioPublicationReceipt["origin"],
    state: row.state as StudioPublicationReceipt["state"],
    publishedAt: row.publishedAt.toISOString(),
    shopUrl: `/shop/products/${row.slug}`,
    ...(row.dropLabel ? { drop: row.dropLabel } : {}),
    ...(row.inventory ? { inventory: {
      ...row.inventory,
      updatedAt: row.inventory.updatedAt.toISOString(),
    } } : {}),
  };
}

type AtomicPublicationInput = {
  wardrobeItemId: string;
  intakeId: string;
  operatorSubject: string;
  idempotencyKey: string;
  sourceRevision: string;
  expectedVersion: number;
  approvedAssetId: string;
  approvedAssetSha256: string;
  captureKey: string;
  backCaptureId: string;
  backCaptureSha256: string;
  detailCaptureId: string;
  detailCaptureSha256: string;
  slug: string;
  title: string;
  description: string;
  sourceCategory: string;
  category: string;
  price: number;
  taggedSize: string;
  condition: string;
  colour: string;
  tone: string;
  silhouette: string;
  facts: Record<string, unknown>;
  media: PublicPublicationMedia[];
};

export type AtomicRevisionPublicationInput = AtomicPublicationInput & {
  baseSourceRevision: string;
  revisionId: string;
  revisionVersion: number;
  sku: string;
};

export type AtomicAdoptedRevisionPublicationInput = {
  wardrobeItemId: string;
  intakeId: string;
  operatorSubject: string;
  idempotencyKey: string;
  baseSourceRevision: string;
  sourceRevision: string;
  expectedVersion: number;
  revisionId: string;
  revisionVersion: number;
  sku: string;
  slug: string;
  title: string;
  description: string;
  sourceCategory: string;
  category: string;
  price: number;
  taggedSize: string;
  condition: string;
  colour: string;
  tone: string;
  silhouette: string;
  facts: Record<string, unknown>;
};

export type AtomicAtelierAdoptionRevisionPublicationInput = Omit<
  AtomicAdoptedRevisionPublicationInput,
  "sourceRevision"
> & {
  receiptId: string;
  media: readonly StudioAtelierPublicationMedia[];
};

/**
 * One SQL statement is the transaction boundary. The guarded UPDATE supplies
 * every downstream INSERT; a stale piece or replaced capture therefore writes
 * nothing, while any uniqueness failure rolls the complete statement back.
 */
export async function insertCataloguePublicationAtomically(
  input: AtomicPublicationInput,
): Promise<CataloguePublicationWithDrop | null> {
  const database = await getStudioDb();
  const catalogueMedia = input.media.map(({ slot, src }) => ({ slot, src }));
  const details = [input.colour, input.taggedSize, input.condition];
  const result = await database.execute(sql`
    with ready_piece as (
      update studio_wardrobe_items
      set state = 'READY', version = version + 1, updated_at = now()
      where id = ${input.wardrobeItemId}::uuid
        and intake_id = ${input.intakeId}::uuid
        and operator_subject = ${input.operatorSubject}
        and state in ('DRAFT', 'READY')
        and quantity = 1
        and version = ${input.expectedVersion}
        and title = ${input.title}
        and category = ${input.sourceCategory}
        and colour = ${input.colour}
        and size_label = ${input.taggedSize}
        and condition = ${input.condition}
        and price = ${input.price}
        and approved_asset_id = ${input.approvedAssetId}::uuid
        and exists (
          select 1 from studio_assets
          where id = ${input.approvedAssetId}::uuid
            and intake_id = ${input.intakeId}::uuid
            and role = 'GARMENT_FRONT'
            and sha256 = ${input.approvedAssetSha256}
            and privacy = 'PRIVATE'
        )
        and exists (
          select 1 from studio_pending_product_captures capture
          where capture.id = ${input.backCaptureId}::uuid
            and capture.operator_subject = ${input.operatorSubject}
            and capture.sku = ${input.captureKey}
            and capture.role = 'GARMENT_BACK'
            and capture.sha256 = ${input.backCaptureSha256}
            and capture.privacy = 'PRIVATE'
            and (
              (capture.origin = 'DIRECT' and capture.completion_job_id is null)
              or (capture.origin = 'AI_DERIVED' and exists (
                select 1 from studio_media_completion_jobs job
                where job.id = capture.completion_job_id
                  and job.operator_subject = capture.operator_subject
                  and job.target_kind = 'WARDROBE_ITEM'
                  and job.target_key = ${input.wardrobeItemId}
                  and job.role = capture.role
                  and job.state = 'APPROVED'
                  and job.output_blob_pathname = capture.blob_pathname
                  and job.output_sha256 = capture.sha256
              ))
            )
        )
        and exists (
          select 1 from studio_pending_product_captures capture
          where capture.id = ${input.detailCaptureId}::uuid
            and capture.operator_subject = ${input.operatorSubject}
            and capture.sku = ${input.captureKey}
            and capture.role = 'FABRIC_DETAIL'
            and capture.sha256 = ${input.detailCaptureSha256}
            and capture.privacy = 'PRIVATE'
            and (
              (capture.origin = 'DIRECT' and capture.completion_job_id is null)
              or (capture.origin = 'AI_DERIVED' and exists (
                select 1 from studio_media_completion_jobs job
                where job.id = capture.completion_job_id
                  and job.operator_subject = capture.operator_subject
                  and job.target_kind = 'WARDROBE_ITEM'
                  and job.target_key = ${input.wardrobeItemId}
                  and job.role = capture.role
                  and job.state = 'APPROVED'
                  and job.output_blob_pathname = capture.blob_pathname
                  and job.output_sha256 = capture.sha256
              ))
            )
        )
        and not exists (
          select 1 from studio_catalogue_publications
          where wardrobe_item_id = ${input.wardrobeItemId}::uuid
        )
      returning id
    ), public_identity as (
      select 'JUW-' || lpad(nextval('shop_dynamic_sku_sequence')::text, 3, '0') as sku
      from ready_piece
    ), catalogue as (
      insert into shop_catalogue_items (
        sku, slug, name, category, price, tagged_size, fit, condition,
        colour, drop_label, tone, silhouette, note, story, details,
        measurements, model_anchor, media, created_at, updated_at
      )
      select
        public_identity.sku, ${input.slug}, ${input.title}, ${input.category}, ${input.price},
        ${input.taggedSize}, 'Measurements confirmed before payment', ${input.condition},
        ${input.colour}, ${CURRENT_SHOP_DROP}, ${input.tone}, ${input.silhouette},
        ${input.description}, ${`${input.colour} · ${input.condition}`},
        ${JSON.stringify(details)}::jsonb, '[]'::jsonb, '{}'::jsonb,
        ${JSON.stringify(catalogueMedia)}::jsonb, now(), now()
      from public_identity
      returning sku
    ), inventory as (
      insert into shop_inventory (
        sku, availability, on_hand, reserved, sold, returned, write_off, updated_at
      )
      select sku, 'AVAILABLE', 1, 0, 0, 0, 0, now()
      from catalogue
      returning sku
    )
    , publication as (
      insert into studio_catalogue_publications (
        wardrobe_item_id, operator_subject, idempotency_key, source_revision,
        sku, slug, state, facts, media, published_at, created_at
      )
      select
        ${input.wardrobeItemId}::uuid, ${input.operatorSubject}, ${input.idempotencyKey},
        ${input.sourceRevision}, inventory.sku, ${input.slug}, 'PUBLISHED',
        ${JSON.stringify(input.facts)}::jsonb, ${JSON.stringify(input.media)}::jsonb,
        now(), now()
      from inventory
      returning *
    ), revision as (
      insert into studio_garment_revisions (
        wardrobe_item_id, operator_subject, revision_number, version, state,
        base_source_revision, facts, media, idempotency_key,
        created_at, updated_at, published_at
      )
      select
        publication.wardrobe_item_id, publication.operator_subject, 1, 1, 'PUBLISHED',
        publication.source_revision, publication.facts, publication.media,
        publication.idempotency_key, now(), now(), now()
      from publication
      on conflict (wardrobe_item_id, revision_number) do nothing
    ), event as (
      insert into studio_garment_events (
        wardrobe_item_id, operator_subject, event_type, summary, details, occurred_at
      )
      select wardrobe_item_id, operator_subject, 'PUBLISHED', 'Published to Shop',
        jsonb_build_object('sku', sku, 'slug', slug, 'revisionNumber', 1), now()
      from publication
    )
    select * from publication
  `);
  const rows = "rows" in result ? result.rows : result;
  const raw = Array.isArray(rows) ? rows[0] as Record<string, unknown> | undefined : undefined;
  if (!raw) return null;
  return {
    id: String(raw.id),
    wardrobeItemId: String(raw.wardrobe_item_id),
    operatorSubject: String(raw.operator_subject),
    idempotencyKey: String(raw.idempotency_key),
    sourceRevision: String(raw.source_revision),
    sku: String(raw.sku),
    slug: String(raw.slug),
    origin: String(raw.origin) as CataloguePublicationRow["origin"],
    state: "PUBLISHED",
    facts: raw.facts as Record<string, unknown>,
    media: raw.media as CataloguePublicationRow["media"],
    baseline: raw.baseline && typeof raw.baseline === "object" ? raw.baseline as Record<string, unknown> : null,
    publishedAt: new Date(String(raw.published_at)),
    createdAt: new Date(String(raw.created_at)),
    dropLabel: CURRENT_SHOP_DROP,
    description: input.description,
  };
}

/**
 * A live revision is swapped in one guarded statement. Public media is copied
 * before this call, so the previous catalogue row remains fully live until the
 * revision, garment truth, catalogue projection and ledger can all advance.
 */
export async function publishCatalogueRevisionAtomically(
  input: AtomicRevisionPublicationInput,
): Promise<CataloguePublicationRow | null> {
  const database = await getStudioDb();
  const catalogueMedia = input.media.map(({ slot, src }) => ({ slot, src }));
  const details = [input.colour, input.taggedSize, input.condition];
  const result = await database.execute(sql`
    with revision_source as (
      select revision.id, revision.wardrobe_item_id, revision.operator_subject,
        revision.revision_number, publication.id as publication_id,
        publication.state as publication_state, publication.sku, publication.slug
      from studio_garment_revisions revision
      join studio_catalogue_publications publication
        on publication.wardrobe_item_id = revision.wardrobe_item_id
       and publication.operator_subject = revision.operator_subject
      join studio_wardrobe_items item on item.id = revision.wardrobe_item_id
      where revision.id = ${input.revisionId}::uuid
        and revision.wardrobe_item_id = ${input.wardrobeItemId}::uuid
        and revision.operator_subject = ${input.operatorSubject}
        and revision.state = 'DRAFT'
        and revision.version = ${input.revisionVersion}
        and publication.source_revision = ${input.baseSourceRevision}
        and publication.sku = ${input.sku}
        and publication.slug = ${input.slug}
        and publication.state in ('PUBLISHED', 'UNPUBLISHED')
        and item.intake_id = ${input.intakeId}::uuid
        and item.quantity = 1
        and item.state in ('DRAFT', 'READY')
      for update of revision, publication, item
    ), inventory_ready as (
      update shop_inventory inventory
      set availability = 'AVAILABLE', updated_at = now()
      from revision_source
      where inventory.sku = revision_source.sku
        and inventory.availability in ('AVAILABLE', 'ARCHIVED')
        and inventory.on_hand = 1
        and inventory.reserved = 0
        and inventory.sold = inventory.returned
        and inventory.write_off = 0
      returning inventory.sku
    ), piece as (
      update studio_wardrobe_items item
      set title = ${input.title}, category = ${input.sourceCategory},
        colour = ${input.colour}, size_label = ${input.taggedSize},
        condition = ${input.condition}, price = ${input.price},
        state = 'READY', approved_asset_id = ${input.approvedAssetId}::uuid,
        version = version + 1, updated_at = now()
      from revision_source, inventory_ready
      where item.id = revision_source.wardrobe_item_id
        and inventory_ready.sku = revision_source.sku
        and item.version = ${input.expectedVersion}
        and exists (
          select 1 from studio_assets
          where id = ${input.approvedAssetId}::uuid
            and intake_id = ${input.intakeId}::uuid
            and role = 'GARMENT_FRONT'
            and sha256 = ${input.approvedAssetSha256}
            and privacy = 'PRIVATE'
        )
        and exists (
          select 1 from studio_pending_product_captures capture
          where capture.id = ${input.backCaptureId}::uuid
            and capture.operator_subject = ${input.operatorSubject}
            and capture.sku = ${input.captureKey}
            and capture.role = 'GARMENT_BACK'
            and capture.sha256 = ${input.backCaptureSha256}
            and capture.privacy = 'PRIVATE'
            and (
              (capture.origin = 'DIRECT' and capture.completion_job_id is null)
              or (capture.origin = 'AI_DERIVED' and exists (
                select 1 from studio_media_completion_jobs job
                where job.id = capture.completion_job_id
                  and job.operator_subject = capture.operator_subject
                  and job.target_kind = 'WARDROBE_ITEM'
                  and job.target_key = ${input.wardrobeItemId}
                  and job.role = capture.role
                  and job.state = 'APPROVED'
                  and job.output_blob_pathname = capture.blob_pathname
                  and job.output_sha256 = capture.sha256
              ))
            )
        )
        and exists (
          select 1 from studio_pending_product_captures capture
          where capture.id = ${input.detailCaptureId}::uuid
            and capture.operator_subject = ${input.operatorSubject}
            and capture.sku = ${input.captureKey}
            and capture.role = 'FABRIC_DETAIL'
            and capture.sha256 = ${input.detailCaptureSha256}
            and capture.privacy = 'PRIVATE'
            and (
              (capture.origin = 'DIRECT' and capture.completion_job_id is null)
              or (capture.origin = 'AI_DERIVED' and exists (
                select 1 from studio_media_completion_jobs job
                where job.id = capture.completion_job_id
                  and job.operator_subject = capture.operator_subject
                  and job.target_kind = 'WARDROBE_ITEM'
                  and job.target_key = ${input.wardrobeItemId}
                  and job.role = capture.role
                  and job.state = 'APPROVED'
                  and job.output_blob_pathname = capture.blob_pathname
                  and job.output_sha256 = capture.sha256
              ))
            )
        )
      returning item.id
    ), catalogue as (
      update shop_catalogue_items target
      set name = ${input.title}, category = ${input.category}, price = ${input.price},
        tagged_size = ${input.taggedSize}, condition = ${input.condition},
        colour = ${input.colour}, tone = ${input.tone}, silhouette = ${input.silhouette},
        note = ${input.description},
        details = ${JSON.stringify(details)}::jsonb,
        media = ${JSON.stringify(catalogueMedia)}::jsonb,
        updated_at = now()
      from revision_source, inventory_ready, piece
      where target.sku = revision_source.sku
        and inventory_ready.sku = target.sku
      returning target.sku
    ), publication as (
      update studio_catalogue_publications target
      set idempotency_key = ${input.idempotencyKey},
        source_revision = ${input.sourceRevision},
        state = 'PUBLISHED', facts = ${JSON.stringify(input.facts)}::jsonb,
        media = ${JSON.stringify(input.media)}::jsonb,
        published_at = now()
      from revision_source, catalogue
      where target.id = revision_source.publication_id and catalogue.sku = target.sku
      returning target.*
    ), revisions as (
      update studio_garment_revisions revision
      set state = case when revision.id = revision_source.id then 'PUBLISHED' else 'SUPERSEDED' end,
        version = version + 1,
        base_source_revision = case when revision.id = revision_source.id then ${input.sourceRevision} else revision.base_source_revision end,
        facts = case when revision.id = revision_source.id then ${JSON.stringify(input.facts)}::jsonb else revision.facts end,
        media = case when revision.id = revision_source.id then ${JSON.stringify(input.media)}::jsonb else revision.media end,
        idempotency_key = case when revision.id = revision_source.id then ${input.idempotencyKey} else revision.idempotency_key end,
        published_at = case when revision.id = revision_source.id then now() else revision.published_at end,
        updated_at = now()
      from revision_source, publication
      where revision.wardrobe_item_id = revision_source.wardrobe_item_id
        and (revision.id = revision_source.id or revision.state = 'PUBLISHED')
      returning revision.id, revision.revision_number
    ), published_revision as (
      select revisions.revision_number
      from revisions, revision_source
      where revisions.id = revision_source.id
    ), event as (
      insert into studio_garment_events (
        wardrobe_item_id, operator_subject, event_type, summary, details, occurred_at
      )
      select publication.wardrobe_item_id, publication.operator_subject,
        'REVISION_PUBLISHED', 'Published revision ' || published_revision.revision_number,
        jsonb_build_object(
          'revisionNumber', published_revision.revision_number,
          'sku', publication.sku,
          'slug', publication.slug
        ), now()
      from publication cross join published_revision
    )
    select * from publication
  `);
  const raw = resultRows(result)[0];
  if (!raw) return null;
  return {
    id: String(raw.id),
    wardrobeItemId: String(raw.wardrobe_item_id),
    operatorSubject: String(raw.operator_subject),
    idempotencyKey: String(raw.idempotency_key),
    sourceRevision: String(raw.source_revision),
    sku: String(raw.sku),
    slug: String(raw.slug),
    origin: String(raw.origin) as CataloguePublicationRow["origin"],
    state: "PUBLISHED",
    facts: raw.facts as Record<string, unknown>,
    media: raw.media as CataloguePublicationRow["media"],
    baseline: raw.baseline && typeof raw.baseline === "object" ? raw.baseline as Record<string, unknown> : null,
    publishedAt: new Date(String(raw.published_at)),
    createdAt: new Date(String(raw.created_at)),
  };
}

/**
 * Catalogue-adopted pieces keep their authored Shop media and long-form story.
 * A facts revision updates only the customer-facing facts and short description that Lulu reviewed;
 * the immutable adoption baseline remains available to the release verifier.
 */
export async function publishAdoptedCatalogueRevisionAtomically(
  input: AtomicAdoptedRevisionPublicationInput,
): Promise<CataloguePublicationRow | null> {
  const result = await (await getStudioDb()).execute(sql`
    with revision_source as (
      select revision.id, revision.wardrobe_item_id, revision.operator_subject,
        revision.revision_number, publication.id as publication_id,
        publication.sku, publication.slug
      from studio_garment_revisions revision
      join studio_catalogue_publications publication
        on publication.wardrobe_item_id = revision.wardrobe_item_id
       and publication.operator_subject = revision.operator_subject
      join studio_wardrobe_items item on item.id = revision.wardrobe_item_id
      where revision.id = ${input.revisionId}::uuid
        and revision.wardrobe_item_id = ${input.wardrobeItemId}::uuid
        and revision.operator_subject = ${input.operatorSubject}
        and revision.state = 'DRAFT'
        and revision.version = ${input.revisionVersion}
        and revision.media = publication.media
        and publication.origin = 'CATALOGUE_ADOPTED'
        and publication.baseline is not null
        and publication.source_revision = ${input.baseSourceRevision}
        and publication.sku = ${input.sku}
        and publication.slug = ${input.slug}
        and publication.state in ('PUBLISHED', 'UNPUBLISHED')
        and item.intake_id = ${input.intakeId}::uuid
        and item.quantity = 1
        and item.state = 'READY'
        and item.version = ${input.expectedVersion}
      for update of revision, publication, item
    ), inventory_ready as (
      update shop_inventory inventory
      set availability = 'AVAILABLE', updated_at = now()
      from revision_source
      where inventory.sku = revision_source.sku
        and inventory.availability in ('AVAILABLE', 'ARCHIVED')
        and inventory.on_hand = 1
        and inventory.reserved = 0
        and inventory.sold = inventory.returned
        and inventory.write_off = 0
      returning inventory.sku
    ), piece as (
      update studio_wardrobe_items item
      set title = ${input.title}, category = ${input.sourceCategory},
        colour = ${input.colour}, size_label = ${input.taggedSize},
        condition = ${input.condition}, price = ${input.price},
        version = version + 1, updated_at = now()
      from revision_source, inventory_ready
      where item.id = revision_source.wardrobe_item_id
        and inventory_ready.sku = revision_source.sku
      returning item.id
    ), catalogue as (
      update shop_catalogue_items target
      set name = ${input.title}, category = ${input.category}, price = ${input.price},
        tagged_size = ${input.taggedSize}, condition = ${input.condition},
        colour = ${input.colour}, tone = ${input.tone}, silhouette = ${input.silhouette},
        note = ${input.description},
        updated_at = now()
      from revision_source, inventory_ready, piece
      where target.sku = revision_source.sku
        and inventory_ready.sku = target.sku
      returning target.sku
    ), publication as (
      update studio_catalogue_publications target
      set idempotency_key = ${input.idempotencyKey},
        source_revision = ${input.sourceRevision}, state = 'PUBLISHED',
        facts = ${JSON.stringify(input.facts)}::jsonb, published_at = now()
      from revision_source, catalogue
      where target.id = revision_source.publication_id
        and target.origin = 'CATALOGUE_ADOPTED'
        and catalogue.sku = target.sku
      returning target.*
    ), revisions as (
      update studio_garment_revisions revision
      set state = case when revision.id = revision_source.id then 'PUBLISHED' else 'SUPERSEDED' end,
        version = version + 1,
        base_source_revision = case when revision.id = revision_source.id then ${input.sourceRevision} else revision.base_source_revision end,
        facts = case when revision.id = revision_source.id then ${JSON.stringify(input.facts)}::jsonb else revision.facts end,
        idempotency_key = case when revision.id = revision_source.id then ${input.idempotencyKey} else revision.idempotency_key end,
        published_at = case when revision.id = revision_source.id then now() else revision.published_at end,
        updated_at = now()
      from revision_source, publication
      where revision.wardrobe_item_id = revision_source.wardrobe_item_id
        and (revision.id = revision_source.id or revision.state = 'PUBLISHED')
      returning revision.id, revision.revision_number
    ), published_revision as (
      select revisions.revision_number
      from revisions, revision_source
      where revisions.id = revision_source.id
    ), event as (
      insert into studio_garment_events (
        wardrobe_item_id, operator_subject, event_type, summary, details, occurred_at
      )
      select publication.wardrobe_item_id, publication.operator_subject,
        'REVISION_PUBLISHED', 'Published revision ' || published_revision.revision_number,
        jsonb_build_object(
          'revisionNumber', published_revision.revision_number,
          'sku', publication.sku,
          'slug', publication.slug,
          'mediaPreserved', true
        ), now()
      from publication cross join published_revision
    )
    select * from publication
  `);
  const raw = resultRows(result)[0];
  if (!raw) return null;
  return {
    id: String(raw.id),
    wardrobeItemId: String(raw.wardrobe_item_id),
    operatorSubject: String(raw.operator_subject),
    idempotencyKey: String(raw.idempotency_key),
    sourceRevision: String(raw.source_revision),
    sku: String(raw.sku),
    slug: String(raw.slug),
    origin: "CATALOGUE_ADOPTED",
    state: "PUBLISHED",
    facts: raw.facts as Record<string, unknown>,
    media: raw.media as CataloguePublicationRow["media"],
    baseline: raw.baseline && typeof raw.baseline === "object" ? raw.baseline as Record<string, unknown> : null,
    publishedAt: new Date(String(raw.published_at)),
    createdAt: new Date(String(raw.created_at)),
  };
}

/**
 * Atelier-adopted pieces use the same garment lifecycle as every other Studio
 * piece, but their seven LOCKED bytes and adoption revision are immutable.
 * This atom updates reviewed facts and visibility while preserving the exact
 * receipt-bound publication and catalogue media JSON.
 */
export async function publishAtelierAdoptionRevisionAtomically(
  input: AtomicAtelierAdoptionRevisionPublicationInput,
): Promise<CataloguePublicationRow | null> {
  const parsed = parseStudioAtelierPublicationMediaSet(input.media);
  if (
    parsed.receiptId !== input.receiptId
    || input.facts.atelierAdoptionRevision !== input.baseSourceRevision
  ) throw new Error("The Atelier facts revision does not match its immutable adoption receipt.");
  const catalogueMedia = input.media.map((item) => ({
    slot: item.slot,
    src: item.src,
    ...(["MODEL_FRONT", "MODEL_LEFT_PROFILE", "MODEL_REAR_THREE_QUARTER"].includes(item.slot)
      ? { modelAnchorId: "lulu-v4" }
      : {}),
  }));
  const result = await (await getStudioDb()).execute(sql`
    with revision_source as materialized (
      select revision.id, revision.wardrobe_item_id, revision.operator_subject,
        revision.revision_number, publication.id as publication_id,
        publication.sku, publication.slug, publication.source_revision
      from studio_garment_revisions revision
      join studio_catalogue_publications publication
        on publication.wardrobe_item_id = revision.wardrobe_item_id
       and publication.operator_subject = revision.operator_subject
      join studio_wardrobe_items item on item.id = revision.wardrobe_item_id
      join shop_catalogue_items catalogue on catalogue.sku = publication.sku
      where revision.id = ${input.revisionId}::uuid
        and revision.wardrobe_item_id = ${input.wardrobeItemId}::uuid
        and revision.operator_subject = ${input.operatorSubject}
        and revision.state = 'DRAFT'
        and revision.version = ${input.revisionVersion}
        and revision.media = ${JSON.stringify(input.media)}::jsonb
        and publication.origin = 'STUDIO_NATIVE'
        and publication.baseline is null
        and publication.source_revision = ${input.baseSourceRevision}
        and publication.facts->>'atelierAdoptionRevision' = ${input.baseSourceRevision}
        and publication.media = ${JSON.stringify(input.media)}::jsonb
        and jsonb_array_length(publication.media) = 7
        and publication.sku = ${input.sku}
        and publication.slug = ${input.slug}
        and publication.state in ('PUBLISHED', 'UNPUBLISHED')
        and catalogue.media = ${JSON.stringify(catalogueMedia)}::jsonb
        and catalogue.model_anchor = '{"id":"lulu-v4"}'::jsonb
        and item.intake_id = ${input.intakeId}::uuid
        and item.quantity = 1
        and item.state = 'READY'
        and item.version = ${input.expectedVersion}
      for update of revision, publication, item, catalogue
    ), inventory_ready as (
      update shop_inventory inventory
      set availability = 'AVAILABLE', updated_at = now()
      from revision_source
      where inventory.sku = revision_source.sku
        and inventory.availability in ('AVAILABLE', 'ARCHIVED')
        and inventory.on_hand = 1
        and inventory.reserved = 0
        and inventory.sold = inventory.returned
        and inventory.write_off = 0
      returning inventory.sku
    ), piece as (
      update studio_wardrobe_items item
      set title = ${input.title}, category = ${input.sourceCategory},
        colour = ${input.colour}, size_label = ${input.taggedSize},
        condition = ${input.condition}, price = ${input.price},
        version = version + 1, updated_at = now()
      from revision_source, inventory_ready
      where item.id = revision_source.wardrobe_item_id
        and inventory_ready.sku = revision_source.sku
      returning item.id
    ), catalogue as (
      update shop_catalogue_items target
      set name = ${input.title}, category = ${input.category}, price = ${input.price},
        tagged_size = ${input.taggedSize}, condition = ${input.condition},
        colour = ${input.colour}, tone = ${input.tone}, silhouette = ${input.silhouette},
        note = ${input.description},
        updated_at = now()
      from revision_source, inventory_ready, piece
      where target.sku = revision_source.sku
        and inventory_ready.sku = target.sku
        and target.media = ${JSON.stringify(catalogueMedia)}::jsonb
        and target.model_anchor = '{"id":"lulu-v4"}'::jsonb
      returning target.sku
    ), publication as (
      update studio_catalogue_publications target
      set idempotency_key = ${input.idempotencyKey}, state = 'PUBLISHED',
        facts = ${JSON.stringify(input.facts)}::jsonb, published_at = now()
      from revision_source, catalogue
      where target.id = revision_source.publication_id
        and target.source_revision = revision_source.source_revision
        and target.media = ${JSON.stringify(input.media)}::jsonb
        and catalogue.sku = target.sku
      returning target.*
    ), revisions as (
      update studio_garment_revisions revision
      set state = case when revision.id = revision_source.id then 'PUBLISHED' else 'SUPERSEDED' end,
        version = version + 1,
        base_source_revision = case when revision.id = revision_source.id then revision_source.source_revision else revision.base_source_revision end,
        facts = case when revision.id = revision_source.id then ${JSON.stringify(input.facts)}::jsonb else revision.facts end,
        idempotency_key = case when revision.id = revision_source.id then ${input.idempotencyKey} else revision.idempotency_key end,
        published_at = case when revision.id = revision_source.id then now() else revision.published_at end,
        updated_at = now()
      from revision_source, publication
      where revision.wardrobe_item_id = revision_source.wardrobe_item_id
        and (revision.id = revision_source.id or revision.state = 'PUBLISHED')
      returning revision.id, revision.revision_number
    ), published_revision as (
      select revisions.revision_number
      from revisions, revision_source
      where revisions.id = revision_source.id
    ), event as (
      insert into studio_garment_events (
        wardrobe_item_id, operator_subject, event_type, summary, details, occurred_at
      )
      select publication.wardrobe_item_id, publication.operator_subject,
        'REVISION_PUBLISHED', 'Published revision ' || published_revision.revision_number,
        jsonb_build_object(
          'revisionNumber', published_revision.revision_number,
          'sku', publication.sku,
          'slug', publication.slug,
          'mediaPreserved', true,
          'adoptionReceiptId', ${input.receiptId}
        ), now()
      from publication cross join published_revision
    )
    select * from publication
  `);
  const raw = resultRows(result)[0];
  if (!raw) return null;
  return {
    id: String(raw.id),
    wardrobeItemId: String(raw.wardrobe_item_id),
    operatorSubject: String(raw.operator_subject),
    idempotencyKey: String(raw.idempotency_key),
    sourceRevision: String(raw.source_revision),
    sku: String(raw.sku),
    slug: String(raw.slug),
    origin: "STUDIO_NATIVE",
    state: "PUBLISHED",
    facts: raw.facts as Record<string, unknown>,
    media: raw.media as CataloguePublicationRow["media"],
    baseline: null,
    publishedAt: new Date(String(raw.published_at)),
    createdAt: new Date(String(raw.created_at)),
  };
}

function resultRows(result: unknown): Record<string, unknown>[] {
  if (!result || typeof result !== "object") return [];
  const value = "rows" in result ? result.rows : result;
  return Array.isArray(value) ? value as Record<string, unknown>[] : [];
}

// Keep these imports anchored in the server repository: both rows are written
// by the atomic statement above and remain part of the Drizzle schema contract.
void shopCatalogueItems;
void shopInventory;
