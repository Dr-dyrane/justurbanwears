CREATE TABLE "studio_media_completion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_subject" text NOT NULL,
	"target_kind" varchar(32) NOT NULL,
	"target_key" varchar(80) NOT NULL,
	"role" varchar(32) NOT NULL,
	"state" varchar(24) DEFAULT 'PENDING' NOT NULL,
	"attempt" integer NOT NULL,
	"execution_token" uuid,
	"started_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"model" text NOT NULL,
	"prompt_version" varchar(48) NOT NULL,
	"prompt_hash" varchar(64) NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"correction" text,
	"source_blob_pathname" text NOT NULL,
	"source_mime_type" varchar(80) NOT NULL,
	"source_byte_size" integer NOT NULL,
	"source_width" integer,
	"source_height" integer,
	"source_sha256" varchar(64) NOT NULL,
	"authority_confirmed_at" timestamp with time zone NOT NULL,
	"source_validation" jsonb,
	"validation_usage" jsonb,
	"validation_cost_usd" text,
	"output_blob_pathname" text,
	"output_mime_type" varchar(80),
	"output_byte_size" integer,
	"output_width" integer,
	"output_height" integer,
	"output_sha256" varchar(64),
	"usage" jsonb,
	"cost_usd" text,
	"error_code" varchar(80),
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_media_completion_jobs_target_known" CHECK ("studio_media_completion_jobs"."target_kind" in ('PENDING_PRODUCT', 'WARDROBE_ITEM')),
	CONSTRAINT "studio_media_completion_jobs_role_known" CHECK ("studio_media_completion_jobs"."role" in ('GARMENT_FRONT', 'GARMENT_BACK', 'FABRIC_DETAIL')),
	CONSTRAINT "studio_media_completion_jobs_state_known" CHECK ("studio_media_completion_jobs"."state" in ('PENDING', 'RUNNING', 'COMPLETE', 'APPROVED', 'REJECTED', 'FAILED')),
	CONSTRAINT "studio_media_completion_jobs_attempt_bounded" CHECK ("studio_media_completion_jobs"."attempt" in (1, 2)),
	CONSTRAINT "studio_media_completion_jobs_execution_lease" CHECK (
    ("studio_media_completion_jobs"."state" = 'RUNNING'
      and "studio_media_completion_jobs"."execution_token" is not null
      and "studio_media_completion_jobs"."started_at" is not null
      and "studio_media_completion_jobs"."lease_expires_at" is not null)
    or ("studio_media_completion_jobs"."state" <> 'RUNNING'
      and "studio_media_completion_jobs"."execution_token" is null
      and "studio_media_completion_jobs"."started_at" is null
      and "studio_media_completion_jobs"."lease_expires_at" is null)
  ),
	CONSTRAINT "studio_media_completion_jobs_prompt_hash" CHECK ("studio_media_completion_jobs"."prompt_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_media_completion_jobs_fingerprint" CHECK ("studio_media_completion_jobs"."fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_media_completion_jobs_source_sha256" CHECK ("studio_media_completion_jobs"."source_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_media_completion_jobs_source_bytes_positive" CHECK ("studio_media_completion_jobs"."source_byte_size" > 0),
	CONSTRAINT "studio_media_completion_jobs_output_complete" CHECK (
    ("studio_media_completion_jobs"."state" in ('PENDING', 'RUNNING', 'FAILED')
      and "studio_media_completion_jobs"."approved_at" is null and "studio_media_completion_jobs"."rejected_at" is null)
    or ("studio_media_completion_jobs"."state" = 'COMPLETE'
      and "studio_media_completion_jobs"."source_validation" is not null
      and "studio_media_completion_jobs"."output_blob_pathname" is not null and "studio_media_completion_jobs"."output_mime_type" is not null
      and "studio_media_completion_jobs"."output_byte_size" > 0 and "studio_media_completion_jobs"."output_sha256" ~ '^[0-9a-f]{64}$'
      and "studio_media_completion_jobs"."approved_at" is null and "studio_media_completion_jobs"."rejected_at" is null)
    or ("studio_media_completion_jobs"."state" = 'APPROVED'
      and "studio_media_completion_jobs"."source_validation" is not null
      and "studio_media_completion_jobs"."output_blob_pathname" is not null and "studio_media_completion_jobs"."output_mime_type" is not null
      and "studio_media_completion_jobs"."output_byte_size" > 0 and "studio_media_completion_jobs"."output_sha256" ~ '^[0-9a-f]{64}$'
      and "studio_media_completion_jobs"."approved_at" is not null and "studio_media_completion_jobs"."rejected_at" is null)
    or ("studio_media_completion_jobs"."state" = 'REJECTED'
      and "studio_media_completion_jobs"."source_validation" is not null
      and "studio_media_completion_jobs"."output_blob_pathname" is not null and "studio_media_completion_jobs"."output_mime_type" is not null
      and "studio_media_completion_jobs"."output_byte_size" > 0 and "studio_media_completion_jobs"."output_sha256" ~ '^[0-9a-f]{64}$'
      and "studio_media_completion_jobs"."approved_at" is null and "studio_media_completion_jobs"."rejected_at" is not null)
  )
);
--> statement-breakpoint
ALTER TABLE "studio_pending_product_captures" ADD COLUMN "origin" varchar(24) DEFAULT 'DIRECT' NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_pending_product_captures" ADD COLUMN "completion_job_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "studio_media_completion_jobs_fingerprint_unique" ON "studio_media_completion_jobs" USING btree ("operator_subject","fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_media_completion_jobs_attempt_slot_unique" ON "studio_media_completion_jobs" USING btree ("operator_subject","target_kind","target_key","role","attempt");--> statement-breakpoint
CREATE INDEX "studio_media_completion_jobs_target_idx" ON "studio_media_completion_jobs" USING btree ("operator_subject","target_kind","target_key","role","created_at");--> statement-breakpoint
ALTER TABLE "studio_pending_product_captures" ADD CONSTRAINT "studio_pending_product_captures_completion_job_id_studio_media_completion_jobs_id_fk" FOREIGN KEY ("completion_job_id") REFERENCES "public"."studio_media_completion_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_pending_product_captures" ADD CONSTRAINT "studio_pending_product_captures_origin_known" CHECK ("studio_pending_product_captures"."origin" in ('DIRECT', 'AI_DERIVED'));--> statement-breakpoint
ALTER TABLE "studio_pending_product_captures" ADD CONSTRAINT "studio_pending_product_captures_lineage" CHECK (
    ("studio_pending_product_captures"."origin" = 'DIRECT' and "studio_pending_product_captures"."completion_job_id" is null)
    or ("studio_pending_product_captures"."origin" = 'AI_DERIVED' and "studio_pending_product_captures"."completion_job_id" is not null)
  );
