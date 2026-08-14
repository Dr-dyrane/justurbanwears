CREATE TABLE "studio_pending_product_captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_subject" text NOT NULL,
	"sku" varchar(40) NOT NULL,
	"role" varchar(32) NOT NULL,
	"blob_pathname" text NOT NULL,
	"mime_type" varchar(80) NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"sha256" varchar(64) NOT NULL,
	"privacy" varchar(24) DEFAULT 'PRIVATE' NOT NULL,
	"operator_approved_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_pending_product_captures_role_known" CHECK ("studio_pending_product_captures"."role" in ('GARMENT_FRONT', 'GARMENT_BACK', 'FABRIC_DETAIL')),
	CONSTRAINT "studio_pending_product_captures_bytes_positive" CHECK ("studio_pending_product_captures"."byte_size" > 0),
	CONSTRAINT "studio_pending_product_captures_sha256" CHECK ("studio_pending_product_captures"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_pending_product_captures_private_only" CHECK ("studio_pending_product_captures"."privacy" = 'PRIVATE')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "studio_pending_product_captures_operator_sku_role_unique" ON "studio_pending_product_captures" USING btree ("operator_subject","sku","role");--> statement-breakpoint
CREATE INDEX "studio_pending_product_captures_operator_sku_idx" ON "studio_pending_product_captures" USING btree ("operator_subject","sku");