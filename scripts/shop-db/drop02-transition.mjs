import { createHash } from "node:crypto";
import { queryRows } from "./release-core.mjs";

export const DROP01_TRANSITION_SKUS = Object.freeze([
  ...Array.from({ length: 16 }, (_, index) => `JUW-${String(index + 1).padStart(3, "0")}`),
  "JUW-020",
  "JUW-021",
]);

export const DROP02_TRANSITION_SKUS = Object.freeze([
  "JUW-025",
  "JUW-026",
  "JUW-027",
  "JUW-028",
  "JUW-029",
  "JUW-030",
  "JUW-031",
  "JUW-032",
]);

const EXPECTED_CATALOGUE_SKUS = Object.freeze([
  ...DROP01_TRANSITION_SKUS,
  ...DROP02_TRANSITION_SKUS,
]);

function invariant(condition, code) {
  if (!condition) throw new Error(code);
}

function numberValue(value) {
  const parsed = Number(value);
  invariant(Number.isInteger(parsed), "DROP02_TRANSITION_DATABASE_CONTRACT_INVALID");
  return parsed;
}

function deterministicUuid(value) {
  const hex = createHash("md5").update(value).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function adoptionId(version, sku, kind) {
  return deterministicUuid(`catalogue-adoption:${version}:${sku}:${kind}`);
}

function exactSkuRows(rows, expectedSkus, code) {
  const actual = rows.map((row) => String(row.sku));
  invariant(actual.length === expectedSkus.length, code);
  invariant(new Set(actual).size === expectedSkus.length, code);
  invariant(expectedSkus.every((sku) => actual.includes(sku)), code);
}

function inventoryCountersMatch(row, expected) {
  return numberValue(row.on_hand) === expected.onHand
    && numberValue(row.reserved) === expected.reserved
    && numberValue(row.sold) === expected.sold
    && numberValue(row.returned) === expected.returned
    && numberValue(row.write_off) === expected.writeOff;
}

function assertDrop01Inventory(rows) {
  exactSkuRows(rows, DROP01_TRANSITION_SKUS, "DROP02_TRANSITION_DROP01_INVENTORY_MISMATCH");
  for (const row of rows) {
    const sku = String(row.sku);
    const availability = String(row.availability);
    if (sku === "JUW-001") {
      invariant(
        (availability === "AVAILABLE" || availability === "ARCHIVED")
          && inventoryCountersMatch(row, {
            onHand: 1,
            reserved: 0,
            sold: 1,
            returned: 1,
            writeOff: 0,
          }),
        "DROP02_TRANSITION_DROP01_INVENTORY_MISMATCH",
      );
      continue;
    }
    if (sku === "JUW-002") {
      const seedReservation = availability === "RESERVED" && inventoryCountersMatch(row, {
        onHand: 1,
        reserved: 1,
        sold: 0,
        returned: 0,
        writeOff: 0,
      });
      const archived = availability === "ARCHIVED" && inventoryCountersMatch(row, {
        onHand: 1,
        reserved: 0,
        sold: 0,
        returned: 0,
        writeOff: 0,
      });
      invariant(seedReservation || archived, "DROP02_TRANSITION_DROP01_INVENTORY_MISMATCH");
      continue;
    }
    if (sku === "JUW-004") {
      invariant(
        (availability === "SOLD" || availability === "ARCHIVED")
          && inventoryCountersMatch(row, {
            onHand: 0,
            reserved: 0,
            sold: 1,
            returned: 0,
            writeOff: 0,
          }),
        "DROP02_TRANSITION_DROP01_INVENTORY_MISMATCH",
      );
      continue;
    }
    invariant(
      (availability === "AVAILABLE" || availability === "ARCHIVED")
        && inventoryCountersMatch(row, {
          onHand: 1,
          reserved: 0,
          sold: 0,
          returned: 0,
          writeOff: 0,
        }),
      "DROP02_TRANSITION_DROP01_INVENTORY_MISMATCH",
    );
  }
}

function assertDrop02InitialInventory(rows, expectedSkus) {
  exactSkuRows(rows, expectedSkus, "DROP02_TRANSITION_DROP02_INVENTORY_MISMATCH");
  invariant(rows.every((row) => (
    String(row.availability) === "AVAILABLE"
    && inventoryCountersMatch(row, {
      onHand: 1,
      reserved: 0,
      sold: 0,
      returned: 0,
      writeOff: 0,
    })
  )), "DROP02_TRANSITION_DROP02_INVENTORY_MISMATCH");
}

function assertManifest(manifest) {
  const products = Array.isArray(manifest?.products) ? manifest.products : [];
  const skus = products.map((product) => product?.sku).filter((sku) => typeof sku === "string");
  invariant(skus.length === EXPECTED_CATALOGUE_SKUS.length, "DROP02_TRANSITION_MANIFEST_MISMATCH");
  invariant(new Set(skus).size === EXPECTED_CATALOGUE_SKUS.length, "DROP02_TRANSITION_MANIFEST_MISMATCH");
  invariant(EXPECTED_CATALOGUE_SKUS.every((sku) => skus.includes(sku)), "DROP02_TRANSITION_MANIFEST_MISMATCH");
}

function assertDrop01Adoption(rows, ownerSubject) {
  exactSkuRows(rows, DROP01_TRANSITION_SKUS, "DROP02_TRANSITION_DROP01_ADOPTION_MISMATCH");
  for (const row of rows) {
    const sku = String(row.sku);
    const initial = row.publication_state === "PUBLISHED" && row.wardrobe_state === "READY";
    const archived = row.publication_state === "ARCHIVED" && row.wardrobe_state === "ARCHIVED";
    invariant(initial || archived, "DROP02_TRANSITION_DROP01_ADOPTION_MISMATCH");
    invariant(row.publication_origin === "CATALOGUE_ADOPTED", "DROP02_TRANSITION_DROP01_ADOPTION_MISMATCH");
    invariant(row.publication_operator_subject === ownerSubject, "DROP02_TRANSITION_DROP01_ADOPTION_MISMATCH");
    invariant(row.wardrobe_operator_subject === ownerSubject, "DROP02_TRANSITION_DROP01_ADOPTION_MISMATCH");
    invariant(row.publication_id === adoptionId("v1", sku, "publication"), "DROP02_TRANSITION_DROP01_ADOPTION_MISMATCH");
    invariant(row.wardrobe_item_id === adoptionId("v1", sku, "wardrobe"), "DROP02_TRANSITION_DROP01_ADOPTION_MISMATCH");
  }
}

function assertExistingDrop02Adoption(rows, ownerSubject) {
  exactSkuRows(rows, DROP02_TRANSITION_SKUS, "DROP02_TRANSITION_DROP02_ADOPTION_MISMATCH");
  const present = rows.filter((row) => row.publication_id != null);
  for (const row of present) {
    const sku = String(row.sku);
    invariant(row.publication_sku === sku, "DROP02_TRANSITION_DROP02_ADOPTION_CONFLICT");
    invariant(row.publication_slug === row.catalogue_slug, "DROP02_TRANSITION_DROP02_ADOPTION_CONFLICT");
    invariant(row.publication_id === adoptionId("v2", sku, "publication"), "DROP02_TRANSITION_DROP02_ADOPTION_CONFLICT");
    invariant(row.wardrobe_item_id === adoptionId("v2", sku, "wardrobe"), "DROP02_TRANSITION_DROP02_ADOPTION_CONFLICT");
    invariant(row.intake_id === adoptionId("v2", sku, "intake"), "DROP02_TRANSITION_DROP02_ADOPTION_CONFLICT");
    invariant(row.revision_id === adoptionId("v2", sku, "revision"), "DROP02_TRANSITION_DROP02_ADOPTION_CONFLICT");
    invariant(row.publication_origin === "CATALOGUE_ADOPTED", "DROP02_TRANSITION_DROP02_ADOPTION_CONFLICT");
    invariant(row.publication_operator_subject === ownerSubject, "DROP02_TRANSITION_DROP02_ADOPTION_CONFLICT");
    invariant(row.wardrobe_operator_subject === ownerSubject, "DROP02_TRANSITION_DROP02_ADOPTION_CONFLICT");
    invariant(row.intake_operator_subject === ownerSubject, "DROP02_TRANSITION_DROP02_ADOPTION_CONFLICT");
    invariant(row.revision_operator_subject === ownerSubject, "DROP02_TRANSITION_DROP02_ADOPTION_CONFLICT");
    invariant(row.intake_idempotency_key === `catalogue-adoption:v2:${sku}:intake`, "DROP02_TRANSITION_DROP02_ADOPTION_CONFLICT");
    invariant(row.publication_idempotency_key === `catalogue-adoption:v2:${sku}:publication`, "DROP02_TRANSITION_DROP02_ADOPTION_CONFLICT");
    invariant(row.revision_idempotency_key === `catalogue-adoption:v2:${sku}:revision`, "DROP02_TRANSITION_DROP02_ADOPTION_CONFLICT");
  }
  return rows.filter((row) => row.publication_id == null).map((row) => String(row.sku));
}

function assertPostcondition(row) {
  invariant(row, "DROP02_TRANSITION_POSTCONDITION_FAILED");
  const expected = {
    old_inventory_archived: 18,
    old_publications_archived: 18,
    old_wardrobe_archived: 18,
    old_archive_events: 18,
    new_intakes: 8,
    new_wardrobe_items: 8,
    new_publications: 8,
    new_revisions: 8,
    new_events: 16,
    returned_listing_sold: 1,
    returned_listing_returned: 1,
  };
  for (const [key, count] of Object.entries(expected)) {
    invariant(numberValue(row[key]) === count, "DROP02_TRANSITION_POSTCONDITION_FAILED");
  }
  invariant(numberValue(row.orphan_reserved) === 0, "DROP02_TRANSITION_POSTCONDITION_FAILED");
  invariant(numberValue(row.sold_listing_sold) === 1, "DROP02_TRANSITION_POSTCONDITION_FAILED");
}

const CATEGORY_SQL = `case catalogue.category
  when 'Dresses' then 'Dress'
  when 'Sets' then 'Set'
  when 'Shirts' then 'Shirt'
  when 'Knitwear' then 'Knitwear'
  when 'Skirts' then 'Skirt'
  when 'Trousers' then 'Trousers'
  when 'Rompers' then 'Set'
  when 'Jumpsuits' then 'Jumpsuit'
  else catalogue.category
end`;

/**
 * Applies the one-time Drop 01 retirement and Drop 02 Studio adoption inside
 * the release transaction supplied by shop-release.mjs. This function never
 * opens, commits, or rolls back a database transaction itself.
 */
export async function applyDrop02TransitionInTransaction(transaction, manifest) {
  assertManifest(manifest);

  await transaction.query(`lock table
    shop_order_items, shop_order_returns, shop_order_return_items,
    studio_manual_holds, studio_piece_custody,
    studio_intakes, studio_wardrobe_items, studio_catalogue_publications,
    studio_garment_revisions
    in share row exclusive mode`);
  await transaction.query("lock table studio_operator_membership in share mode");

  const catalogueState = queryRows(await transaction.query(
    `select
      (select count(*) from shop_catalogue_items)::integer as catalogue_count,
      (select count(*) from shop_catalogue_items where sku = any($1::varchar[]))::integer as expected_catalogue_count,
      (select count(*) from shop_inventory where sku = any($1::varchar[]))::integer as expected_inventory_count`,
    [EXPECTED_CATALOGUE_SKUS],
  ))[0];
  invariant(
    catalogueState
      && numberValue(catalogueState.catalogue_count) === 26
      && numberValue(catalogueState.expected_catalogue_count) === 26
      && numberValue(catalogueState.expected_inventory_count) === 26,
    "DROP02_TRANSITION_CATALOGUE_MISMATCH",
  );

  const owners = queryRows(await transaction.query(
    `select membership.auth_subject, membership.email
     from studio_operator_membership membership
     where membership.active = true
       and (
         exists (
           select 1 from studio_wardrobe_items item
           where item.operator_subject = membership.auth_subject
         )
         or not exists (select 1 from studio_wardrobe_items)
       )
     order by membership.auth_subject`,
  ));
  invariant(owners.length === 1, "DROP02_TRANSITION_OWNER_AMBIGUOUS");
  const ownerSubject = String(owners[0].auth_subject);
  const ownerEmail = String(owners[0].email);
  invariant(ownerSubject.length > 0 && ownerEmail.length > 0, "DROP02_TRANSITION_OWNER_AMBIGUOUS");

  const inventoryRows = queryRows(await transaction.query(
    `select sku, availability::text as availability, on_hand, reserved, sold, returned, write_off
     from shop_inventory
     where sku = any($1::varchar[])
     order by sku
     for update`,
    [EXPECTED_CATALOGUE_SKUS],
  ));
  const drop01Inventory = inventoryRows.filter((row) => DROP01_TRANSITION_SKUS.includes(String(row.sku)));
  const drop02Inventory = inventoryRows.filter((row) => DROP02_TRANSITION_SKUS.includes(String(row.sku)));
  assertDrop01Inventory(drop01Inventory);
  exactSkuRows(drop02Inventory, DROP02_TRANSITION_SKUS, "DROP02_TRANSITION_DROP02_INVENTORY_MISMATCH");

  const relationships = queryRows(await transaction.query(
    `select
      (select count(*) from studio_manual_holds where sku = any($1::varchar[]))::integer as hold_count,
      (select count(*) from shop_order_items where sku = any($1::varchar[]))::integer as order_item_count,
      (select count(*) from shop_order_return_items where sku = any($1::varchar[]))::integer as return_item_count,
      (select count(*)
       from studio_piece_custody custody
       where custody.piece_key = any($2::varchar[])
          or exists (
            select 1
            from studio_catalogue_publications publication
            where publication.sku = any($1::varchar[])
              and custody.piece_key = 'wardrobe:' || publication.wardrobe_item_id::text
          ))::integer as custody_count`,
    [DROP01_TRANSITION_SKUS, DROP01_TRANSITION_SKUS.map((sku) => `sku:${sku}`)],
  ))[0];
  invariant(
    relationships
      && numberValue(relationships.hold_count) === 0
      && numberValue(relationships.order_item_count) === 0
      && numberValue(relationships.return_item_count) === 0
      && numberValue(relationships.custody_count) === 0,
    "DROP02_TRANSITION_RELATIONSHIP_CONFLICT",
  );

  const oldAdoptions = queryRows(await transaction.query(
    `select publication.sku, publication.id::text as publication_id,
      publication.wardrobe_item_id::text as wardrobe_item_id,
      publication.origin as publication_origin, publication.state as publication_state,
      publication.operator_subject as publication_operator_subject,
      wardrobe.state as wardrobe_state,
      wardrobe.operator_subject as wardrobe_operator_subject
     from studio_catalogue_publications publication
     join studio_wardrobe_items wardrobe on wardrobe.id = publication.wardrobe_item_id
     where publication.sku = any($1::varchar[])
     order by publication.sku`,
    [DROP01_TRANSITION_SKUS],
  ));
  assertDrop01Adoption(oldAdoptions, ownerSubject);

  const newAdoptions = queryRows(await transaction.query(
    `select catalogue.sku, catalogue.slug as catalogue_slug,
      publication.sku as publication_sku, publication.slug as publication_slug,
      publication.id::text as publication_id,
      publication.wardrobe_item_id::text as wardrobe_item_id,
      publication.operator_subject as publication_operator_subject,
      publication.idempotency_key as publication_idempotency_key,
      publication.origin as publication_origin,
      wardrobe.operator_subject as wardrobe_operator_subject,
      wardrobe.intake_id::text as intake_id,
      intake.operator_subject as intake_operator_subject,
      intake.idempotency_key as intake_idempotency_key,
      revision.id::text as revision_id,
      revision.operator_subject as revision_operator_subject,
      revision.idempotency_key as revision_idempotency_key
     from shop_catalogue_items catalogue
     left join studio_catalogue_publications publication
       on publication.sku = catalogue.sku or publication.slug = catalogue.slug
     left join studio_wardrobe_items wardrobe on wardrobe.id = publication.wardrobe_item_id
     left join studio_intakes intake on intake.id = wardrobe.intake_id
     left join studio_garment_revisions revision
       on revision.wardrobe_item_id = wardrobe.id and revision.revision_number = 1
     where catalogue.sku = any($1::varchar[])
     order by catalogue.sku`,
    [DROP02_TRANSITION_SKUS],
  ));
  const missingDrop02Adoptions = assertExistingDrop02Adoption(newAdoptions, ownerSubject);
  const missingDrop02Inventory = drop02Inventory.filter((row) => (
    missingDrop02Adoptions.includes(String(row.sku))
  ));
  assertDrop02InitialInventory(missingDrop02Inventory, missingDrop02Adoptions);

  const incompleteMedia = queryRows(await transaction.query(
    `select catalogue.sku
     from shop_catalogue_items catalogue
     where catalogue.sku = any($1::varchar[])
       and (
         (select count(*) from jsonb_array_elements(catalogue.media) entry(value) where value->>'slot' = 'GARMENT_FRONT') <> 1
         or (select count(*) from jsonb_array_elements(catalogue.media) entry(value) where value->>'slot' = 'GARMENT_BACK') <> 1
         or (select count(*) from jsonb_array_elements(catalogue.media) entry(value) where value->>'slot' in ('FABRIC_DETAIL', 'CONSTRUCTION_DETAIL')) <> 1
       )`,
    [DROP02_TRANSITION_SKUS],
  ));
  invariant(incompleteMedia.length === 0, "DROP02_TRANSITION_MEDIA_INCOMPLETE");

  const archivedInventory = queryRows(await transaction.query(
    `update shop_inventory
     set availability = 'ARCHIVED',
         reserved = case when sku = 'JUW-002' then 0 else reserved end,
         updated_at = now()
     where sku = any($1::varchar[])
       and (availability <> 'ARCHIVED' or reserved <> 0)
     returning sku`,
    [DROP01_TRANSITION_SKUS],
  ));

  await transaction.query(
    `update studio_catalogue_publications
     set state = 'ARCHIVED'
     where sku = any($1::varchar[])
       and origin = 'CATALOGUE_ADOPTED'
       and state <> 'ARCHIVED'`,
    [DROP01_TRANSITION_SKUS],
  );
  await transaction.query(
    `update studio_wardrobe_items wardrobe
     set state = 'ARCHIVED', version = wardrobe.version + 1, updated_at = now()
     from studio_catalogue_publications publication
     where publication.wardrobe_item_id = wardrobe.id
       and publication.sku = any($1::varchar[])
       and publication.origin = 'CATALOGUE_ADOPTED'
       and wardrobe.state <> 'ARCHIVED'`,
    [DROP01_TRANSITION_SKUS],
  );
  await transaction.query(
    `insert into studio_garment_events (
       id, wardrobe_item_id, operator_subject, event_type, summary, details, occurred_at
     )
     select
       md5('catalogue-adoption:v2:' || publication.sku || ':archive-event')::uuid,
       publication.wardrobe_item_id,
       publication.operator_subject,
       'ARCHIVED',
       case publication.sku
         when 'JUW-002' then 'Seed reservation cleared and test piece archived'
         when 'JUW-004' then 'Sold test listing retired'
         else 'Drop 01 test piece archived'
       end,
       jsonb_build_object(
         'origin', 'DROP02_TRANSITION',
         'sku', publication.sku,
         'orphanSeedReservationCleared', publication.sku = 'JUW-002',
         'soldListingRetired', publication.sku = 'JUW-004'
       ),
       now()
     from studio_catalogue_publications publication
     where publication.sku = any($1::varchar[])
       and publication.origin = 'CATALOGUE_ADOPTED'
     on conflict (id) do nothing`,
    [DROP01_TRANSITION_SKUS],
  );

  const insertedIntakes = queryRows(await transaction.query(
    `insert into studio_intakes (
       id, operator_subject, operator_email, kind, source_mode, description, facts,
       state, version, idempotency_key, created_at, updated_at
     )
     select
       md5('catalogue-adoption:v2:' || catalogue.sku || ':intake')::uuid,
       $2, $3, 'GARMENT', 'DESCRIBE', 'Adopted from the approved Shop catalogue.',
       jsonb_build_object(
         'title', catalogue.name,
         'category', ${CATEGORY_SQL},
         'colour', catalogue.colour,
         'sizeLabel', catalogue.tagged_size,
         'condition', catalogue.condition,
         'price', catalogue.price
       ),
       'COMMITTED', 1, 'catalogue-adoption:v2:' || catalogue.sku || ':intake',
       catalogue.created_at, now()
     from shop_catalogue_items catalogue
     where catalogue.sku = any($1::varchar[])
     on conflict (operator_subject, idempotency_key) do nothing
     returning id`,
    [DROP02_TRANSITION_SKUS, ownerSubject, ownerEmail],
  ));

  await transaction.query(
    `insert into studio_wardrobe_items (
       id, intake_id, operator_subject, title, category, colour, size_label,
       condition, price, quantity, state, version, approved_asset_id, created_at, updated_at
     )
     select
       md5('catalogue-adoption:v2:' || catalogue.sku || ':wardrobe')::uuid,
       intake.id, $2, catalogue.name, ${CATEGORY_SQL}, catalogue.colour,
       catalogue.tagged_size, catalogue.condition, catalogue.price,
       1, 'READY', 1, null, catalogue.created_at, now()
     from shop_catalogue_items catalogue
     join studio_intakes intake
       on intake.id = md5('catalogue-adoption:v2:' || catalogue.sku || ':intake')::uuid
      and intake.operator_subject = $2
     where catalogue.sku = any($1::varchar[])
     on conflict (intake_id) do nothing`,
    [DROP02_TRANSITION_SKUS, ownerSubject],
  );

  const insertedPublications = queryRows(await transaction.query(
    `with adoption as (
       select catalogue.*,
         wardrobe.id as wardrobe_item_id,
         jsonb_build_object(
           'title', catalogue.name,
           'category', catalogue.category,
           'colour', catalogue.colour,
           'sizeLabel', catalogue.tagged_size,
           'condition', catalogue.condition,
           'price', catalogue.price,
           'quantity', 1
         ) as publication_facts,
         jsonb_build_array(
           jsonb_build_object(
             'origin', 'CATALOGUE_BASELINE', 'slot', 'GARMENT_FRONT',
             'src', (select value->>'src' from jsonb_array_elements(catalogue.media) entry(value) where value->>'slot' = 'GARMENT_FRONT')
           ),
           jsonb_build_object(
             'origin', 'CATALOGUE_BASELINE', 'slot', 'GARMENT_BACK',
             'src', (select value->>'src' from jsonb_array_elements(catalogue.media) entry(value) where value->>'slot' = 'GARMENT_BACK')
           ),
           jsonb_build_object(
             'origin', 'CATALOGUE_BASELINE', 'slot', 'FABRIC_DETAIL',
             'src', (select value->>'src' from jsonb_array_elements(catalogue.media) entry(value) where value->>'slot' in ('FABRIC_DETAIL', 'CONSTRUCTION_DETAIL'))
           )
         ) as publication_media,
         to_jsonb(catalogue) - 'created_at' - 'updated_at' as baseline
       from shop_catalogue_items catalogue
       join studio_wardrobe_items wardrobe
         on wardrobe.id = md5('catalogue-adoption:v2:' || catalogue.sku || ':wardrobe')::uuid
        and wardrobe.operator_subject = $2
       where catalogue.sku = any($1::varchar[])
     ), revisioned as (
       select adoption.*,
         encode(digest(convert_to(jsonb_build_object(
           'facts', adoption.publication_facts,
           'media', adoption.publication_media,
           'baseline', adoption.baseline
         )::text, 'UTF8'), 'sha256'), 'hex') as source_revision
       from adoption
     )
     insert into studio_catalogue_publications (
       id, wardrobe_item_id, operator_subject, idempotency_key, source_revision,
       sku, slug, origin, state, facts, media, baseline, published_at, created_at
     )
     select
       md5('catalogue-adoption:v2:' || sku || ':publication')::uuid,
       wardrobe_item_id, $2, 'catalogue-adoption:v2:' || sku || ':publication',
       source_revision, sku, slug, 'CATALOGUE_ADOPTED', 'PUBLISHED',
       publication_facts, publication_media, baseline, created_at, created_at
     from revisioned
     on conflict do nothing
     returning id`,
    [DROP02_TRANSITION_SKUS, ownerSubject],
  ));

  await transaction.query(
    `insert into studio_garment_revisions (
       id, wardrobe_item_id, operator_subject, revision_number, version, state,
       base_source_revision, facts, media, idempotency_key,
       created_at, updated_at, published_at
     )
     select
       md5('catalogue-adoption:v2:' || publication.sku || ':revision')::uuid,
       publication.wardrobe_item_id, publication.operator_subject,
       1, 1, 'PUBLISHED', publication.source_revision,
       publication.facts, publication.media,
       'catalogue-adoption:v2:' || publication.sku || ':revision',
       publication.created_at, publication.created_at, publication.published_at
     from studio_catalogue_publications publication
     where publication.sku = any($1::varchar[])
       and publication.id = md5('catalogue-adoption:v2:' || publication.sku || ':publication')::uuid
     on conflict do nothing`,
    [DROP02_TRANSITION_SKUS],
  );

  await transaction.query(
    `insert into studio_garment_events (
       id, wardrobe_item_id, operator_subject, event_type, summary, details, occurred_at
     )
     select
       md5('catalogue-adoption:v2:' || publication.sku || ':committed')::uuid,
       publication.wardrobe_item_id, publication.operator_subject,
       'COMMITTED', 'Adopted into Studio Wardrobe',
       jsonb_build_object('origin', 'CATALOGUE_ADOPTION', 'sku', publication.sku),
       publication.created_at
     from studio_catalogue_publications publication
     where publication.sku = any($1::varchar[])
       and publication.id = md5('catalogue-adoption:v2:' || publication.sku || ':publication')::uuid
     on conflict (id) do nothing`,
    [DROP02_TRANSITION_SKUS],
  );
  await transaction.query(
    `insert into studio_garment_events (
       id, wardrobe_item_id, operator_subject, event_type, summary, details, occurred_at
     )
     select
       md5('catalogue-adoption:v2:' || publication.sku || ':published')::uuid,
       publication.wardrobe_item_id, publication.operator_subject,
       'PUBLISHED', 'Existing Shop listing linked to Studio',
       jsonb_build_object(
         'origin', 'CATALOGUE_ADOPTION', 'sku', publication.sku, 'slug', publication.slug
       ),
       publication.published_at
     from studio_catalogue_publications publication
     where publication.sku = any($1::varchar[])
       and publication.id = md5('catalogue-adoption:v2:' || publication.sku || ':publication')::uuid
     on conflict (id) do nothing`,
    [DROP02_TRANSITION_SKUS],
  );

  const postcondition = queryRows(await transaction.query(
    `select
      (select count(*) from shop_inventory where sku = any($1::varchar[]) and availability = 'ARCHIVED' and reserved = 0)::integer as old_inventory_archived,
      (select count(*) from studio_catalogue_publications where sku = any($1::varchar[]) and origin = 'CATALOGUE_ADOPTED' and state = 'ARCHIVED')::integer as old_publications_archived,
      (select count(*) from studio_wardrobe_items wardrobe join studio_catalogue_publications publication on publication.wardrobe_item_id = wardrobe.id where publication.sku = any($1::varchar[]) and wardrobe.state = 'ARCHIVED')::integer as old_wardrobe_archived,
      (select count(*) from studio_garment_events event join studio_catalogue_publications publication on publication.wardrobe_item_id = event.wardrobe_item_id where publication.sku = any($1::varchar[]) and event.id = md5('catalogue-adoption:v2:' || publication.sku || ':archive-event')::uuid)::integer as old_archive_events,
      (select count(*) from studio_intakes intake where intake.id in (select md5('catalogue-adoption:v2:' || sku || ':intake')::uuid from unnest($2::varchar[]) sku) and intake.operator_subject = $3)::integer as new_intakes,
      (select count(*) from studio_wardrobe_items wardrobe where wardrobe.id in (select md5('catalogue-adoption:v2:' || sku || ':wardrobe')::uuid from unnest($2::varchar[]) sku) and wardrobe.operator_subject = $3)::integer as new_wardrobe_items,
      (select count(*) from studio_catalogue_publications publication where publication.sku = any($2::varchar[]) and publication.id = md5('catalogue-adoption:v2:' || publication.sku || ':publication')::uuid and publication.origin = 'CATALOGUE_ADOPTED' and publication.operator_subject = $3)::integer as new_publications,
      (select count(*) from studio_garment_revisions revision join studio_catalogue_publications publication on publication.wardrobe_item_id = revision.wardrobe_item_id where publication.sku = any($2::varchar[]) and revision.id = md5('catalogue-adoption:v2:' || publication.sku || ':revision')::uuid and revision.operator_subject = $3)::integer as new_revisions,
      (select count(*) from studio_garment_events event join studio_catalogue_publications publication on publication.wardrobe_item_id = event.wardrobe_item_id where publication.sku = any($2::varchar[]) and event.id in (md5('catalogue-adoption:v2:' || publication.sku || ':committed')::uuid, md5('catalogue-adoption:v2:' || publication.sku || ':published')::uuid))::integer as new_events,
      (select reserved from shop_inventory where sku = 'JUW-002')::integer as orphan_reserved,
      (select sold from shop_inventory where sku = 'JUW-001')::integer as returned_listing_sold,
      (select returned from shop_inventory where sku = 'JUW-001')::integer as returned_listing_returned,
      (select sold from shop_inventory where sku = 'JUW-004')::integer as sold_listing_sold`,
    [DROP01_TRANSITION_SKUS, DROP02_TRANSITION_SKUS, ownerSubject],
  ))[0];
  assertPostcondition(postcondition);

  return archivedInventory.length > 0 || insertedIntakes.length > 0 || insertedPublications.length > 0
    ? "apply"
    : "noop";
}
