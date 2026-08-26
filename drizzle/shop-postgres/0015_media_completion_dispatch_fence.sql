ALTER TABLE "studio_media_completion_jobs" DROP CONSTRAINT "studio_media_completion_jobs_state_known";--> statement-breakpoint
ALTER TABLE "studio_media_completion_jobs" DROP CONSTRAINT "studio_media_completion_jobs_output_complete";--> statement-breakpoint
ALTER TABLE "studio_media_completion_jobs" ADD COLUMN "validation_invocation_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studio_media_completion_jobs" ADD COLUMN "validation_result_received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studio_media_completion_jobs" ADD COLUMN "provider_invocation_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studio_media_completion_jobs" ADD COLUMN "provider_result_received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studio_media_completion_jobs" ADD COLUMN "provider_result_blob_pathname" text;--> statement-breakpoint
ALTER TABLE "studio_media_completion_jobs" ADD COLUMN "provider_result_mime_type" varchar(80);--> statement-breakpoint
ALTER TABLE "studio_media_completion_jobs" ADD COLUMN "provider_result_byte_size" integer;--> statement-breakpoint
ALTER TABLE "studio_media_completion_jobs" ADD COLUMN "provider_result_sha256" varchar(64);--> statement-breakpoint
UPDATE "studio_media_completion_jobs"
SET
  "state" = 'INDETERMINATE',
  "execution_token" = null,
  "started_at" = null,
  "lease_expires_at" = null,
  "error_code" = CASE
    WHEN "state" = 'RUNNING' THEN 'MIGRATED_RUNNING_RECONCILIATION'
    ELSE 'MIGRATED_STALE_RECONCILIATION'
  END,
  "updated_at" = now()
WHERE "state" = 'RUNNING'
  OR ("state" = 'FAILED' AND "error_code" = 'STALE_EXECUTION');--> statement-breakpoint
ALTER TABLE "studio_media_completion_jobs" ADD CONSTRAINT "studio_media_completion_jobs_validation_checkpoints" CHECK (
    ("studio_media_completion_jobs"."validation_invocation_started_at" is null
      and "studio_media_completion_jobs"."validation_result_received_at" is null)
    or ("studio_media_completion_jobs"."validation_invocation_started_at" is not null
      and "studio_media_completion_jobs"."validation_result_received_at" is null)
    or ("studio_media_completion_jobs"."validation_invocation_started_at" is not null
      and "studio_media_completion_jobs"."validation_result_received_at" is not null
      and "studio_media_completion_jobs"."source_validation" is not null)
  );--> statement-breakpoint
ALTER TABLE "studio_media_completion_jobs" ADD CONSTRAINT "studio_media_completion_jobs_provider_checkpoints" CHECK (
    ("studio_media_completion_jobs"."provider_invocation_started_at" is null
      and "studio_media_completion_jobs"."provider_result_received_at" is null
      and "studio_media_completion_jobs"."provider_result_blob_pathname" is null
      and "studio_media_completion_jobs"."provider_result_mime_type" is null
      and "studio_media_completion_jobs"."provider_result_byte_size" is null
      and "studio_media_completion_jobs"."provider_result_sha256" is null)
    or ("studio_media_completion_jobs"."provider_invocation_started_at" is not null
      and "studio_media_completion_jobs"."provider_result_received_at" is null
      and "studio_media_completion_jobs"."provider_result_blob_pathname" is null
      and "studio_media_completion_jobs"."provider_result_mime_type" is null
      and "studio_media_completion_jobs"."provider_result_byte_size" is null
      and "studio_media_completion_jobs"."provider_result_sha256" is null)
    or ("studio_media_completion_jobs"."provider_invocation_started_at" is not null
      and "studio_media_completion_jobs"."provider_result_received_at" is not null
      and "studio_media_completion_jobs"."provider_result_blob_pathname" is not null
      and "studio_media_completion_jobs"."provider_result_mime_type" is not null
      and "studio_media_completion_jobs"."provider_result_byte_size" > 0
      and "studio_media_completion_jobs"."provider_result_sha256" ~ '^[0-9a-f]{64}$')
  );--> statement-breakpoint
ALTER TABLE "studio_media_completion_jobs" ADD CONSTRAINT "studio_media_completion_jobs_state_known" CHECK ("studio_media_completion_jobs"."state" in ('PENDING', 'RUNNING', 'COMPLETE', 'APPROVED', 'REJECTED', 'FAILED', 'INDETERMINATE'));--> statement-breakpoint
ALTER TABLE "studio_media_completion_jobs" ADD CONSTRAINT "studio_media_completion_jobs_output_complete" CHECK (
    ("studio_media_completion_jobs"."state" in ('PENDING', 'RUNNING', 'FAILED', 'INDETERMINATE')
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
  );
