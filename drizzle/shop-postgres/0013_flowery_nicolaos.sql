CREATE TABLE "studio_collection_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_subject" text NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"command" varchar(40) NOT NULL,
	"collection_id" uuid NOT NULL,
	"collection_key" varchar(80) NOT NULL,
	"before_state" jsonb NOT NULL,
	"after_state" jsonb NOT NULL,
	"consequence" text NOT NULL,
	"next_route" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_collection_commands_fingerprint" CHECK ("studio_collection_commands"."request_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_collection_commands_known" CHECK (
    "studio_collection_commands"."command" in ('CREATE_COLLECTION', 'RENAME_COLLECTION', 'ACTIVATE_COLLECTION', 'ARCHIVE_COLLECTION')
  ),
	CONSTRAINT "studio_collection_commands_before_object" CHECK (jsonb_typeof("studio_collection_commands"."before_state") = 'object'),
	CONSTRAINT "studio_collection_commands_after_object" CHECK (jsonb_typeof("studio_collection_commands"."after_state") = 'object')
);
--> statement-breakpoint
ALTER TABLE "studio_collection_commands" ADD CONSTRAINT "studio_collection_commands_collection_id_shop_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."shop_collections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "studio_collection_commands_operator_idempotency_unique" ON "studio_collection_commands" USING btree ("operator_subject","idempotency_key");--> statement-breakpoint
CREATE INDEX "studio_collection_commands_collection_created_idx" ON "studio_collection_commands" USING btree ("collection_id","created_at");