ALTER TYPE "public"."studio_asset_role" ADD VALUE 'EDITORIAL_MODEL';--> statement-breakpoint
CREATE TABLE "studio_model_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_subject" text,
	"name" text NOT NULL,
	"authority_id" varchar(120) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"state" varchar(24) DEFAULT 'READY' NOT NULL,
	"source_blob_pathname" text NOT NULL,
	"source_mime_type" varchar(80) NOT NULL,
	"source_byte_size" integer NOT NULL,
	"source_width" integer,
	"source_height" integer,
	"source_sha256" varchar(64) NOT NULL,
	"license_url" text,
	"authority" jsonb NOT NULL,
	"authority_confirmed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_model_profiles_kind_known" CHECK ("studio_model_profiles"."kind" in ('LULU_V3', 'AUTHORIZED_STOCK')),
	CONSTRAINT "studio_model_profiles_state_private" CHECK ("studio_model_profiles"."state" in ('READY', 'ARCHIVED')),
	CONSTRAINT "studio_model_profiles_source_bytes_positive" CHECK ("studio_model_profiles"."source_byte_size" > 0),
	CONSTRAINT "studio_model_profiles_source_sha256" CHECK ("studio_model_profiles"."source_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_model_profiles_authority_object" CHECK (jsonb_typeof("studio_model_profiles"."authority") = 'object')
);
--> statement-breakpoint
ALTER TABLE "studio_generations" ADD COLUMN "model_profile_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "studio_model_profiles_operator_authority_unique" ON "studio_model_profiles" USING btree ("operator_subject","authority_id");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_model_profiles_lulu_authority_unique" ON "studio_model_profiles" USING btree ("authority_id") WHERE "studio_model_profiles"."kind" = 'LULU_V3';--> statement-breakpoint
CREATE INDEX "studio_model_profiles_operator_updated_idx" ON "studio_model_profiles" USING btree ("operator_subject","updated_at");--> statement-breakpoint
ALTER TABLE "studio_generations" ADD CONSTRAINT "studio_generations_model_profile_id_studio_model_profiles_id_fk" FOREIGN KEY ("model_profile_id") REFERENCES "public"."studio_model_profiles"("id") ON DELETE restrict ON UPDATE no action;