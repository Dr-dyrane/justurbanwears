CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
ALTER TABLE "studio_generations" ALTER COLUMN "state" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "public"."studio_generation_state" RENAME TO "studio_generation_state_pre_0014";--> statement-breakpoint
CREATE TYPE "public"."studio_generation_state" AS ENUM(
  'PENDING', 'RUNNING', 'COMPLETE', 'APPROVED', 'REJECTED', 'FAILED', 'INDETERMINATE'
);--> statement-breakpoint
ALTER TABLE "studio_generations" ALTER COLUMN "state" TYPE "public"."studio_generation_state"
  USING "state"::text::"public"."studio_generation_state";--> statement-breakpoint
ALTER TABLE "studio_generations" ALTER COLUMN "state" SET DEFAULT 'PENDING';--> statement-breakpoint
DROP TYPE "public"."studio_generation_state_pre_0014";--> statement-breakpoint
ALTER TABLE "studio_decisions" ADD COLUMN "idempotency_key" varchar(160);--> statement-breakpoint
ALTER TABLE "studio_generations" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "studio_generations" ADD COLUMN "paid_scope_key" varchar(160);--> statement-breakpoint
ALTER TABLE "studio_generations" ADD COLUMN "execution_token" uuid;--> statement-breakpoint
ALTER TABLE "studio_generations" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studio_generations" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studio_generations" ADD COLUMN "provider_invocation_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studio_generations" ADD COLUMN "provider_result_received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studio_generations" ADD COLUMN "provider_result_blob_pathname" text;--> statement-breakpoint
ALTER TABLE "studio_generations" ADD COLUMN "provider_result_mime_type" varchar(80);--> statement-breakpoint
ALTER TABLE "studio_generations" ADD COLUMN "provider_result_byte_size" integer;--> statement-breakpoint
ALTER TABLE "studio_generations" ADD COLUMN "provider_result_sha256" varchar(64);--> statement-breakpoint
ALTER TABLE "studio_generations" ADD COLUMN "provider_result_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "studio_generations" ADD COLUMN "final_decision" "studio_decision_kind";--> statement-breakpoint
ALTER TABLE "studio_generations" ADD COLUMN "final_decision_note_sha256" varchar(64);--> statement-breakpoint
ALTER TABLE "studio_generations" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studio_intakes" ADD COLUMN "source_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "studio_intakes" ADD COLUMN "source_sha256" varchar(64);--> statement-breakpoint
WITH deterministic_source AS (
  SELECT DISTINCT ON (asset."intake_id")
    asset."intake_id",
    asset."id" AS "source_asset_id",
    asset."sha256" AS "source_sha256"
  FROM "studio_assets" AS asset
  WHERE asset."role" = 'SOURCE'
  ORDER BY asset."intake_id", asset."created_at", asset."id"
)
UPDATE "studio_intakes" AS intake
SET "source_asset_id" = source."source_asset_id",
    "source_sha256" = source."source_sha256",
    "updated_at" = now()
FROM deterministic_source AS source
WHERE intake."id" = source."intake_id";--> statement-breakpoint
UPDATE "studio_generations"
SET "parameters" = jsonb_set("parameters", '{attempt}', '1'::jsonb, true),
    "updated_at" = now()
WHERE "operation" IN (
    'GARMENT_ANALYSIS', 'GARMENT_FRONT', 'MANNEQUIN_FRONT',
    'MODEL_TRY_ON', 'EDITORIAL_MODEL'
  )
  AND NOT coalesce(
    jsonb_typeof("parameters"->'attempt') = 'number'
      AND "parameters"->>'attempt' IN ('1', '2'),
    false
  );--> statement-breakpoint
UPDATE "studio_generations" AS generation
SET "paid_scope_key" =
      'studio-paid-scope:v1:'
      || generation."intake_id"::text || ':'
      || generation."operation" || ':'
      || CASE
        WHEN generation."operation" = 'MODEL_TRY_ON'
          THEN 'model:' || coalesce(generation."parameters"->>'modelProfileId', 'missing')
        WHEN generation."operation" = 'EDITORIAL_MODEL'
          THEN 'parent:' || coalesce(generation."parameters"->>'parentGenerationId', 'missing')
        ELSE 'base'
      END
      || ':' || coalesce(generation."parameters"->>'attempt', '1'),
    "updated_at" = now()
