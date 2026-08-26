CREATE TABLE "studio_atelier_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execution_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"kind" varchar(32) NOT NULL,
	"role" varchar(80) NOT NULL,
	"state" varchar(24) DEFAULT 'STORED' NOT NULL,
	"blob_pathname" text NOT NULL,
	"blob_url" text NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"sha256" varchar(64) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"quarantine_reason" text,
	"privacy" varchar(24) DEFAULT 'PRIVATE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_atelier_artifacts_ordinal_bounded" CHECK ("studio_atelier_artifacts"."ordinal" >= 0 and "studio_atelier_artifacts"."ordinal" < 64),
	CONSTRAINT "studio_atelier_artifacts_kind_known" CHECK (
    "studio_atelier_artifacts"."kind" in ('PROVIDER_RAW', 'NORMALIZED', 'SUBJECT_LAYER', 'COMPOSITE', 'DIAGNOSTIC')
  ),
	CONSTRAINT "studio_atelier_artifacts_state_known" CHECK ("studio_atelier_artifacts"."state" in ('STORED', 'QUARANTINED')),
	CONSTRAINT "studio_atelier_artifacts_bytes_positive" CHECK ("studio_atelier_artifacts"."byte_size" > 0),
	CONSTRAINT "studio_atelier_artifacts_dimensions" CHECK (
    ("studio_atelier_artifacts"."width" is null and "studio_atelier_artifacts"."height" is null)
    or ("studio_atelier_artifacts"."width" > 0 and "studio_atelier_artifacts"."height" > 0)
  ),
	CONSTRAINT "studio_atelier_artifacts_sha256" CHECK ("studio_atelier_artifacts"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_atelier_artifacts_content_addressed" CHECK (position("studio_atelier_artifacts"."sha256" in "studio_atelier_artifacts"."blob_pathname") > 0),
	CONSTRAINT "studio_atelier_artifacts_metadata_object" CHECK (jsonb_typeof("studio_atelier_artifacts"."metadata") = 'object'),
	CONSTRAINT "studio_atelier_artifacts_quarantine_pair" CHECK (
    ("studio_atelier_artifacts"."state" = 'STORED' and "studio_atelier_artifacts"."quarantine_reason" is null)
    or ("studio_atelier_artifacts"."state" = 'QUARANTINED' and length(trim("studio_atelier_artifacts"."quarantine_reason")) > 0)
  ),
	CONSTRAINT "studio_atelier_artifacts_private_only" CHECK ("studio_atelier_artifacts"."privacy" = 'PRIVATE')
);
--> statement-breakpoint
CREATE TABLE "studio_atelier_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"event_type" varchar(48) NOT NULL,
	"expected_version" integer NOT NULL,
	"resulting_version" integer NOT NULL,
	"execution_id" uuid,
	"artifact_id" uuid,
	"actor_subject" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"previous_event_hash" varchar(64),
	"event_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_atelier_events_sequence_positive" CHECK ("studio_atelier_events"."sequence" > 0),
	CONSTRAINT "studio_atelier_events_versions" CHECK (
    "studio_atelier_events"."expected_version" >= 0
    and "studio_atelier_events"."resulting_version" = "studio_atelier_events"."expected_version" + 1
    and "studio_atelier_events"."sequence" = "studio_atelier_events"."resulting_version"
  ),
	CONSTRAINT "studio_atelier_events_type_known" CHECK (
    "studio_atelier_events"."event_type" in (
      'MATERIALIZED', 'TECHNICAL_PASS', 'TECHNICAL_FAIL', 'SEMANTIC_PASS', 'SEMANTIC_FAIL',
      'USER_APPROVED', 'USER_REJECTED', 'LOCKED', 'SUPERSEDED',
      'CORRECTION_AUTHORIZED', 'BLOCKED_USER_DIRECTION'
    )
  ),
	CONSTRAINT "studio_atelier_events_actor_present" CHECK (length(trim("studio_atelier_events"."actor_subject")) > 0),
	CONSTRAINT "studio_atelier_events_payload_object" CHECK (jsonb_typeof("studio_atelier_events"."payload") = 'object'),
	CONSTRAINT "studio_atelier_events_previous_hash" CHECK (
    "studio_atelier_events"."previous_event_hash" is null or "studio_atelier_events"."previous_event_hash" ~ '^[0-9a-f]{64}$'
  ),
	CONSTRAINT "studio_atelier_events_hash" CHECK ("studio_atelier_events"."event_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "studio_atelier_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"state" varchar(24) DEFAULT 'INTENT' NOT NULL,
	"adapter" varchar(80) NOT NULL,
	"model" text NOT NULL,
	"execution_hash" varchar(64) NOT NULL,
	"prompt_version" varchar(64) NOT NULL,
	"compiled_prompt" text NOT NULL,
	"prompt_hash" varchar(64) NOT NULL,
	"ordered_bindings" jsonb NOT NULL,
	"parameters" jsonb NOT NULL,
	"execution_token" uuid,
	"lease_fence" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"provider_invocation_started_at" timestamp with time zone,
	"provider_result_received_at" timestamp with time zone,
	"provider_result_manifest" jsonb,
	"usage" jsonb,
	"cost_usd" text,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sanitized_responses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"request_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duration_ms" integer,
	"error_code" varchar(96),
	"error_message" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_atelier_executions_attempt_positive" CHECK ("studio_atelier_executions"."attempt" > 0),
	CONSTRAINT "studio_atelier_executions_state_known" CHECK (
    "studio_atelier_executions"."state" in ('INTENT', 'RUNNING', 'PERSISTING', 'COMPLETE', 'FAILED', 'QUARANTINED', 'INDETERMINATE')
  ),
	CONSTRAINT "studio_atelier_executions_execution_hash" CHECK ("studio_atelier_executions"."execution_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_atelier_executions_prompt_hash" CHECK ("studio_atelier_executions"."prompt_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_atelier_executions_prompt_present" CHECK (length(trim("studio_atelier_executions"."compiled_prompt")) > 0),
	CONSTRAINT "studio_atelier_executions_bindings_array" CHECK (jsonb_typeof("studio_atelier_executions"."ordered_bindings") = 'array'),
	CONSTRAINT "studio_atelier_executions_parameters_object" CHECK (jsonb_typeof("studio_atelier_executions"."parameters") = 'object'),
	CONSTRAINT "studio_atelier_executions_usage_object" CHECK ("studio_atelier_executions"."usage" is null or jsonb_typeof("studio_atelier_executions"."usage") = 'object'),
	CONSTRAINT "studio_atelier_executions_result_manifest_object" CHECK (
    "studio_atelier_executions"."provider_result_manifest" is null
    or jsonb_typeof("studio_atelier_executions"."provider_result_manifest") = 'object'
  ),
	CONSTRAINT "studio_atelier_executions_warnings_array" CHECK (jsonb_typeof("studio_atelier_executions"."warnings") = 'array'),
	CONSTRAINT "studio_atelier_executions_responses_array" CHECK (jsonb_typeof("studio_atelier_executions"."sanitized_responses") = 'array'),
	CONSTRAINT "studio_atelier_executions_request_ids_array" CHECK (jsonb_typeof("studio_atelier_executions"."request_ids") = 'array'),
	CONSTRAINT "studio_atelier_executions_cost" CHECK (
    "studio_atelier_executions"."cost_usd" is null or "studio_atelier_executions"."cost_usd" ~ '^[0-9]+([.][0-9]+)?$'
  ),
	CONSTRAINT "studio_atelier_executions_duration_nonnegative" CHECK ("studio_atelier_executions"."duration_ms" is null or "studio_atelier_executions"."duration_ms" >= 0),
	CONSTRAINT "studio_atelier_executions_fence_nonnegative" CHECK ("studio_atelier_executions"."lease_fence" >= 0),
	CONSTRAINT "studio_atelier_executions_provider_checkpoints" CHECK (
    ("studio_atelier_executions"."provider_invocation_started_at" is null
      and "studio_atelier_executions"."provider_result_received_at" is null
      and "studio_atelier_executions"."provider_result_manifest" is null)
    or ("studio_atelier_executions"."provider_invocation_started_at" is not null
      and "studio_atelier_executions"."provider_result_received_at" is null
      and "studio_atelier_executions"."provider_result_manifest" is null)
    or ("studio_atelier_executions"."provider_invocation_started_at" is not null
      and "studio_atelier_executions"."provider_result_received_at" is not null
      and "studio_atelier_executions"."provider_result_manifest" is not null)
  ),
	CONSTRAINT "studio_atelier_executions_lease" CHECK (
    ("studio_atelier_executions"."state" = 'INTENT'
      and "studio_atelier_executions"."execution_token" is null
      and "studio_atelier_executions"."started_at" is null
      and "studio_atelier_executions"."lease_expires_at" is null
      and "studio_atelier_executions"."completed_at" is null)
    or ("studio_atelier_executions"."state" in ('RUNNING', 'PERSISTING')
      and "studio_atelier_executions"."execution_token" is not null
      and "studio_atelier_executions"."lease_fence" > 0
      and "studio_atelier_executions"."started_at" is not null
      and "studio_atelier_executions"."lease_expires_at" is not null
      and "studio_atelier_executions"."completed_at" is null)
    or ("studio_atelier_executions"."state" in ('COMPLETE', 'FAILED', 'QUARANTINED', 'INDETERMINATE')
      and "studio_atelier_executions"."execution_token" is null
      and "studio_atelier_executions"."started_at" is not null
      and "studio_atelier_executions"."lease_expires_at" is null
      and "studio_atelier_executions"."completed_at" is not null)
  ),
	CONSTRAINT "studio_atelier_executions_complete_accounting" CHECK (
    "studio_atelier_executions"."state" <> 'COMPLETE'
    or ("studio_atelier_executions"."provider_invocation_started_at" is not null
      and "studio_atelier_executions"."provider_result_received_at" is not null
      and "studio_atelier_executions"."provider_result_manifest" is not null
      and "studio_atelier_executions"."usage" is not null
      and "studio_atelier_executions"."cost_usd" is not null
      and "studio_atelier_executions"."duration_ms" is not null)
  ),
	CONSTRAINT "studio_atelier_executions_exception_reason" CHECK (
    "studio_atelier_executions"."state" not in ('QUARANTINED', 'INDETERMINATE') or "studio_atelier_executions"."error_code" is not null
  )
);
--> statement-breakpoint
CREATE TABLE "studio_atelier_operation_projections" (
	"operation_id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"state" varchar(40) DEFAULT 'DRAFT' NOT NULL,
	"technical_decision" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"semantic_decision" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"user_decision" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"correction_authorized" boolean DEFAULT false NOT NULL,
	"materialized_execution_id" uuid,
	"materialized_artifact_id" uuid,
	"materialized_artifact_sha256" varchar(64),
	"locked_artifact_id" uuid,
	"locked_asset_id" varchar(200),
	"locked_artifact_sha256" varchar(64),
	"locked_parent_descriptor" jsonb,
	"superseded_by_operation_id" uuid,
	"blocked_reason" varchar(96),
	"last_event_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_atelier_operation_projections_version_nonnegative" CHECK ("studio_atelier_operation_projections"."version" >= 0),
	CONSTRAINT "studio_atelier_operation_projections_state_known" CHECK (
    "studio_atelier_operation_projections"."state" in (
      'DRAFT', 'MATERIALIZED', 'TECHNICAL_PASS', 'TECHNICAL_FAIL', 'SEMANTIC_PASS', 'SEMANTIC_FAIL',
      'USER_APPROVED', 'USER_REJECTED', 'LOCKED', 'SUPERSEDED',
      'BLOCKED_USER_DIRECTION'
    )
  ),
	CONSTRAINT "studio_atelier_operation_projections_technical_known" CHECK (
    "studio_atelier_operation_projections"."technical_decision" in ('PENDING', 'PASS', 'FAIL')
  ),
	CONSTRAINT "studio_atelier_operation_projections_semantic_known" CHECK (
    "studio_atelier_operation_projections"."semantic_decision" in ('PENDING', 'PASS', 'FAIL')
  ),
	CONSTRAINT "studio_atelier_operation_projections_user_known" CHECK (
    "studio_atelier_operation_projections"."user_decision" in ('PENDING', 'APPROVED', 'REJECTED')
  ),
	CONSTRAINT "studio_atelier_operation_projections_materialized_tuple" CHECK (
    ("studio_atelier_operation_projections"."materialized_execution_id" is null
      and "studio_atelier_operation_projections"."materialized_artifact_id" is null
      and "studio_atelier_operation_projections"."materialized_artifact_sha256" is null)
    or ("studio_atelier_operation_projections"."materialized_execution_id" is not null
      and "studio_atelier_operation_projections"."materialized_artifact_id" is not null
      and "studio_atelier_operation_projections"."materialized_artifact_sha256" ~ '^[0-9a-f]{64}$')
  ),
	CONSTRAINT "studio_atelier_operation_projections_lock_tuple" CHECK (
    ("studio_atelier_operation_projections"."state" = 'LOCKED'
      and "studio_atelier_operation_projections"."locked_artifact_id" is not null
      and length(trim("studio_atelier_operation_projections"."locked_asset_id")) > 0
      and "studio_atelier_operation_projections"."locked_artifact_sha256" ~ '^[0-9a-f]{64}$'
      and jsonb_typeof("studio_atelier_operation_projections"."locked_parent_descriptor") = 'object')
    or ("studio_atelier_operation_projections"."state" <> 'LOCKED')
  ),
	CONSTRAINT "studio_atelier_operation_projections_event_hash" CHECK (
    "studio_atelier_operation_projections"."last_event_hash" is null or "studio_atelier_operation_projections"."last_event_hash" ~ '^[0-9a-f]{64}$'
  )
);
--> statement-breakpoint
CREATE TABLE "studio_atelier_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_subject" text NOT NULL,
	"operation_key" varchar(160) NOT NULL,
	"garment_id" varchar(80) NOT NULL,
	"view" varchar(24) NOT NULL,
	"stage" varchar(48) NOT NULL,
	"contract_version" varchar(64) NOT NULL,
	"workflow_revision" varchar(80) NOT NULL,
	"semantic_hash" varchar(64) NOT NULL,
	"root_semantic_hash" varchar(64) NOT NULL,
	"correction_of_semantic_hash" varchar(64),
	"correction_ordinal" integer DEFAULT 0 NOT NULL,
	"declaration_receipt" jsonb NOT NULL,
	"truth_receipt" jsonb NOT NULL,
	"canonical_operation" jsonb NOT NULL,
	"parent_assets" jsonb NOT NULL,
	"authority_stack" jsonb NOT NULL,
	"change_set" jsonb NOT NULL,
	"immutable_set" jsonb NOT NULL,
	"output_contract" jsonb NOT NULL,
	"failure_gates" jsonb NOT NULL,
	"state" varchar(24) DEFAULT 'PLANNED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_atelier_operations_key_present" CHECK (length(trim("studio_atelier_operations"."operation_key")) > 0),
	CONSTRAINT "studio_atelier_operations_garment_present" CHECK (length(trim("studio_atelier_operations"."garment_id")) > 0),
	CONSTRAINT "studio_atelier_operations_contract_present" CHECK (length(trim("studio_atelier_operations"."contract_version")) > 0),
	CONSTRAINT "studio_atelier_operations_workflow_present" CHECK (length(trim("studio_atelier_operations"."workflow_revision")) > 0),
	CONSTRAINT "studio_atelier_operations_semantic_hash" CHECK ("studio_atelier_operations"."semantic_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_atelier_operations_root_semantic_hash" CHECK ("studio_atelier_operations"."root_semantic_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_atelier_operations_correction_hash" CHECK (
    "studio_atelier_operations"."correction_of_semantic_hash" is null
    or "studio_atelier_operations"."correction_of_semantic_hash" ~ '^[0-9a-f]{64}$'
  ),
	CONSTRAINT "studio_atelier_operations_correction_lineage" CHECK (
    ("studio_atelier_operations"."correction_of_semantic_hash" is null
      and "studio_atelier_operations"."correction_ordinal" = 0
      and "studio_atelier_operations"."root_semantic_hash" = "studio_atelier_operations"."semantic_hash")
    or ("studio_atelier_operations"."correction_of_semantic_hash" is not null
      and "studio_atelier_operations"."correction_ordinal" = 1
      and "studio_atelier_operations"."root_semantic_hash" <> "studio_atelier_operations"."semantic_hash")
  ),
	CONSTRAINT "studio_atelier_operations_declaration_receipt" CHECK (
    jsonb_typeof("studio_atelier_operations"."declaration_receipt") = 'object'
    and "studio_atelier_operations"."declaration_receipt"->>'sourceHash' ~ '^[0-9a-f]{64}$'
    and length(trim("studio_atelier_operations"."declaration_receipt"->>'schemaVersion')) > 0
    and length(trim("studio_atelier_operations"."declaration_receipt"->>'validatorRevision')) > 0
    and jsonb_typeof("studio_atelier_operations"."declaration_receipt"->'fileVerification') = 'object'
    and "studio_atelier_operations"."declaration_receipt"->'fileVerification'->>'status' = 'PASS'
    and "studio_atelier_operations"."declaration_receipt"->'fileVerification'->>'receiptHash' ~ '^[0-9a-f]{64}$'
    and "studio_atelier_operations"."declaration_receipt"->'fileVerification'->>'manifestHash' ~ '^[0-9a-f]{64}$'
  ),
	CONSTRAINT "studio_atelier_operations_truth_receipt" CHECK (
    jsonb_typeof("studio_atelier_operations"."truth_receipt") = 'object'
    and length(trim("studio_atelier_operations"."truth_receipt"->>'bundleVersion')) > 0
    and "studio_atelier_operations"."truth_receipt"->>'stateFileHash' ~ '^[0-9a-f]{64}$'
    and length(trim("studio_atelier_operations"."truth_receipt"->>'manifestRevision')) > 0
    and "studio_atelier_operations"."truth_receipt"->>'manifestHash' ~ '^[0-9a-f]{64}$'
    and "studio_atelier_operations"."truth_receipt"->>'garmentTruthRevision' ~ '^[a-zA-Z0-9._:/-]{1,240}$'
    and "studio_atelier_operations"."truth_receipt"->>'garmentTruthSourceHash' ~ '^[0-9a-f]{64}$'
  ),
	CONSTRAINT "studio_atelier_operations_canonical_object" CHECK (jsonb_typeof("studio_atelier_operations"."canonical_operation") = 'object'),
	CONSTRAINT "studio_atelier_operations_parent_array" CHECK (jsonb_typeof("studio_atelier_operations"."parent_assets") = 'array'),
	CONSTRAINT "studio_atelier_operations_authority_array" CHECK (jsonb_typeof("studio_atelier_operations"."authority_stack") = 'array'),
	CONSTRAINT "studio_atelier_operations_change_array" CHECK (jsonb_typeof("studio_atelier_operations"."change_set") = 'array'),
	CONSTRAINT "studio_atelier_operations_immutable_array" CHECK (jsonb_typeof("studio_atelier_operations"."immutable_set") = 'array'),
	CONSTRAINT "studio_atelier_operations_output_object" CHECK (jsonb_typeof("studio_atelier_operations"."output_contract") = 'object'),
	CONSTRAINT "studio_atelier_operations_failure_array" CHECK (jsonb_typeof("studio_atelier_operations"."failure_gates") = 'array'),
	CONSTRAINT "studio_atelier_operations_state_known" CHECK (
    "studio_atelier_operations"."state" in ('PLANNED', 'ACTIVE', 'COMPLETE', 'FAILED', 'QUARANTINED', 'INDETERMINATE')
  )
);
--> statement-breakpoint
ALTER TABLE "studio_atelier_artifacts" ADD CONSTRAINT "studio_atelier_artifacts_execution_id_studio_atelier_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."studio_atelier_executions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_atelier_events" ADD CONSTRAINT "studio_atelier_events_operation_id_studio_atelier_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."studio_atelier_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_atelier_events" ADD CONSTRAINT "studio_atelier_events_execution_id_studio_atelier_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."studio_atelier_executions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_atelier_events" ADD CONSTRAINT "studio_atelier_events_artifact_id_studio_atelier_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."studio_atelier_artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_atelier_executions" ADD CONSTRAINT "studio_atelier_executions_operation_id_studio_atelier_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."studio_atelier_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_atelier_operation_projections" ADD CONSTRAINT "studio_atelier_operation_projections_operation_id_studio_atelier_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."studio_atelier_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_atelier_operation_projections" ADD CONSTRAINT "studio_atelier_operation_projections_materialized_execution_id_studio_atelier_executions_id_fk" FOREIGN KEY ("materialized_execution_id") REFERENCES "public"."studio_atelier_executions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_atelier_operation_projections" ADD CONSTRAINT "studio_atelier_operation_projections_materialized_artifact_id_studio_atelier_artifacts_id_fk" FOREIGN KEY ("materialized_artifact_id") REFERENCES "public"."studio_atelier_artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_atelier_operation_projections" ADD CONSTRAINT "studio_atelier_operation_projections_locked_artifact_id_studio_atelier_artifacts_id_fk" FOREIGN KEY ("locked_artifact_id") REFERENCES "public"."studio_atelier_artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_atelier_operation_projections" ADD CONSTRAINT "studio_atelier_operation_projections_superseded_by_operation_id_studio_atelier_operations_id_fk" FOREIGN KEY ("superseded_by_operation_id") REFERENCES "public"."studio_atelier_operations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "studio_atelier_artifacts_execution_kind_ordinal_unique" ON "studio_atelier_artifacts" USING btree ("execution_id","kind","ordinal");--> statement-breakpoint
CREATE INDEX "studio_atelier_artifacts_execution_created_idx" ON "studio_atelier_artifacts" USING btree ("execution_id","created_at");--> statement-breakpoint
CREATE INDEX "studio_atelier_artifacts_sha_idx" ON "studio_atelier_artifacts" USING btree ("sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_atelier_events_operation_sequence_unique" ON "studio_atelier_events" USING btree ("operation_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_atelier_events_hash_unique" ON "studio_atelier_events" USING btree ("event_hash");--> statement-breakpoint
CREATE INDEX "studio_atelier_events_operation_created_idx" ON "studio_atelier_events" USING btree ("operation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_atelier_executions_operation_attempt_unique" ON "studio_atelier_executions" USING btree ("operation_id","attempt");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_atelier_executions_operation_hash_unique" ON "studio_atelier_executions" USING btree ("operation_id","execution_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_atelier_executions_active_operation_unique" ON "studio_atelier_executions" USING btree ("operation_id") WHERE "studio_atelier_executions"."state" in ('RUNNING', 'PERSISTING');--> statement-breakpoint
CREATE INDEX "studio_atelier_executions_operation_created_idx" ON "studio_atelier_executions" USING btree ("operation_id","created_at");--> statement-breakpoint
CREATE INDEX "studio_atelier_executions_recovery_idx" ON "studio_atelier_executions" USING btree ("state","lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_atelier_operation_projections_locked_asset_unique" ON "studio_atelier_operation_projections" USING btree ("locked_asset_id") WHERE "studio_atelier_operation_projections"."locked_asset_id" is not null and "studio_atelier_operation_projections"."state" = 'LOCKED';--> statement-breakpoint
CREATE INDEX "studio_atelier_operation_projections_state_idx" ON "studio_atelier_operation_projections" USING btree ("state","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_atelier_operations_operator_key_unique" ON "studio_atelier_operations" USING btree ("operator_subject","operation_key");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_atelier_operations_operator_semantic_unique" ON "studio_atelier_operations" USING btree ("operator_subject","semantic_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_atelier_operations_one_correction_per_root_unique" ON "studio_atelier_operations" USING btree ("operator_subject","root_semantic_hash") WHERE "studio_atelier_operations"."correction_of_semantic_hash" is not null;--> statement-breakpoint
CREATE INDEX "studio_atelier_operations_garment_view_idx" ON "studio_atelier_operations" USING btree ("operator_subject","garment_id","view","created_at");