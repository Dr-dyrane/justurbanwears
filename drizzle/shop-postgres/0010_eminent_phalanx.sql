CREATE TYPE "public"."shop_order_source" AS ENUM('ONLINE', 'PHONE', 'DM', 'IN_PERSON');--> statement-breakpoint
CREATE TABLE "shop_order_recoveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"status" "shop_refund_status" DEFAULT 'PENDING' NOT NULL,
	"reason" text NOT NULL,
	"refund_cap_amount" integer NOT NULL,
	"refund_currency" varchar(3) NOT NULL,
	"refund_reference" text,
	"refund_amount" integer,
	"requested_by" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failed_at" timestamp with time zone,
	"failure_note" text,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_order_recoveries_request_fingerprint_sha256" CHECK (
    "shop_order_recoveries"."request_fingerprint" ~ '^[0-9a-f]{64}$'
  ),
	CONSTRAINT "shop_order_recoveries_reason_length" CHECK (length(trim("shop_order_recoveries"."reason")) between 4 and 500),
	CONSTRAINT "shop_order_recoveries_status_started" CHECK ("shop_order_recoveries"."status" <> 'NOT_STARTED'),
	CONSTRAINT "shop_order_recoveries_refund_cap" CHECK (
    "shop_order_recoveries"."refund_cap_amount" > 0 and "shop_order_recoveries"."refund_currency" = 'NGN'
  ),
	CONSTRAINT "shop_order_recoveries_state_facts" CHECK (
    ("shop_order_recoveries"."status" = 'PENDING'
      and "shop_order_recoveries"."refund_reference" is null
      and "shop_order_recoveries"."refund_amount" is null
      and "shop_order_recoveries"."failed_at" is null
      and "shop_order_recoveries"."completed_at" is null)
    or ("shop_order_recoveries"."status" = 'FAILED'
      and "shop_order_recoveries"."refund_reference" is null
      and "shop_order_recoveries"."refund_amount" is null
      and "shop_order_recoveries"."failed_at" is not null
      and "shop_order_recoveries"."completed_at" is null
      and length(trim("shop_order_recoveries"."failure_note")) > 0)
    or ("shop_order_recoveries"."status" = 'COMPLETED'
      and "shop_order_recoveries"."refund_reference" is not null
      and "shop_order_recoveries"."refund_amount" = "shop_order_recoveries"."refund_cap_amount"
      and "shop_order_recoveries"."failed_at" is null
      and "shop_order_recoveries"."completed_at" is not null)
  )
);
--> statement-breakpoint
CREATE TABLE "shop_order_return_items" (
	"return_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"refund_cap_amount" integer NOT NULL,
	"disposition" "shop_return_disposition",
	"resolved_at" timestamp with time zone,
	CONSTRAINT "shop_order_return_items_return_id_order_item_id_pk" PRIMARY KEY("return_id","order_item_id"),
	CONSTRAINT "shop_order_return_items_refund_cap_nonnegative" CHECK ("shop_order_return_items"."refund_cap_amount" >= 0),
	CONSTRAINT "shop_order_return_items_resolution_pair" CHECK (
    ("shop_order_return_items"."disposition" is null and "shop_order_return_items"."resolved_at" is null)
    or ("shop_order_return_items"."disposition" is not null and "shop_order_return_items"."resolved_at" is not null)
  )
);
--> statement-breakpoint
CREATE TABLE "studio_garment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wardrobe_item_id" uuid NOT NULL,
	"operator_subject" text NOT NULL,
	"event_type" varchar(48) NOT NULL,
	"summary" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_garment_events_type_known" CHECK ("studio_garment_events"."event_type" in (
    'COMMITTED', 'FACTS_UPDATED', 'REVISION_STARTED', 'REVISION_DISCARDED',
    'REVISION_PUBLISHED', 'PUBLISHED', 'UNPUBLISHED', 'REPUBLISHED',
    'ARCHIVED', 'MEDIA_REPLACED'
  )),
	CONSTRAINT "studio_garment_events_summary_nonempty" CHECK (length(trim("studio_garment_events"."summary")) > 0),
	CONSTRAINT "studio_garment_events_details_object" CHECK (jsonb_typeof("studio_garment_events"."details") = 'object')
);
--> statement-breakpoint
CREATE TABLE "studio_garment_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wardrobe_item_id" uuid NOT NULL,
	"operator_subject" text NOT NULL,
	"revision_number" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"state" varchar(24) NOT NULL,
	"base_source_revision" varchar(64) NOT NULL,
	"facts" jsonb NOT NULL,
	"media" jsonb NOT NULL,
	"idempotency_key" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "studio_garment_revisions_revision_positive" CHECK ("studio_garment_revisions"."revision_number" > 0 and "studio_garment_revisions"."version" > 0),
	CONSTRAINT "studio_garment_revisions_state_known" CHECK ("studio_garment_revisions"."state" in ('DRAFT', 'PUBLISHED', 'SUPERSEDED', 'DISCARDED')),
	CONSTRAINT "studio_garment_revisions_base_sha256" CHECK ("studio_garment_revisions"."base_source_revision" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "studio_garment_revisions_facts_object" CHECK (jsonb_typeof("studio_garment_revisions"."facts") = 'object'),
	CONSTRAINT "studio_garment_revisions_media_array" CHECK (jsonb_typeof("studio_garment_revisions"."media") = 'array'),
	CONSTRAINT "studio_garment_revisions_publish_pair" CHECK (
    ("studio_garment_revisions"."state" = 'PUBLISHED' and "studio_garment_revisions"."published_at" is not null)
    or ("studio_garment_revisions"."state" <> 'PUBLISHED')
  )
);
--> statement-breakpoint
CREATE TABLE "studio_manual_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_subject" text NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"sku" varchar(40) NOT NULL,
	"customer_name" text NOT NULL,
	"contact" text NOT NULL,
	"reason" text NOT NULL,
	"status" varchar(24) DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "studio_manual_holds_status_known" CHECK ("studio_manual_holds"."status" in ('ACTIVE', 'RELEASED', 'EXPIRED')),
	CONSTRAINT "studio_manual_holds_release_pair" CHECK (
    ("studio_manual_holds"."status" = 'ACTIVE' and "studio_manual_holds"."released_at" is null)
    or ("studio_manual_holds"."status" <> 'ACTIVE' and "studio_manual_holds"."released_at" is not null)
  ),
	CONSTRAINT "studio_manual_holds_expiry_after_create" CHECK ("studio_manual_holds"."expires_at" > "studio_manual_holds"."created_at")
);
--> statement-breakpoint
CREATE TABLE "studio_notification_receipts" (
	"operator_subject" text NOT NULL,
	"notification_id" varchar(240) NOT NULL,
	"dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_notification_receipts_operator_subject_notification_id_pk" PRIMARY KEY("operator_subject","notification_id")
);
--> statement-breakpoint
CREATE TABLE "studio_piece_custody" (
	"operator_subject" text NOT NULL,
	"piece_key" varchar(96) NOT NULL,
	"location_key" varchar(40) NOT NULL,
	"location_label" text NOT NULL,
	"custody" varchar(24) NOT NULL,
	"availability" varchar(24) NOT NULL,
	"order_reference" varchar(40),
	"last_command_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_piece_custody_operator_subject_piece_key_pk" PRIMARY KEY("operator_subject","piece_key"),
	CONSTRAINT "studio_piece_custody_custody_known" CHECK ("studio_piece_custody"."custody" = 'STUDIO'),
	CONSTRAINT "studio_piece_custody_availability_known" CHECK (
    "studio_piece_custody"."availability" in ('PRIVATE', 'AVAILABLE', 'RESERVED', 'SOLD', 'ARCHIVED')
  ),
	CONSTRAINT "studio_piece_custody_location_known" CHECK (
    "studio_piece_custody"."location_key" in ('WARDROBE_RAIL', 'PACKING_SHELF', 'RETURN_INSPECTION')
  ),
	CONSTRAINT "studio_piece_custody_version_positive" CHECK ("studio_piece_custody"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "studio_piece_custody_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_subject" text NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"piece_key" varchar(96) NOT NULL,
	"command" varchar(24) NOT NULL,
	"from_location_key" varchar(40) NOT NULL,
	"from_location_label" text NOT NULL,
	"to_location_key" varchar(40) NOT NULL,
	"to_location_label" text NOT NULL,
	"custody" varchar(24) NOT NULL,
	"availability" varchar(24) NOT NULL,
	"order_reference" varchar(40),
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_piece_custody_command_known" CHECK ("studio_piece_custody_commands"."command" = 'MOVE'),
	CONSTRAINT "studio_piece_custody_command_custody_known" CHECK ("studio_piece_custody_commands"."custody" = 'STUDIO'),
	CONSTRAINT "studio_piece_custody_command_availability_known" CHECK (
    "studio_piece_custody_commands"."availability" in ('PRIVATE', 'AVAILABLE', 'RESERVED', 'SOLD', 'ARCHIVED')
  ),
	CONSTRAINT "studio_piece_custody_command_location_known" CHECK (
    "studio_piece_custody_commands"."to_location_key" in ('WARDROBE_RAIL', 'PACKING_SHELF', 'RETURN_INSPECTION')
  )
);
--> statement-breakpoint
ALTER TABLE "shop_order_returns" DROP CONSTRAINT "shop_order_returns_resolution";--> statement-breakpoint
ALTER TABLE "studio_catalogue_publications" DROP CONSTRAINT "studio_catalogue_publications_state_known";--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM shop_customers
    WHERE email IS NOT NULL
    GROUP BY lower(email)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'SHOP_CUSTOMER_EMAIL_COLLISION: case-insensitive customer emails must be reconciled before migration';
  END IF;
END
$$;--> statement-breakpoint
DROP INDEX "shop_customers_email_unique";--> statement-breakpoint
ALTER TABLE "shop_order_returns" ADD COLUMN "correction_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_order_returns" ADD COLUMN "merchandise_refund_cap_amount" integer;--> statement-breakpoint
ALTER TABLE "shop_order_returns" ADD COLUMN "delivery_refund_cap_amount" integer;--> statement-breakpoint
ALTER TABLE "shop_order_returns" ADD COLUMN "delivery_refund_allowance" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_order_returns" ADD COLUMN "refund_cap_currency" varchar(3);--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "source" "shop_order_source" DEFAULT 'ONLINE' NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "created_by_actor_subject" text;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "funds_paid_amount" integer;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "funds_paid_currency" varchar(3);--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "funds_amount_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "funds_refunded_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_order_recoveries" ADD CONSTRAINT "shop_order_recoveries_order_id_shop_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."shop_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_return_items" ADD CONSTRAINT "shop_order_return_items_return_id_shop_order_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."shop_order_returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_return_items" ADD CONSTRAINT "shop_order_return_items_order_item_id_shop_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."shop_order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_garment_events" ADD CONSTRAINT "studio_garment_events_wardrobe_item_id_studio_wardrobe_items_id_fk" FOREIGN KEY ("wardrobe_item_id") REFERENCES "public"."studio_wardrobe_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_garment_revisions" ADD CONSTRAINT "studio_garment_revisions_wardrobe_item_id_studio_wardrobe_items_id_fk" FOREIGN KEY ("wardrobe_item_id") REFERENCES "public"."studio_wardrobe_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_manual_holds" ADD CONSTRAINT "studio_manual_holds_sku_shop_catalogue_items_sku_fk" FOREIGN KEY ("sku") REFERENCES "public"."shop_catalogue_items"("sku") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "studio_piece_custody" ADD CONSTRAINT "studio_piece_custody_last_command_id_studio_piece_custody_commands_id_fk" FOREIGN KEY ("last_command_id") REFERENCES "public"."studio_piece_custody_commands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shop_order_recoveries_order_unique" ON "shop_order_recoveries" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_order_recoveries_order_idempotency_unique" ON "shop_order_recoveries" USING btree ("order_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "shop_order_recoveries_status_updated_idx" ON "shop_order_recoveries" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_order_return_items_return_sku_unique" ON "shop_order_return_items" USING btree ("return_id","sku");--> statement-breakpoint
CREATE INDEX "shop_order_return_items_order_item_idx" ON "shop_order_return_items" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "studio_garment_events_piece_time_idx" ON "studio_garment_events" USING btree ("wardrobe_item_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_garment_revisions_number_unique" ON "studio_garment_revisions" USING btree ("wardrobe_item_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_garment_revisions_one_draft_unique" ON "studio_garment_revisions" USING btree ("wardrobe_item_id") WHERE "studio_garment_revisions"."state" = 'DRAFT';--> statement-breakpoint
CREATE UNIQUE INDEX "studio_garment_revisions_one_published_unique" ON "studio_garment_revisions" USING btree ("wardrobe_item_id") WHERE "studio_garment_revisions"."state" = 'PUBLISHED';--> statement-breakpoint
CREATE UNIQUE INDEX "studio_garment_revisions_operator_idempotency_unique" ON "studio_garment_revisions" USING btree ("operator_subject","idempotency_key") WHERE "studio_garment_revisions"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "studio_garment_revisions_operator_updated_idx" ON "studio_garment_revisions" USING btree ("operator_subject","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_manual_holds_operator_idempotency_unique" ON "studio_manual_holds" USING btree ("operator_subject","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_manual_holds_active_sku_unique" ON "studio_manual_holds" USING btree ("sku") WHERE "studio_manual_holds"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "studio_manual_holds_operator_created_idx" ON "studio_manual_holds" USING btree ("operator_subject","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_piece_custody_command_operator_idempotency_unique" ON "studio_piece_custody_commands" USING btree ("operator_subject","idempotency_key");--> statement-breakpoint
CREATE INDEX "studio_piece_custody_commands_piece_idx" ON "studio_piece_custody_commands" USING btree ("operator_subject","piece_key","created_at");--> statement-breakpoint
CREATE INDEX "shop_orders_lifecycle_saved_idx" ON "shop_orders" USING btree ("lifecycle_status","saved_at");--> statement-breakpoint
CREATE INDEX "shop_orders_fulfillment_saved_idx" ON "shop_orders" USING btree ("fulfillment_status","saved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_customers_email_unique" ON "shop_customers" USING btree (lower("email")) WHERE "shop_customers"."email" is not null;--> statement-breakpoint
ALTER TABLE "shop_order_returns" ADD CONSTRAINT "shop_order_returns_correction_once" CHECK ("shop_order_returns"."correction_count" between 0 and 1);--> statement-breakpoint
ALTER TABLE "shop_order_returns" ADD CONSTRAINT "shop_order_returns_refund_caps" CHECK (
    ("shop_order_returns"."merchandise_refund_cap_amount" is null or "shop_order_returns"."merchandise_refund_cap_amount" >= 0)
    and ("shop_order_returns"."delivery_refund_cap_amount" is null or "shop_order_returns"."delivery_refund_cap_amount" >= 0)
    and "shop_order_returns"."delivery_refund_allowance" >= 0
    and ("shop_order_returns"."delivery_refund_cap_amount" is null or "shop_order_returns"."delivery_refund_allowance" <= "shop_order_returns"."delivery_refund_cap_amount")
    and ("shop_order_returns"."refund_cap_currency" is null or "shop_order_returns"."refund_cap_currency" = 'NGN')
  );--> statement-breakpoint
ALTER TABLE "shop_order_returns" ADD CONSTRAINT "shop_order_returns_resolution" CHECK (
    ("shop_order_returns"."status" = 'RESOLVED'
      and "shop_order_returns"."resolved_at" is not null
      and "shop_order_returns"."refund_status" = 'COMPLETED')
    or ("shop_order_returns"."status" <> 'RESOLVED'
      and "shop_order_returns"."resolved_at" is null
      and "shop_order_returns"."disposition" is null)
  );--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_source_actor" CHECK (
    ("shop_orders"."source" = 'ONLINE' and "shop_orders"."created_by_actor_subject" is null)
    or ("shop_orders"."source" <> 'ONLINE' and length(trim("shop_orders"."created_by_actor_subject")) > 0)
  );--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_paid_amount_truth" CHECK (
    ("shop_orders"."funds_paid_amount" is null
      and "shop_orders"."funds_paid_currency" is null
      and "shop_orders"."funds_amount_updated_at" is null)
    or ("shop_orders"."funds_paid_amount" > 0
      and "shop_orders"."funds_paid_currency" = "shop_orders"."currency"
      and "shop_orders"."funds_amount_updated_at" is not null)
  );--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_refund_cap" CHECK (
    "shop_orders"."funds_refunded_amount" >= 0
    and ("shop_orders"."funds_paid_amount" is null or "shop_orders"."funds_refunded_amount" <= "shop_orders"."funds_paid_amount")
  );--> statement-breakpoint
ALTER TABLE "studio_catalogue_publications" ADD CONSTRAINT "studio_catalogue_publications_state_known" CHECK ("studio_catalogue_publications"."state" in ('PUBLISHED', 'UNPUBLISHED', 'ARCHIVED'));
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM shop_order_returns returns
    WHERE NOT EXISTS (
      SELECT 1 FROM shop_order_items items WHERE items.order_id = returns.order_id
    )
  ) THEN
    RAISE EXCEPTION 'SHOP_RETURN_WITHOUT_ITEMS: every legacy return must reference at least one order item';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM shop_order_returns returns
    INNER JOIN shop_orders orders ON orders.id = returns.order_id
    WHERE returns.refund_status = 'COMPLETED'
      AND returns.refund_amount > orders.total
  ) THEN
    RAISE EXCEPTION 'SHOP_REFUND_ABOVE_ORDER_TOTAL: legacy return refund exceeds the authoritative order total';
  END IF;

  IF EXISTS (
    SELECT events.order_id
    FROM shop_order_events events
    WHERE events.event_type = 'RETURN_CORRECTED'
    GROUP BY events.order_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'SHOP_RETURN_CORRECTION_LIMIT: legacy history contains more than one return correction';
  END IF;
END
$$;
--> statement-breakpoint
WITH latest_paid_event AS (
  SELECT DISTINCT ON (events.order_id)
    events.order_id,
    (events.metadata ->> 'paidAmount')::integer AS paid_amount,
    events.metadata ->> 'paidCurrency' AS paid_currency,
    events.occurred_at
  FROM shop_order_events events
  WHERE events.event_type IN ('FUNDS_CONFIRMATION_CONFIRMED', 'FUNDS_CONFIRMATION_CORRECTED')
    AND events.visibility = 'CUSTOMER'
    AND events.metadata ->> 'paidAmount' ~ '^[1-9][0-9]*$'
    AND (events.metadata ->> 'paidAmount')::numeric <= 2147483647
    AND events.metadata ->> 'paidCurrency' = 'NGN'
  ORDER BY events.order_id, events.occurred_at DESC, events.id DESC
)
UPDATE shop_orders orders
SET funds_paid_amount = paid.paid_amount,
    funds_paid_currency = paid.paid_currency,
    funds_amount_updated_at = paid.occurred_at
FROM latest_paid_event paid
WHERE orders.id = paid.order_id
  AND orders.funds_confirmation_status = 'CONFIRMED'
  AND paid.paid_currency = orders.currency;
--> statement-breakpoint
WITH completed_refunds AS (
  SELECT returns.order_id, sum(returns.refund_amount)::integer AS refunded_amount
  FROM shop_order_returns returns
  WHERE returns.refund_status = 'COMPLETED'
  GROUP BY returns.order_id
)
UPDATE shop_orders orders
SET funds_refunded_amount = completed.refunded_amount
FROM completed_refunds completed
WHERE orders.id = completed.order_id;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM shop_orders
    WHERE funds_paid_amount IS NOT NULL
      AND funds_refunded_amount > funds_paid_amount
  ) THEN
    RAISE EXCEPTION 'SHOP_REFUND_ABOVE_PAID_FUNDS: recorded refunds exceed trustworthy paid funds';
  END IF;
END
$$;
--> statement-breakpoint
INSERT INTO shop_order_return_items (
  return_id,
  order_item_id,
  sku,
  refund_cap_amount,
  disposition,
  resolved_at
)
SELECT
  returns.id,
  items.id,
  items.sku,
  items.line_total,
  CASE WHEN returns.status = 'RESOLVED' THEN returns.disposition ELSE NULL END,
  CASE WHEN returns.status = 'RESOLVED' THEN returns.resolved_at ELSE NULL END
FROM shop_order_returns returns
INNER JOIN shop_order_items items ON items.order_id = returns.order_id
ON CONFLICT (return_id, order_item_id) DO NOTHING;
--> statement-breakpoint
WITH return_caps AS (
  SELECT
    returns.id AS return_id,
    returns.order_id,
    sum(items.line_total)::integer AS merchandise_cap,
    orders.delivery_fee AS delivery_cap,
    orders.currency,
    CASE
      WHEN returns.refund_status = 'COMPLETED'
        THEN greatest(0, least(orders.delivery_fee, returns.refund_amount - sum(items.line_total)::integer))
      ELSE 0
    END AS delivery_allowance
  FROM shop_order_returns returns
  INNER JOIN shop_orders orders ON orders.id = returns.order_id
  INNER JOIN shop_order_items items ON items.order_id = orders.id
  GROUP BY returns.id, returns.refund_status, returns.refund_amount, orders.delivery_fee, orders.currency
), correction_counts AS (
  SELECT events.order_id, count(*)::integer AS correction_count
  FROM shop_order_events events
  WHERE events.event_type = 'RETURN_CORRECTED'
  GROUP BY events.order_id
)
UPDATE shop_order_returns returns
SET merchandise_refund_cap_amount = caps.merchandise_cap,
    delivery_refund_cap_amount = caps.delivery_cap,
    delivery_refund_allowance = caps.delivery_allowance,
    refund_cap_currency = caps.currency,
    correction_count = coalesce(corrections.correction_count, 0)
FROM return_caps caps
LEFT JOIN correction_counts corrections ON corrections.order_id = caps.order_id
WHERE returns.id = caps.return_id;
--> statement-breakpoint
INSERT INTO studio_garment_revisions (
  wardrobe_item_id,
  operator_subject,
  revision_number,
  version,
  state,
  base_source_revision,
  facts,
  media,
  idempotency_key,
  created_at,
  updated_at,
  published_at
)
SELECT
  publications.wardrobe_item_id,
  publications.operator_subject,
  1,
  1,
  'PUBLISHED',
  publications.source_revision,
  publications.facts,
  publications.media,
  publications.idempotency_key,
  publications.created_at,
  publications.published_at,
  publications.published_at
FROM studio_catalogue_publications publications
WHERE NOT EXISTS (
  SELECT 1
  FROM studio_garment_revisions revisions
  WHERE revisions.wardrobe_item_id = publications.wardrobe_item_id
);
--> statement-breakpoint
INSERT INTO studio_garment_events (
  wardrobe_item_id,
  operator_subject,
  event_type,
  summary,
  details,
  occurred_at
)
SELECT
  publications.wardrobe_item_id,
  publications.operator_subject,
  'COMMITTED',
  'Garment committed to Wardrobe',
  jsonb_build_object('revisionNumber', 1, 'sku', publications.sku),
  publications.created_at
FROM studio_catalogue_publications publications
WHERE NOT EXISTS (
  SELECT 1
  FROM studio_garment_events events
  WHERE events.wardrobe_item_id = publications.wardrobe_item_id
    AND events.event_type = 'COMMITTED'
);
--> statement-breakpoint
INSERT INTO studio_garment_events (
  wardrobe_item_id,
  operator_subject,
  event_type,
  summary,
  details,
  occurred_at
)
SELECT
  publications.wardrobe_item_id,
  publications.operator_subject,
  'PUBLISHED',
  'Garment published to Shop',
  jsonb_build_object('revisionNumber', 1, 'sku', publications.sku, 'slug', publications.slug),
  publications.published_at
FROM studio_catalogue_publications publications
WHERE NOT EXISTS (
  SELECT 1
  FROM studio_garment_events events
  WHERE events.wardrobe_item_id = publications.wardrobe_item_id
    AND events.event_type = 'PUBLISHED'
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION shop_allowed_transitions_v3(
  p_order_id uuid,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  order_record record;
  recovery_record record;
  transitions jsonb := '[]'::jsonb;
BEGIN
  SELECT orders.* INTO order_record FROM shop_orders AS orders WHERE orders.id = p_order_id;
  IF NOT FOUND THEN RETURN transitions; END IF;

  IF order_record.funds_confirmation_status = 'CONFIRMED' THEN
    transitions := transitions || jsonb_build_array(
      jsonb_build_object('dimension', 'FUNDS_CONFIRMATION', 'target', 'CORRECTED')
    );
  END IF;
  IF order_record.lifecycle_status <> 'ACTIVE' THEN RETURN transitions; END IF;

  SELECT recoveries.* INTO recovery_record
  FROM shop_order_recoveries AS recoveries WHERE recoveries.order_id = order_record.id;
  IF FOUND AND recovery_record.status = 'PENDING' THEN
    RETURN transitions || jsonb_build_array(
      jsonb_build_object('dimension', 'CANCELLATION_REFUND', 'target', 'COMPLETED'),
      jsonb_build_object('dimension', 'CANCELLATION_REFUND', 'target', 'FAILED')
    );
  ELSIF FOUND AND recovery_record.status = 'FAILED' THEN
    RETURN transitions || jsonb_build_array(
      jsonb_build_object('dimension', 'CANCELLATION_REFUND', 'target', 'PENDING')
    );
  END IF;

  IF order_record.fulfillment_status = 'NOT_STARTED'
    AND order_record.funds_confirmation_status = 'UNCONFIRMED'
  THEN
    transitions := transitions || jsonb_build_array(
      jsonb_build_object('dimension', 'LIFECYCLE', 'target', 'CANCELLED')
    );
  END IF;
  IF order_record.fulfillment_status = 'NOT_STARTED'
    AND order_record.funds_confirmation_status = 'UNCONFIRMED'
    AND order_record.reservation_expires_at IS NOT NULL
    AND order_record.reservation_expires_at <= p_now
  THEN
    transitions := transitions || jsonb_build_array(
      jsonb_build_object('dimension', 'LIFECYCLE', 'target', 'EXPIRED')
    );
  END IF;

  IF order_record.payment_review_status = 'EVIDENCE_RECEIVED' THEN
    transitions := transitions || jsonb_build_array(
      jsonb_build_object('dimension', 'PAYMENT_REVIEW', 'target', 'UNDER_REVIEW'),
      jsonb_build_object('dimension', 'PAYMENT_REVIEW', 'target', 'REVIEW_APPROVED'),
      jsonb_build_object('dimension', 'PAYMENT_REVIEW', 'target', 'REVIEW_REJECTED')
    );
  ELSIF order_record.payment_review_status = 'UNDER_REVIEW' THEN
    transitions := transitions || jsonb_build_array(
      jsonb_build_object('dimension', 'PAYMENT_REVIEW', 'target', 'REVIEW_APPROVED'),
      jsonb_build_object('dimension', 'PAYMENT_REVIEW', 'target', 'REVIEW_REJECTED')
    );
  END IF;

  IF order_record.payment_review_status = 'REVIEW_APPROVED'
    AND order_record.funds_confirmation_status = 'UNCONFIRMED'
  THEN
    transitions := transitions || jsonb_build_array(
      jsonb_build_object('dimension', 'FUNDS_CONFIRMATION', 'target', 'CONFIRMED')
    );
  END IF;

  IF order_record.payment_review_status = 'REVIEW_APPROVED'
    AND order_record.funds_confirmation_status = 'CONFIRMED'
  THEN
    IF order_record.fulfillment_status = 'NOT_STARTED' THEN
      transitions := transitions || jsonb_build_array(
        jsonb_build_object('dimension', 'FULFILLMENT', 'target', 'QUALITY_CHECK')
      );
    ELSIF order_record.fulfillment_status = 'QUALITY_CHECK' THEN
      transitions := transitions || jsonb_build_array(
        jsonb_build_object('dimension', 'FULFILLMENT', 'target', 'READY_FOR_HANDOFF')
      );
    ELSIF order_record.fulfillment_status = 'READY_FOR_HANDOFF' THEN
      IF order_record.fulfillment_kind = 'DELIVERY' THEN
        transitions := transitions || jsonb_build_array(
          jsonb_build_object('dimension', 'FULFILLMENT', 'target', 'IN_TRANSIT')
        );
      ELSE
        transitions := transitions || jsonb_build_array(
          jsonb_build_object('dimension', 'PICKUP', 'target', 'SCHEDULED')
        );
        IF order_record.pickup_appointment IS NOT NULL THEN
          transitions := transitions || jsonb_build_array(
            jsonb_build_object('dimension', 'FULFILLMENT', 'target', 'DELIVERED')
          );
        END IF;
      END IF;
    ELSIF order_record.fulfillment_status = 'IN_TRANSIT' THEN
      transitions := transitions || jsonb_build_array(
        jsonb_build_object('dimension', 'FULFILLMENT', 'target', 'DELIVERED')
      );
    END IF;
  END IF;
  RETURN transitions;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION shop_allowed_return_transitions_v3(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  return_record record;
BEGIN
  SELECT returns.* INTO return_record
  FROM shop_order_returns AS returns WHERE returns.order_id = p_order_id;
  IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;
  IF return_record.status = 'REQUESTED' THEN
    RETURN jsonb_build_array(
      jsonb_build_object('dimension', 'RETURN', 'target', 'APPROVED'),
      jsonb_build_object('dimension', 'RETURN', 'target', 'REJECTED')
    );
  ELSIF return_record.status = 'APPROVED' THEN
    RETURN jsonb_build_array(jsonb_build_object('dimension', 'RETURN', 'target', 'RECEIVED'));
  ELSIF return_record.status = 'RECEIVED' THEN
    IF return_record.refund_status = 'NOT_STARTED' THEN
      RETURN jsonb_build_array(jsonb_build_object('dimension', 'REFUND', 'target', 'PENDING'));
    ELSIF return_record.refund_status IN ('PENDING', 'FAILED') THEN
      RETURN jsonb_build_array(
        jsonb_build_object('dimension', 'REFUND', 'target', 'COMPLETED'),
        jsonb_build_object('dimension', 'REFUND', 'target', 'FAILED')
      );
    ELSIF return_record.refund_status = 'COMPLETED' THEN
      RETURN jsonb_build_array(
        jsonb_build_object('dimension', 'RETURN_RESOLUTION', 'target', 'RESOLVE_ITEMS')
      );
    END IF;
  END IF;
  RETURN '[]'::jsonb;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION shop_order_document_v3(
  p_order_id uuid,
  p_include_private boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', orders.reference,
    'reference', orders.reference,
    'lines', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'snapshot', 'PRODUCT', 'slug', items.product_slug, 'sku', items.sku,
        'name', items.product_name, 'taggedSize', items.tagged_size,
        'unitPrice', items.unit_price, 'quantity', items.quantity
      ) ORDER BY items.id)
      FROM shop_order_items AS items WHERE items.order_id = orders.id
    ), '[]'::jsonb),
    'contact', jsonb_build_object(
      'name', orders.contact_name, 'email', orders.contact_email, 'phone', orders.contact_phone
    ),
    'fulfillment', CASE orders.fulfillment_kind
      WHEN 'PICKUP' THEN jsonb_build_object('kind', 'PICKUP', 'optionId', 'pickup')
      ELSE jsonb_build_object('kind', 'DELIVERY', 'optionId', orders.delivery_option_id,
        'address', orders.delivery_address)
    END,
    'subtotal', orders.subtotal,
    'deliveryFee', orders.delivery_fee,
    'total', orders.total,
    'deliveryLabel', orders.delivery_label,
    'deliveryEstimate', orders.delivery_estimate,
    'savedAt', orders.saved_at,
    'reservationExpiresAt', orders.reservation_expires_at,
    'returnEligibleUntil', orders.return_eligible_until,
    'status', CASE
      WHEN orders.lifecycle_status IN ('CANCELLED', 'EXPIRED') THEN 'CANCELLED'
      WHEN orders.lifecycle_status = 'COMPLETED' OR orders.fulfillment_status = 'DELIVERED' THEN 'DELIVERED'
      WHEN orders.fulfillment_status = 'IN_TRANSIT' THEN 'IN_TRANSIT'
      WHEN orders.fulfillment_status = 'READY_FOR_HANDOFF' THEN 'READY_FOR_HANDOFF'
      WHEN orders.fulfillment_status = 'QUALITY_CHECK' THEN 'QUALITY_CHECK'
      WHEN orders.funds_confirmation_status = 'CONFIRMED' THEN 'ORDER_RECEIVED'
      ELSE 'PAYMENT_REQUIRED'
    END,
    'transmission', 'SUBMITTED',
    'source', orders.source,
    'lifecycleStatus', orders.lifecycle_status,
    'paymentReviewStatus', orders.payment_review_status,
    'fundsConfirmationStatus', orders.funds_confirmation_status,
    'fundsConfirmation', CASE WHEN orders.funds_confirmation_status = 'CONFIRMED' THEN
      jsonb_strip_nulls(jsonb_build_object(
        'transferReference', orders.funds_transfer_reference,
        'receivingAccountLabel', orders.funds_receiving_account_label,
        'paidAmount', orders.funds_paid_amount,
        'paidCurrency', orders.funds_paid_currency,
        'confirmedAt', orders.funds_confirmed_at,
        'updatedAt', COALESCE(orders.funds_amount_updated_at, orders.funds_confirmed_at),
        'verifierSubject', CASE WHEN p_include_private THEN orders.funds_verifier_subject END,
        'verifierDisplayName', orders.funds_verifier_display_name
      )) ELSE NULL END,
    'fulfillmentStatus', orders.fulfillment_status,
    'fulfillmentFacts', jsonb_build_object(
      'kind', orders.fulfillment_kind, 'carrierName', orders.carrier_name,
      'trackingReference', orders.tracking_reference, 'trackingUrl', NULL,
      'pickupAppointment', orders.pickup_appointment, 'recipientName', orders.recipient_name,
      'dispatchReference', orders.dispatch_reference, 'dispatchedAt', orders.dispatched_at,
      'deliveredAt', orders.delivered_at, 'deliveryProofReference', orders.delivery_proof_reference
    ),
    'cancellationRecovery', (
      SELECT jsonb_build_object(
        'status', recoveries.status, 'reason', recoveries.reason,
        'requestedAt', recoveries.requested_at, 'updatedAt', recoveries.updated_at,
        'refundReference', recoveries.refund_reference,
        'refundAmount', recoveries.refund_amount,
        'refundCurrency', recoveries.refund_currency
      ) FROM shop_order_recoveries AS recoveries WHERE recoveries.order_id = orders.id
    ),
    'return', (
      SELECT jsonb_build_object(
        'id', returns.id, 'status', returns.status, 'reason', returns.reason,
        'detail', returns.detail, 'requestedAt', returns.requested_at,
        'eligibleUntil', returns.eligible_until, 'approvedAt', returns.approved_at,
        'rejectedAt', returns.rejected_at, 'receivedAt', returns.received_at,
        'resolvedAt', returns.resolved_at, 'resolutionNote', returns.resolution_note,
        'refundStatus', returns.refund_status, 'refundReference', returns.refund_reference,
        'refundAmount', returns.refund_amount, 'refundCurrency', returns.refund_currency,
        'refundUpdatedAt', returns.refund_updated_at, 'disposition', returns.disposition,
        'correctionCount', returns.correction_count,
        'items', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'orderItemId', selected.order_item_id, 'sku', selected.sku,
            'name', items.product_name, 'unitPrice', items.unit_price,
            'refundCapAmount', selected.refund_cap_amount,
            'disposition', selected.disposition
          ) ORDER BY items.id)
          FROM shop_order_return_items AS selected
          JOIN shop_order_items AS items ON items.id = selected.order_item_id
          WHERE selected.return_id = returns.id
        ), '[]'::jsonb)
      ) FROM shop_order_returns AS returns WHERE returns.order_id = orders.id
    ),
    'version', orders.version,
    'evidence', COALESCE((
      SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', evidence.id, 'status', evidence.status,
        'originalFileName', evidence.original_file_name, 'contentType', evidence.content_type,
        'byteSize', evidence.byte_size, 'sha256', evidence.sha256,
        'authorizedAt', evidence.authorized_at, 'expiresAt', evidence.expires_at,
        'receivedAt', evidence.received_at,
        'notice', CASE WHEN evidence.received_at IS NULL
          THEN 'Payment evidence is authorized for private upload and has not been received.'
          ELSE 'Payment evidence received for review. This does not prove bank payment.' END,
        'blobPathname', CASE WHEN p_include_private THEN evidence.blob_pathname END
      )) ORDER BY evidence.authorized_at)
      FROM shop_payment_evidence AS evidence WHERE evidence.order_id = orders.id
    ), '[]'::jsonb),
    'events', COALESCE((
      SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', events.id, 'eventType', events.event_type, 'actorKind', events.actor_kind,
        'actorSubject', CASE WHEN p_include_private THEN events.actor_subject END,
        'visibility', events.visibility, 'lifecycleStatus', events.lifecycle_status,
        'paymentReviewStatus', events.payment_review_status,
        'fundsConfirmationStatus', events.funds_confirmation_status,
        'fulfillmentStatus', events.fulfillment_status, 'note', events.note,
        'metadata', events.metadata, 'occurredAt', events.occurred_at
      )) ORDER BY events.occurred_at, events.id)
      FROM shop_order_events AS events
      WHERE events.order_id = orders.id AND (p_include_private OR events.visibility = 'CUSTOMER')
    ), '[]'::jsonb),
    'allowedTransitions', CASE WHEN p_include_private
      THEN shop_allowed_transitions_v3(orders.id, now()) ELSE '[]'::jsonb END,
    'allowedReturnTransitions', CASE WHEN p_include_private
      THEN shop_allowed_return_transitions_v3(orders.id) ELSE '[]'::jsonb END,
    'canRequestReturn', (
      NOT p_include_private AND orders.lifecycle_status = 'COMPLETED'
      AND orders.fulfillment_status = 'DELIVERED'
      AND orders.return_eligible_until >= now()
      AND NOT EXISTS (SELECT 1 FROM shop_order_returns AS returns WHERE returns.order_id = orders.id)
    ),
    'canRequestPaidCancellation', (
      NOT p_include_private AND orders.lifecycle_status = 'ACTIVE'
      AND orders.funds_confirmation_status = 'CONFIRMED'
      AND orders.funds_paid_amount IS NOT NULL
      AND orders.funds_refunded_amount = 0
      AND orders.fulfillment_status IN ('NOT_STARTED', 'QUALITY_CHECK', 'READY_FOR_HANDOFF')
      AND NOT EXISTS (SELECT 1 FROM shop_order_recoveries AS recoveries WHERE recoveries.order_id = orders.id)
    )
  )
  FROM shop_orders AS orders WHERE orders.id = p_order_id
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION shop_claim_assisted_customer_v3(
  p_auth_subject text,
  p_verified_email text,
  p_display_name text,
  p_now timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  subject_customer record;
  email_customer record;
  normalized_email text;
BEGIN
  IF p_auth_subject IS NULL OR length(trim(p_auth_subject)) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'SHOP_INVALID_REQUEST: invalid customer subject';
  END IF;
  normalized_email := lower(NULLIF(trim(p_verified_email), ''));

  SELECT customers.* INTO subject_customer
  FROM shop_customers AS customers
  WHERE customers.auth_subject = trim(p_auth_subject)
  FOR UPDATE;

  IF normalized_email IS NULL THEN RETURN true; END IF;
  SELECT customers.* INTO email_customer
  FROM shop_customers AS customers
  WHERE lower(customers.email) = normalized_email
  FOR UPDATE;

  IF subject_customer.id IS NOT NULL AND email_customer.id IS NOT NULL
    AND subject_customer.id <> email_customer.id
  THEN
    RAISE EXCEPTION 'SHOP_CUSTOMER_CLAIM_CONFLICT: verified email belongs to another customer';
  END IF;

  IF subject_customer.id IS NOT NULL THEN
    UPDATE shop_customers
    SET email = normalized_email,
        display_name = COALESCE(NULLIF(trim(p_display_name), ''), display_name),
        updated_at = p_now
    WHERE id = subject_customer.id;
    RETURN true;
  END IF;

  IF email_customer.id IS NULL THEN RETURN true; END IF;
  IF email_customer.auth_subject NOT LIKE 'assisted:%' THEN
    RAISE EXCEPTION 'SHOP_CUSTOMER_CLAIM_CONFLICT: established identity cannot be merged';
  END IF;
  UPDATE shop_customers
  SET auth_subject = trim(p_auth_subject),
      display_name = COALESCE(NULLIF(trim(p_display_name), ''), display_name),
      updated_at = p_now
  WHERE id = email_customer.id;
  RETURN true;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION shop_create_assisted_order_v3(
  p_actor_subject text,
  p_actor_display_name text,
  p_source text,
  p_source_note text,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_lines jsonb,
  p_contact jsonb,
  p_fulfillment jsonb,
  p_now timestamptz,
  p_reservation_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  normalized_email text;
  customer_record record;
  assisted_subject text;
  base_document jsonb;
  order_record record;
BEGIN
  IF p_actor_subject IS NULL OR length(trim(p_actor_subject)) NOT BETWEEN 1 AND 255
    OR p_source NOT IN ('PHONE', 'DM', 'IN_PERSON')
    OR (p_source_note IS NOT NULL AND length(trim(p_source_note)) > 500)
  THEN
    RAISE EXCEPTION 'SHOP_INVALID_REQUEST: invalid assisted order';
  END IF;
  normalized_email := lower(trim(p_contact->>'email'));
  assisted_subject := 'assisted:' || md5(normalized_email);

  SELECT customers.* INTO customer_record
  FROM shop_customers AS customers
  WHERE lower(customers.email) = normalized_email
  FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO shop_customers(auth_subject, email, phone, display_name, created_at, updated_at)
    VALUES (assisted_subject, normalized_email, trim(p_contact->>'phone'),
      trim(p_contact->>'name'), p_now, p_now)
    ON CONFLICT DO NOTHING;
    SELECT customers.* INTO customer_record
    FROM shop_customers AS customers
    WHERE lower(customers.email) = normalized_email
    FOR UPDATE;
  END IF;
  IF customer_record.id IS NULL THEN
    RAISE EXCEPTION 'SHOP_PERSISTENCE_UNAVAILABLE: assisted customer could not be established';
  END IF;

  base_document := shop_create_order_v2(
    customer_record.auth_subject, normalized_email, trim(p_contact->>'name'),
    p_idempotency_key, p_request_fingerprint, p_lines, p_contact, p_fulfillment,
    p_now, p_reservation_expires_at
  );
  SELECT orders.* INTO order_record
  FROM shop_orders AS orders WHERE orders.reference = base_document->>'reference' FOR UPDATE;

  IF order_record.source = 'ONLINE' AND order_record.created_by_actor_subject IS NULL THEN
    UPDATE shop_orders
    SET source = p_source::shop_order_source,
        created_by_actor_subject = trim(p_actor_subject),
        updated_at = p_now
    WHERE id = order_record.id;
    UPDATE shop_order_events
    SET actor_kind = 'OPERATOR', actor_subject = trim(p_actor_subject),
        note = 'Order created from ' || lower(replace(p_source, '_', ' '))
          || '. Payment evidence has not been received.',
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('source', p_source)
    WHERE order_id = order_record.id AND event_type = 'ORDER_CREATED';
    IF p_source_note IS NOT NULL AND length(trim(p_source_note)) > 0 THEN
      INSERT INTO shop_order_events(
        order_id, event_type, actor_kind, actor_subject, visibility,
        lifecycle_status, payment_review_status, funds_confirmation_status, fulfillment_status,
        note, metadata, occurred_at
      ) VALUES (
        order_record.id, 'ORDER_SOURCE_NOTE', 'OPERATOR', trim(p_actor_subject), 'OPERATOR',
        order_record.lifecycle_status, order_record.payment_review_status,
        order_record.funds_confirmation_status, order_record.fulfillment_status,
        trim(p_source_note), jsonb_build_object('source', p_source), p_now
      );
    END IF;
  ELSIF order_record.source::text <> p_source
    OR order_record.created_by_actor_subject IS DISTINCT FROM trim(p_actor_subject)
  THEN
    RAISE EXCEPTION 'SHOP_IDEMPOTENCY_MISMATCH: assisted order provenance differs';
  END IF;
  RETURN shop_order_document_v3(order_record.id, true);
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION shop_mutate_customer_order_v3(
  p_reference text,
  p_auth_subject text,
  p_expected_version integer,
  p_action text,
  p_mutation jsonb,
  p_now timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  order_record record;
  event_type_value text;
  event_note_value text;
  event_metadata jsonb := '{}'::jsonb;
  fee_value integer;
  label_value text;
  estimate_value text;
  fulfillment_kind_value shop_fulfillment_kind;
  address_value jsonb;
  next_version integer;
BEGIN
  IF p_auth_subject IS NULL OR length(trim(p_auth_subject)) NOT BETWEEN 1 AND 255
    OR p_expected_version < 0 OR jsonb_typeof(p_mutation) IS DISTINCT FROM 'object'
    OR p_action NOT IN ('CANCEL', 'UPDATE_CONTACT', 'UPDATE_FULFILLMENT', 'REQUEST_PAID_CANCELLATION')
  THEN RAISE EXCEPTION 'SHOP_INVALID_REQUEST: invalid customer order update'; END IF;

  SELECT orders.*, customers.auth_subject INTO order_record
  FROM shop_orders AS orders JOIN shop_customers AS customers ON customers.id = orders.customer_id
  WHERE orders.reference = p_reference FOR UPDATE OF orders;
  IF NOT FOUND OR order_record.auth_subject IS DISTINCT FROM trim(p_auth_subject) THEN
    RAISE EXCEPTION 'SHOP_NOT_FOUND: order';
  END IF;
  IF order_record.version <> p_expected_version THEN
    RAISE EXCEPTION 'SHOP_VERSION_CONFLICT: customer order update';
  END IF;
  IF order_record.lifecycle_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'SHOP_INVALID_TRANSITION: inactive order';
  END IF;
  next_version := order_record.version + 1;

  IF p_action = 'CANCEL' THEN
    IF order_record.fulfillment_status <> 'NOT_STARTED'
      OR order_record.funds_confirmation_status <> 'UNCONFIRMED'
      OR order_record.payment_review_status <> 'AWAITING_EVIDENCE'
      OR length(trim(p_mutation->>'reason')) NOT BETWEEN 4 AND 500
    THEN RAISE EXCEPTION 'SHOP_INVALID_TRANSITION: order cannot be self-cancelled'; END IF;
    PERFORM shop_release_order_inventory_v2(order_record.id, p_now);
    UPDATE shop_orders SET lifecycle_status = 'CANCELLED', status = 'CANCELLED',
      cancelled_at = p_now, version = next_version, updated_at = p_now WHERE id = order_record.id;
    event_type_value := 'LIFECYCLE_CANCELLED';
    event_note_value := trim(p_mutation->>'reason');
    event_metadata := jsonb_build_object('previous', 'ACTIVE', 'releasedInventory', true);

  ELSIF p_action = 'UPDATE_CONTACT' THEN
    IF order_record.fulfillment_status <> 'NOT_STARTED'
      OR length(trim(p_mutation->'contact'->>'name')) NOT BETWEEN 2 AND 100
      OR length(trim(p_mutation->'contact'->>'email')) NOT BETWEEN 3 AND 320
      OR position('@' in p_mutation->'contact'->>'email') < 2
      OR length(trim(p_mutation->'contact'->>'phone')) NOT BETWEEN 7 AND 30
    THEN RAISE EXCEPTION 'SHOP_INVALID_TRANSITION: contact can no longer be changed'; END IF;
    UPDATE shop_orders SET
      contact_name = trim(p_mutation->'contact'->>'name'),
      contact_email = lower(trim(p_mutation->'contact'->>'email')),
      contact_phone = trim(p_mutation->'contact'->>'phone'),
      version = next_version, updated_at = p_now WHERE id = order_record.id;
    event_type_value := 'CONTACT_UPDATED'; event_note_value := 'Order contact details updated.';
    event_metadata := jsonb_build_object('previousEmail', order_record.contact_email,
      'email', lower(trim(p_mutation->'contact'->>'email')));

  ELSIF p_action = 'UPDATE_FULFILLMENT' THEN
    IF order_record.fulfillment_status <> 'NOT_STARTED' THEN
      RAISE EXCEPTION 'SHOP_INVALID_TRANSITION: handoff can no longer be changed';
    END IF;
    IF p_mutation->'fulfillment'->>'kind' = 'PICKUP'
      AND p_mutation->'fulfillment'->>'optionId' = 'pickup'
    THEN
      fulfillment_kind_value := 'PICKUP'; fee_value := 0;
      label_value := 'Studio pickup'; estimate_value := 'After payment'; address_value := NULL;
    ELSIF p_mutation->'fulfillment'->>'kind' = 'DELIVERY'
      AND p_mutation->'fulfillment'->>'optionId' IN ('lagos', 'nationwide')
      AND p_mutation->'fulfillment'->'address'->>'country' = 'Nigeria'
      AND length(trim(p_mutation->'fulfillment'->'address'->>'street')) BETWEEN 1 AND 180
      AND length(trim(p_mutation->'fulfillment'->'address'->>'area')) BETWEEN 1 AND 100
      AND length(trim(p_mutation->'fulfillment'->'address'->>'state')) BETWEEN 1 AND 100
    THEN
      fulfillment_kind_value := 'DELIVERY';
      address_value := p_mutation->'fulfillment'->'address';
      IF p_mutation->'fulfillment'->>'optionId' = 'lagos' THEN
        fee_value := 2500; label_value := 'Lagos delivery'; estimate_value := '1–3 working days';
      ELSE fee_value := 4500; label_value := 'Nationwide delivery'; estimate_value := '3–7 working days'; END IF;
    ELSE RAISE EXCEPTION 'SHOP_INVALID_REQUEST: invalid fulfillment selection'; END IF;
    IF fee_value <> order_record.delivery_fee AND (
      order_record.funds_confirmation_status <> 'UNCONFIRMED'
      OR order_record.payment_review_status <> 'AWAITING_EVIDENCE'
    ) THEN RAISE EXCEPTION 'SHOP_INVALID_TRANSITION: handoff change affects active payment'; END IF;
    UPDATE shop_orders SET fulfillment_kind = fulfillment_kind_value,
      delivery_option_id = p_mutation->'fulfillment'->>'optionId', delivery_address = address_value,
      delivery_fee = fee_value, total = subtotal + fee_value,
      delivery_label = label_value, delivery_estimate = estimate_value,
      pickup_appointment = NULL, version = next_version, updated_at = p_now
    WHERE id = order_record.id;
    event_type_value := 'FULFILLMENT_DETAILS_UPDATED';
    event_note_value := 'Delivery or pickup details updated before preparation started.';
    event_metadata := jsonb_build_object('previousKind', order_record.fulfillment_kind,
      'previousOptionId', order_record.delivery_option_id, 'kind', fulfillment_kind_value,
      'optionId', p_mutation->'fulfillment'->>'optionId', 'total', order_record.subtotal + fee_value);

  ELSE
    IF length(trim(p_mutation->>'reason')) NOT BETWEEN 4 AND 500
      OR order_record.funds_confirmation_status <> 'CONFIRMED'
      OR order_record.funds_paid_amount IS NULL
      OR order_record.funds_refunded_amount <> 0
      OR order_record.fulfillment_status NOT IN ('NOT_STARTED', 'QUALITY_CHECK', 'READY_FOR_HANDOFF')
      OR EXISTS (SELECT 1 FROM shop_order_recoveries WHERE order_id = order_record.id)
    THEN RAISE EXCEPTION 'SHOP_INVALID_TRANSITION: paid cancellation is unavailable'; END IF;
    INSERT INTO shop_order_recoveries(
      order_id, idempotency_key, request_fingerprint, status, reason,
      refund_cap_amount, refund_currency, requested_by, requested_at, updated_at
    ) VALUES (
      order_record.id, 'customer-cancel:' || next_version,
      md5(order_record.reference || ':' || next_version::text) || md5(trim(p_mutation->>'reason')),
      'PENDING', trim(p_mutation->>'reason'), order_record.funds_paid_amount,
      order_record.funds_paid_currency, trim(p_auth_subject), p_now, p_now
    );
    UPDATE shop_orders SET version = next_version, updated_at = p_now WHERE id = order_record.id;
    event_type_value := 'CANCELLATION_REFUND_PENDING';
    event_note_value := trim(p_mutation->>'reason');
    event_metadata := jsonb_build_object('releasedInventory', false);
  END IF;

  INSERT INTO shop_order_events(
    order_id, event_type, actor_kind, actor_subject, visibility,
    lifecycle_status, payment_review_status, funds_confirmation_status, fulfillment_status,
    note, metadata, occurred_at
  ) VALUES (
    order_record.id, event_type_value, 'CUSTOMER', trim(p_auth_subject), 'CUSTOMER',
    CASE WHEN p_action = 'CANCEL' THEN 'CANCELLED'::shop_order_lifecycle_status
      ELSE order_record.lifecycle_status END,
    order_record.payment_review_status, order_record.funds_confirmation_status,
    order_record.fulfillment_status, event_note_value, event_metadata, p_now
  );
  PERFORM shop_enqueue_notification_v2(
    order_record.id, order_record.customer_id, event_type_value,
    'order:' || order_record.id::text || ':customer:' || next_version::text || ':' || lower(p_action),
    jsonb_build_object('orderReference', order_record.reference, 'action', p_action), p_now
  );
  RETURN shop_order_document_v3(order_record.id, false);
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION shop_transition_order_v3(
  p_reference text,
  p_actor_subject text,
  p_actor_display_name text,
  p_expected_version integer,
  p_dimension text,
  p_target text,
  p_details jsonb,
  p_note text,
  p_return_eligible_until timestamptz,
  p_now timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  order_record record;
  ignored jsonb;
BEGIN
  SELECT orders.* INTO order_record
  FROM shop_orders AS orders WHERE orders.reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SHOP_NOT_FOUND: order'; END IF;
  IF order_record.version <> p_expected_version THEN
    RAISE EXCEPTION 'SHOP_VERSION_CONFLICT: transition';
  END IF;
  IF p_dimension IN ('FUNDS_CONFIRMATION', 'PICKUP', 'CANCELLATION_REFUND') THEN
    RAISE EXCEPTION 'SHOP_INVALID_REQUEST: use the dedicated v3 command';
  END IF;
  IF NOT shop_allowed_transitions_v3(order_record.id, p_now) @> jsonb_build_array(
    jsonb_build_object('dimension', p_dimension, 'target', p_target)
  ) THEN
    RAISE EXCEPTION 'SHOP_INVALID_TRANSITION: transition is not currently allowed';
  END IF;
  IF p_dimension = 'FULFILLMENT' AND p_target = 'DELIVERED'
    AND order_record.fulfillment_kind = 'PICKUP'
    AND (
      order_record.pickup_appointment IS NULL
      OR p_details->>'pickupAppointment' IS NULL
      OR (p_details->>'pickupAppointment')::timestamptz IS DISTINCT FROM order_record.pickup_appointment
    )
  THEN
    RAISE EXCEPTION 'SHOP_INVALID_REQUEST: use the agreed pickup appointment';
  END IF;
  ignored := shop_transition_order_v2(
    p_reference, p_actor_subject, p_actor_display_name, p_expected_version,
    p_dimension, p_target, p_details, p_note, p_return_eligible_until, p_now
  );
  RETURN shop_order_document_v3(order_record.id, true);
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION shop_schedule_pickup_v3(
  p_reference text,
  p_actor_subject text,
  p_expected_version integer,
  p_pickup_appointment timestamptz,
  p_note text,
  p_now timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  order_record record;
  event_type_value text;
  next_version integer;
BEGIN
  IF p_actor_subject IS NULL OR length(trim(p_actor_subject)) NOT BETWEEN 1 AND 255
    OR p_expected_version < 0 OR p_pickup_appointment <= p_now
    OR (p_note IS NOT NULL AND length(p_note) > 500)
  THEN RAISE EXCEPTION 'SHOP_INVALID_REQUEST: valid future pickup time is required'; END IF;
  SELECT orders.* INTO order_record FROM shop_orders AS orders
  WHERE orders.reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SHOP_NOT_FOUND: order'; END IF;
  IF order_record.version <> p_expected_version THEN RAISE EXCEPTION 'SHOP_VERSION_CONFLICT: pickup'; END IF;
  IF order_record.lifecycle_status <> 'ACTIVE'
    OR order_record.fulfillment_kind <> 'PICKUP'
    OR order_record.funds_confirmation_status <> 'CONFIRMED'
    OR order_record.fulfillment_status <> 'READY_FOR_HANDOFF'
    OR EXISTS (
      SELECT 1 FROM shop_order_recoveries AS recoveries
      WHERE recoveries.order_id = order_record.id AND recoveries.status IN ('PENDING', 'FAILED')
    )
  THEN RAISE EXCEPTION 'SHOP_INVALID_TRANSITION: pickup cannot be scheduled'; END IF;
  next_version := order_record.version + 1;
  event_type_value := CASE WHEN order_record.pickup_appointment IS NULL
    THEN 'PICKUP_SCHEDULED' ELSE 'PICKUP_RESCHEDULED' END;
  UPDATE shop_orders SET pickup_appointment = p_pickup_appointment,
    version = next_version, updated_at = p_now WHERE id = order_record.id;
  INSERT INTO shop_order_events(
    order_id, event_type, actor_kind, actor_subject, visibility,
    lifecycle_status, payment_review_status, funds_confirmation_status, fulfillment_status,
    note, metadata, occurred_at
  ) VALUES (
    order_record.id, event_type_value, 'OPERATOR', trim(p_actor_subject), 'CUSTOMER',
    order_record.lifecycle_status, order_record.payment_review_status,
    order_record.funds_confirmation_status, order_record.fulfillment_status,
    COALESCE(p_note, 'Pickup scheduled for ' || p_pickup_appointment::text || '.'),
    jsonb_strip_nulls(jsonb_build_object(
      'previousPickupAppointment', order_record.pickup_appointment,
      'pickupAppointment', p_pickup_appointment
    )), p_now
  );
  PERFORM shop_enqueue_notification_v2(
    order_record.id, order_record.customer_id, event_type_value,
    'order:' || order_record.id::text || ':pickup:' || next_version::text || ':scheduled',
    jsonb_build_object('orderReference', order_record.reference,
      'pickupAppointment', p_pickup_appointment), p_now
  );
  RETURN shop_order_document_v3(order_record.id, true);
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION shop_transition_pre_handoff_recovery_v3(
  p_reference text,
  p_actor_subject text,
  p_expected_version integer,
  p_target text,
  p_refund_reference text,
  p_refund_amount integer,
  p_refund_currency text,
  p_note text,
  p_now timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  order_record record;
  recovery_record record;
  next_version integer;
  event_note_value text;
BEGIN
  IF p_actor_subject IS NULL OR length(trim(p_actor_subject)) NOT BETWEEN 1 AND 255
    OR p_expected_version < 0 OR p_target NOT IN ('PENDING', 'FAILED', 'COMPLETED')
    OR (p_note IS NOT NULL AND length(p_note) > 500)
  THEN RAISE EXCEPTION 'SHOP_INVALID_REQUEST: invalid cancellation refund transition'; END IF;
  SELECT orders.* INTO order_record FROM shop_orders AS orders
  WHERE orders.reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SHOP_NOT_FOUND: order'; END IF;
  IF order_record.version <> p_expected_version THEN
    RAISE EXCEPTION 'SHOP_VERSION_CONFLICT: cancellation refund';
  END IF;
  SELECT recoveries.* INTO recovery_record FROM shop_order_recoveries AS recoveries
  WHERE recoveries.order_id = order_record.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SHOP_NOT_FOUND: cancellation recovery'; END IF;
  IF order_record.lifecycle_status <> 'ACTIVE'
    OR order_record.fulfillment_status NOT IN ('NOT_STARTED', 'QUALITY_CHECK', 'READY_FOR_HANDOFF')
    OR (recovery_record.status = 'PENDING' AND p_target NOT IN ('FAILED', 'COMPLETED'))
    OR (recovery_record.status = 'FAILED' AND p_target <> 'PENDING')
    OR recovery_record.status = 'COMPLETED'
  THEN RAISE EXCEPTION 'SHOP_INVALID_TRANSITION: cancellation refund transition is unavailable'; END IF;
  next_version := order_record.version + 1;

  IF p_target = 'COMPLETED' THEN
    IF p_refund_reference IS NULL OR length(trim(p_refund_reference)) NOT BETWEEN 4 AND 160
      OR p_refund_amount IS DISTINCT FROM recovery_record.refund_cap_amount
      OR p_refund_currency IS DISTINCT FROM recovery_record.refund_currency
      OR order_record.funds_paid_amount IS NULL
      OR recovery_record.refund_cap_amount IS DISTINCT FROM order_record.funds_paid_amount
      OR order_record.funds_refunded_amount <> 0
    THEN RAISE EXCEPTION 'SHOP_INVALID_REQUEST: record the exact full refund before cancellation'; END IF;
    PERFORM shop_release_order_inventory_v2(order_record.id, p_now);
    UPDATE shop_order_recoveries SET status = 'COMPLETED',
      refund_reference = trim(p_refund_reference), refund_amount = p_refund_amount,
      failed_at = NULL, failure_note = NULL, completed_at = p_now, updated_at = p_now
    WHERE id = recovery_record.id;
    UPDATE shop_orders SET lifecycle_status = 'CANCELLED', status = 'CANCELLED',
      cancelled_at = p_now, funds_refunded_amount = funds_refunded_amount + p_refund_amount,
      version = next_version, updated_at = p_now WHERE id = order_record.id;
    event_note_value := COALESCE(p_note, 'Refund of ' || p_refund_currency || ' '
      || p_refund_amount::text || ' completed; reference ' || trim(p_refund_reference)
      || '. The pieces were released.');
  ELSIF p_target = 'FAILED' THEN
    IF p_note IS NULL OR length(trim(p_note)) = 0 THEN
      RAISE EXCEPTION 'SHOP_INVALID_REQUEST: record why the refund failed';
    END IF;
    UPDATE shop_order_recoveries SET status = 'FAILED', failed_at = p_now,
      failure_note = trim(p_note), updated_at = p_now WHERE id = recovery_record.id;
    UPDATE shop_orders SET version = next_version, updated_at = p_now WHERE id = order_record.id;
    event_note_value := trim(p_note);
  ELSE
    IF p_refund_reference IS NOT NULL OR p_refund_amount IS NOT NULL OR p_refund_currency IS NOT NULL THEN
      RAISE EXCEPTION 'SHOP_INVALID_REQUEST: retry does not record completed refund facts';
    END IF;
    UPDATE shop_order_recoveries SET status = 'PENDING', failed_at = NULL,
      failure_note = NULL, updated_at = p_now WHERE id = recovery_record.id;
    UPDATE shop_orders SET version = next_version, updated_at = p_now WHERE id = order_record.id;
    event_note_value := COALESCE(p_note, 'Cancellation refund is being retried.');
  END IF;

  INSERT INTO shop_order_events(
    order_id, event_type, actor_kind, actor_subject, visibility,
    lifecycle_status, payment_review_status, funds_confirmation_status, fulfillment_status,
    note, metadata, occurred_at
  ) VALUES (
    order_record.id, 'CANCELLATION_REFUND_' || p_target, 'OPERATOR',
    trim(p_actor_subject), 'CUSTOMER',
    CASE WHEN p_target = 'COMPLETED' THEN 'CANCELLED'::shop_order_lifecycle_status
      ELSE order_record.lifecycle_status END,
    order_record.payment_review_status, order_record.funds_confirmation_status,
    order_record.fulfillment_status, event_note_value,
    jsonb_strip_nulls(jsonb_build_object(
      'previous', recovery_record.status, 'refundReference', p_refund_reference,
      'refundAmount', p_refund_amount, 'refundCurrency', p_refund_currency,
      'releasedInventory', CASE WHEN p_target = 'COMPLETED' THEN true END
    )), p_now
  );
  PERFORM shop_enqueue_notification_v2(
    order_record.id, order_record.customer_id, 'CANCELLATION_REFUND_' || p_target,
    'order:' || order_record.id::text || ':cancellation_refund:' || next_version::text
      || ':' || lower(p_target),
    jsonb_build_object('orderReference', order_record.reference,
      'dimension', 'CANCELLATION_REFUND', 'target', p_target), p_now
  );
  RETURN shop_order_document_v3(order_record.id, true);
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION shop_resolve_return_inventory_v3(
  p_return_id uuid,
  p_line_resolutions jsonb,
  p_now timestamptz
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  expected_count integer;
  supplied_count integer;
  changed_count integer;
  inventory_record record;
BEGIN
  IF jsonb_typeof(p_line_resolutions) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'SHOP_INVALID_REQUEST: return line decisions must be an array';
  END IF;
  SELECT count(*) INTO expected_count
  FROM shop_order_return_items WHERE return_id = p_return_id;
  supplied_count := jsonb_array_length(p_line_resolutions);
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_line_resolutions) AS decision
    WHERE jsonb_typeof(decision) IS DISTINCT FROM 'object'
  ) THEN
    RAISE EXCEPTION 'SHOP_INVALID_REQUEST: every return decision must be an object';
  END IF;
  IF expected_count = 0 OR supplied_count <> expected_count
    OR (SELECT count(DISTINCT decision->>'sku')
        FROM jsonb_array_elements(p_line_resolutions) AS decision) <> supplied_count
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_line_resolutions) AS decision
      WHERE decision->>'disposition' NOT IN ('RESTOCK', 'WRITE_OFF')
        OR (SELECT count(*) FROM jsonb_object_keys(decision)) <> 2
    )
    OR EXISTS (
      (SELECT selected.sku FROM shop_order_return_items AS selected WHERE selected.return_id = p_return_id
       EXCEPT SELECT decision->>'sku' FROM jsonb_array_elements(p_line_resolutions) AS decision)
      UNION ALL
      (SELECT decision->>'sku' FROM jsonb_array_elements(p_line_resolutions) AS decision
       EXCEPT SELECT selected.sku FROM shop_order_return_items AS selected WHERE selected.return_id = p_return_id)
    )
  THEN RAISE EXCEPTION 'SHOP_INVALID_REQUEST: choose one inventory result for every returned piece'; END IF;

  FOR inventory_record IN
    SELECT inventory.* FROM shop_inventory AS inventory
    JOIN shop_order_return_items AS selected ON selected.sku = inventory.sku
    WHERE selected.return_id = p_return_id
    ORDER BY inventory.sku FOR UPDATE OF inventory
  LOOP
    IF inventory_record.availability <> 'SOLD'
      OR inventory_record.on_hand <> 0 OR inventory_record.reserved <> 0
      OR inventory_record.sold - inventory_record.returned <> 1
    THEN RAISE EXCEPTION 'SHOP_INVENTORY_UNAVAILABLE: sold return inventory mismatch'; END IF;
  END LOOP;

  WITH decisions AS (
    SELECT decision->>'sku' AS sku,
      (decision->>'disposition')::shop_return_disposition AS disposition
    FROM jsonb_array_elements(p_line_resolutions) AS decision
  )
  UPDATE shop_inventory AS inventory
  SET availability = CASE decisions.disposition WHEN 'RESTOCK'
        THEN 'AVAILABLE'::shop_catalogue_availability ELSE 'ARCHIVED'::shop_catalogue_availability END,
      on_hand = CASE decisions.disposition WHEN 'RESTOCK' THEN 1 ELSE 0 END,
      returned = inventory.returned + 1,
      write_off = inventory.write_off + CASE decisions.disposition WHEN 'WRITE_OFF' THEN 1 ELSE 0 END,
      updated_at = p_now
  FROM decisions
  WHERE inventory.sku = decisions.sku
    AND inventory.availability = 'SOLD' AND inventory.on_hand = 0 AND inventory.reserved = 0
    AND inventory.sold - inventory.returned = 1;
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count <> expected_count THEN
    RAISE EXCEPTION 'SHOP_INVENTORY_UNAVAILABLE: returned inventory update mismatch';
  END IF;

  WITH decisions AS (
    SELECT decision->>'sku' AS sku,
      (decision->>'disposition')::shop_return_disposition AS disposition
    FROM jsonb_array_elements(p_line_resolutions) AS decision
  )
  UPDATE shop_order_return_items AS selected
  SET disposition = decisions.disposition, resolved_at = p_now
  FROM decisions
  WHERE selected.return_id = p_return_id AND selected.sku = decisions.sku;
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count <> expected_count THEN
    RAISE EXCEPTION 'SHOP_PERSISTENCE_UNAVAILABLE: return line resolution mismatch';
  END IF;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION shop_request_return_v3(
  p_reference text,
  p_auth_subject text,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_expected_version integer,
  p_correction boolean,
  p_reason text,
  p_detail text,
  p_line_skus jsonb,
  p_now timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  order_record record;
  return_record record;
  return_id_value uuid;
  selected_count integer;
  line_skus_value jsonb;
  merchandise_cap integer;
  event_type_value text;
  next_version integer;
BEGIN
  IF p_auth_subject IS NULL OR length(trim(p_auth_subject)) NOT BETWEEN 1 AND 255
    OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,159}$'
    OR p_request_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_reason NOT IN ('WRONG_SIZE', 'NOT_AS_DESCRIBED', 'DAMAGED', 'CHANGED_MIND', 'OTHER')
    OR length(trim(p_detail)) NOT BETWEEN 10 AND 500
    OR jsonb_typeof(p_line_skus) IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'SHOP_INVALID_REQUEST: invalid return request'; END IF;

  SELECT orders.*, customers.auth_subject INTO order_record
  FROM shop_orders AS orders JOIN shop_customers AS customers ON customers.id = orders.customer_id
  WHERE orders.reference = p_reference FOR UPDATE OF orders;
  IF NOT FOUND THEN RAISE EXCEPTION 'SHOP_NOT_FOUND: order'; END IF;
  IF order_record.auth_subject IS DISTINCT FROM trim(p_auth_subject) THEN
    RAISE EXCEPTION 'SHOP_FORBIDDEN: order ownership';
  END IF;

  SELECT returns.* INTO return_record FROM shop_order_returns AS returns
  WHERE returns.order_id = order_record.id FOR UPDATE;
  IF FOUND AND return_record.idempotency_key = p_idempotency_key THEN
    IF return_record.request_fingerprint = p_request_fingerprint THEN
      RETURN shop_order_document_v3(order_record.id, false);
    END IF;
    RAISE EXCEPTION 'SHOP_IDEMPOTENCY_MISMATCH: return request differs';
  END IF;
  IF p_expected_version IS NOT NULL AND order_record.version <> p_expected_version THEN
    RAISE EXCEPTION 'SHOP_VERSION_CONFLICT: return request';
  END IF;

  line_skus_value := CASE WHEN jsonb_array_length(p_line_skus) = 0 THEN (
    SELECT jsonb_agg(items.sku ORDER BY items.sku)
    FROM shop_order_items AS items WHERE items.order_id = order_record.id
  ) ELSE p_line_skus END;
  selected_count := jsonb_array_length(line_skus_value);
  IF selected_count < 1
    OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(line_skus_value) AS value) <> selected_count
    OR EXISTS (
      SELECT value FROM jsonb_array_elements_text(line_skus_value) AS value
      EXCEPT SELECT items.sku FROM shop_order_items AS items WHERE items.order_id = order_record.id
    )
  THEN RAISE EXCEPTION 'SHOP_INVALID_REQUEST: selected return pieces do not belong to order'; END IF;
  SELECT sum(items.line_total)::integer INTO merchandise_cap
  FROM shop_order_items AS items
  WHERE items.order_id = order_record.id
    AND items.sku IN (SELECT value FROM jsonb_array_elements_text(line_skus_value) AS value);
  next_version := order_record.version + 1;

  IF return_record.id IS NOT NULL THEN
    IF NOT p_correction OR return_record.status <> 'REJECTED' OR return_record.correction_count >= 1 THEN
      RAISE EXCEPTION 'SHOP_INVALID_TRANSITION: return request cannot be reopened';
    END IF;
    DELETE FROM shop_order_return_items WHERE return_id = return_record.id;
    INSERT INTO shop_order_return_items(return_id, order_item_id, sku, refund_cap_amount)
    SELECT return_record.id, items.id, items.sku, items.line_total
    FROM shop_order_items AS items
    WHERE items.order_id = order_record.id
      AND items.sku IN (SELECT value FROM jsonb_array_elements_text(line_skus_value) AS value);
    UPDATE shop_order_returns SET idempotency_key = p_idempotency_key,
      request_fingerprint = p_request_fingerprint, status = 'REQUESTED',
      reason = p_reason::shop_return_reason, detail = trim(p_detail), requested_at = p_now,
      rejected_at = NULL, correction_count = correction_count + 1,
      merchandise_refund_cap_amount = merchandise_cap,
      delivery_refund_cap_amount = order_record.delivery_fee,
      delivery_refund_allowance = 0, refund_cap_currency = order_record.currency
    WHERE id = return_record.id;
    return_id_value := return_record.id;
    event_type_value := 'RETURN_CORRECTED';
  ELSE
    IF p_correction THEN RAISE EXCEPTION 'SHOP_INVALID_TRANSITION: no rejected return to correct'; END IF;
    IF order_record.lifecycle_status <> 'COMPLETED'
      OR order_record.fulfillment_status <> 'DELIVERED'
      OR order_record.funds_confirmation_status <> 'CONFIRMED'
      OR order_record.return_eligible_until IS NULL OR order_record.return_eligible_until < p_now
    THEN RAISE EXCEPTION 'SHOP_RETURN_WINDOW_CLOSED: order is not eligible for return'; END IF;
    return_id_value := gen_random_uuid();
    INSERT INTO shop_order_returns(
      id, order_id, customer_id, idempotency_key, request_fingerprint,
      status, reason, detail, requested_at, eligible_until,
      merchandise_refund_cap_amount, delivery_refund_cap_amount,
      delivery_refund_allowance, refund_cap_currency
    ) VALUES (
      return_id_value, order_record.id, order_record.customer_id, p_idempotency_key,
      p_request_fingerprint, 'REQUESTED', p_reason::shop_return_reason, trim(p_detail),
      p_now, order_record.return_eligible_until, merchandise_cap, order_record.delivery_fee,
      0, order_record.currency
    );
    INSERT INTO shop_order_return_items(return_id, order_item_id, sku, refund_cap_amount)
    SELECT return_id_value, items.id, items.sku, items.line_total
    FROM shop_order_items AS items
    WHERE items.order_id = order_record.id
      AND items.sku IN (SELECT value FROM jsonb_array_elements_text(line_skus_value) AS value);
    event_type_value := 'RETURN_REQUESTED';
  END IF;

  UPDATE shop_orders SET version = next_version, updated_at = p_now WHERE id = order_record.id;
  INSERT INTO shop_order_events(
    order_id, event_type, actor_kind, actor_subject, visibility,
    lifecycle_status, payment_review_status, funds_confirmation_status, fulfillment_status,
    note, metadata, occurred_at
  ) VALUES (
    order_record.id, event_type_value, 'CUSTOMER', trim(p_auth_subject), 'CUSTOMER',
    order_record.lifecycle_status, order_record.payment_review_status,
    order_record.funds_confirmation_status, order_record.fulfillment_status,
    CASE event_type_value WHEN 'RETURN_CORRECTED'
      THEN 'Return request corrected and reopened for one more review.'
      ELSE 'Return requested. Lulu will review eligibility and next steps.' END,
    jsonb_build_object('returnId', return_id_value, 'reason', p_reason, 'lineSkus', line_skus_value), p_now
  );
  PERFORM shop_enqueue_notification_v2(
    order_record.id, order_record.customer_id, event_type_value,
    'order:' || order_record.id::text || ':return:' || lower(event_type_value),
    jsonb_build_object('orderReference', order_record.reference,
      'returnId', return_id_value, 'reason', p_reason), p_now
  );
  RETURN shop_order_document_v3(order_record.id, false);
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION shop_transition_return_v3(
  p_reference text,
  p_actor_subject text,
  p_expected_version integer,
  p_dimension text,
  p_target text,
  p_refund_reference text,
  p_refund_amount integer,
  p_refund_currency text,
  p_line_dispositions jsonb,
  p_note text,
  p_now timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  order_record record;
  return_record record;
  event_type_value text;
  event_note_value text;
  next_version integer;
  aggregate_disposition shop_return_disposition;
BEGIN
  IF p_actor_subject IS NULL OR length(trim(p_actor_subject)) NOT BETWEEN 1 AND 255
    OR p_expected_version < 0 OR (p_note IS NOT NULL AND length(p_note) > 500)
    OR jsonb_typeof(p_line_dispositions) IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'SHOP_INVALID_REQUEST: invalid return transition'; END IF;
  SELECT orders.* INTO order_record FROM shop_orders AS orders
  WHERE orders.reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SHOP_NOT_FOUND: order'; END IF;
  IF order_record.version <> p_expected_version THEN
    RAISE EXCEPTION 'SHOP_VERSION_CONFLICT: return transition';
  END IF;
  SELECT returns.* INTO return_record FROM shop_order_returns AS returns
  WHERE returns.order_id = order_record.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SHOP_NOT_FOUND: return'; END IF;
  IF NOT shop_allowed_return_transitions_v3(order_record.id) @> jsonb_build_array(
    jsonb_build_object('dimension', p_dimension, 'target', p_target)
  ) THEN RAISE EXCEPTION 'SHOP_INVALID_TRANSITION: return transition is not currently allowed'; END IF;
  next_version := order_record.version + 1;

  IF p_dimension = 'RETURN' THEN
    IF jsonb_array_length(p_line_dispositions) <> 0
      OR p_refund_reference IS NOT NULL OR p_refund_amount IS NOT NULL OR p_refund_currency IS NOT NULL
    THEN RAISE EXCEPTION 'SHOP_INVALID_REQUEST: return review does not accept refund facts'; END IF;
    IF p_target = 'REJECTED' AND (p_note IS NULL OR length(trim(p_note)) = 0) THEN
      RAISE EXCEPTION 'SHOP_INVALID_REQUEST: rejection reason is required';
    END IF;
    UPDATE shop_order_returns SET status = p_target::shop_return_status,
      approved_at = CASE WHEN p_target = 'APPROVED' THEN p_now ELSE approved_at END,
      rejected_at = CASE WHEN p_target = 'REJECTED' THEN p_now ELSE rejected_at END,
      received_at = CASE WHEN p_target = 'RECEIVED' THEN p_now ELSE received_at END
    WHERE id = return_record.id;
    event_type_value := 'RETURN_' || p_target;
    event_note_value := COALESCE(p_note, CASE p_target
      WHEN 'APPROVED' THEN 'Return approved. Arrange the Studio handoff before sending the piece.'
      WHEN 'RECEIVED' THEN 'Returned pieces received by the Studio.' END);

  ELSIF p_dimension = 'REFUND' THEN
    IF jsonb_array_length(p_line_dispositions) <> 0 THEN
      RAISE EXCEPTION 'SHOP_INVALID_REQUEST: refund transition does not resolve inventory';
    END IF;
    IF p_target = 'COMPLETED' THEN
      IF p_refund_reference IS NULL OR length(trim(p_refund_reference)) NOT BETWEEN 4 AND 160
        OR p_refund_amount IS NULL OR p_refund_amount <= 0
        OR p_refund_amount > return_record.merchandise_refund_cap_amount
            + return_record.delivery_refund_allowance
        OR p_refund_currency IS DISTINCT FROM return_record.refund_cap_currency
        OR order_record.funds_paid_amount IS NULL
        OR order_record.funds_refunded_amount + p_refund_amount > order_record.funds_paid_amount
      THEN RAISE EXCEPTION 'SHOP_INVALID_REQUEST: exact capped refund audit is required'; END IF;
      UPDATE shop_order_returns SET refund_status = 'COMPLETED',
        refund_reference = trim(p_refund_reference), refund_amount = p_refund_amount,
        refund_currency = p_refund_currency, refund_updated_at = p_now
      WHERE id = return_record.id;
      UPDATE shop_orders SET funds_refunded_amount = funds_refunded_amount + p_refund_amount,
        version = next_version, updated_at = p_now WHERE id = order_record.id;
      event_note_value := COALESCE(p_note, 'Refund of ' || p_refund_currency || ' '
        || p_refund_amount::text || ' completed; reference ' || trim(p_refund_reference) || '.');
    ELSIF p_target = 'PENDING' THEN
      IF p_refund_reference IS NOT NULL OR p_refund_amount IS NOT NULL OR p_refund_currency IS NOT NULL THEN
        RAISE EXCEPTION 'SHOP_INVALID_REQUEST: pending refund cannot claim completed facts';
      END IF;
      UPDATE shop_order_returns SET refund_status = 'PENDING', refund_updated_at = p_now
      WHERE id = return_record.id;
      UPDATE shop_orders SET version = next_version, updated_at = p_now WHERE id = order_record.id;
      event_note_value := COALESCE(p_note, 'Refund is being prepared.');
    ELSE
      IF p_note IS NULL OR length(trim(p_note)) = 0
        OR p_refund_reference IS NOT NULL OR p_refund_amount IS NOT NULL OR p_refund_currency IS NOT NULL
      THEN RAISE EXCEPTION 'SHOP_INVALID_REQUEST: failed refund reason is required'; END IF;
      UPDATE shop_order_returns SET refund_status = 'FAILED', refund_updated_at = p_now
      WHERE id = return_record.id;
      UPDATE shop_orders SET version = next_version, updated_at = p_now WHERE id = order_record.id;
      event_note_value := trim(p_note);
    END IF;
    event_type_value := 'REFUND_' || p_target;

  ELSIF p_dimension = 'RETURN_RESOLUTION' THEN
    IF p_target <> 'RESOLVE_ITEMS'
      OR p_refund_reference IS NOT NULL OR p_refund_amount IS NOT NULL OR p_refund_currency IS NOT NULL
    THEN RAISE EXCEPTION 'SHOP_INVALID_REQUEST: invalid return resolution'; END IF;
    PERFORM shop_resolve_return_inventory_v3(return_record.id, p_line_dispositions, p_now);
    SELECT CASE WHEN count(DISTINCT selected.disposition) = 1 THEN min(selected.disposition::text)::shop_return_disposition
      ELSE NULL END INTO aggregate_disposition
    FROM shop_order_return_items AS selected WHERE selected.return_id = return_record.id;
    event_type_value := 'RETURN_RESOLVED';
    event_note_value := COALESCE(p_note,
      'Every returned piece was inspected and its inventory result recorded.');
    UPDATE shop_order_returns SET status = 'RESOLVED', resolved_at = p_now,
      resolution_note = event_note_value, disposition = aggregate_disposition
    WHERE id = return_record.id;
    UPDATE shop_orders SET version = next_version, updated_at = p_now WHERE id = order_record.id;
  ELSE
    RAISE EXCEPTION 'SHOP_INVALID_REQUEST: unknown return transition dimension';
  END IF;

  -- RETURN review branches have not yet updated the aggregate version.
  IF p_dimension = 'RETURN' THEN
    UPDATE shop_orders SET version = next_version, updated_at = p_now WHERE id = order_record.id;
  END IF;
  INSERT INTO shop_order_events(
    order_id, event_type, actor_kind, actor_subject, visibility,
    lifecycle_status, payment_review_status, funds_confirmation_status, fulfillment_status,
    note, metadata, occurred_at
  ) VALUES (
    order_record.id, event_type_value, 'OPERATOR', trim(p_actor_subject), 'CUSTOMER',
    order_record.lifecycle_status, order_record.payment_review_status,
    order_record.funds_confirmation_status, order_record.fulfillment_status,
    event_note_value,
    jsonb_strip_nulls(jsonb_build_object(
      'returnId', return_record.id,
      'returnStatus', CASE WHEN p_dimension = 'RETURN' THEN p_target
        WHEN p_dimension = 'RETURN_RESOLUTION' THEN 'RESOLVED' ELSE return_record.status::text END,
      'refundStatus', CASE WHEN p_dimension = 'REFUND' THEN p_target ELSE return_record.refund_status::text END,
      'refundReference', CASE WHEN p_target = 'COMPLETED' THEN trim(p_refund_reference) END,
      'refundAmount', CASE WHEN p_target = 'COMPLETED' THEN p_refund_amount END,
      'refundCurrency', CASE WHEN p_target = 'COMPLETED' THEN p_refund_currency END,
      'disposition', aggregate_disposition,
      'lineDispositions', CASE WHEN p_dimension = 'RETURN_RESOLUTION' THEN p_line_dispositions END
    )), p_now
  );
  PERFORM shop_enqueue_notification_v2(
    order_record.id, order_record.customer_id, event_type_value,
    'order:' || order_record.id::text || ':return:' || next_version::text
      || ':' || lower(event_type_value),
    jsonb_build_object('orderReference', order_record.reference,
      'returnId', return_record.id, 'eventType', event_type_value), p_now
  );
  RETURN shop_order_document_v3(order_record.id, true);
END
$$;


--> statement-breakpoint