WHERE generation."operation" IN (
    'GARMENT_ANALYSIS', 'GARMENT_FRONT', 'MANNEQUIN_FRONT',
    'MODEL_TRY_ON', 'EDITORIAL_MODEL'
  );--> statement-breakpoint
WITH ranked_paid_scopes AS (
  SELECT generation."id", generation."state",
    row_number() OVER (
      PARTITION BY generation."paid_scope_key"
      ORDER BY
        CASE
          WHEN generation."state" = 'APPROVED' THEN 0
          WHEN generation."state" = 'COMPLETE' OR generation."output_asset_id" IS NOT NULL THEN 1
          WHEN generation."state" = 'REJECTED' THEN 2
          WHEN generation."cost_usd" IS NOT NULL OR generation."usage" IS NOT NULL THEN 3
          WHEN generation."state" IN ('INDETERMINATE', 'RUNNING') THEN 4
          WHEN generation."state" = 'FAILED' THEN 5
          ELSE 6
        END,
        generation."updated_at" DESC,
        generation."created_at",
        generation."id"
    ) AS scope_rank
  FROM "studio_generations" AS generation
  WHERE generation."paid_scope_key" IS NOT NULL
)
UPDATE "studio_generations" AS generation
SET "paid_scope_key" = null,
    "state" = CASE
      WHEN ranked."state" = 'RUNNING' THEN 'INDETERMINATE'::studio_generation_state
      WHEN ranked."state" = 'PENDING' THEN 'FAILED'::studio_generation_state
      ELSE ranked."state"
    END,
    "lease_expires_at" = CASE
      WHEN ranked."state" IN ('PENDING', 'RUNNING') THEN null
      ELSE generation."lease_expires_at"
    END,
    "error_code" = CASE
      WHEN ranked."state" = 'RUNNING' THEN 'DUPLICATE_PAID_SCOPE_RECONCILIATION'
      WHEN ranked."state" = 'PENDING' THEN 'DUPLICATE_PAID_SCOPE_SUPERSEDED'
      ELSE generation."error_code"
    END,
    "updated_at" = now()
FROM ranked_paid_scopes AS ranked
WHERE generation."id" = ranked."id" AND ranked.scope_rank > 1;--> statement-breakpoint
WITH ranked_active_paid AS (
  SELECT generation."id", generation."state",
    row_number() OVER (
      PARTITION BY
        generation."intake_id",
        generation."operation",
        CASE
          WHEN generation."operation" = 'MODEL_TRY_ON'
            THEN 'model:' || coalesce(generation."parameters"->>'modelProfileId', 'missing')
          WHEN generation."operation" = 'EDITORIAL_MODEL'
            THEN 'parent:' || coalesce(generation."parameters"->>'parentGenerationId', 'missing')
          ELSE 'base'
        END,
        coalesce(generation."parameters"->>'attempt', '1')
      ORDER BY
        CASE WHEN generation."state" = 'RUNNING' THEN 0 ELSE 1 END,
        generation."created_at",
        generation."id"
    ) AS active_rank
  FROM "studio_generations" AS generation
  WHERE generation."state" IN ('PENDING', 'RUNNING')
    AND generation."operation" IN (
      'GARMENT_ANALYSIS', 'GARMENT_FRONT', 'MANNEQUIN_FRONT',
      'MODEL_TRY_ON', 'EDITORIAL_MODEL'
    )
)
UPDATE "studio_generations" AS generation
SET "state" = CASE
      WHEN ranked."state" = 'RUNNING' THEN 'INDETERMINATE'::studio_generation_state
      ELSE 'FAILED'::studio_generation_state
    END,
    "lease_expires_at" = null,
    "error_code" = CASE
      WHEN ranked."state" = 'RUNNING' THEN 'DUPLICATE_ACTIVE_RECONCILIATION'
      ELSE 'DUPLICATE_PENDING_SUPERSEDED'
    END,
    "updated_at" = now()
