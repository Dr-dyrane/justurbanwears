ALTER TABLE "studio_catalogue_publications" ADD COLUMN "origin" varchar(32) DEFAULT 'STUDIO_NATIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_catalogue_publications" ADD COLUMN "baseline" jsonb;--> statement-breakpoint
ALTER TABLE "studio_catalogue_publications" ADD CONSTRAINT "studio_catalogue_publications_origin_known" CHECK ("studio_catalogue_publications"."origin" in ('STUDIO_NATIVE', 'CATALOGUE_ADOPTED'));--> statement-breakpoint
ALTER TABLE "studio_catalogue_publications" ADD CONSTRAINT "studio_catalogue_publications_origin_baseline" CHECK (
    ("studio_catalogue_publications"."origin" = 'STUDIO_NATIVE' and "studio_catalogue_publications"."baseline" is null)
    or ("studio_catalogue_publications"."origin" = 'CATALOGUE_ADOPTED' and jsonb_typeof("studio_catalogue_publications"."baseline") = 'object')
  );--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
CREATE TEMP TABLE juw_catalogue_adoption_skus (
  sku varchar(40) PRIMARY KEY
) ON COMMIT DROP;--> statement-breakpoint
INSERT INTO juw_catalogue_adoption_skus (sku) VALUES
  ('JUW-001'), ('JUW-002'), ('JUW-003'), ('JUW-004'), ('JUW-005'), ('JUW-006'),
  ('JUW-007'), ('JUW-008'), ('JUW-009'), ('JUW-010'), ('JUW-011'), ('JUW-012'),
  ('JUW-013'), ('JUW-014'), ('JUW-015'), ('JUW-016'), ('JUW-020'), ('JUW-021');--> statement-breakpoint
CREATE TEMP TABLE juw_catalogue_adoption_owner ON COMMIT DROP AS
SELECT membership.auth_subject, membership.email
FROM studio_operator_membership membership
WHERE membership.active = true
  AND (
    EXISTS (
      SELECT 1 FROM studio_wardrobe_items item
      WHERE item.operator_subject = membership.auth_subject
    )
    OR NOT EXISTS (SELECT 1 FROM studio_wardrobe_items)
  );--> statement-breakpoint
DO $$
DECLARE
  target_count integer;
  owner_count integer;
  invalid_media_count integer;
  publication_conflict_count integer;
BEGIN
  SELECT count(*) INTO target_count
  FROM shop_catalogue_items catalogue
  JOIN juw_catalogue_adoption_skus target ON target.sku = catalogue.sku
  JOIN shop_inventory inventory ON inventory.sku = catalogue.sku;
  IF target_count <> 18 THEN
    RAISE EXCEPTION 'STUDIO_CATALOGUE_ADOPTION_TARGET_MISMATCH';
  END IF;

  SELECT count(*) INTO owner_count FROM juw_catalogue_adoption_owner;
  IF owner_count <> 1 THEN
    RAISE EXCEPTION 'STUDIO_CATALOGUE_ADOPTION_OWNER_AMBIGUOUS';
  END IF;

  SELECT count(*) INTO invalid_media_count
  FROM shop_catalogue_items catalogue
  JOIN juw_catalogue_adoption_skus target ON target.sku = catalogue.sku
  WHERE (SELECT count(*) FROM jsonb_array_elements(catalogue.media) AS media_entry(value) WHERE value->>'slot' = 'GARMENT_FRONT') <> 1
     OR (SELECT count(*) FROM jsonb_array_elements(catalogue.media) AS media_entry(value) WHERE value->>'slot' = 'GARMENT_BACK') <> 1
     OR (SELECT count(*) FROM jsonb_array_elements(catalogue.media) AS media_entry(value) WHERE value->>'slot' IN ('FABRIC_DETAIL', 'CONSTRUCTION_DETAIL')) <> 1;
  IF invalid_media_count <> 0 THEN
    RAISE EXCEPTION 'STUDIO_CATALOGUE_ADOPTION_MEDIA_INCOMPLETE';
  END IF;

  SELECT count(*) INTO publication_conflict_count
  FROM studio_catalogue_publications publication
  WHERE publication.sku IN (SELECT sku FROM juw_catalogue_adoption_skus)
     OR publication.slug IN (
       SELECT catalogue.slug
       FROM shop_catalogue_items catalogue
       JOIN juw_catalogue_adoption_skus target ON target.sku = catalogue.sku
     );
  IF publication_conflict_count <> 0 THEN
    RAISE EXCEPTION 'STUDIO_CATALOGUE_ADOPTION_PUBLICATION_CONFLICT';
  END IF;
