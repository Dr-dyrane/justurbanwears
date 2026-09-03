CREATE TABLE "studio_model_command_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_subject" text NOT NULL,
	"actor_subject" text NOT NULL,
	"model_id" uuid NOT NULL,
	"action" varchar(24) NOT NULL,
	"expected_revision" text NOT NULL,
	"resulting_revision" text NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"summary" text NOT NULL,
	"consequence" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_model_command_receipts_action_known" CHECK ("studio_model_command_receipts"."action" in ('UPDATE', 'ARCHIVE')),
	CONSTRAINT "studio_model_command_receipts_fingerprint" CHECK ("studio_model_command_receipts"."request_fingerprint" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "studio_model_command_receipts" ADD CONSTRAINT "studio_model_command_receipts_model_id_studio_model_profiles_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."studio_model_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "studio_model_command_receipts_actor_idempotency_unique" ON "studio_model_command_receipts" USING btree ("actor_subject","idempotency_key");--> statement-breakpoint
CREATE INDEX "studio_model_command_receipts_model_idx" ON "studio_model_command_receipts" USING btree ("workspace_subject","model_id","occurred_at");