FROM ranked_active_paid AS ranked
WHERE generation."id" = ranked."id" AND ranked.active_rank > 1;--> statement-breakpoint
UPDATE "studio_generations"
SET "state" = 'FAILED',
    "error_code" = 'MIGRATED_COMMAND_RETRYABLE',
    "lease_expires_at" = null,
    "updated_at" = now()
WHERE "state" = 'RUNNING' AND "operation" = 'GENESIS_COMMAND';--> statement-breakpoint
UPDATE "studio_generations"
SET "state" = 'INDETERMINATE',
    "error_code" = 'MIGRATED_RUNNING_RECONCILIATION',
    "lease_expires_at" = null,
    "updated_at" = now()
WHERE "state" = 'RUNNING';--> statement-breakpoint
WITH ranked_decisions AS (
  SELECT decision."id", decision."generation_id", decision."decision",
    row_number() OVER (
      PARTITION BY decision."generation_id", decision."decision"
      ORDER BY decision."created_at" DESC, decision."id" DESC
    ) AS decision_rank
  FROM "studio_decisions" AS decision
  WHERE decision."generation_id" IS NOT NULL
)
UPDATE "studio_decisions" AS decision
SET "idempotency_key" = 'generation:' || ranked."generation_id"::text || ':' || ranked."decision"::text
FROM ranked_decisions AS ranked
WHERE decision."id" = ranked."id" AND ranked.decision_rank = 1;--> statement-breakpoint
WITH selected_decisions AS (
  SELECT DISTINCT ON (decision."generation_id")
    decision."generation_id",
    decision."decision",
    decision."note",
    decision."created_at"
  FROM "studio_decisions" AS decision
  WHERE decision."generation_id" IS NOT NULL
    AND decision."decision" <> 'RETRY'
  ORDER BY decision."generation_id", decision."created_at" DESC, decision."id" DESC
), resolved_decisions AS (
  SELECT
    generation."id" AS "generation_id",
    coalesce(
      selected."decision",
      CASE
        WHEN generation."state" = 'APPROVED' THEN 'KEEP'::studio_decision_kind
        ELSE 'REJECT'::studio_decision_kind
      END
    ) AS "decision",
    coalesce(nullif(btrim(selected."note"), ''), '') AS "normalized_note",
    coalesce(selected."created_at", generation."updated_at") AS "decided_at"
  FROM "studio_generations" AS generation
  LEFT JOIN selected_decisions AS selected ON selected."generation_id" = generation."id"
  WHERE generation."state" IN ('APPROVED', 'REJECTED')
)
UPDATE "studio_generations" AS generation
SET "final_decision" = resolved."decision",
    "final_decision_note_sha256" = encode(digest(resolved."normalized_note", 'sha256'), 'hex'),
    "decided_at" = resolved."decided_at"
FROM resolved_decisions AS resolved
WHERE generation."id" = resolved."generation_id";--> statement-breakpoint
CREATE UNIQUE INDEX "studio_decisions_idempotency_unique" ON "studio_decisions" USING btree ("idempotency_key") WHERE "studio_decisions"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "studio_generations_intake_request_unique" ON "studio_generations" USING btree ("intake_id","request_id") WHERE "studio_generations"."request_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "studio_generations_paid_scope_fence_unique" ON "studio_generations" USING btree ("paid_scope_key") WHERE "studio_generations"."paid_scope_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "studio_generations_active_paid_scope_unique" ON "studio_generations" USING btree ("intake_id","operation",(case
      when "operation" = 'MODEL_TRY_ON'
        then 'model:' || coalesce("parameters"->>'modelProfileId', 'missing')
      when "operation" = 'EDITORIAL_MODEL'
        then 'parent:' || coalesce("parameters"->>'parentGenerationId', 'missing')
      else 'base'
    end),(coalesce("parameters"->>'attempt', '1'))) WHERE
    "studio_generations"."state" in ('PENDING', 'RUNNING')
    and "studio_generations"."operation" in (
      'GARMENT_ANALYSIS', 'GARMENT_FRONT', 'MANNEQUIN_FRONT',
      'MODEL_TRY_ON', 'EDITORIAL_MODEL'
    )
  ;--> statement-breakpoint