END
$$;--> statement-breakpoint
INSERT INTO studio_intakes (
  id, operator_subject, operator_email, kind, source_mode, description, facts,
  state, version, idempotency_key, created_at, updated_at
)
SELECT
  md5('catalogue-adoption:v1:' || catalogue.sku || ':intake')::uuid,
  owner.auth_subject,
  owner.email,
  'GARMENT',
  'DESCRIBE',
  'Adopted from the approved Shop catalogue.',
  jsonb_build_object(
    'title', catalogue.name,
    'category', CASE catalogue.category
      WHEN 'Dresses' THEN 'Dress' WHEN 'Sets' THEN 'Set' WHEN 'Shirts' THEN 'Shirt'
      WHEN 'Knitwear' THEN 'Knitwear' WHEN 'Skirts' THEN 'Skirt' ELSE 'Trousers' END,
    'colour', catalogue.colour,
    'sizeLabel', catalogue.tagged_size,
    'condition', catalogue.condition,
    'price', catalogue.price
  ),
  'COMMITTED',
  1,
  'catalogue-adoption:v1:' || catalogue.sku || ':intake',
  catalogue.created_at,
  now()
FROM shop_catalogue_items catalogue
JOIN juw_catalogue_adoption_skus target ON target.sku = catalogue.sku
CROSS JOIN juw_catalogue_adoption_owner owner
ON CONFLICT (operator_subject, idempotency_key) DO NOTHING;--> statement-breakpoint
INSERT INTO studio_wardrobe_items (
  id, intake_id, operator_subject, title, category, colour, size_label,
  condition, price, quantity, state, version, approved_asset_id, created_at, updated_at
)
SELECT
  md5('catalogue-adoption:v1:' || catalogue.sku || ':wardrobe')::uuid,
  intake.id,
  owner.auth_subject,
  catalogue.name,
  CASE catalogue.category
    WHEN 'Dresses' THEN 'Dress' WHEN 'Sets' THEN 'Set' WHEN 'Shirts' THEN 'Shirt'
    WHEN 'Knitwear' THEN 'Knitwear' WHEN 'Skirts' THEN 'Skirt' ELSE 'Trousers' END,
  catalogue.colour,
  catalogue.tagged_size,
  catalogue.condition,
  catalogue.price,
  1,
  'READY',
  1,
  null,
  catalogue.created_at,
  now()
FROM shop_catalogue_items catalogue
JOIN juw_catalogue_adoption_skus target ON target.sku = catalogue.sku
CROSS JOIN juw_catalogue_adoption_owner owner
JOIN studio_intakes intake
  ON intake.operator_subject = owner.auth_subject
 AND intake.idempotency_key = 'catalogue-adoption:v1:' || catalogue.sku || ':intake'
