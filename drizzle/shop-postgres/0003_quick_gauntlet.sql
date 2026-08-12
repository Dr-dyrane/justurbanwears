CREATE TYPE "public"."studio_asset_role" AS ENUM('SOURCE', 'GARMENT_FRONT', 'MANNEQUIN_FRONT', 'MODEL_TRY_ON');--> statement-breakpoint
CREATE TYPE "public"."studio_decision_kind" AS ENUM('KEEP', 'EDIT', 'REJECT', 'RETRY');--> statement-breakpoint
CREATE TYPE "public"."studio_generation_state" AS ENUM('PENDING', 'RUNNING', 'COMPLETE', 'APPROVED', 'REJECTED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."studio_intake_kind" AS ENUM('GARMENT', 'MODEL');--> statement-breakpoint
CREATE TYPE "public"."studio_intake_state" AS ENUM('DRAFT', 'ANALYZING', 'REVIEW', 'GENERATING', 'DECISION', 'COMMITTED', 'FAILED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."studio_source_mode" AS ENUM('CAMERA', 'UPLOAD', 'DESCRIBE');--> statement-breakpoint
CREATE TABLE "studio_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intake_id" uuid NOT NULL,
	"role" "studio_asset_role" NOT NULL,
	"blob_pathname" text NOT NULL,
	"blob_url" text NOT NULL,
	"mime_type" varchar(80) NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"sha256" varchar(64) NOT NULL,
	"privacy" varchar(24) DEFAULT 'PRIVATE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_assets_bytes_positive" CHECK ("studio_assets"."byte_size" > 0),
	CONSTRAINT "studio_assets_sha256" CHECK ("studio_assets"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_assets_private_only" CHECK ("studio_assets"."privacy" = 'PRIVATE')
);
--> statement-breakpoint
CREATE TABLE "studio_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intake_id" uuid NOT NULL,
	"generation_id" uuid,
	"actor_subject" text NOT NULL,
	"decision" "studio_decision_kind" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intake_id" uuid NOT NULL,
	"operation" varchar(40) NOT NULL,
	"state" "studio_generation_state" DEFAULT 'PENDING' NOT NULL,
	"model" text NOT NULL,
	"prompt_version" varchar(40) NOT NULL,
	"prompt_hash" varchar(64) NOT NULL,
	"source_asset_ids" jsonb NOT NULL,
	"source_hashes" jsonb NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"parameters" jsonb NOT NULL,
	"output_asset_id" uuid,
	"usage" jsonb,
	"cost_usd" text,
	"error_code" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_generations_prompt_hash" CHECK ("studio_generations"."prompt_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_generations_fingerprint" CHECK ("studio_generations"."fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_generations_source_ids_array" CHECK (jsonb_typeof("studio_generations"."source_asset_ids") = 'array'),
	CONSTRAINT "studio_generations_source_hashes_array" CHECK (jsonb_typeof("studio_generations"."source_hashes") = 'array'),
	CONSTRAINT "studio_generations_parameters_object" CHECK (jsonb_typeof("studio_generations"."parameters") = 'object')
);
--> statement-breakpoint
CREATE TABLE "studio_intakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_subject" text NOT NULL,
	"operator_email" text NOT NULL,
	"kind" "studio_intake_kind" NOT NULL,
	"source_mode" "studio_source_mode" NOT NULL,
	"description" text,
	"facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"state" "studio_intake_state" DEFAULT 'DRAFT' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"error_code" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_intakes_version_positive" CHECK ("studio_intakes"."version" > 0),
	CONSTRAINT "studio_intakes_facts_object" CHECK (jsonb_typeof("studio_intakes"."facts") = 'object')
);
--> statement-breakpoint
CREATE TABLE "studio_wardrobe_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intake_id" uuid NOT NULL,
	"operator_subject" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"colour" text NOT NULL,
	"size_label" text NOT NULL,
	"condition" text NOT NULL,
	"price" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"state" varchar(24) DEFAULT 'DRAFT' NOT NULL,
	"approved_asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_wardrobe_items_price_nonnegative" CHECK ("studio_wardrobe_items"."price" >= 0),
	CONSTRAINT "studio_wardrobe_items_quantity_one" CHECK ("studio_wardrobe_items"."quantity" = 1),
	CONSTRAINT "studio_wardrobe_items_state_private" CHECK ("studio_wardrobe_items"."state" in ('DRAFT', 'READY', 'ARCHIVED'))
);
--> statement-breakpoint
ALTER TABLE "studio_assets" ADD CONSTRAINT "studio_assets_intake_id_studio_intakes_id_fk" FOREIGN KEY ("intake_id") REFERENCES "public"."studio_intakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_decisions" ADD CONSTRAINT "studio_decisions_intake_id_studio_intakes_id_fk" FOREIGN KEY ("intake_id") REFERENCES "public"."studio_intakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_decisions" ADD CONSTRAINT "studio_decisions_generation_id_studio_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."studio_generations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_generations" ADD CONSTRAINT "studio_generations_intake_id_studio_intakes_id_fk" FOREIGN KEY ("intake_id") REFERENCES "public"."studio_intakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_generations" ADD CONSTRAINT "studio_generations_output_asset_id_studio_assets_id_fk" FOREIGN KEY ("output_asset_id") REFERENCES "public"."studio_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_wardrobe_items" ADD CONSTRAINT "studio_wardrobe_items_intake_id_studio_intakes_id_fk" FOREIGN KEY ("intake_id") REFERENCES "public"."studio_intakes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_wardrobe_items" ADD CONSTRAINT "studio_wardrobe_items_approved_asset_id_studio_assets_id_fk" FOREIGN KEY ("approved_asset_id") REFERENCES "public"."studio_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_assets_intake_role_idx" ON "studio_assets" USING btree ("intake_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_assets_intake_sha_role_unique" ON "studio_assets" USING btree ("intake_id","sha256","role");--> statement-breakpoint
CREATE INDEX "studio_decisions_intake_created_idx" ON "studio_decisions" USING btree ("intake_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_generations_intake_fingerprint_unique" ON "studio_generations" USING btree ("intake_id","fingerprint");--> statement-breakpoint
CREATE INDEX "studio_generations_intake_created_idx" ON "studio_generations" USING btree ("intake_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_intakes_operator_idempotency_unique" ON "studio_intakes" USING btree ("operator_subject","idempotency_key");--> statement-breakpoint
CREATE INDEX "studio_intakes_operator_updated_idx" ON "studio_intakes" USING btree ("operator_subject","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_wardrobe_items_intake_unique" ON "studio_wardrobe_items" USING btree ("intake_id");--> statement-breakpoint
CREATE INDEX "studio_wardrobe_items_operator_updated_idx" ON "studio_wardrobe_items" USING btree ("operator_subject","updated_at");