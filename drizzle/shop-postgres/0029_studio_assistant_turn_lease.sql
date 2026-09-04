CREATE SEQUENCE "public"."studio_assistant_message_sequence" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
DROP INDEX "studio_assistant_messages_thread_created_idx";--> statement-breakpoint
ALTER TABLE "studio_assistant_messages" ADD COLUMN "sequence" integer;--> statement-breakpoint
WITH ordered_messages AS (
	SELECT
		message.thread_id,
		message.id,
		row_number() OVER (
			ORDER BY message.created_at, message.thread_id, message.id
		)::integer AS sequence
	FROM "studio_assistant_messages" AS message
)
UPDATE "studio_assistant_messages" AS message
SET "sequence" = ordered_messages.sequence
FROM ordered_messages
WHERE message.thread_id = ordered_messages.thread_id
	AND message.id = ordered_messages.id;--> statement-breakpoint
SELECT setval(
	'public.studio_assistant_message_sequence',
	greatest(coalesce((SELECT max("sequence") FROM "studio_assistant_messages"), 0), 1),
	coalesce((SELECT max("sequence") FROM "studio_assistant_messages"), 0) > 0
);--> statement-breakpoint
ALTER TABLE "studio_assistant_messages" ALTER COLUMN "sequence" SET DEFAULT nextval('studio_assistant_message_sequence');--> statement-breakpoint
ALTER TABLE "studio_assistant_messages" ALTER COLUMN "sequence" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_assistant_threads" ADD COLUMN "active_turn_message_id" varchar(160);--> statement-breakpoint
ALTER TABLE "studio_assistant_threads" ADD COLUMN "active_turn_response_id" varchar(160);--> statement-breakpoint
ALTER TABLE "studio_assistant_threads" ADD COLUMN "active_turn_lease_expires_at" timestamp with time zone;--> statement-breakpoint
WITH latest_pending AS (
	SELECT
		response.thread_id,
		response.id AS response_id,
		response.updated_at,
		(
			SELECT request.id
			FROM "studio_assistant_messages" AS request
			WHERE request.thread_id = response.thread_id
				AND request.role = 'user'
				AND request.sequence < response.sequence
			ORDER BY request.sequence DESC
			LIMIT 1
		) AS message_id,
		row_number() OVER (
			PARTITION BY response.thread_id
			ORDER BY response.sequence DESC
		) AS pending_ordinal
	FROM "studio_assistant_messages" AS response
	WHERE response.role = 'assistant'
		AND response.status = 'PENDING'
)
UPDATE "studio_assistant_threads" AS thread
SET
	"active_turn_message_id" = latest_pending.message_id,
	"active_turn_response_id" = latest_pending.response_id,
	"active_turn_lease_expires_at" = latest_pending.updated_at + interval '60 seconds'
FROM latest_pending
WHERE thread.id = latest_pending.thread_id
	AND latest_pending.pending_ordinal = 1
	AND latest_pending.message_id IS NOT NULL;--> statement-breakpoint
UPDATE "studio_assistant_messages" AS response
SET
	"status" = 'ERROR',
	"updated_at" = clock_timestamp()
WHERE response.role = 'assistant'
	AND response.status = 'PENDING'
	AND NOT EXISTS (
		SELECT 1
		FROM "studio_assistant_threads" AS thread
		WHERE thread.id = response.thread_id
			AND thread.active_turn_response_id = response.id
	);--> statement-breakpoint
CREATE UNIQUE INDEX "studio_assistant_messages_thread_sequence_unique" ON "studio_assistant_messages" USING btree ("thread_id","sequence");--> statement-breakpoint
ALTER TABLE "studio_assistant_messages" ADD CONSTRAINT "studio_assistant_messages_sequence_positive" CHECK ("studio_assistant_messages"."sequence" > 0);--> statement-breakpoint
ALTER TABLE "studio_assistant_threads" ADD CONSTRAINT "studio_assistant_threads_active_turn_lease" CHECK (
    (
      "studio_assistant_threads"."active_turn_message_id" is null
      and "studio_assistant_threads"."active_turn_response_id" is null
      and "studio_assistant_threads"."active_turn_lease_expires_at" is null
    )
    or (
      "studio_assistant_threads"."active_turn_message_id" is not null
      and "studio_assistant_threads"."active_turn_response_id" is not null
      and "studio_assistant_threads"."active_turn_lease_expires_at" is not null
    )
  );
