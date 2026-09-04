ALTER TABLE "studio_assistant_threads" ADD COLUMN "history_summary" text;--> statement-breakpoint
ALTER TABLE "studio_assistant_threads" ADD COLUMN "history_summary_through_sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_assistant_threads" ADD COLUMN "history_summary_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studio_assistant_threads" ADD CONSTRAINT "studio_assistant_threads_history_summary_pair" CHECK (
    (
      "studio_assistant_threads"."history_summary" is null
      and "studio_assistant_threads"."history_summary_through_sequence" = 0
      and "studio_assistant_threads"."history_summary_updated_at" is null
    )
    or (
      length(trim("studio_assistant_threads"."history_summary")) > 0
      and "studio_assistant_threads"."history_summary_through_sequence" > 0
      and "studio_assistant_threads"."history_summary_updated_at" is not null
    )
  );