ON CONFLICT (intake_id) DO NOTHING;--> statement-breakpoint
WITH adoption AS (
  SELECT
    catalogue.*,
    wardrobe.id AS wardrobe_item_id,
    owner.auth_subject AS operator_subject,
    jsonb_build_object(
      'title', catalogue.name,
      'category', catalogue.category,
      'colour', catalogue.colour,
      'sizeLabel', catalogue.tagged_size,
      'condition', catalogue.condition,
      'price', catalogue.price,
      'quantity', 1
    ) AS publication_facts,
    jsonb_build_array(
      jsonb_build_object(
        'origin', 'CATALOGUE_BASELINE', 'slot', 'GARMENT_FRONT',
        'src', (SELECT value->>'src' FROM jsonb_array_elements(catalogue.media) AS media_entry(value) WHERE value->>'slot' = 'GARMENT_FRONT')
      ),
      jsonb_build_object(
        'origin', 'CATALOGUE_BASELINE', 'slot', 'GARMENT_BACK',
        'src', (SELECT value->>'src' FROM jsonb_array_elements(catalogue.media) AS media_entry(value) WHERE value->>'slot' = 'GARMENT_BACK')
      ),
      jsonb_build_object(
        'origin', 'CATALOGUE_BASELINE', 'slot', 'FABRIC_DETAIL',
        'src', (SELECT value->>'src' FROM jsonb_array_elements(catalogue.media) AS media_entry(value) WHERE value->>'slot' IN ('FABRIC_DETAIL', 'CONSTRUCTION_DETAIL'))
      )
    ) AS publication_media,
    to_jsonb(catalogue) - 'created_at' - 'updated_at' AS baseline
  FROM shop_catalogue_items catalogue
  JOIN juw_catalogue_adoption_skus target ON target.sku = catalogue.sku
  CROSS JOIN juw_catalogue_adoption_owner owner
  JOIN studio_wardrobe_items wardrobe
    ON wardrobe.id = md5('catalogue-adoption:v1:' || catalogue.sku || ':wardrobe')::uuid
), revisioned AS (
  SELECT adoption.*,
    encode(digest(convert_to(jsonb_build_object(
      'facts', adoption.publication_facts,
      'media', adoption.publication_media,
      'baseline', adoption.baseline
    )::text, 'UTF8'), 'sha256'), 'hex') AS source_revision
  FROM adoption
)
INSERT INTO studio_catalogue_publications (
  id, wardrobe_item_id, operator_subject, idempotency_key, source_revision,
  sku, slug, origin, state, facts, media, baseline, published_at, created_at
)
SELECT
  md5('catalogue-adoption:v1:' || sku || ':publication')::uuid,
  wardrobe_item_id,
  operator_subject,
  'catalogue-adoption:v1:' || sku || ':publication',
  source_revision,
  sku,
  slug,
  'CATALOGUE_ADOPTED',
  'PUBLISHED',
  publication_facts,
  publication_media,
  baseline,
  created_at,
  created_at
FROM revisioned;--> statement-breakpoint
INSERT INTO studio_garment_revisions (
  id, wardrobe_item_id, operator_subject, revision_number, version, state,
  base_source_revision, facts, media, idempotency_key,
  created_at, updated_at, published_at
)
SELECT
  md5('catalogue-adoption:v1:' || publication.sku || ':revision')::uuid,
  publication.wardrobe_item_id,
  publication.operator_subject,
  1,
  1,
  'PUBLISHED',
  publication.source_revision,
  publication.facts,
  publication.media,
  'catalogue-adoption:v1:' || publication.sku || ':revision',
  publication.created_at,
  publication.created_at,
  publication.published_at
FROM studio_catalogue_publications publication
JOIN juw_catalogue_adoption_skus target ON target.sku = publication.sku
WHERE publication.origin = 'CATALOGUE_ADOPTED';--> statement-breakpoint
INSERT INTO studio_garment_events (
  id, wardrobe_item_id, operator_subject, event_type, summary, details, occurred_at
)
SELECT
  md5('catalogue-adoption:v1:' || publication.sku || ':committed')::uuid,
  publication.wardrobe_item_id,
  publication.operator_subject,
  'COMMITTED',
  'Adopted into Studio Wardrobe',
  jsonb_build_object('origin', 'CATALOGUE_ADOPTION', 'sku', publication.sku),
  publication.created_at
FROM studio_catalogue_publications publication
JOIN juw_catalogue_adoption_skus target ON target.sku = publication.sku
WHERE publication.origin = 'CATALOGUE_ADOPTED';--> statement-breakpoint
INSERT INTO studio_garment_events (
  id, wardrobe_item_id, operator_subject, event_type, summary, details, occurred_at
)
SELECT
  md5('catalogue-adoption:v1:' || publication.sku || ':published')::uuid,
  publication.wardrobe_item_id,
  publication.operator_subject,
  'PUBLISHED',
  'Existing Shop listing linked to Studio',
  jsonb_build_object('origin', 'CATALOGUE_ADOPTION', 'sku', publication.sku, 'slug', publication.slug),
  publication.published_at
FROM studio_catalogue_publications publication
JOIN juw_catalogue_adoption_skus target ON target.sku = publication.sku
WHERE publication.origin = 'CATALOGUE_ADOPTED';
