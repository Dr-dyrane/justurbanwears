CREATE TYPE "public"."shop_catalogue_availability" AS ENUM('AVAILABLE', 'RESERVED', 'SOLD', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "shop_catalogue_items" (
	"sku" varchar(40) PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"price" integer NOT NULL,
	"tagged_size" text NOT NULL,
	"fit" text NOT NULL,
	"condition" text NOT NULL,
	"colour" text NOT NULL,
	"drop_label" text NOT NULL,
	"tone" text NOT NULL,
	"silhouette" text NOT NULL,
	"note" text NOT NULL,
	"story" text NOT NULL,
	"details" jsonb NOT NULL,
	"measurements" jsonb NOT NULL,
	"model_anchor" jsonb NOT NULL,
	"media" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_catalogue_items_price_nonnegative" CHECK ("shop_catalogue_items"."price" >= 0),
	CONSTRAINT "shop_catalogue_items_details_array" CHECK (jsonb_typeof("shop_catalogue_items"."details") = 'array'),
	CONSTRAINT "shop_catalogue_items_measurements_array" CHECK (jsonb_typeof("shop_catalogue_items"."measurements") = 'array'),
	CONSTRAINT "shop_catalogue_items_model_anchor_object" CHECK (jsonb_typeof("shop_catalogue_items"."model_anchor") = 'object'),
	CONSTRAINT "shop_catalogue_items_media_array" CHECK (jsonb_typeof("shop_catalogue_items"."media") = 'array')
);
--> statement-breakpoint
CREATE TABLE "shop_inventory" (
	"sku" varchar(40) PRIMARY KEY NOT NULL,
	"availability" "shop_catalogue_availability" NOT NULL,
	"on_hand" integer NOT NULL,
	"reserved" integer NOT NULL,
	"sold" integer NOT NULL,
	"returned" integer NOT NULL,
	"write_off" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_inventory_counts_nonnegative" CHECK (
    "shop_inventory"."on_hand" >= 0
    and "shop_inventory"."reserved" >= 0
    and "shop_inventory"."sold" >= 0
    and "shop_inventory"."returned" >= 0
    and "shop_inventory"."write_off" >= 0
  ),
	CONSTRAINT "shop_inventory_reserved_within_on_hand" CHECK ("shop_inventory"."reserved" <= "shop_inventory"."on_hand"),
	CONSTRAINT "shop_inventory_returns_within_sales" CHECK ("shop_inventory"."returned" <= "shop_inventory"."sold"),
	CONSTRAINT "shop_inventory_one_off_conservation" CHECK (
    "shop_inventory"."on_hand" + "shop_inventory"."sold" - "shop_inventory"."returned" + "shop_inventory"."write_off" = 1
  ),
	CONSTRAINT "shop_inventory_availability_consistent" CHECK (
    ("shop_inventory"."availability" = 'AVAILABLE' and "shop_inventory"."on_hand" = 1 and "shop_inventory"."reserved" = 0)
    or ("shop_inventory"."availability" = 'RESERVED' and "shop_inventory"."on_hand" = 1 and "shop_inventory"."reserved" = 1)
    or ("shop_inventory"."availability" = 'SOLD' and "shop_inventory"."on_hand" = 0 and "shop_inventory"."reserved" = 0 and "shop_inventory"."sold" > "shop_inventory"."returned")
    or ("shop_inventory"."availability" = 'ARCHIVED' and "shop_inventory"."reserved" = 0)
  )
);
--> statement-breakpoint
CREATE TABLE "shop_seed_ledger" (
	"namespace" varchar(120) NOT NULL,
	"revision" varchar(120) NOT NULL,
	"target" varchar(24) NOT NULL,
	"git_sha" varchar(64) NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"row_count" integer NOT NULL,
	"operation" varchar(24) NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_seed_ledger_namespace_revision_pk" PRIMARY KEY("namespace","revision"),
	CONSTRAINT "shop_seed_ledger_checksum_sha256" CHECK ("shop_seed_ledger"."checksum" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "shop_seed_ledger_git_sha" CHECK ("shop_seed_ledger"."git_sha" ~ '^[0-9a-f]{7,64}$'),
	CONSTRAINT "shop_seed_ledger_row_count_positive" CHECK ("shop_seed_ledger"."row_count" > 0),
	CONSTRAINT "shop_seed_ledger_target_known" CHECK ("shop_seed_ledger"."target" in ('local', 'preview', 'production')),
	CONSTRAINT "shop_seed_ledger_operation_known" CHECK ("shop_seed_ledger"."operation" in ('seed', 'descriptive-sync'))
);
--> statement-breakpoint
ALTER TABLE "shop_inventory" ADD CONSTRAINT "shop_inventory_sku_shop_catalogue_items_sku_fk" FOREIGN KEY ("sku") REFERENCES "public"."shop_catalogue_items"("sku") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shop_catalogue_items_slug_unique" ON "shop_catalogue_items" USING btree ("slug");