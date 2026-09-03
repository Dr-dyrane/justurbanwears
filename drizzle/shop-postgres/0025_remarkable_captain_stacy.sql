CREATE TYPE "public"."studio_assistant_operation_kind" AS ENUM('PIECE_EDIT', 'PUBLISH_REVISION', 'DROP_MOVE', 'ARCHIVE', 'PERMANENT_DELETE');--> statement-breakpoint
CREATE TYPE "public"."studio_assistant_operation_state" AS ENUM('PREPARED', 'EXECUTING', 'SUCCEEDED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "studio_assistant_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "studio_assistant_operation_kind" NOT NULL,
	"state" "studio_assistant_operation_state" DEFAULT 'PREPARED' NOT NULL,
	"target_type" varchar(40) NOT NULL,
	"target_id" text NOT NULL,
	"target_reference" varchar(120) NOT NULL,
	"target_label" text NOT NULL,
	"target_href" text NOT NULL,
	"expected_version" integer,
	"expected_revision" varchar(64),
	"idempotency_key" varchar(160) NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"payload" jsonb NOT NULL,
	"preview" jsonb NOT NULL,
	"receipt" jsonb,
	"last_error" jsonb,
	"created_by_subject" text NOT NULL,
	"created_by_email" text NOT NULL,
	"created_by_display_name" text NOT NULL,
	"executed_by_subject" text,
	"executed_by_email" text,
	"executed_by_display_name" text,
	"version" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"executed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_assistant_operations_version_positive" CHECK ("studio_assistant_operations"."version" > 0),
	CONSTRAINT "studio_assistant_operations_target_present" CHECK (
    length(trim("studio_assistant_operations"."target_type")) > 0
    and length(trim("studio_assistant_operations"."target_id")) > 0
    and length(trim("studio_assistant_operations"."target_reference")) > 0
    and length(trim("studio_assistant_operations"."target_label")) > 0
    and length(trim("studio_assistant_operations"."target_href")) > 0
  ),
	CONSTRAINT "studio_assistant_operations_expected_version_positive" CHECK (
    "studio_assistant_operations"."expected_version" is null or "studio_assistant_operations"."expected_version" > 0
  ),
	CONSTRAINT "studio_assistant_operations_expected_revision_hash" CHECK (
    "studio_assistant_operations"."expected_revision" is null or "studio_assistant_operations"."expected_revision" ~ '^[0-9a-f]{64}$'
  ),
	CONSTRAINT "studio_assistant_operations_request_fingerprint_hash" CHECK (
    "studio_assistant_operations"."request_fingerprint" ~ '^[0-9a-f]{64}$'
  ),
	CONSTRAINT "studio_assistant_operations_payload_object" CHECK (jsonb_typeof("studio_assistant_operations"."payload") = 'object'),
	CONSTRAINT "studio_assistant_operations_preview_object" CHECK (jsonb_typeof("studio_assistant_operations"."preview") = 'object'),
	CONSTRAINT "studio_assistant_operations_receipt_object" CHECK (
    "studio_assistant_operations"."receipt" is null or jsonb_typeof("studio_assistant_operations"."receipt") = 'object'
  ),
	CONSTRAINT "studio_assistant_operations_error_object" CHECK (
    "studio_assistant_operations"."last_error" is null or jsonb_typeof("studio_assistant_operations"."last_error") = 'object'
  ),
	CONSTRAINT "studio_assistant_operations_execution_pair" CHECK (
    ("studio_assistant_operations"."executed_at" is null
      and "studio_assistant_operations"."executed_by_subject" is null
      and "studio_assistant_operations"."executed_by_email" is null
      and "studio_assistant_operations"."executed_by_display_name" is null)
    or ("studio_assistant_operations"."executed_at" is not null
      and "studio_assistant_operations"."executed_by_subject" is not null
      and "studio_assistant_operations"."executed_by_email" is not null
      and "studio_assistant_operations"."executed_by_display_name" is not null)
  ),
	CONSTRAINT "studio_assistant_operations_terminal_receipt" CHECK (
    ("studio_assistant_operations"."state" = 'SUCCEEDED' and "studio_assistant_operations"."receipt" is not null and "studio_assistant_operations"."executed_at" is not null)
    or ("studio_assistant_operations"."state" <> 'SUCCEEDED')
  )
);
--> statement-breakpoint
ALTER TABLE "studio_assistant_operations" ADD CONSTRAINT "studio_assistant_operations_thread_id_studio_assistant_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."studio_assistant_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_assistant_operations" ADD CONSTRAINT "studio_assistant_operations_workspace_id_studio_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."studio_workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "studio_assistant_operations_workspace_idempotency_unique" ON "studio_assistant_operations" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "studio_assistant_operations_thread_updated_idx" ON "studio_assistant_operations" USING btree ("thread_id","updated_at");--> statement-breakpoint
CREATE INDEX "studio_assistant_operations_workspace_state_idx" ON "studio_assistant_operations" USING btree ("workspace_id","state");