CREATE SEQUENCE "public"."shop_dynamic_sku_sequence" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100 CACHE 1;--> statement-breakpoint
CREATE TABLE "studio_catalogue_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wardrobe_item_id" uuid NOT NULL,
	"operator_subject" text NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"source_revision" varchar(64) NOT NULL,
	"sku" varchar(40) NOT NULL,
	"slug" text NOT NULL,
	"state" varchar(24) DEFAULT 'PUBLISHED' NOT NULL,
	"facts" jsonb NOT NULL,
	"media" jsonb NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_catalogue_publications_source_revision_sha256" CHECK ("studio_catalogue_publications"."source_revision" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_catalogue_publications_state_known" CHECK ("studio_catalogue_publications"."state" = 'PUBLISHED'),
	CONSTRAINT "studio_catalogue_publications_facts_object" CHECK (jsonb_typeof("studio_catalogue_publications"."facts") = 'object'),
	CONSTRAINT "studio_catalogue_publications_media_array" CHECK (jsonb_typeof("studio_catalogue_publications"."media") = 'array')
);
--> statement-breakpoint
ALTER TABLE "studio_wardrobe_items" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_catalogue_publications" ADD CONSTRAINT "studio_catalogue_publications_wardrobe_item_id_studio_wardrobe_items_id_fk" FOREIGN KEY ("wardrobe_item_id") REFERENCES "public"."studio_wardrobe_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_catalogue_publications" ADD CONSTRAINT "studio_catalogue_publications_sku_shop_catalogue_items_sku_fk" FOREIGN KEY ("sku") REFERENCES "public"."shop_catalogue_items"("sku") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "studio_catalogue_publications_wardrobe_unique" ON "studio_catalogue_publications" USING btree ("wardrobe_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_catalogue_publications_sku_unique" ON "studio_catalogue_publications" USING btree ("sku");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_catalogue_publications_slug_unique" ON "studio_catalogue_publications" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_catalogue_publications_operator_idempotency_unique" ON "studio_catalogue_publications" USING btree ("operator_subject","idempotency_key");--> statement-breakpoint
CREATE INDEX "studio_catalogue_publications_operator_published_idx" ON "studio_catalogue_publications" USING btree ("operator_subject","published_at");--> statement-breakpoint
ALTER TABLE "studio_wardrobe_items" ADD CONSTRAINT "studio_wardrobe_items_version_positive" CHECK ("studio_wardrobe_items"."version" > 0);