CREATE INDEX "studio_generations_running_lease_idx" ON "studio_generations" USING btree ("lease_expires_at") WHERE "studio_generations"."state" = 'RUNNING';--> statement-breakpoint
ALTER TABLE "studio_generations" ADD CONSTRAINT "studio_generations_paid_attempt" CHECK (
    "studio_generations"."operation" not in (
      'GARMENT_ANALYSIS', 'GARMENT_FRONT', 'MANNEQUIN_FRONT',
      'MODEL_TRY_ON', 'EDITORIAL_MODEL'
    ) or (
      jsonb_typeof("studio_generations"."parameters"->'attempt') = 'number'
      and ("studio_generations"."parameters"->>'attempt')::integer between 1 and 2
    )
  );--> statement-breakpoint
ALTER TABLE "studio_generations" ADD CONSTRAINT "studio_generations_execution_lease" CHECK (
    ("studio_generations"."state" = 'RUNNING'
      and "studio_generations"."execution_token" is not null
      and "studio_generations"."started_at" is not null
      and "studio_generations"."lease_expires_at" is not null)
    or ("studio_generations"."state" <> 'RUNNING' and "studio_generations"."lease_expires_at" is null)
  );--> statement-breakpoint
ALTER TABLE "studio_generations" ADD CONSTRAINT "studio_generations_provider_checkpoints" CHECK (
    ("studio_generations"."provider_invocation_started_at" is null
      and "studio_generations"."provider_result_received_at" is null
      and "studio_generations"."provider_result_blob_pathname" is null
      and "studio_generations"."provider_result_mime_type" is null
      and "studio_generations"."provider_result_byte_size" is null
      and "studio_generations"."provider_result_sha256" is null)
    or ("studio_generations"."provider_invocation_started_at" is not null
      and "studio_generations"."provider_result_received_at" is null
      and "studio_generations"."provider_result_blob_pathname" is null
      and "studio_generations"."provider_result_mime_type" is null
      and "studio_generations"."provider_result_byte_size" is null
      and "studio_generations"."provider_result_sha256" is null)
    or ("studio_generations"."provider_invocation_started_at" is not null
      and "studio_generations"."provider_result_received_at" is not null
      and "studio_generations"."provider_result_blob_pathname" is not null
      and "studio_generations"."provider_result_mime_type" is not null
      and "studio_generations"."provider_result_byte_size" > 0
      and "studio_generations"."provider_result_sha256" ~ '^[0-9a-f]{64}$')
  );--> statement-breakpoint
ALTER TABLE "studio_generations" ADD CONSTRAINT "studio_generations_provider_result_metadata" CHECK (
  "studio_generations"."provider_result_metadata" is null
  or jsonb_typeof("studio_generations"."provider_result_metadata") = 'object'
);--> statement-breakpoint
ALTER TABLE "studio_generations" ADD CONSTRAINT "studio_generations_indeterminate_reason" CHECK (
    "studio_generations"."state" <> 'INDETERMINATE' or "studio_generations"."error_code" is not null
  );--> statement-breakpoint
ALTER TABLE "studio_generations" ADD CONSTRAINT "studio_generations_final_decision" CHECK (
    ("studio_generations"."final_decision" is null and "studio_generations"."final_decision_note_sha256" is null and "studio_generations"."decided_at" is null)
    or ("studio_generations"."final_decision" is not null
      and "studio_generations"."final_decision_note_sha256" ~ '^[0-9a-f]{64}$'
      and "studio_generations"."decided_at" is not null)
  );--> statement-breakpoint
ALTER TABLE "studio_intakes" ADD CONSTRAINT "studio_intakes_source_binding" CHECK (
    ("studio_intakes"."source_asset_id" is null and "studio_intakes"."source_sha256" is null)
    or ("studio_intakes"."source_asset_id" is not null and "studio_intakes"."source_sha256" ~ '^[0-9a-f]{64}$')
  );
