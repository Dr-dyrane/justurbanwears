import { and, desc, eq, sql } from "drizzle-orm";
import { getStudioDb } from "../../db/shop-postgres";
import {
  shopCatalogueItems,
  shopInventory,
  studioCataloguePublications,
} from "../../db/shop-postgres-schema";
import type { PublicationMediaSlot, StudioPublicationReceipt } from "../studio/engine/catalogue-publication-contracts";

export type CataloguePublicationRow = typeof studioCataloguePublications.$inferSelect;

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

export async function findCataloguePublication(input: {
  wardrobeItemId: string;
  operatorSubject: string;
}): Promise<CataloguePublicationRow | null> {
  const [row] = await (await getStudioDb()).select().from(studioCataloguePublications).where(and(
    eq(studioCataloguePublications.wardrobeItemId, input.wardrobeItemId),
    eq(studioCataloguePublications.operatorSubject, input.operatorSubject),
  )).limit(1);
  return row ?? null;
}

export async function listCataloguePublications(operatorSubject: string): Promise<CataloguePublicationRow[]> {
  return (await getStudioDb()).select().from(studioCataloguePublications).where(
    eq(studioCataloguePublications.operatorSubject, operatorSubject),
  ).orderBy(desc(studioCataloguePublications.publishedAt));
}

export function cataloguePublicationReceipt(row: CataloguePublicationRow): StudioPublicationReceipt {
  return {
    publicationId: row.id,
    wardrobeItemId: row.wardrobeItemId,
    sku: row.sku,
    slug: row.slug,
    state: "PUBLISHED",
    publishedAt: row.publishedAt.toISOString(),
    shopUrl: `/shop/products/${row.slug}`,
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

/**
 * One SQL statement is the transaction boundary. The guarded UPDATE supplies
 * every downstream INSERT; a stale piece or replaced capture therefore writes
 * nothing, while any uniqueness failure rolls the complete statement back.
 */
export async function insertCataloguePublicationAtomically(
  input: AtomicPublicationInput,
): Promise<CataloguePublicationRow | null> {
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
          select 1 from studio_pending_product_captures
          where id = ${input.backCaptureId}::uuid
            and operator_subject = ${input.operatorSubject}
            and sku = ${input.captureKey}
            and role = 'GARMENT_BACK'
            and sha256 = ${input.backCaptureSha256}
            and privacy = 'PRIVATE'
        )
        and exists (
          select 1 from studio_pending_product_captures
          where id = ${input.detailCaptureId}::uuid
            and operator_subject = ${input.operatorSubject}
            and sku = ${input.captureKey}
            and role = 'FABRIC_DETAIL'
            and sha256 = ${input.detailCaptureSha256}
            and privacy = 'PRIVATE'
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
        ${input.colour}, 'Studio wardrobe', ${input.tone}, ${input.silhouette},
        'One-off wardrobe piece.', ${`${input.colour} · ${input.condition}`},
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
    state: "PUBLISHED",
    facts: raw.facts as Record<string, unknown>,
    media: raw.media as PublicPublicationMedia[],
    publishedAt: new Date(String(raw.published_at)),
    createdAt: new Date(String(raw.created_at)),
  };
}

// Keep these imports anchored in the server repository: both rows are written
// by the atomic statement above and remain part of the Drizzle schema contract.
void shopCatalogueItems;
void shopInventory;
