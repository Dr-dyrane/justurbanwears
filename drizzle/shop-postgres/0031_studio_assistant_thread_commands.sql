CREATE TABLE "studio_assistant_thread_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"actor_subject" text NOT NULL,
	"action" varchar(24) NOT NULL,
	"expected_version" integer,
	"resulting_version" integer NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_assistant_thread_commands_action_known" CHECK ("studio_assistant_thread_commands"."action" in ('CREATE', 'RENAME', 'ARCHIVE', 'RESTORE')),
	CONSTRAINT "studio_assistant_thread_commands_idempotency_key" CHECK (
    length("studio_assistant_thread_commands"."idempotency_key") between 8 and 160
    and "studio_assistant_thread_commands"."idempotency_key" ~ '^[a-zA-Z0-9._:-]+$'
  ),
	CONSTRAINT "studio_assistant_thread_commands_fingerprint" CHECK ("studio_assistant_thread_commands"."request_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_assistant_thread_commands_versions" CHECK (
    "studio_assistant_thread_commands"."resulting_version" > 0
    and (
      ("studio_assistant_thread_commands"."action" = 'CREATE' and "studio_assistant_thread_commands"."expected_version" is null)
      or ("studio_assistant_thread_commands"."action" <> 'CREATE' and "studio_assistant_thread_commands"."expected_version" > 0)
    )
  )
);
--> statement-breakpoint
ALTER TABLE "studio_assistant_thread_commands" ADD CONSTRAINT "studio_assistant_thread_commands_workspace_id_studio_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."studio_workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_assistant_thread_commands" ADD CONSTRAINT "studio_assistant_thread_commands_thread_id_studio_assistant_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."studio_assistant_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "studio_assistant_thread_commands_workspace_idempotency_unique" ON "studio_assistant_thread_commands" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "studio_assistant_thread_commands_thread_idx" ON "studio_assistant_thread_commands" USING btree ("thread_id","occurred_at");
