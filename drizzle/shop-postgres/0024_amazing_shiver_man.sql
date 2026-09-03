CREATE TYPE "public"."studio_assistant_message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."studio_assistant_message_state" AS ENUM('PENDING', 'COMPLETE', 'ERROR', 'ABORTED');--> statement-breakpoint
CREATE TYPE "public"."studio_assistant_thread_state" AS ENUM('OPEN', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "studio_assistant_messages" (
	"thread_id" uuid NOT NULL,
	"id" varchar(160) NOT NULL,
	"role" "studio_assistant_message_role" NOT NULL,
	"parts" jsonb NOT NULL,
	"status" "studio_assistant_message_state" DEFAULT 'COMPLETE' NOT NULL,
	"author_subject" text,
	"author_email" text,
	"author_display_name" text NOT NULL,
	"model" varchar(160),
	"token_usage" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_assistant_messages_thread_id_pk" PRIMARY KEY("thread_id","id"),
	CONSTRAINT "studio_assistant_messages_parts_array" CHECK (jsonb_typeof("studio_assistant_messages"."parts") = 'array'),
	CONSTRAINT "studio_assistant_messages_author_present" CHECK (length(trim("studio_assistant_messages"."author_display_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "studio_assistant_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" varchar(120) DEFAULT 'New conversation' NOT NULL,
	"state" "studio_assistant_thread_state" DEFAULT 'OPEN' NOT NULL,
	"focus" jsonb,
	"pending_work" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_subject" text NOT NULL,
	"created_by_email" text NOT NULL,
	"created_by_display_name" text NOT NULL,
	"updated_by_subject" text NOT NULL,
	"updated_by_email" text NOT NULL,
	"updated_by_display_name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_assistant_threads_title_present" CHECK (length(trim("studio_assistant_threads"."title")) > 0),
	CONSTRAINT "studio_assistant_threads_version_positive" CHECK ("studio_assistant_threads"."version" > 0),
	CONSTRAINT "studio_assistant_threads_focus_object" CHECK ("studio_assistant_threads"."focus" is null or jsonb_typeof("studio_assistant_threads"."focus") = 'object'),
	CONSTRAINT "studio_assistant_threads_pending_work_array" CHECK (jsonb_typeof("studio_assistant_threads"."pending_work") = 'array'),
	CONSTRAINT "studio_assistant_threads_archive_pair" CHECK (
    ("studio_assistant_threads"."state" = 'OPEN' and "studio_assistant_threads"."archived_at" is null)
    or ("studio_assistant_threads"."state" = 'ARCHIVED' and "studio_assistant_threads"."archived_at" is not null)
  )
);
--> statement-breakpoint
ALTER TABLE "studio_assistant_messages" ADD CONSTRAINT "studio_assistant_messages_thread_id_studio_assistant_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."studio_assistant_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_assistant_threads" ADD CONSTRAINT "studio_assistant_threads_workspace_id_studio_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."studio_workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_assistant_messages_thread_created_idx" ON "studio_assistant_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "studio_assistant_threads_workspace_state_updated_idx" ON "studio_assistant_threads" USING btree ("workspace_id","state","updated_at");
