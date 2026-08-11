ALTER TABLE "shop_inventory" DROP CONSTRAINT "shop_inventory_sku_shop_catalogue_items_sku_fk";
--> statement-breakpoint
ALTER TABLE "shop_inventory" ADD CONSTRAINT "shop_inventory_sku_shop_catalogue_items_sku_fk" FOREIGN KEY ("sku") REFERENCES "public"."shop_catalogue_items"("sku") ON DELETE restrict ON UPDATE cascade;
--> statement-breakpoint
CREATE TEMPORARY TABLE "shop_sku_rename_map" (
	"legacy_sku" varchar(40) PRIMARY KEY,
	"current_sku" varchar(40) UNIQUE NOT NULL,
	"slug" text UNIQUE NOT NULL
) ON COMMIT DROP;
--> statement-breakpoint
INSERT INTO "shop_sku_rename_map" ("legacy_sku", "current_sku", "slug") VALUES
	('DYN-081', 'JUW-001', 'coral-drift-dress'),
	('DYN-082', 'JUW-002', 'indigo-workshirt'),
	('DYN-083', 'JUW-003', 'moss-square-knit'),
	('DYN-084', 'JUW-004', 'ivory-tie-skirt'),
	('DYN-085', 'JUW-005', 'cocoa-pleat-trouser'),
	('DYN-086', 'JUW-006', 'salmon-camp-shirt'),
	('DYN-087', 'JUW-007', 'blush-scoop-mini-dress'),
	('DYN-088', 'JUW-008', 'orchid-beaded-column-gown'),
	('DYN-089', 'JUW-009', 'sage-asymmetric-ruched-maxi-dress'),
	('DYN-090', 'JUW-010', 'magenta-plunge-ruched-mini-dress'),
	('DYN-091', 'JUW-011', 'silver-off-shoulder-mermaid-dress'),
	('DYN-092', 'JUW-012', 'multicolor-abstract-strapless-mini-dress');
--> statement-breakpoint
DO $$
DECLARE
	legacy_count integer;
	current_count integer;
	exact_slug_count integer;
	inventory_count integer;
BEGIN
	SELECT count(*) INTO legacy_count
	FROM "shop_catalogue_items" AS "catalogue"
	JOIN "shop_sku_rename_map" AS "sku_rename"
		ON "catalogue"."sku" = "sku_rename"."legacy_sku";

	SELECT count(*) INTO current_count
	FROM "shop_catalogue_items" AS "catalogue"
	JOIN "shop_sku_rename_map" AS "sku_rename"
		ON "catalogue"."sku" = "sku_rename"."current_sku";

	IF legacy_count NOT IN (0, 12) THEN
		RAISE EXCEPTION 'SKU migration requires either zero or all 12 legacy catalogue rows; found %.', legacy_count;
	END IF;
	IF current_count <> 0 THEN
		RAISE EXCEPTION 'SKU migration requires zero pre-existing JUW targets; found %.', current_count;
	END IF;

	SELECT count(*) INTO exact_slug_count
	FROM "shop_catalogue_items" AS "catalogue"
	JOIN "shop_sku_rename_map" AS "sku_rename"
		ON "catalogue"."sku" = "sku_rename"."legacy_sku"
		AND "catalogue"."slug" = "sku_rename"."slug";
	IF exact_slug_count <> legacy_count THEN
		RAISE EXCEPTION 'SKU migration legacy SKU/slug mapping does not match the reviewed catalogue.';
	END IF;

	SELECT count(*) INTO inventory_count
	FROM "shop_inventory" AS "inventory"
	JOIN "shop_sku_rename_map" AS "sku_rename"
		ON "inventory"."sku" = "sku_rename"."legacy_sku";
	IF inventory_count <> legacy_count THEN
		RAISE EXCEPTION 'SKU migration requires one inventory row for every legacy catalogue row.';
	END IF;
