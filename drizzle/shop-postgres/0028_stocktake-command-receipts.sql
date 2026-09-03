CREATE TABLE "studio_stocktake_command_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_subject" text NOT NULL,
	"actor_subject" text NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"command" varchar(24) NOT NULL,
	"stocktake_id" uuid NOT NULL,
	"expected_version" integer,
	"resulting_version" integer NOT NULL,
	"location_key" varchar(40) NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_stocktake_command_receipts_fingerprint" CHECK ("studio_stocktake_command_receipts"."request_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_stocktake_command_receipts_command_known" CHECK ("studio_stocktake_command_receipts"."command" in ('START_COUNT', 'CLOSE_COUNT')),
	CONSTRAINT "studio_stocktake_command_receipts_location_known" CHECK (
    "studio_stocktake_command_receipts"."location_key" in ('WARDROBE_RAIL', 'PACKING_SHELF', 'RETURN_INSPECTION')
  ),
	CONSTRAINT "studio_stocktake_command_receipts_versions" CHECK (
    (
      "studio_stocktake_command_receipts"."command" = 'START_COUNT'
      and "studio_stocktake_command_receipts"."expected_version" is null
      and "studio_stocktake_command_receipts"."resulting_version" = 1
    )
    or (
      "studio_stocktake_command_receipts"."command" = 'CLOSE_COUNT'
      and "studio_stocktake_command_receipts"."expected_version" is not null
      and "studio_stocktake_command_receipts"."expected_version" > 0
      and "studio_stocktake_command_receipts"."resulting_version" = "studio_stocktake_command_receipts"."expected_version" + 1
    )
  )
);
--> statement-breakpoint
ALTER TABLE "studio_stocktake_command_receipts" ADD CONSTRAINT "studio_stocktake_command_receipts_stocktake_id_studio_stocktakes_id_fk" FOREIGN KEY ("stocktake_id") REFERENCES "public"."studio_stocktakes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "studio_stocktake_command_receipts_actor_idempotency_unique" ON "studio_stocktake_command_receipts" USING btree ("actor_subject","idempotency_key");--> statement-breakpoint
CREATE INDEX "studio_stocktake_command_receipts_stocktake_idx" ON "studio_stocktake_command_receipts" USING btree ("stocktake_id","occurred_at");