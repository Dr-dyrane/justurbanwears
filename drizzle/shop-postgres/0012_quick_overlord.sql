CREATE TYPE "public"."shop_collection_state" AS ENUM('DRAFT', 'ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "shop_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(80) NOT NULL,
	"label" varchar(120) NOT NULL,
	"ordinal" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"state" "shop_collection_state" DEFAULT 'DRAFT' NOT NULL,
	"activated_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_collections_key_format" CHECK ("shop_collections"."key" ~ '^drop-[0-9]{2,}$'),
	CONSTRAINT "shop_collections_label_present" CHECK (length(trim("shop_collections"."label")) > 0),
	CONSTRAINT "shop_collections_ordinal_positive" CHECK ("shop_collections"."ordinal" > 0),
	CONSTRAINT "shop_collections_version_positive" CHECK ("shop_collections"."version" > 0),
	CONSTRAINT "shop_collections_lifecycle_timestamps" CHECK (
    ("shop_collections"."state" = 'DRAFT' and "shop_collections"."activated_at" is null and "shop_collections"."archived_at" is null)
    or ("shop_collections"."state" = 'ACTIVE' and "shop_collections"."activated_at" is not null and "shop_collections"."archived_at" is null)
    or ("shop_collections"."state" = 'ARCHIVED' and "shop_collections"."archived_at" is not null)
  )
);
--> statement-breakpoint
ALTER TABLE "shop_catalogue_items" ADD COLUMN "collection_id" uuid;--> statement-breakpoint
ALTER TABLE "studio_wardrobe_items" ADD COLUMN "target_collection_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "shop_collections_key_unique" ON "shop_collections" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_collections_ordinal_unique" ON "shop_collections" USING btree ("ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_collections_one_active_unique" ON "shop_collections" USING btree ("state") WHERE "shop_collections"."state" = 'ACTIVE';--> statement-breakpoint
ALTER TABLE "shop_catalogue_items" ADD CONSTRAINT "shop_catalogue_items_collection_id_shop_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."shop_collections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_wardrobe_items" ADD CONSTRAINT "studio_wardrobe_items_target_collection_id_shop_collections_id_fk" FOREIGN KEY ("target_collection_id") REFERENCES "public"."shop_collections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shop_catalogue_items_collection_idx" ON "shop_catalogue_items" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "studio_wardrobe_items_target_collection_idx" ON "studio_wardrobe_items" USING btree ("target_collection_id");--> statement-breakpoint
INSERT INTO "shop_collections" (
	"id", "key", "label", "ordinal", "version", "state",
	"activated_at", "archived_at", "created_at", "updated_at"
) VALUES
	(md5('shop-collection:drop-01')::uuid, 'drop-01', 'Drop 01', 1, 1, 'ARCHIVED', null, now(), now(), now()),
	(md5('shop-collection:drop-02')::uuid, 'drop-02', 'Drop 02', 2, 1, 'ACTIVE', now(), null, now(), now());--> statement-breakpoint
DO $$
DECLARE
	catalogue_count integer;
	drop_01_missing_count integer;
	drop_02_missing_count integer;
	expected_drop_01 text[] := ARRAY[
		'JUW-001', 'JUW-002', 'JUW-003', 'JUW-004',
		'JUW-005', 'JUW-006', 'JUW-007', 'JUW-008',
		'JUW-009', 'JUW-010', 'JUW-011', 'JUW-012',
		'JUW-013', 'JUW-014', 'JUW-015', 'JUW-016',
		'JUW-020', 'JUW-021'
	];
	expected_drop_02 text[] := ARRAY[
		'JUW-025', 'JUW-026', 'JUW-027', 'JUW-028',
		'JUW-029', 'JUW-030', 'JUW-031', 'JUW-032',
		'JUW-033', 'JUW-034', 'JUW-035', 'JUW-036',
		'JUW-037', 'JUW-038', 'JUW-039', 'JUW-040',
		'JUW-042'
	];
BEGIN
	SELECT count(*) INTO catalogue_count FROM "shop_catalogue_items";
	IF catalogue_count = 0 THEN
		RETURN;
	END IF;

	SELECT count(*) INTO drop_01_missing_count
	FROM unnest(expected_drop_01) AS expected(sku)
	WHERE NOT EXISTS (
		SELECT 1
		FROM "shop_catalogue_items" catalogue
		WHERE catalogue."sku" = expected.sku
	);

	SELECT count(*) INTO drop_02_missing_count
	FROM unnest(expected_drop_02) AS expected(sku)
	WHERE NOT EXISTS (
		SELECT 1
		FROM "shop_catalogue_items" catalogue
		WHERE catalogue."sku" = expected.sku
	);

	IF drop_01_missing_count <> 0 OR drop_02_missing_count <> 0 THEN
		RAISE EXCEPTION 'SHOP_COLLECTION_CANONICAL_MEMBERSHIP_MISSING';
	END IF;
END
$$;--> statement-breakpoint
UPDATE "shop_catalogue_items" AS catalogue
SET "collection_id" = collection."id"
FROM "shop_collections" AS collection
WHERE (
	catalogue."sku" = ANY(ARRAY[
		'JUW-001', 'JUW-002', 'JUW-003', 'JUW-004',
		'JUW-005', 'JUW-006', 'JUW-007', 'JUW-008',
		'JUW-009', 'JUW-010', 'JUW-011', 'JUW-012',
		'JUW-013', 'JUW-014', 'JUW-015', 'JUW-016',
		'JUW-020', 'JUW-021'
	]::text[])
	AND collection."key" = 'drop-01'
) OR (
	catalogue."sku" = ANY(ARRAY[
		'JUW-025', 'JUW-026', 'JUW-027', 'JUW-028',
		'JUW-029', 'JUW-030', 'JUW-031', 'JUW-032',
		'JUW-033', 'JUW-034', 'JUW-035', 'JUW-036',
		'JUW-037', 'JUW-038', 'JUW-039', 'JUW-040',
		'JUW-042'
	]::text[])
	AND collection."key" = 'drop-02'
);--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT expected.sku
		FROM (
			SELECT unnest(ARRAY[
				'JUW-001', 'JUW-002', 'JUW-003', 'JUW-004',
				'JUW-005', 'JUW-006', 'JUW-007', 'JUW-008',
				'JUW-009', 'JUW-010', 'JUW-011', 'JUW-012',
				'JUW-013', 'JUW-014', 'JUW-015', 'JUW-016',
				'JUW-020', 'JUW-021'
			]::text[]) AS sku, 'drop-01'::text AS collection_key
			UNION ALL
			SELECT unnest(ARRAY[
				'JUW-025', 'JUW-026', 'JUW-027', 'JUW-028',
				'JUW-029', 'JUW-030', 'JUW-031', 'JUW-032',
				'JUW-033', 'JUW-034', 'JUW-035', 'JUW-036',
				'JUW-037', 'JUW-038', 'JUW-039', 'JUW-040',
				'JUW-042'
			]::text[]) AS sku, 'drop-02'::text AS collection_key
		) AS expected
		LEFT JOIN "shop_catalogue_items" AS catalogue
			ON catalogue."sku" = expected.sku
		LEFT JOIN "shop_collections" AS collection
			ON collection."id" = catalogue."collection_id"
		WHERE collection."key" IS DISTINCT FROM expected.collection_key
	) THEN
		RAISE EXCEPTION 'SHOP_COLLECTION_CANONICAL_MEMBERSHIP_NOT_BACKFILLED';
	END IF;
END
$$;--> statement-breakpoint
UPDATE "studio_wardrobe_items" AS wardrobe
SET "target_collection_id" = catalogue."collection_id"
FROM "studio_catalogue_publications" AS publication
JOIN "shop_catalogue_items" AS catalogue
	ON catalogue."sku" = publication."sku"
WHERE publication."wardrobe_item_id" = wardrobe."id"
  AND publication."state" = 'PUBLISHED'
  AND catalogue."collection_id" IS NOT NULL;