END $$;
--> statement-breakpoint
CREATE TEMPORARY TABLE "shop_sku_rename_state" (
	"legacy_count" integer NOT NULL
) ON COMMIT DROP;
--> statement-breakpoint
INSERT INTO "shop_sku_rename_state" ("legacy_count")
SELECT count(*)
FROM "shop_catalogue_items" AS "catalogue"
JOIN "shop_sku_rename_map" AS "sku_rename"
	ON "catalogue"."sku" = "sku_rename"."legacy_sku";
--> statement-breakpoint
CREATE TEMPORARY TABLE "shop_sku_rename_inventory_before" ON COMMIT DROP AS
SELECT
	"sku_rename"."current_sku",
	"inventory"."availability",
	"inventory"."on_hand",
	"inventory"."reserved",
	"inventory"."sold",
	"inventory"."returned",
	"inventory"."write_off",
	"inventory"."updated_at"
FROM "shop_inventory" AS "inventory"
JOIN "shop_sku_rename_map" AS "sku_rename"
	ON "inventory"."sku" = "sku_rename"."legacy_sku";
--> statement-breakpoint
UPDATE "shop_catalogue_items" AS "catalogue"
SET "sku" = "sku_rename"."current_sku"
FROM "shop_sku_rename_map" AS "sku_rename"
WHERE "catalogue"."sku" = "sku_rename"."legacy_sku";
--> statement-breakpoint
UPDATE "shop_order_items" AS "order_item"
SET "sku" = "sku_rename"."current_sku"
FROM "shop_sku_rename_map" AS "sku_rename"
WHERE "order_item"."sku" = "sku_rename"."legacy_sku";
--> statement-breakpoint
DO $$
DECLARE
	expected_count integer;
BEGIN
	SELECT "legacy_count" INTO expected_count FROM "shop_sku_rename_state";

	IF EXISTS (
		SELECT 1
		FROM "shop_catalogue_items" AS "catalogue"
		JOIN "shop_sku_rename_map" AS "sku_rename"
			ON "catalogue"."sku" = "sku_rename"."legacy_sku"
	) THEN
		RAISE EXCEPTION 'SKU migration left legacy catalogue rows behind.';
	END IF;

	IF (
		SELECT count(*)
		FROM "shop_catalogue_items" AS "catalogue"
		JOIN "shop_sku_rename_map" AS "sku_rename"
			ON "catalogue"."sku" = "sku_rename"."current_sku"
			AND "catalogue"."slug" = "sku_rename"."slug"
	) <> expected_count THEN
		RAISE EXCEPTION 'SKU migration did not produce the expected JUW catalogue rows.';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "shop_sku_rename_inventory_before" AS "before"
		LEFT JOIN "shop_inventory" AS "inventory"
			ON "inventory"."sku" = "before"."current_sku"
		WHERE "inventory"."sku" IS NULL
			OR "inventory"."availability" IS DISTINCT FROM "before"."availability"
			OR "inventory"."on_hand" IS DISTINCT FROM "before"."on_hand"
			OR "inventory"."reserved" IS DISTINCT FROM "before"."reserved"
			OR "inventory"."sold" IS DISTINCT FROM "before"."sold"
			OR "inventory"."returned" IS DISTINCT FROM "before"."returned"
			OR "inventory"."write_off" IS DISTINCT FROM "before"."write_off"
			OR "inventory"."updated_at" IS DISTINCT FROM "before"."updated_at"
	) THEN
		RAISE EXCEPTION 'SKU migration changed operational inventory state.';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "shop_inventory" AS "inventory"
		JOIN "shop_sku_rename_map" AS "sku_rename"
			ON "inventory"."sku" = "sku_rename"."legacy_sku"
	) THEN
		RAISE EXCEPTION 'SKU migration left legacy inventory rows behind.';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "shop_order_items" AS "order_item"
		JOIN "shop_sku_rename_map" AS "sku_rename"
			ON "order_item"."sku" = "sku_rename"."legacy_sku"
	) THEN
		RAISE EXCEPTION 'SKU migration left legacy order-item snapshots behind.';
	END IF;
END $$;
