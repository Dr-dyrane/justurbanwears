CREATE TABLE "studio_atelier_shop_adoption_media" (
	"receipt_id" varchar(64) NOT NULL,
	"role" varchar(48) NOT NULL,
	"ordinal" integer NOT NULL,
	"operation_id" uuid NOT NULL,
	"projection_version" integer NOT NULL,
	"locked_artifact_id" uuid NOT NULL,
	"locked_artifact_sha256" varchar(64) NOT NULL,
	"public_src" text NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_atelier_shop_adoption_media_pkey" PRIMARY KEY("receipt_id","role"),
	CONSTRAINT "studio_atelier_shop_adoption_media_role_order" CHECK (
      ("studio_atelier_shop_adoption_media"."role" = 'GARMENT_FRONT' and "studio_atelier_shop_adoption_media"."ordinal" = 0)
      or ("studio_atelier_shop_adoption_media"."role" = 'GARMENT_BACK' and "studio_atelier_shop_adoption_media"."ordinal" = 1)
      or ("studio_atelier_shop_adoption_media"."role" = 'MANNEQUIN_FRONT' and "studio_atelier_shop_adoption_media"."ordinal" = 2)
      or ("studio_atelier_shop_adoption_media"."role" = 'FABRIC_DETAIL' and "studio_atelier_shop_adoption_media"."ordinal" = 3)
      or ("studio_atelier_shop_adoption_media"."role" = 'MODEL_FRONT' and "studio_atelier_shop_adoption_media"."ordinal" = 4)
      or ("studio_atelier_shop_adoption_media"."role" = 'MODEL_LEFT_PROFILE' and "studio_atelier_shop_adoption_media"."ordinal" = 5)
      or ("studio_atelier_shop_adoption_media"."role" = 'MODEL_REAR_THREE_QUARTER' and "studio_atelier_shop_adoption_media"."ordinal" = 6)
    ),
	CONSTRAINT "studio_atelier_shop_adoption_media_projection_version" CHECK (
      "studio_atelier_shop_adoption_media"."projection_version" > 0
    ),
	CONSTRAINT "studio_atelier_shop_adoption_media_artifact_hash" CHECK (
      "studio_atelier_shop_adoption_media"."locked_artifact_sha256" ~ '^[0-9a-f]{64}$'
    ),
	CONSTRAINT "studio_atelier_shop_adoption_media_same_origin_src" CHECK (
      "studio_atelier_shop_adoption_media"."public_src" = '/api/shop/atelier-media/' || "studio_atelier_shop_adoption_media"."receipt_id" || '/' || "studio_atelier_shop_adoption_media"."role"
    ),
	CONSTRAINT "studio_atelier_shop_adoption_media_mime" CHECK (
      "studio_atelier_shop_adoption_media"."mime_type" in ('image/jpeg', 'image/png')
    ),
	CONSTRAINT "studio_atelier_shop_adoption_media_dimensions" CHECK (
      "studio_atelier_shop_adoption_media"."byte_size" > 0 and "studio_atelier_shop_adoption_media"."width" > 0 and "studio_atelier_shop_adoption_media"."height" > 0
    )
);
--> statement-breakpoint
CREATE TABLE "studio_atelier_shop_adoption_receipts" (
	"receipt_id" varchar(64) NOT NULL,
	"operator_subject" text NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"wardrobe_item_id" uuid NOT NULL,
	"garment_id" varchar(80) NOT NULL,
	"adoption_revision" varchar(64) NOT NULL,
	"schema_version" varchar(80) NOT NULL,
	"state" varchar(24) DEFAULT 'COMMITTING' NOT NULL,
	"receipt" jsonb NOT NULL,
	"publication_id" uuid,
	"sku" varchar(40),
	"slug" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_at" timestamp with time zone,
	"request_fingerprint" varchar(64) NOT NULL,
	"media_count" integer NOT NULL,
	CONSTRAINT "studio_atelier_shop_adoption_receipts_pkey" PRIMARY KEY("receipt_id"),
	CONSTRAINT "studio_atelier_shop_adoption_receipts_id_hash" CHECK ("studio_atelier_shop_adoption_receipts"."receipt_id" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_atelier_shop_adoption_receipts_idempotency_key" CHECK (
      length("studio_atelier_shop_adoption_receipts"."idempotency_key") between 8 and 160
      and "studio_atelier_shop_adoption_receipts"."idempotency_key" ~ '^[a-zA-Z0-9._:-]+$'
    ),
	CONSTRAINT "studio_atelier_shop_adoption_receipts_garment_present" CHECK (
      length(trim("studio_atelier_shop_adoption_receipts"."garment_id")) > 0
    ),
	CONSTRAINT "studio_atelier_shop_adoption_receipts_revision_hash" CHECK (
      "studio_atelier_shop_adoption_receipts"."adoption_revision" ~ '^[0-9a-f]{64}$'
    ),
	CONSTRAINT "studio_atelier_shop_adoption_receipts_schema" CHECK (
      "studio_atelier_shop_adoption_receipts"."schema_version" = 'juw.studio-atelier-shop-adoption.v1'
    ),
	CONSTRAINT "studio_atelier_shop_adoption_receipts_state_known" CHECK (
      "studio_atelier_shop_adoption_receipts"."state" in ('COMMITTING', 'COMMITTED')
    ),
	CONSTRAINT "studio_atelier_shop_adoption_receipts_fingerprint" CHECK (
      "studio_atelier_shop_adoption_receipts"."request_fingerprint" = "studio_atelier_shop_adoption_receipts"."receipt_id"
      and "studio_atelier_shop_adoption_receipts"."request_fingerprint" ~ '^[0-9a-f]{64}$'
    ),
	CONSTRAINT "studio_atelier_shop_adoption_receipts_media_count" CHECK ("studio_atelier_shop_adoption_receipts"."media_count" = 7),
	CONSTRAINT "studio_atelier_shop_adoption_receipts_payload" CHECK (
      (
        jsonb_typeof("studio_atelier_shop_adoption_receipts"."receipt") = 'object'
        and "studio_atelier_shop_adoption_receipts"."receipt"->>'schemaVersion' = "studio_atelier_shop_adoption_receipts"."schema_version"
        and "studio_atelier_shop_adoption_receipts"."receipt"->>'receiptId' = "studio_atelier_shop_adoption_receipts"."receipt_id"
        and "studio_atelier_shop_adoption_receipts"."receipt"->>'wardrobeItemId' = "studio_atelier_shop_adoption_receipts"."wardrobe_item_id"::text
        and "studio_atelier_shop_adoption_receipts"."receipt"->>'garmentId' = "studio_atelier_shop_adoption_receipts"."garment_id"
        and "studio_atelier_shop_adoption_receipts"."receipt"->>'adoptionRevision' = "studio_atelier_shop_adoption_receipts"."adoption_revision"
        and jsonb_typeof("studio_atelier_shop_adoption_receipts"."receipt"->'media') = 'array'
        and jsonb_array_length("studio_atelier_shop_adoption_receipts"."receipt"->'media') = "studio_atelier_shop_adoption_receipts"."media_count"
      ) is true
    ),
	CONSTRAINT "studio_atelier_shop_adoption_receipts_commit_tuple" CHECK (
      (
        ("studio_atelier_shop_adoption_receipts"."state" = 'COMMITTING'
          and "studio_atelier_shop_adoption_receipts"."publication_id" is null
          and "studio_atelier_shop_adoption_receipts"."sku" is null
          and "studio_atelier_shop_adoption_receipts"."slug" is null
          and "studio_atelier_shop_adoption_receipts"."committed_at" is null)
        or ("studio_atelier_shop_adoption_receipts"."state" = 'COMMITTED'
          and "studio_atelier_shop_adoption_receipts"."publication_id" is not null
          and "studio_atelier_shop_adoption_receipts"."sku" is not null
          and length(trim("studio_atelier_shop_adoption_receipts"."sku")) > 0
          and "studio_atelier_shop_adoption_receipts"."slug" is not null
          and length(trim("studio_atelier_shop_adoption_receipts"."slug")) > 0
          and "studio_atelier_shop_adoption_receipts"."committed_at" is not null
          and "studio_atelier_shop_adoption_receipts"."committed_at" >= "studio_atelier_shop_adoption_receipts"."created_at")
      ) is true
    )
);
--> statement-breakpoint
ALTER TABLE "studio_atelier_shop_adoption_media" ADD CONSTRAINT "studio_atelier_shop_adoption_media_receipt_id_studio_atelier_shop_adoption_receipts_receipt_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."studio_atelier_shop_adoption_receipts"("receipt_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_atelier_shop_adoption_media" ADD CONSTRAINT "studio_atelier_shop_adoption_media_operation_id_studio_atelier_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."studio_atelier_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_atelier_shop_adoption_media" ADD CONSTRAINT "studio_atelier_shop_adoption_media_locked_artifact_id_studio_atelier_artifacts_id_fk" FOREIGN KEY ("locked_artifact_id") REFERENCES "public"."studio_atelier_artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_atelier_shop_adoption_receipts" ADD CONSTRAINT "studio_atelier_shop_adoption_receipts_wardrobe_item_id_studio_wardrobe_items_id_fk" FOREIGN KEY ("wardrobe_item_id") REFERENCES "public"."studio_wardrobe_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_atelier_shop_adoption_receipts" ADD CONSTRAINT "studio_atelier_shop_adoption_receipts_publication_id_studio_catalogue_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."studio_catalogue_publications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_atelier_shop_adoption_receipts" ADD CONSTRAINT "studio_atelier_shop_adoption_receipts_sku_shop_catalogue_items_sku_fk" FOREIGN KEY ("sku") REFERENCES "public"."shop_catalogue_items"("sku") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "studio_atelier_shop_adoption_media_receipt_ordinal_unique" ON "studio_atelier_shop_adoption_media" USING btree ("receipt_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_atelier_shop_adoption_receipts_operator_idempotency_unique" ON "studio_atelier_shop_adoption_receipts" USING btree ("operator_subject","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_atelier_shop_adoption_receipts_wardrobe_unique" ON "studio_atelier_shop_adoption_receipts" USING btree ("wardrobe_item_id");