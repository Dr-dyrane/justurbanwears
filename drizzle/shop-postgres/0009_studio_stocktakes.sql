CREATE TABLE "studio_physical_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stocktake_id" uuid,
	"operator_subject" text NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"piece_key" varchar(96) NOT NULL,
	"wardrobe_item_id" uuid,
	"sku" varchar(40),
	"command" varchar(32) DEFAULT 'CONFIRM_IN_HAND' NOT NULL,
	"expected_location_key" varchar(40) NOT NULL,
	"expected_location_label" text NOT NULL,
	"expected_custody" varchar(24) NOT NULL,
	"observed_location_key" varchar(40) NOT NULL,
	"observed_location_label" text NOT NULL,
	"observed_custody" varchar(24) DEFAULT 'STUDIO' NOT NULL,
	"result" varchar(24) NOT NULL,
	"order_reference" varchar(40),
	"note" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_physical_observations_identity" CHECK (
    "studio_physical_observations"."wardrobe_item_id" is not null or "studio_physical_observations"."sku" is not null
  ),
	CONSTRAINT "studio_physical_observations_piece_key_nonempty" CHECK (length(trim("studio_physical_observations"."piece_key")) > 0),
	CONSTRAINT "studio_physical_observations_command_known" CHECK ("studio_physical_observations"."command" = 'CONFIRM_IN_HAND'),
	CONSTRAINT "studio_physical_observations_expected_location_known" CHECK (
    "studio_physical_observations"."expected_location_key" in ('WARDROBE_RAIL', 'PACKING_SHELF', 'RETURN_INSPECTION', 'COURIER', 'CUSTOMER', 'RETIRED')
  ),
	CONSTRAINT "studio_physical_observations_observed_location_known" CHECK (
    "studio_physical_observations"."observed_location_key" in ('WARDROBE_RAIL', 'PACKING_SHELF', 'RETURN_INSPECTION')
  ),
	CONSTRAINT "studio_physical_observations_expected_custody_known" CHECK (
    "studio_physical_observations"."expected_custody" in ('STUDIO', 'COURIER', 'CUSTOMER', 'UNKNOWN')
  ),
	CONSTRAINT "studio_physical_observations_observed_custody_studio" CHECK ("studio_physical_observations"."observed_custody" = 'STUDIO'),
	CONSTRAINT "studio_physical_observations_result_known" CHECK ("studio_physical_observations"."result" in ('MATCH', 'MISMATCH')),
	CONSTRAINT "studio_physical_observations_note_length" CHECK (
    "studio_physical_observations"."note" is null or length("studio_physical_observations"."note") <= 240
  )
);
--> statement-breakpoint
CREATE TABLE "studio_stocktakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_subject" text NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"location_key" varchar(40) NOT NULL,
	"location_label" text NOT NULL,
	"state" varchar(24) DEFAULT 'OPEN' NOT NULL,
	"expected_pieces" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_stocktakes_location_known" CHECK (
    "studio_stocktakes"."location_key" in ('WARDROBE_RAIL', 'PACKING_SHELF', 'RETURN_INSPECTION')
  ),
	CONSTRAINT "studio_stocktakes_state_known" CHECK ("studio_stocktakes"."state" in ('OPEN', 'CLOSED')),
	CONSTRAINT "studio_stocktakes_expected_array" CHECK (jsonb_typeof("studio_stocktakes"."expected_pieces") = 'array'),
	CONSTRAINT "studio_stocktakes_expected_nonempty" CHECK (jsonb_array_length("studio_stocktakes"."expected_pieces") > 0),
	CONSTRAINT "studio_stocktakes_version_positive" CHECK ("studio_stocktakes"."version" > 0),
	CONSTRAINT "studio_stocktakes_close_pair" CHECK (
    ("studio_stocktakes"."state" = 'OPEN' and "studio_stocktakes"."closed_at" is null)
    or ("studio_stocktakes"."state" = 'CLOSED' and "studio_stocktakes"."closed_at" is not null)
  )
);
--> statement-breakpoint
ALTER TABLE "studio_physical_observations" ADD CONSTRAINT "studio_physical_observations_stocktake_id_studio_stocktakes_id_fk" FOREIGN KEY ("stocktake_id") REFERENCES "public"."studio_stocktakes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_physical_observations" ADD CONSTRAINT "studio_physical_observations_wardrobe_item_id_studio_wardrobe_items_id_fk" FOREIGN KEY ("wardrobe_item_id") REFERENCES "public"."studio_wardrobe_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_physical_observations" ADD CONSTRAINT "studio_physical_observations_sku_shop_catalogue_items_sku_fk" FOREIGN KEY ("sku") REFERENCES "public"."shop_catalogue_items"("sku") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "studio_physical_observations_operator_idempotency_unique" ON "studio_physical_observations" USING btree ("operator_subject","idempotency_key");--> statement-breakpoint
CREATE INDEX "studio_physical_observations_piece_time_idx" ON "studio_physical_observations" USING btree ("piece_key","occurred_at");--> statement-breakpoint
CREATE INDEX "studio_physical_observations_stocktake_time_idx" ON "studio_physical_observations" USING btree ("stocktake_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_stocktakes_operator_idempotency_unique" ON "studio_stocktakes" USING btree ("operator_subject","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_stocktakes_operator_open_unique" ON "studio_stocktakes" USING btree ("operator_subject") WHERE "studio_stocktakes"."state" = 'OPEN';--> statement-breakpoint
CREATE INDEX "studio_stocktakes_operator_started_idx" ON "studio_stocktakes" USING btree ("operator_subject","started_at");--> statement-breakpoint
CREATE FUNCTION "studio_physical_observations_append_only_v1"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
	RAISE EXCEPTION 'STUDIO_INVALID_TRANSITION: physical observations are append-only';
END
$$;--> statement-breakpoint
CREATE TRIGGER "studio_physical_observations_append_only"
BEFORE UPDATE OR DELETE ON "studio_physical_observations"
FOR EACH ROW EXECUTE FUNCTION "studio_physical_observations_append_only_v1"();
